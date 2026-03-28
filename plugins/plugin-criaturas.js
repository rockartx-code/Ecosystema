// ════════════════════════════════════════════════════════════════
// PLUGIN: Criaturas — Implementación completa del sistema de criaturas
//
// Este plugin registra:
//   - EntityRegistry.register('creature', ...)  fábrica de criaturas
//   - Escucha world:request_creatures            genera criaturas en nodos
//   - Escucha worldai:tick_creatures             mueve criaturas libres
//   - Escucha player:create                      añade ext.compañeros y slots
//   - Escucha player:tick                        actualiza afinidad/memoria
//   - Escucha world:node_enter                   notifica llegada de criatura
//   - Escucha combat:post_resolve                aura de compañero en batalla
//   - Registra comandos: capturar, vincular, liberar, criar, modo, nombrar, criaturas
// ════════════════════════════════════════════════════════════════

// ── Implementación de Creature ────────────────────────────────────
class Creature extends Entity {
  constructor(data = {}) {
    super({ ...data, tipo:'creature' });

    // Stats específicos de criatura
    this.voluntad      = data.voluntad      ?? U.rand(20, 65);
    this.afinidad      = data.afinidad      ?? 0;
    this.inestabilidad = data.inestabilidad ?? U.rand(10, 35);
    this.arquetipo     = data.arquetipo     || 'eco_encarnado';
    this.modo          = data.modo          || 'activo';
    this.imprint       = data.imprint       || null;
    this.linaje        = data.linaje        || { parent_a:null, parent_b:null, generacion:0 };
    this.memoria       = data.memoria       || { combates:0, ciclos:0 };
    this.fase          = data.fase          ?? 2;
  }

  onTick(clock) {
    this.memoria.ciclos++;
    // Alta inestabilidad → puede cambiar de estado
    if(this.inestabilidad > 70 && this.estado === 'vinculada') {
      if(U.chance(0.05)) {
        this.estado = 'libre';
        EventBus.emit('creature:escaped', { creature:this });
      }
    }
  }

  onCombatStart(battle) {
    EventBus.emit('creature:combat_start', { creature:this, battle });
  }

  // Aplica el aura elemental de esta criatura a un enemigo en batalla
  apoyoEnTurno(battle) {
    _apoyoCompanero(this, battle);
  }

  statsEnBatalla() {
    const modModo = {
      activo:    { atk:1.0, hp:1.0 },
      caza:      { atk:1.4, hp:0.7 },
      defensivo: { atk:0.7, hp:1.5 },
      autónomo:  { atk:1.0, hp:1.0 },
      latente:   { atk:0.0, hp:1.0 },
    };
    const m = modModo[this.modo] || modModo.activo;
    return {
      atk: Math.round(this.atk * m.atk),
      hp:  Math.round(this.maxHp * m.hp),
      def: this.def || 0,
    };
  }

  anclasRequeridas() {
    const arq = D.creatures?.[this.arquetipo];
    return arq?.anclas || [];
  }

  serialize() {
    return {
      ...super.serialize(),
      voluntad:      this.voluntad,
      afinidad:      this.afinidad,
      inestabilidad: this.inestabilidad,
      arquetipo:     this.arquetipo,
      modo:          this.modo,
      imprint:       this.imprint,
      linaje:        this.linaje,
      memoria:       this.memoria,
      fase:          this.fase,
    };
  }
}

// ── Helpers internos ──────────────────────────────────────────────
function _getAura(creature) {
  const tags = creature.tags || [];
  if(tags.includes('fuego'))                          return 'ARDIENDO';
  if(tags.includes('agua'))                           return 'MOJADO';
  if(tags.includes('rayo'))                           return 'ELECTRIZADO';
  if(tags.includes('hielo'))                          return 'CONGELADO';
  if(tags.includes('eco') || tags.includes('resonante')) return 'RESONANTE';
  if(tags.includes('corrupto')|| tags.includes('vacío'))  return 'VACÍO';
  return null;
}

function _apoyoCompanero(creature, battle, opts = {}) {
  if(!creature || !battle || creature.modo === 'latente' || creature.estado === 'latente') return;
  const aura = _getAura(creature);
  const enemigos = battle.cola.filter(c => c.vivo && (c.tipo === 'enemy' || c.tipo === 'npc'));
  if(!enemigos.length) return;

  const modo = creature.modo || 'activo';
  const atk  = Math.max(1, creature.atk || 1);
  const factorBase = opts.opening ? 0.55 : 0.35;

  const atacar = (target, factor, etiqueta = '') => {
    if(!target?.vivo) return;
    const dmg = Math.max(1, Math.round(atk * factor) - Math.floor((target.def || 0) * 0.35));
    target.hp = Math.max(0, target.hp - dmg);
    battleLog(battle, `✦ ${creature.nombre}${etiqueta} → ${target.name}  −${dmg}HP  (${target.hp}/${target.maxHp})`, 't-cri');
    if(aura && !target.elemento_estado) {
      target.elemento_estado = aura;
      battleLog(battle, `  ↳ ${creature.nombre} aplica ${aura}.`, 't-cri');
    }
    if(target.hp <= 0) { target.vivo = false; battleLog(battle, `${target.name} cae.`, 't-cor'); }
  };

  if(modo === 'defensivo') {
    const p = Player.get();
    const curacion = Math.floor(atk * (opts.opening ? 0.45 : 0.3));
    p.hp = Math.min(p.maxHp, p.hp + curacion);
    const pj = battle.cola.find(c => c.tipo === 'player' && c.playerId === p.id);
    if(pj) pj.hp = p.hp;
    battleLog(battle, `✦ ${creature.nombre} cura ${curacion}HP al jugador.`, 't-cri');
    return;
  }

  if(modo === 'autónomo') {
    const p = Player.get();
    if((p.hp / Math.max(1, p.maxHp)) < 0.3) {
      const curacion = Math.floor(atk * 0.25);
      p.hp = Math.min(p.maxHp, p.hp + curacion);
      const pj = battle.cola.find(c => c.tipo === 'player' && c.playerId === p.id);
      if(pj) pj.hp = p.hp;
      battleLog(battle, `✦ ${creature.nombre} [autónomo] cura ${curacion}HP.`, 't-cri');
      return;
    }
  }

  const target = (modo === 'caza')
    ? enemigos.reduce((a,b)=>a.hp<=b.hp?a:b)
    : enemigos[0];
  const factor = modo === 'caza' ? factorBase * 1.3 : factorBase;
  atacar(target, factor, opts.opening ? ' [embiste]' : '');
}

function _mkCreature(arcId, nodeId, nodeEstado = 'virgen', opts = {}) {
  const arq = D.creatures?.[arcId] ||
              Object.values(D.creatures || {})[0] ||
              { tags:[], hp:10, atk:4, def:0, desc:'—' };
  const rng   = U.rng(Date.now() + Math.random());
  const extra = nodeEstado === 'corrompido' ? ['corrupto'] : [];
  const cn    = D.creNames || { prefijos:['Eco'], sufijos:['Profundo'] };
  const nombre = U.pick(cn.prefijos || ['Eco'], rng) + '-' + U.pick(cn.sufijos || ['Profundo'], rng);
  const imp   = typeof Imprint !== 'undefined'
    ? Imprint.gen(arcId, [...(arq.tags||[]),...extra], { nodeId, cycle:Clock.cycle, pid:'world' })
    : null;

  const dif = opts.difficulty || 1.0;
  return new Creature({
    nombre, arquetipo:arcId,
    tags:    [...(arq.tags||[]), ...extra],
    imprint: imp,
    hp:      Math.round((arq.hp || 10) * Math.sqrt(dif)),
    maxHp:   Math.round((arq.hp || 10) * Math.sqrt(dif)),
    atk:     Math.round((arq.atk|| 4) * Math.sqrt(dif) * 0.9),
    def:     arq.def  || 0,
    desc:    arq.desc || '—',
    inestabilidad: extra.includes('inestable') ? U.rand(40,70) : U.rand(10,35),
    nodeId,
  });
}

function _anclasRequeridas(creature) {
  if(!creature) return [];
  if(typeof creature.anclasRequeridas === 'function') return creature.anclasRequeridas();
  const arq = D.creatures?.[creature.arquetipo];
  return arq?.anclas || [];
}

// ── Verificar si el jugador tiene ancla compatible ────────────────
function _anclaCompatible(creature) {
  const reqs = _anclasRequeridas(creature);
  if(!reqs.length) return { ok:true, ancla:null };
  const ancla = Player.get().inventory.find(i=>reqs.includes(i.blueprint));
  return { ok:!!ancla, ancla:ancla || null };
}

// ── Comandos ──────────────────────────────────────────────────────
function cmdCapturar(args) {
  const target = args.join(' ').trim();
  const captureService = ServiceRegistry?.get?.('gameplay.capture.start');
  if(typeof captureService === 'function') return captureService(target);
  const q      = target.toLowerCase();
  const n      = World.node(Player.pos());
  const cre    = target
    ? n?.creatures?.find(c => {
        const nombre = String(c?.nombre || '').toLowerCase();
        const arc    = String(c?.arquetipo || '').toLowerCase();
        const id     = String(c?.id || '').toLowerCase();
        const hash   = String(c?.imprint?.hash || c?.hash || '').toLowerCase();
        const short  = hash ? hash.slice(0, 6) : '';
        return nombre.includes(q) || arc.includes(q) || id.includes(q) || hash === q || short === q;
      })
    : n?.creatures?.[0];
  if(!cre) { Out.line('No hay criatura para capturar.','t-dim'); return; }

  cre.hp_current = cre.hp || cre.maxHp;
  const { ok, ancla } = _anclaCompatible(cre);
  const reqs = _anclasRequeridas(cre);

  Out.sp(); Out.sep('─');
  Out.line(`CAPTURA — ${cre.nombre}  [${cre.arquetipo}]`, 't-cri', true);
  Out.line(`HP:${cre.hp}  ATK:${cre.atk}  DEF:${cre.def||0}  Voluntad:${cre.voluntad}`, 't-dim');
  Out.line(`Tags: ${cre.tags.join(', ')}`, 't-dim');
  if(reqs.length) {
    Out.line(`Anclas requeridas: ${reqs.join(' / ')}`, ok ? 't-cra' : 't-pel');
    if(!ok) Out.line('⚠ Sin ancla compatible. La captura será más difícil.','t-pel');
    else    Out.line(`Ancla disponible: ${ancla.blueprint} ✓`, 't-cra');
  } else {
    Out.line('No requiere ancla específica.','t-dim');
  }
  Out.line('Debilita la criatura a < 30% HP y usa "vincular [ancla]".', 't-dim');
  Out.sep('─'); Out.sp();

  const { cancelled } = EventBus.emitCancellable('creature:capture_try', { creature:cre, player:Player.get() });
  if(cancelled) { Out.line('La captura fue bloqueada.','t-dim'); return; }

  const p = Player.get();
  const startBattle = ServiceRegistry?.get?.('runtime.battle.start') || ServiceRegistry?.get?.('gameplay.battle.start');
  const actors = [
    { tipo:'player',   id:p.id,   name:p.name,     hp:p.hp, maxHp:p.maxHp, atk:Player.getAtk(), def:Player.getDef(), nodeId:n.id, playerId:p.id, vivo:true },
    { tipo:'creature', id:cre.id, name:cre.nombre, hp:cre.hp_current, maxHp:cre.maxHp||cre.hp, atk:cre.atk, def:cre.def||0, nodeId:n.id, tags:cre.tags||[], vivo:true, _cre_ref:cre },
  ];
  if(typeof startBattle === 'function') startBattle(n.id, actors);
  else Net.startBattle(n.id, actors);
}

function cmdVincular(args, battle) {
  const anclaQuery = (Array.isArray(args) ? args.join(' ') : args||'').trim();
  const p   = Player.get();
  const pos = Player.pos();
  const n   = World.node(pos);

  // Buscar criatura en combate activo.
  // Importante: la HP confiable durante combate vive en `battle.cola`,
  // no necesariamente en el estado persistido del nodo.
  let cre = null;         // referencia persistida (mundo/inventario)
  let creCombate = null;  // snapshot de combate con HP actual
  if(battle) {
    const c = battle.cola.find(x=>x.tipo==='creature'&&x.vivo);
    if(c) {
      creCombate = c;
      cre = n?.creatures?.find(x=>x.id===c.id) || c._cre_ref || null;
    }
  }
  if(!cre) cre = n?.creatures?.[0] || null;
  if(!cre && creCombate) cre = creCombate;
  if(!creCombate && cre) creCombate = cre;
  if(!creCombate) { Out.line('No hay criatura para vincular.','t-dim'); return; }

  // Verificar HP usando los valores del combate cuando existen.
  const hpActual = creCombate.hp_current ?? creCombate.hp;
  const hpMax    = creCombate.maxHp || cre.maxHp || creCombate.hp || cre.hp || 1;
  const hpPct = hpActual / hpMax;
  if(hpPct >= 0.30) { Out.line(`HP al ${Math.round(hpPct*100)}%. Necesitas < 30% para vincular.`,'t-pel'); return; }

  // Verificar ancla
  const reqs = _anclasRequeridas(cre);
  let ancla = null;
  if(reqs.length) {
    ancla = anclaQuery
      ? p.inventory.find(i=>reqs.includes(i.blueprint)&&i.blueprint.includes(anclaQuery))
      : p.inventory.find(i=>reqs.includes(i.blueprint));
    if(!ancla) { Out.line(`Necesitas un ancla compatible: ${reqs.join(' / ')}`,'t-pel'); return; }
  }

  // Voluntad decide si la vinculación tiene éxito
  const chance = ancla ? 0.75 : 0.45;
  if(!U.chance(chance)) {
    Out.line(`${cre.nombre} rechaza el vínculo. (Voluntad: ${cre.voluntad})`,'t-pel');
    if(ancla) { Out.line('El ancla se consume de todas formas.','t-dim'); Player.rmItem(ancla.id); }
    return;
  }

  // Vincular
  if(ancla) Player.rmItem(ancla.id);
  cre.estado   = 'vinculada';
  cre.afinidad = 20;
  World.rmCreature(pos, cre.id);

  if(!Player.addToSlot('compañeros', cre)) {
    Out.line('Sin espacio para compañeros.','t-dim');
    cre.estado = 'libre';
    n.creatures.push(cre);
    return;
  }

  p.stats.capturas = (p.stats.capturas || 0) + 1;
  if(typeof XP !== 'undefined') XP.ganar('criaturas', 35, 'captura exitosa');

  Out.sp();
  Out.line(`✦ ${cre.nombre} vinculado. [${cre.arquetipo}]`, 't-cri', true);
  Out.line(`HP:${cre.hp}  ATK:${cre.atk}  Voluntad:${cre.voluntad}  Afinidad:${cre.afinidad}`, 't-dim');
  Out.line(`Tags: ${cre.tags.join(', ')}`, 't-dim');
  Out.line(`Gen.${cre.linaje?.generacion||0}  Modo: ${cre.modo}`, 't-dim');
  Out.sep('─'); Out.sp();

  EventBus.emit('creature:bound', { creature:cre, player:p });
  if(battle) {
    const escapeBattle = ServiceRegistry?.get?.('runtime.battle.escape') || ServiceRegistry?.get?.('gameplay.combat.escape');
    if(typeof escapeBattle === 'function') escapeBattle(battle, p.id);
    else Net.sendBattleAction(battle.id, p.id, 'huir', null);
  }
  save();
}

function cmdLiberar(args) {
  const q = args.join(' ').trim();
  const c = Player.findInSlot('compañeros', q);
  if(!c) { Out.line(`No tienes "${q}".`,'t-dim'); return; }
  Player.removeFromSlot('compañeros', c.id);
  const n = World.node(Player.pos());
  if(n) { c.estado='libre'; c.afinidad=Math.max(0,c.afinidad-20); n.creatures.push(c); }
  Out.line(`Liberas a ${c.nombre}. Afinidad reducida.`,'t-mem');
  save();
}

function cmdModo(args) {
  const [cQ, ...rest] = args;
  const modo = rest.join(' ').trim();
  const c = Player.findInSlot('compañeros', cQ);
  if(!c) { Out.line(`No tienes "${cQ||'?'}".`,'t-dim'); return; }
  const modos = ['activo','defensivo','caza','autónomo','latente'];
  if(!modos.includes(modo)) {
    Out.line(`Modos: ${modos.join(' / ')}`,'t-dim');
    Out.line('  activo    — ataca al de menor HP','t-dim');
    Out.line('  caza      — ATK×1.4 DEF×0.7','t-dim');
    Out.line('  defensivo — DEF×1.5 ATK×0.7, cura al jugador','t-dim');
    Out.line('  autónomo  — evalúa la situación','t-dim');
    Out.line('  latente   — no participa en combate','t-dim');
    return;
  }
  c.modo = modo;
  Out.line(`${c.nombre} → ${modo}.`,'t-cri');
  save();
}

function cmdNombrar(args) {
  const [cQ, ...rest] = args;
  const nombre = rest.join(' ').trim();
  const c = Player.findInSlot('compañeros', cQ);
  if(!c || !nombre) return;
  c.nombre = nombre;
  Out.line(`${c.nombre}.`,'t-cri');
  save();
}

function cmdCompañeros() {
  const comps = Player.get().ext?.compañeros || [];
  Out.sp();
  Out.line(`— COMPAÑEROS (${comps.length}/${Player.getSlot('compañeros')}) —`,'t-cri');
  if(!comps.length) { Out.line('Sin compañeros. Usa "capturar" en un nodo con criaturas.','t-dim'); Out.sp(); return; }
  comps.forEach(c => {
    const st  = c instanceof Creature ? c.statsEnBatalla() : { atk:c.atk, hp:c.maxHp, def:c.def||0 };
    const gen = c.linaje?.generacion > 0 ? ` Gen.${c.linaje.generacion}` : '';
    Out.line(`  ${c.nombre}  [${c.arquetipo}]  ${c.estado}  modo:${c.modo}${gen}`, 't-cri');
    Out.line(`    HP:${c.hp}/${c.maxHp}(→${st.hp}) ATK:${c.atk}→${st.atk}  DEF:${c.def||0}→${st.def}  Afi:${c.afinidad}  Ines:${c.inestabilidad}`, 't-dim');
    Out.line(`    Tags: ${c.tags.join(', ')}  Combates:${c.memoria?.combates||0}`, 't-dim');
    if(c.inestabilidad > 60) Out.line(`    ⚠ Alta inestabilidad`, 't-pel');
  });
  Out.sp();
}

function cmdCriar(args) {
  const [qa, qb] = args;
  const a = Player.findInSlot('compañeros', qa);
  const b = Player.findInSlot('compañeros', qb);
  if(!a || !b || a.id===b.id) { Out.line('Necesitas dos compañeros distintos.','t-dim'); return; }
  if(a.afinidad < 60 || b.afinidad < 60) {
    Out.line(`Ambos necesitan afinidad ≥ 60.  (${a.nombre}:${a.afinidad}  ${b.nombre}:${b.afinidad})`,'t-dim');
    return;
  }
  const fams = D.creFamilies || {};
  const compat = Object.values(fams).some(f=>f.includes(a.arquetipo)&&f.includes(b.arquetipo));
  if(!compat) { Out.line(`${a.nombre} y ${b.nombre} no son compatibles.`,'t-dim'); return; }

  const rng     = U.rng(Date.now()+Math.random());
  const tagsH   = [...U.pickN(a.tags,Math.ceil(a.tags.length/2),rng),...U.pickN(b.tags,Math.ceil(b.tags.length/2),rng)];
  const genA    = a.linaje?.generacion||0, genB=b.linaje?.generacion||0;
  const genHijo = Math.max(genA,genB)+1;
  const genBonus= 1 + Math.min(genHijo,10)*0.04;
  const cn      = D.creNames || { prefijos:['Eco'], sufijos:['Bifurcado'] };
  const nombre  = U.pick(cn.prefijos,rng)+'-'+U.pick(cn.sufijos,rng);

  const cria = new Creature({
    nombre, arquetipo: Math.random()>.5 ? a.arquetipo : b.arquetipo,
    tags: tagsH,
    hp:   Math.round(Math.max(a.maxHp,b.maxHp)*genBonus),
    maxHp:Math.round(Math.max(a.maxHp,b.maxHp)*genBonus),
    atk:  Math.round(Math.max(a.atk,b.atk)*genBonus),
    def:  Math.round(Math.max(a.def||0,b.def||0)*genBonus),
    voluntad:      Math.round((a.voluntad+b.voluntad)/2)+U.rand(-5,5),
    afinidad:      50,
    inestabilidad: Math.max(0,Math.floor(Tags?.tension(tagsH)*80||30)-genHijo*3),
    estado:        'latente', modo:'latente',
    linaje: { parent_a:a.imprint?.hash, parent_b:b.imprint?.hash, generacion:genHijo },
  });

  EventBus.emit('creature:breed_result', { cria, parentA:a, parentB:b });
  const huevo = {
    id:U.uid(), blueprint:'huevo_impronta',
    nombre:`Huevo de ${nombre}`, tipo:'reliquia',
    tags:tagsH, estado:'latente', _cria:cria,
    desc:`Gen.${genHijo}. ATK:${cria.atk} DEF:${cria.def} HP:${cria.maxHp}`,
  };
  Player.addItem(huevo);
  Player.get().stats.breeding = (Player.get().stats.breeding||0)+1;
  if(typeof XP !== 'undefined') XP.ganar('criaturas', 40+genHijo*15, `breeding gen.${genHijo}`);

  Out.sp();
  Out.line(`BREEDING — ${a.nombre} × ${b.nombre}`, 't-cri', true);
  Out.line(`${nombre}  Gen.${genHijo}`, 't-cri');
  Out.line(`Stats: HP:${cria.maxHp}  ATK:${cria.atk}  DEF:${cria.def}  (×${genBonus.toFixed(2)})`, 't-dim');
  Out.line('"usar huevo" para incubar.','t-dim');
  Out.sp();
  save();
}

// ── Registro del plugin ───────────────────────────────────────────
const pluginCreaturas = {
  id:      'plugin:criaturas',
  nombre:  'Sistema de Criaturas',
  version: '2.0.0',
  descripcion: 'Criaturas capturables, compañeros, breeding y aura en batalla.',

  onLoad(ctx) {
    // Registrar la fábrica en EntityRegistry
    EntityRegistry.register('creature', (data, context) => {
      return new Creature(data);
    });
  },

  hooks: {
    // Inicializar datos de criaturas en el jugador
    'player:create': {
      fn(payload) {
        payload.player.slots.compañeros     = D.playerDef?.slots_compañeros || 1;
        payload.player.ext.compañeros       = [];
        return payload;
      }
    },

    // Slot dinámico de compañeros
    'player:calc_slot': {
      fn(payload) {
        if(payload.tipo !== 'compañeros') return payload;
        payload.final = D.playerDef?.slots_compañeros || 1;
        return payload;
      }
    },

    // Tick de compañeros: afinidad y memoria
    'player:tick': {
      fn(payload) {
        const comps = payload.player.ext?.compañeros || [];
        comps.forEach(c => {
          if(c.memoria) c.memoria.ciclos++;
          c.afinidad = U.clamp((c.afinidad||0)+1, 0, 100);
        });
        return payload;
      }
    },

    // ── Declarar slot COMP en la status bar ───────────────────────
    'output:collect_status': {
      fn(payload) {
        const p     = payload.player;
        const comps = p.ext?.compañeros || [];
        const max   = Player.getSlot('compañeros');
        payload.slots['comp'] = { text: `${comps.length}/${max}`, color: 't-cri' };
        return payload;
      }
    },

    // Generar criaturas al poblar nodos
    'world:request_creatures': {
      fn(payload) {
        const wd = D.world;
        if(!U.chance(wd?.creature_chance || .35)) return payload;
        const cp = wd?.criaturas_por_tipo?.[payload.tipo] || Object.keys(D.creatures||{}).slice(0,1);
        if(!cp.length) return payload;
        const arcId = U.pick(cp, payload.rng);
        const c = _mkCreature(arcId, payload.nodeId, payload.nodeEstado, { difficulty: payload.difficulty || 1 });
        payload.creatures.push(c);
        return payload;
      }
    },

    // Mover criaturas libres en WorldAI tick
    'worldai:tick_creatures': {
      fn(payload) {
        const { nodes, playerPos, eventos } = payload;
        Object.values(nodes).forEach(nodo => {
          if(!nodo.creatures) return;
          nodo.creatures.forEach(creature => {
            if(creature.estado !== 'libre') return;
            const exits = Object.values(World.exits(nodo.id));
            if(!exits.length) return;
            const destId = exits[Math.floor(Math.random()*exits.length)];
            if(destId === nodo.id) return;
            const destNode = World.node(destId);
            if(!destNode) return;
            destNode.creatures = destNode.creatures || [];
            destNode.creatures.push(creature);
            nodo.creatures = nodo.creatures.filter(c=>c.id!==creature.id);
            if(destId === playerPos)
              eventos.push({ tipo:'creature_enter', entity:creature, nodeId:destId });
          });
        });
        return payload;
      }
    },

    // Apoyo de compañeros al inicio del turno del jugador en batalla
    'combat:start': {
      fn(payload) {
        const battle = payload?.battle;
        if(!battle?.cola?.length) return payload;
        const comps = Player.get().ext?.compañeros || [];
        comps.forEach(c => _apoyoCompanero(c, battle, { opening:true }));
        return payload;
      }
    },

    'combat:post_resolve': {
      fn(payload) {
        const comps = Player.get().ext?.compañeros || [];
        comps.forEach(c => _apoyoCompanero(c, payload?.battle));
        return payload;
      }
    },
  },

  comandos: {
    'capturar':  { fn: cmdCapturar,   meta: { titulo:'capturar [nombre]', color:'t-cri', desc:'Inicia combate de captura con una criatura del nodo.', uso:['capturar','capturar bifurcado'], notas:['Debilita a < 30% HP y usa "vincular [ancla]".'] } },
    'vincular':  { fn: cmdVincular,   meta: { titulo:'vincular [ancla]',   color:'t-cri', desc:'Vincula una criatura debilitada consumiendo un ancla compatible.' } },
    'liberar':   { fn: cmdLiberar,    meta: { titulo:'liberar [nombre]',   color:'t-cri', desc:'Suelta un compañero al nodo actual.' } },
    'modo':      { fn: cmdModo,       meta: { titulo:'modo [cre] [modo]',  color:'t-cri', desc:'Cambia el modo de comportamiento de un compañero.' } },
    'nombrar':   { fn: cmdNombrar,    meta: { titulo:'nombrar [cre] [nombre]', color:'t-cri', desc:'Renombra un compañero.' } },
    'criaturas': { fn: ()=>cmdCompañeros(), meta: { titulo:'criaturas', color:'t-cri', desc:'Lista compañeros vinculados con sus stats y modo actual.' } },
    'comp':      { fn: ()=>cmdCompañeros(), meta: { titulo:'comp (alias criaturas)', color:'t-cri', desc:'Lista compañeros.' } },
    'criar':     { fn: cmdCriar,      meta: { titulo:'criar [a] [b]',      color:'t-cri', desc:'Cría dos compañeros compatibles con afinidad ≥ 60. Produce un huevo.' } },
  },
};
