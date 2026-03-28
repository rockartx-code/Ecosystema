// ════════════════════════════════════════════════════════════════
// PLUGIN: Facciones v2.0
// Control territorial, servicios por reputación y emboscadas.
// ════════════════════════════════════════════════════════════════
const FactionSystem = (() => {

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
    Object.entries(World.all()).forEach(([nodeId, nodo]) => {
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

  function getRep(facId)       { return Player.get().reputacion?.[facId] || 0; }
  function getRango(rep)       { return RANGOS.find(r => rep>=r.min && rep<r.max) || RANGOS[3]; }
  function getFaccion(facId)   { return ModuleLoader.get('facciones')?.[facId] || FACCIONES_BASE[facId] || null; }

  function setRep(facId, valor) {
    const p    = Player.get();
    p.reputacion = p.reputacion || {};
    const prev = p.reputacion[facId] || 0;
    p.reputacion[facId] = U.clamp(valor, -100, 100);
    const rango     = getRango(p.reputacion[facId]);
    const prevRango = getRango(prev);
    if(rango.nombre !== prevRango.nombre) {
      setTimeout(() => {
        const fac = getFaccion(facId);
        Out.sp();
        Out.line(`${rango.icon} REPUTACIÓN — ${fac?.nombre||facId}`, rango.color, true);
        Out.line(`${prevRango.nombre} → ${rango.nombre}  (${p.reputacion[facId]})`, rango.color);
        Out.sp();
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
      const npc = GS.npcEnNodo(nodeId).find(n => n.faccion === facId);
      if(npc) Out.line(`[${fac.icon} ${fac.nombre}] ${npc.nombre} te observa.`, fac.color||'t-out');
    }
  }

  function _procesarHostilidad(facId, fac, nodeId, rep) {
    const prob = rep <= -60 ? 0.8 : 0.45;
    if(!U.chance(prob)) return;

    Out.sp(); Out.sep('─');
    Out.line(`${fac.icon} TERRITORIO HOSTIL — ${fac.nombre}`, 't-pel', true);
    Out.line(`Reputación: ${rep} [${getRango(rep).nombre}]`, 't-pel');

    const dif = typeof World.calcDificultad === 'function' ? World.calcDificultad() : 1.0;
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
      const n = World.node(nodeId);
      n.enemies = n.enemies || [];
      n.enemies.push(base);
      nuevos.push(base);
    }

    Out.line(`¡${numE} miembro${numE>1?'s':''} de la facción te emboscan!`, 't-pel');
    Out.sep('─'); Out.sp();

    if(nuevos.length) {
      setTimeout(() => {
        const p = Player.get();
        const combatants = [
          { tipo:'player', id:p.id, name:p.name, hp:p.hp, maxHp:p.maxHp, atk:Player.getAtk(), def:Player.getDef(), nodeId, playerId:p.id },
          ...nuevos.map(e => ({ tipo:'enemy', id:e.id, name:e.nombre, hp:e.hp, maxHp:e.hp, atk:e.atk, def:e.def||0, nodeId, tags:[facId] })),
        ];
        const startBattleSvc = (typeof ServiceRegistry!=='undefined' && ServiceRegistry.get)
          ? (ServiceRegistry.get('runtime.battle.start') || ServiceRegistry.get('gameplay.battle.start'))
          : null;
        if(startBattleSvc) startBattleSvc(nodeId, combatants);
        else Out.line('Servicio runtime.battle.start no disponible para emboscada de facción.', 't-dim');
      }, 800);
    }
    modRep(facId, -5);
  }

  function _procesarAlianza(facId, fac, nodeId, rep) {
    Out.sp();
    Out.line(`${fac.icon} ${fac.nombre} — Territorio aliado  [REP: ${rep}]`, fac.color||'t-eco');
    const servicios = _serviciosDisponibles(facId, rep, nodeId);
    if(servicios.length) {
      Out.line('Servicios disponibles:', fac.color||'t-eco');
      servicios.forEach(s => {
        Out.line(`  ${s.desc}`, fac.color||'t-out');
        if(s.auto) s.auto();
      });
    }
    Out.sp();
  }

  function _serviciosDisponibles(facId, rep, nodeId) {
    const servicios = [];
    const p = Player.get();
    if(rep >= 60) servicios.push({ desc:'Curación básica: +10HP (automático)', auto() { p.hp = Math.min(p.maxHp, p.hp+10); refreshStatus(); } });
    if(rep >= 70) servicios.push({ desc:'Stamina restaurada (automático)', auto() { p.stamina = Math.min(p.maxStamina||100,(p.stamina||0)+30); refreshStatus(); } });
    if(rep >= 80) {
      const n = World.node(nodeId || Player.pos());
      if(n) {
        const antes = n.enemies?.length || 0;
        n.enemies   = (n.enemies||[]).filter(e => e.faccion !== facId);
        const elim  = antes - n.enemies.length;
        if(elim > 0) servicios.push({ desc:`Protección: ${elim} enemigo${elim>1?'s':''} se retiran.` });
      }
      if(typeof ItemSystem !== 'undefined') {
        const itemFac = ItemSystem.crear(rep >= 90 ? 'medicina_mayor' : 'fragmento_cura');
        if(itemFac && Math.random() < 0.4) { Player.addItem(itemFac); servicios.push({ desc:`Obsequio: ${itemFac.nombre}` }); }
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
    const npc = GS.npc(mision.npc_id);
    if(!npc?.faccion) return;
    modRep(npc.faccion, +20);
  }

  function onTraicion(npc) { if(npc.faccion) modRep(npc.faccion, -25); }

  function cmdFacciones() {
    Out.sp(); Out.line('— FACCIONES & TERRITORIOS —', 't-acc');
    const facs = ModuleLoader.get('facciones') || FACCIONES_BASE;
    Object.entries(facs).forEach(([id, f]) => {
      const rep   = getRep(id);
      const rango = getRango(rep);
      const nodos = controlNodos[id]?.size || 0;
      const base  = FACCIONES_BASE[id];
      Out.line(`  ${rango.icon} ${f.nombre||base?.nombre||id}  REP:${rep}  [${rango.nombre}]  Nodos:${nodos}`, rango.color);
      if(rep < -30) Out.line(`    → Emboscada al entrar en sus nodos.`, 't-pel');
      else if(rep >= 60) Out.line(`    → Servicios y protección en sus nodos.`, base?.color||'t-eco');
      if(base?.tipos_nodo) Out.line(`    Tipos: ${base.tipos_nodo.join(', ')}`, 't-dim');
    });
    Out.sp();
    const facActual = faccionDeNodo(Player.pos());
    if(facActual) {
      const fac = getFaccion(facActual);
      const rep = getRep(facActual);
      Out.line(`Nodo actual: ${fac?.nombre||facActual}  REP:${rep}  [${getRango(rep).nombre}]`, getRango(rep).color);
    } else {
      Out.line('Nodo actual: Sin control de facción.', 't-dim');
    }
    Out.sp();
  }

  EventBus.on('world:node_enter',         ({ nodeId })   => onNodeEnter(nodeId),       'faction_enter');
  EventBus.on('narrative:npc_death',      ({ npc })      => onNPCMuerto(npc),          'faction_npc_death');
  EventBus.on('narrative:mission_complete',({ mision })  => onMisionCompletada(mision),'faction_mission');
  EventBus.on('world:after_gen',          ()             => setTimeout(inicializar,100),'faction_init');

  return { getRep, setRep, modRep, getRango, getFaccion, faccionDeNodo, controlNodos, onNPCMuerto, onMisionCompletada, onTraicion, cmdFacciones, inicializar };
})();

// Registrar como plugin para que PluginLoader lo conozca
const pluginFacciones = {
  id: 'plugin:facciones', nombre:'Sistema de Facciones', version:'2.0.0',
  descripcion: 'Control territorial, reputación y emboscadas.',
  hooks: {
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
