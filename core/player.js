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

      // Equipamiento
      equipped: { arma:null, armadura:null, reliquia:null, mitico:null },

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
    const base = this.s.atk + (this.s.equipped.arma?.atk || 0);
    const r = EventBus.emit('player:calc_stat', {
      stat: 'atk', base, player: this.s, final: base,
    });
    return r?.final ?? base;
  },

  getDef() {
    const base = this.s.def + (this.s.equipped.armadura?.def || 0);
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
    const r = EventBus.emit('player:calc_stat', {
      stat, base, player: this.s, final: base,
    });
    return r?.final ?? base;
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
  equip(item) {
    if(item.tipo==='arma')                       this.s.equipped.arma     = item;
    else if(item.tipo==='armadura')              this.s.equipped.armadura = item;
    else if(item.tipo==='reliquia')              this.s.equipped.reliquia = item;
    else if(item.tipo==='mítico'||item.es_mitico)this.s.equipped.mitico   = item;
    EventBus.emit('player:equip', { item, player:this.s });
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
