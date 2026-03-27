// ════════════════════════════════════════════════════════════════
// PLAYER — Estado del jugador con stats dinámicos
//
// Los stats calculados (atk, def, slots) pasan siempre por el
// EventBus para que los plugins añadan modificadores sin tocar
// este archivo. El estado persistible vive en player.s.
//
// Contrato con plugins:
//   player:create       → plugins inicializan player.s.ext y player.s.slots
//   player:tick         → plugins manejan hambre, heridas, duración de flags
//   player:calc_stat    → plugins añaden modificadores a cualquier stat
//   player:calc_slot    → plugins declaran cuántos slots de cada tipo existen
//   player:stat_change  → notificación tras cambio de hp
//   player:item_add     → notificación tras añadir ítem
//   player:item_remove  → notificación tras quitar ítem
//   player:equip        → notificación tras equipar
// ════════════════════════════════════════════════════════════════

const Player = {
  s: {},

  // ── Creación ─────────────────────────────────────────────────
  create() {
    const pd = D.playerDef;
    this.s = {
      id:       U.uid(),
      name:     'Sin Nombre',

      // Stats base — solo valores numéricos "en reposo"
      hp:      pd.hp_base  || 50,
      maxHp:   pd.hp_base  || 50,
      atk:     pd.atk_base || 5,
      def:     pd.def_base || 1,

      position: '',

      // Equipamiento (multislot + compat legacy)
      equipped: {
        casco:null, guantes:null, peto:null, botas:null,
        mano_izquierda:null, mano_derecha:null,
        accesorio_1:null, accesorio_2:null,
        arma:null, armadura:null, reliquia:null, mitico:null,
      },

      // Inventario plano
      inventory: [],

      // Contadores globales
      stats: { kills:0, steps:0, crafted:0 },

      // Flags de estado activos (invisibilidad, duplicar, etc.)
      flags: [],

      // ── Namespaces de plugins ─────────────────────────────────
      // Los plugins escriben aquí sus datos; no en campos raíz.
      // Ejemplo:
      //   s.ext.habilidades = []     ← plugin:habilidades
      //   s.ext.magias      = []     ← plugin:magias
      //   s.ext.compañeros  = []     ← plugin:criaturas
      //   s.ext.resonance   = 0      ← plugin:resonance_field
      ext: {},

      // Declaración de slots — los plugins la pueblan en player:create
      // Ejemplo: { habilidades:3, magias:2, compañeros:1 }
      slots: {},
    };

    // Los plugins inicializan sus datos aquí y pueden modificar
    // cualquier campo de s antes de que el jugador "nace"
    const result = EventBus.emit('player:create', { player: this.s });
    if(result?.player) this.s = result.player;
  },

  // ── Accessors básicos ────────────────────────────────────────
  get()  { return this.s; },
  pos()  { return this.s.position; },
  hp()   { return this.s.hp; },
  alive(){ return this.s.hp > 0; },

  setPos(id) {
    this.s.position = id;
    this.s.stats.steps++;
  },

  rename(n) { this.s.name = n; },

  // ── Stats calculados — siempre pasan por EventBus ────────────
  // El valor base lo calcula el core; los plugins modifican `final`.

  getAtk() {
    const eq = this.s.equipped || {};
    const base = this.s.atk
      + (eq.arma?.atk || 0)
      + (eq.mano_derecha?.atk || 0)
      + (eq.mano_izquierda?.atk || 0)
      + (this._bonusAccesorios('atk') || 0)
      + (this.s._resonance?.bonos?.atk || 0);
    const r = EventBus.emit('player:calc_stat', {
      stat: 'atk', base, player: this.s, final: base,
    });
    return r?.final ?? base;
  },

  getDef() {
    const eq = this.s.equipped || {};
    const base = this.s.def
      + (eq.armadura?.def || 0)
      + (eq.peto?.def || 0)
      + (eq.casco?.def || 0)
      + (eq.guantes?.def || 0)
      + (eq.botas?.def || 0)
      + (this._bonusAccesorios('def') || 0)
      + (this.s._resonance?.bonos?.def || 0);
    const r = EventBus.emit('player:calc_stat', {
      stat: 'def', base, player: this.s, final: base,
    });
    return r?.final ?? base;
  },

  /**
   * Obtiene el valor de cualquier stat (extendible por plugins).
   * Uso: Player.getStat('stamina') → delegado a plugin:tactics
   *      Player.getStat('resonance') → delegado a plugin:resonance_field
   */
  getStat(stat) {
    const base = this.s[stat] ?? this.s.ext?.[stat] ?? 0;
    let extra = 0;
    if(stat === 'crit')       extra += this._bonusAccesorios('crit') + (this.s._resonance?.bonos?.crit || 0);
    if(stat === 'evasion')    extra += this._bonusAccesorios('evasion') + (this.s._resonance?.bonos?.evasion || 0);
    if(stat === 'mana_max')   extra += this._bonusAccesorios('mana_max');
    if(stat === 'stamina_max')extra += this._bonusAccesorios('stamina_max');
    const r = EventBus.emit('player:calc_stat', {
      stat, base, player: this.s, final: base + extra,
    });
    return r?.final ?? (base + extra);
  },

  /**
   * Obtiene la capacidad de un slot. El valor lo definen los plugins.
   * Uso: Player.getSlot('habilidades') → 3 (si plugin:habilidades está cargado)
   */
  getSlot(tipo) {
    const base = this.s.slots?.[tipo] ?? 0;
    const r = EventBus.emit('player:calc_slot', {
      tipo, base, player: this.s, final: base,
    });
    return r?.final ?? base;
  },

  // ── Modificaciones de HP ─────────────────────────────────────
  heal(n) {
    const prev = this.s.hp;
    this.s.hp = U.clamp(this.s.hp + n, 0, this.s.maxHp);
    EventBus.emit('player:stat_change', { stat:'hp', prev, current:this.s.hp, delta:n });
  },

  damage(n) {
    const base = Math.max(1, n - this.getDef());
    const result = EventBus.emit('player:stat_change', {
      stat:'hp', prev:this.s.hp,
      current: this.s.hp - base,
      delta: -base, damage: base,
    });
    const finalDmg = result?.damage ?? base;
    this.s.hp -= finalDmg;
    return finalDmg;
  },

  // ── Inventario ───────────────────────────────────────────────
  addItem(o) {
    this.s.inventory.push(o);
    EventBus.emit('player:item_add', { item:o, player:this.s });
    return o;
  },
  rmItem(id) {
    const item = this.s.inventory.find(x=>x.id===id);
    this.s.inventory = this.s.inventory.filter(x=>x.id!==id);
    if(item) EventBus.emit('player:item_remove', { item, player:this.s });
  },
  findItem(q) {
    if(!q) return null;
    const qn = q.toLowerCase().replace(/_/g,' ');
    return this.s.inventory.find(i=>
      i.id===q ||
      i.blueprint?.toLowerCase().includes(q.toLowerCase()) ||
      i.nombre?.toLowerCase().includes(qn)
    );
  },

  // ── Equipamiento ─────────────────────────────────────────────
  equip(item, slotHint=null) {
    const eq = this.s.equipped || (this.s.equipped = {});
    const normalizar = (s='') => s.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_');
    const hint = normalizar(slotHint || '');
    const aliases = {
      mh:'mano_izquierda', manoizquierda:'mano_izquierda', mano_i:'mano_izquierda',
      md:'mano_derecha', manoderecha:'mano_derecha', mano_d:'mano_derecha',
      acc1:'accesorio_1', accesorio1:'accesorio_1',
      acc2:'accesorio_2', accesorio2:'accesorio_2',
    };
    const slotManual = aliases[hint] || hint || null;
    const tipo = normalizar(item.tipo || '');
    const equipSlot = normalizar(item.equip_slot || '');

    let slot = slotManual || equipSlot;
    if(!slot) {
      if(tipo==='arma')            slot = 'mano_derecha';
      else if(tipo==='armadura')   slot = 'peto';
      else if(tipo==='casco')      slot = 'casco';
      else if(tipo==='guantes')    slot = 'guantes';
      else if(tipo==='peto')       slot = 'peto';
      else if(tipo==='botas')      slot = 'botas';
      else if(tipo==='accesorio')  slot = !eq.accesorio_1 ? 'accesorio_1' : 'accesorio_2';
      else if(tipo==='reliquia')   slot = !eq.accesorio_1 ? 'accesorio_1' : 'accesorio_2';
      else if(tipo==='mitico' || item.es_mitico) slot = 'mitico';
    }

    if(slot) eq[slot] = item;
    // Compatibilidad con sistemas antiguos
    if(tipo==='arma' || slot==='mano_derecha' || slot==='mano_izquierda') eq.arma = eq.mano_derecha || eq.mano_izquierda || item;
    if(tipo==='armadura' || slot==='peto' || slot==='casco' || slot==='guantes' || slot==='botas') eq.armadura = eq.peto || eq.casco || eq.guantes || eq.botas || item;
    if(tipo==='reliquia') eq.reliquia = item;
    if(tipo==='mitico' || item.es_mitico) eq.mitico = item;
    this._recalcResonancias();
    EventBus.emit('player:equip', { item, player:this.s });
  },

  _bonusAccesorios(stat) {
    const eq = this.s.equipped || {};
    const accs = [eq.accesorio_1, eq.accesorio_2, eq.reliquia].filter(Boolean);
    return accs.reduce((sum, item) => {
      const ef = item.efecto_accesorio || {};
      if(ef.stat !== stat) return sum;
      return sum + (ef.valor || 0);
    }, 0);
  },

  _recalcResonancias() {
    const eq = this.s.equipped || {};
    const seen = new Set();
    const pool = Object.values(eq).filter(Boolean).filter(it => {
      const k = it.id || it.blueprint || JSON.stringify(it);
      if(seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const grupos = {};
    const keyFrom = (it) => it.resonancia || it.set_id ||
      (it.tags||[]).find(t => ['resonante','corrupto','antiguo','vacío','vacio','inestable','fuego','hielo','rayo'].includes(t));
    pool.forEach(it => {
      const k = keyFrom(it);
      if(!k) return;
      if(!grupos[k]) grupos[k] = [];
      grupos[k].push(it);
    });
    const bonos = { atk:0, def:0, crit:0, evasion:0 };
    const habilidades = [];
    Object.entries(grupos).forEach(([k, items]) => {
      if(items.length >= 2) {
        bonos.atk += 1;
        bonos.def += 1;
        habilidades.push(`Eco oculto de ${k} (x${items.length})`);
      }
      if(items.length >= 3) {
        bonos.crit += 4;
        habilidades.push(`Pulso secreto de ${k}: +4% crit`);
      }
      if(items.length >= 4) {
        bonos.evasion += 6;
        habilidades.push(`Resonancia total ${k}: +6% evasión`);
      }
    });
    this.s._resonance = { bonos, habilidades };
  },

  // ── Acceso genérico a colecciones de plugins ─────────────────
  // Los plugins exponen sus colecciones a través de estos helpers
  // usando el namespace ext. El core no sabe que "habilidades" existe.

  /**
   * Añade un elemento a una colección de ext si hay espacio en slots.
   * Uso: Player.addToSlot('habilidades', hab)
   */
  addToSlot(tipo, item) {
    const coleccion = this.s.ext[tipo];
    if(!Array.isArray(coleccion)) {
      console.warn(`[Player] ext.${tipo} no es un array. ¿Plugin no cargado?`);
      return false;
    }
    if(coleccion.length >= this.getSlot(tipo)) return false;
    coleccion.push(item);
    EventBus.emit('player:slot_add', { tipo, item, player:this.s });
    return true;
  },

  removeFromSlot(tipo, id) {
    if(!Array.isArray(this.s.ext[tipo])) return;
    this.s.ext[tipo] = this.s.ext[tipo].filter(x=>x.id!==id);
    EventBus.emit('player:slot_remove', { tipo, id, player:this.s });
  },

  findInSlot(tipo, q) {
    const col = this.s.ext[tipo];
    if(!Array.isArray(col)) return null;
    return col.find(x=>
      x.id===q ||
      x.nombre?.toLowerCase().includes(q?.toLowerCase())
    );
  },

  // ── Serialización ────────────────────────────────────────────
  ser()    { return this.s; },
  load(d)  { this.s = d; },
};
