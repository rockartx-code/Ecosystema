// ════════════════════════════════════════════════════════════════
// PLUGIN: Facciones v2.0
// Control territorial, servicios por reputación y emboscadas.
// ════════════════════════════════════════════════════════════════
const FactionSystem = (() => {
  function _svc(name) {
    return (typeof ServiceRegistry !== 'undefined' && typeof ServiceRegistry.get === 'function')
      ? ServiceRegistry.get(name)
      : null;
  }
  function _player() {
    const fn = _svc('runtime.player.current');
    return typeof fn === 'function' ? fn() : null;
  }
  function _playerPos() {
    const fn = _svc('runtime.player.position');
    return typeof fn === 'function' ? fn() : null;
  }
  function _playerCombatStats() {
    const fn = _svc('runtime.player.combat_stats');
    return typeof fn === 'function' ? (fn() || {}) : {};
  }
  function _playerAddItem(item) {
    const fn = _svc('runtime.player.add_item');
    return typeof fn === 'function' ? !!fn(item) : false;
  }
  function _worldAll() {
    const fn = _svc('runtime.world.all');
    return typeof fn === 'function' ? (fn() || {}) : {};
  }
  function _worldNode(nodeId) {
    const fn = _svc('runtime.world.node');
    return typeof fn === 'function' ? fn(nodeId) : null;
  }
  function _worldCalcDifficulty() {
    const fn = _svc('runtime.world.calc_difficulty');
    return typeof fn === 'function' ? Number(fn()) || 1.0 : 1.0;
  }
  function _gsNPCEnNodo(nodeId) {
    const fn = _svc('runtime.gs.npcs_in_node');
    return typeof fn === 'function' ? (fn(nodeId) || []) : [];
  }
  function _gsNpc(npcId) {
    const fn = _svc('runtime.gs.npc');
    return typeof fn === 'function' ? fn(npcId) : null;
  }
  function _line(text, color='t-out', bold=false) {
    const fn = _svc('runtime.output.line');
    if(typeof fn === 'function') fn(text, color, bold);
  }
  function _sp() {
    const fn = _svc('runtime.output.sp');
    if(typeof fn === 'function') fn();
  }
  function _sep(ch='─', len=46) {
    const fn = _svc('runtime.output.sep');
    if(typeof fn === 'function') fn(ch, len);
  }
  function _refreshStatus() {
    const fn = _svc('runtime.status.refresh');
    if(typeof fn === 'function') fn();
  }

  const FACCIONES_BASE = {
    orden_grieta:    { nombre:'Orden de la Grieta', color:'t-sis', tipos_nodo:['ruina','umbral'],             icon:'⟁' },
    culto_eco:       { nombre:'Culto del Eco',       color:'t-mag', tipos_nodo:['templo','caverna','resonante'],icon:'◎' },
    errantes_libres: { nombre:'Errantes Libres',     color:'t-mem', tipos_nodo:['bosque','yermo','hub'],       icon:'◈' },
  };

  const RANGOS = [
    { min:-100, max:-60, nombre:'Enemigo Declarado', color:'t-pel', icon:'⚔' },
    { min:-60,  max:-30, nombre:'Hostil',            color:'t-pel', icon:'✗'  },
    { min:-30,  max:0,   nombre:'Desconfiado',       color:'t-dim', icon:'?'  },
    { min:0,    max:30,  nombre:'Neutral',           color:'t-out', icon:'·'  },
    { min:30,   max:60,  nombre:'Conocido',          color:'t-cra', icon:'◦'  },
    { min:60,   max:80,  nombre:'Aliado',            color:'t-eco', icon:'◎'  },
    { min:80,   max:101, nombre:'Hermano/Hermana',   color:'t-cor', icon:'✦'  },
  ];

  const controlNodos = {};

  function inicializar() {
    Object.entries(_worldAll()).forEach(([nodeId, nodo]) => {
      Object.entries(FACCIONES_BASE).forEach(([facId, fac]) => {
        if(fac.tipos_nodo.includes(nodo.tipo)) {
          if(!controlNodos[facId]) controlNodos[facId] = new Set();
          if(Math.random() < 0.6) controlNodos[facId].add(nodeId);
        }
      });
    });
    EventBus.emit('faction:init', { controlNodos });
  }

  function faccionDeNodo(nodeId) {
    for(const [facId, nodos] of Object.entries(controlNodos))
      if(nodos.has(nodeId)) return facId;
    return null;
  }

  function getRep(facId)       { return _player()?.reputacion?.[facId] || 0; }
  function getRango(rep)       { return RANGOS.find(r => rep>=r.min && rep<r.max) || RANGOS[3]; }
  function getFaccion(facId)   { return ModuleLoader.get('facciones')?.[facId] || FACCIONES_BASE[facId] || null; }

  function setRep(facId, valor) {
    const p = _player();
    if(!p) return;
    p.reputacion = p.reputacion || {};
    const prev = p.reputacion[facId] || 0;
    p.reputacion[facId] = U.clamp(valor, -100, 100);
    const rango     = getRango(p.reputacion[facId]);
    const prevRango = getRango(prev);
    if(rango.nombre !== prevRango.nombre) {
      setTimeout(() => {
        const fac = getFaccion(facId);
        _sp();
        _line(`${rango.icon} REPUTACIÓN — ${fac?.nombre||facId}`, rango.color, true);
        _line(`${prevRango.nombre} → ${rango.nombre}  (${p.reputacion[facId]})`, rango.color);
        _sp();
      }, 300);
    }
  }

  function modRep(facId, delta) { setRep(facId, getRep(facId) + delta); }

  function onNodeEnter(nodeId) {
    const facId = faccionDeNodo(nodeId);
    if(!facId) return;
    const rep = getRep(facId);
    const fac = getFaccion(facId);
    if(!fac) return;

    if(rep <= -30) _procesarHostilidad(facId, fac, nodeId, rep);
    else if(rep >= 60) _procesarAlianza(facId, fac, nodeId, rep);
    else if(rep >= 0) {
      const npc = _gsNPCEnNodo(nodeId).find(n => n.faccion === facId);
      if(npc) _line(`[${fac.icon} ${fac.nombre}] ${npc.nombre} te observa.`, fac.color||'t-out');
    }
  }

  function _procesarHostilidad(facId, fac, nodeId, rep) {
    const prob = rep <= -60 ? 0.8 : 0.45;
    if(!U.chance(prob)) return;

    _sp(); _sep('─');
    _line(`${fac.icon} TERRITORIO HOSTIL — ${fac.nombre}`, 't-pel', true);
    _line(`Reputación: ${rep} [${getRango(rep).nombre}]`, 't-pel');

    const dif = _worldCalcDifficulty();
    const numE = rep <= -60 ? 3 : 2;
    const ep   = D.enemies;
    const rng  = U.rng(Date.now() + nodeId);
    const nuevos = [];

    for(let i = 0; i < numE; i++) {
      if(!ep.length) break;
      const base = { ...U.pick(ep, rng) };
      base.id         = U.uid();
      base.hp         = Math.round((base.hp||10) * dif * 0.8);
      base.atk        = Math.round((base.atk||4) * Math.sqrt(dif));
      base.hp_current = base.hp;
      base.nombre     = `${fac.icon} ${base.nombre}`;
      base.faccion    = facId;
      const n = _worldNode(nodeId);
      if(!n) continue;
      n.enemies = n.enemies || [];
      n.enemies.push(base);
      nuevos.push(base);
    }

    _line(`¡${numE} miembro${numE>1?'s':''} de la facción te emboscan!`, 't-pel');
    _sep('─'); _sp();

    if(nuevos.length) {
      setTimeout(() => {
        const p = _player();
        const stats = _playerCombatStats();
        if(!p) return;
        const combatants = [
          { tipo:'player', id:p.id, name:p.name, hp:p.hp, maxHp:p.maxHp, atk:stats.atk || 0, def:stats.def || 0, nodeId, playerId:p.id },
          ...nuevos.map(e => ({ tipo:'enemy', id:e.id, name:e.nombre, hp:e.hp, maxHp:e.hp, atk:e.atk, def:e.def||0, nodeId, tags:[facId] })),
        ];
        const startBattleSvc = ServiceRegistry?.get?.('runtime.battle.start') || _svc('runtime.battle.start');
        if(startBattleSvc) startBattleSvc(nodeId, combatants);
        else _line('Servicio runtime.battle.start no disponible para emboscada de facción.', 't-dim');
      }, 800);
    }
    modRep(facId, -5);
  }

  function _procesarAlianza(facId, fac, nodeId, rep) {
    _sp();
    _line(`${fac.icon} ${fac.nombre} — Territorio aliado  [REP: ${rep}]`, fac.color||'t-eco');
    const servicios = _serviciosDisponibles(facId, rep, nodeId);
    if(servicios.length) {
      _line('Servicios disponibles:', fac.color||'t-eco');
      servicios.forEach(s => {
        _line(`  ${s.desc}`, fac.color||'t-out');
        if(s.auto) s.auto();
      });
    }
    _sp();
  }

  function _serviciosDisponibles(facId, rep, nodeId) {
    const servicios = [];
    const p = _player();
    if(!p) return servicios;
    if(rep >= 60) servicios.push({ desc:'Curación básica: +10HP (automático)', auto() { p.hp = Math.min(p.maxHp, p.hp+10); _refreshStatus(); } });
    if(rep >= 70) servicios.push({ desc:'Stamina restaurada (automático)', auto() { p.stamina = Math.min(p.maxStamina||100,(p.stamina||0)+30); _refreshStatus(); } });
    if(rep >= 80) {
      const n = _worldNode(nodeId || _playerPos());
      if(n) {
        const antes = n.enemies?.length || 0;
        n.enemies   = (n.enemies||[]).filter(e => e.faccion !== facId);
        const elim  = antes - n.enemies.length;
        if(elim > 0) servicios.push({ desc:`Protección: ${elim} enemigo${elim>1?'s':''} se retiran.` });
      }
      const createItem = _svc('runtime.items.create');
      if(typeof createItem === 'function') {
        const itemFac = createItem(rep >= 90 ? 'medicina_mayor' : 'fragmento_cura');
        if(itemFac && Math.random() < 0.4 && _playerAddItem(itemFac)) servicios.push({ desc:`Obsequio: ${itemFac.nombre}` });
      }
    }
    return servicios;
  }

  function onNPCMuerto(npc) {
    if(!npc.faccion) return;
    modRep(npc.faccion, -15);
    Object.keys(FACCIONES_BASE).forEach(fid => { if(fid !== npc.faccion && getRep(npc.faccion) > 30) modRep(fid, -5); });
  }

  function onMisionCompletada(mision) {
    const npc = _gsNpc(mision.npc_id);
    if(!npc?.faccion) return;
    modRep(npc.faccion, +20);
  }

  function onTraicion(npc) { if(npc.faccion) modRep(npc.faccion, -25); }

  function onBossDefeated() {
    Object.keys(controlNodos).forEach(facId => modRep(facId, +30));
  }

  function cmdFacciones() {
    _sp(); _line('— FACCIONES & TERRITORIOS —', 't-acc');
    const facs = ModuleLoader.get('facciones') || FACCIONES_BASE;
    Object.entries(facs).forEach(([id, f]) => {
      const rep   = getRep(id);
      const rango = getRango(rep);
      const nodos = controlNodos[id]?.size || 0;
      const base  = FACCIONES_BASE[id];
      _line(`  ${rango.icon} ${f.nombre||base?.nombre||id}  REP:${rep}  [${rango.nombre}]  Nodos:${nodos}`, rango.color);
      if(rep < -30) _line(`    → Emboscada al entrar en sus nodos.`, 't-pel');
      else if(rep >= 60) _line(`    → Servicios y protección en sus nodos.`, base?.color||'t-eco');
      if(base?.tipos_nodo) _line(`    Tipos: ${base.tipos_nodo.join(', ')}`, 't-dim');
    });
    _sp();
    const facActual = faccionDeNodo(_playerPos());
    if(facActual) {
      const fac = getFaccion(facActual);
      const rep = getRep(facActual);
      _line(`Nodo actual: ${fac?.nombre||facActual}  REP:${rep}  [${getRango(rep).nombre}]`, getRango(rep).color);
    } else {
      _line('Nodo actual: Sin control de facción.', 't-dim');
    }
    _sp();
  }

  return { getRep, setRep, modRep, getRango, getFaccion, faccionDeNodo, controlNodos, onNodeEnter, onNPCMuerto, onMisionCompletada, onTraicion, onBossDefeated, cmdFacciones, inicializar };
})();

// Registrar como plugin para que PluginLoader lo conozca
const pluginFacciones = {
  id: 'plugin:facciones', nombre:'Sistema de Facciones', version:'2.0.0',
  descripcion: 'Control territorial, reputación y emboscadas.',
  hooks: {
    'world:after_gen': {
      fn(payload) {
        setTimeout(() => FactionSystem.inicializar(), 100);
        return payload;
      }
    },
    'world:node_enter': {
      fn(payload) {
        FactionSystem.onNodeEnter(payload.nodeId);
        return payload;
      }
    },
    'narrative:npc_death': {
      fn(payload) {
        FactionSystem.onNPCMuerto(payload.npc);
        return payload;
      }
    },
    'narrative:mission_complete': {
      fn(payload) {
        FactionSystem.onMisionCompletada(payload.mision);
        return payload;
      }
    },
    'boss:defeated': {
      fn(payload) {
        FactionSystem.onBossDefeated();
        return payload;
      }
    },
    'player:create': {
      fn(payload) {
        payload.player.reputacion = {};
        const facs = ModuleLoader.get('facciones') || {};
        Object.entries(facs).forEach(([id, f]) => { payload.player.reputacion[id] = f.rep_inicial || 0; });
        return payload;
      }
    },
    'output:collect_status': {
      fn(payload) {
        const reps = Object.entries(payload.player.reputacion || {});
        if(reps.length) {
          const top = reps.reduce((a, b) => Math.abs(b[1]) > Math.abs(a[1]) ? b : a);
          payload.slots['fac'] = { text: `${top[0].slice(0,3).toUpperCase()}:${top[1]}`, color: FactionSystem.getRango(top[1]).color };
        }
        return payload;
      }
    },
  },
  comandos: {
    'facciones':   { fn: ()     => FactionSystem.cmdFacciones(), meta:{ titulo:'facciones', color:'t-sis', desc:'Ver facciones, reputación y territorios.' } },
    'reputacion':  { fn: ()     => FactionSystem.cmdFacciones(), meta:{ titulo:'reputacion (alias)', color:'t-sis', desc:'Ver reputación.' } },
  },
};
