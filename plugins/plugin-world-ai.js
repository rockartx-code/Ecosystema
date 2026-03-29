// ════════════════════════════════════════════════════════════════
// PLUGIN: World AI v2.0
// Migracion y roaming del mundo movidos a plugin.
// ════════════════════════════════════════════════════════════════

(function initWorldAIPlugin(global) {
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
  function _worldAll() {
    const fn = _svc('runtime.world.all');
    return typeof fn === 'function' ? (fn() || {}) : {};
  }
  function _worldNode(nodeId) {
    const fn = _svc('runtime.world.node');
    return typeof fn === 'function' ? fn(nodeId) : null;
  }
  function _worldExits(nodeId) {
    const fn = _svc('runtime.world.exits');
    return typeof fn === 'function' ? (fn(nodeId) || {}) : {};
  }
  function _clockCurrent() {
    const fn = _svc('runtime.clock.current');
    return typeof fn === 'function' ? (fn() || {}) : {};
  }
  function _aliveNPCs() {
    const fn = _svc('runtime.gs.alive_npcs');
    return typeof fn === 'function' ? (fn() || []) : [];
  }
  function _line(text, color='t-out', bold=false) {
    const fn = _svc('runtime.output.line');
    if(typeof fn === 'function') fn(text, color, bold);
  }
  function _sp() {
    const fn = _svc('runtime.output.sp');
    if(typeof fn === 'function') fn();
  }
  function _refreshStatus() {
    const fn = _svc('runtime.status.refresh');
    if(typeof fn === 'function') fn();
  }

  function loadWorldAIData() {
    const fallback = {
      migration_interval: 5,
      preferencias: {
        enemy: { abismo:3, ruina:2, umbral:2, yermo:2, hub:0 },
        creature: { bosque:3, pantano:2, caverna:2, ruina:1, hub:0 },
        npc: { hub:3, templo:2, ruina:1, bosque:1, abismo:0 },
      },
      heuristicas: {
        patrullero_keywords: ['guardián', 'custodio'],
        errante_keywords: ['errante', 'eco'],
        cazador_keywords: ['cazador', 'grieta'],
        creature_migrante_chance: 0.5,
        enemy_cazador_chance: 0.4,
        npc_roaming_roles: ['comerciante', 'errante', 'heraldo'],
        npc_move_chance: 0.3,
      },
    };
    try { return ModuleLoader?.getSystemData?.('world-ai', fallback) || fallback; }
    catch {}
    return fallback;
  }

  function getCfgObj(path, fallback) {
    try {
      const v = ModuleLoader?.get?.(path);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback;
    } catch {
      return fallback;
    }
  }

  function createWorldAIApi() {
    const data = loadWorldAIData();
    const MIGRATION_INTERVAL = Number(getCfgObj('systems.world_ai.migration_interval', data.migration_interval || 5)) || 5;
    const PREFERENCIAS = getCfgObj('systems.world_ai.preferencias', data.preferencias || {});
    const HEURISTICAS = getCfgObj('systems.world_ai.heuristicas', data.heuristicas || {});
    const PATROLLERO_KEYWORDS = HEURISTICAS.patrullero_keywords || ['guardián', 'custodio'];
    const ERRANTE_KEYWORDS = HEURISTICAS.errante_keywords || ['errante', 'eco'];
    const CAZADOR_KEYWORDS = HEURISTICAS.cazador_keywords || ['cazador', 'grieta'];
    const CREATURE_MIGRANTE_CHANCE = Number(HEURISTICAS.creature_migrante_chance ?? 0.5);
    const ENEMY_CAZADOR_CHANCE = Number(HEURISTICAS.enemy_cazador_chance ?? 0.4);
    const NPC_ROAMING_ROLES = HEURISTICAS.npc_roaming_roles || ['comerciante', 'errante', 'heraldo'];
    const NPC_MOVE_CHANCE = Number(HEURISTICAS.npc_move_chance ?? 0.3);
    let lastMigrationCycle = 0;

    function _randomExit(nodeId) {
      const exits = Object.values(_worldExits(nodeId));
      if(!exits.length) return null;
      return exits[Math.floor(Math.random() * exits.length)];
    }
    function _matchesAnyKeyword(nameLower, list) { return (list || []).some(k => nameLower.includes(k)); }
    function _asignarComportamiento(entity) {
      if(entity.comportamiento) return entity.comportamiento;
      const n = (entity.nombre || entity.name || '').toLowerCase();
      if(_matchesAnyKeyword(n, PATROLLERO_KEYWORDS)) return 'patrullero';
      if(_matchesAnyKeyword(n, ERRANTE_KEYWORDS)) return 'errante';
      if(_matchesAnyKeyword(n, CAZADOR_KEYWORDS)) return 'cazador';
      if(entity.tipo === 'creature') return Math.random() < CREATURE_MIGRANTE_CHANCE ? 'migrante' : 'errante';
      return Math.random() < ENEMY_CAZADOR_CHANCE ? 'cazador' : 'migrante';
    }

    const COMPORTAMIENTOS = {
      cazador(entity, nodeId) {
        const playerNode = _playerPos();
        const exits = _worldExits(nodeId);
        const dirHacia = Object.entries(exits).find(([, destId]) => destId === playerNode);
        if(dirHacia && entity.vio_jugador) return dirHacia[1];
        return _randomExit(nodeId);
      },
      patrullero(entity, nodeId) {
        const exits = Object.values(_worldExits(nodeId));
        if(!exits.length) return null;
        if(entity._patrol_idx == null) entity._patrol_idx = 0;
        entity._patrol_idx = (entity._patrol_idx + 1) % Math.max(1, exits.length);
        return exits[entity._patrol_idx];
      },
      migrante(entity, nodeId) {
        const prefs = PREFERENCIAS[entity.tipo || 'enemy'] || {};
        const exits = Object.entries(_worldExits(nodeId));
        if(!exits.length) return null;
        let best = null, bestScore = -1;
        exits.forEach(([, destId]) => {
          const destNode = _worldNode(destId);
          const score = (prefs[destNode?.tipo] || 1) + Math.random() * 0.5;
          if(score > bestScore) { bestScore = score; best = destId; }
        });
        return best;
      },
      errante(entity, nodeId) { return _randomExit(nodeId); },
    };

    function _procesarEventos(eventos) {
        eventos.forEach(ev => {
          setTimeout(() => {
            switch(ev.tipo) {
              case 'enemy_enter': _sp(); _line(`⚠ ${ev.entity.nombre || ev.entity.name} entra en tu nodo.`, 't-pel'); _line(`HP:${ev.entity.hp}  ATK:${ev.entity.atk}  — "atacar" para iniciar combate.`, 't-dim'); _refreshStatus(); break;
              case 'enemy_leave': _line(`${ev.entity.nombre || ev.entity.name} abandona el nodo.`, 't-dim'); break;
              case 'creature_enter': _sp(); _line(`✦ ${ev.entity.nombre} merodea por aquí.`, 't-cri'); _line(`"capturar ${ev.entity.nombre.split('-')[0].toLowerCase()}" para intentar vincularlo.`, 't-dim'); _refreshStatus(); break;
              case 'npc_enter': _sp(); _line(`◈ ${ev.entity.nombre} llega a este nodo.`, 't-npc'); _line(`"hablar ${ev.entity.nombre.split(' ')[0].toLowerCase()}" para interactuar.`, 't-dim'); _refreshStatus(); break;
              case 'npc_leave': _line(`${ev.entity.nombre} se marcha.`, 't-dim'); break;
            }
          }, 200);
        });
    }

    function tick() {
      const cycle = Number(_clockCurrent().cycle) || 0;
      if(cycle - lastMigrationCycle < MIGRATION_INTERVAL) return false;
      lastMigrationCycle = cycle;
      let movidos = 0;
      const eventos = [];
      Object.values(_worldAll()).forEach(nodo => {
        (nodo.enemies || []).forEach(enemy => {
          if(!enemy.id) return;
          const comp = _asignarComportamiento({ ...enemy, tipo:'enemy' });
          enemy.comportamiento = comp;
          const destId = (COMPORTAMIENTOS[comp] || _randomExit)(enemy, nodo.id);
          if(!destId || destId === nodo.id) return;
          const destNode = _worldNode(destId); if(!destNode) return;
          destNode.enemies = destNode.enemies || []; destNode.enemies.push(enemy);
          nodo.enemies = nodo.enemies.filter(e => e.id !== enemy.id); movidos++;
          const invisible = _player()?.flags?.some(f => f.tipo === 'invisible' && (f.ciclos || 0) > 0);
          if(destId === _playerPos() && !invisible) { enemy.vio_jugador = true; eventos.push({ tipo:'enemy_enter', entity:enemy, nodeId:destId }); }
          if(nodo.id === _playerPos()) eventos.push({ tipo:'enemy_leave', entity:enemy, nodeId:nodo.id });
        });
      });
      EventBus.emit('worldai:tick_creatures', { nodes:_worldAll(), playerPos:_playerPos(), eventos });
      _aliveNPCs().forEach(npc => {
        if(!npc.id || npc.estado !== 'vivo') return;
        const esAmbulante = NPC_ROAMING_ROLES.includes(npc.arq_vis || '');
        if(!esAmbulante || Math.random() > NPC_MOVE_CHANCE) return;
        const exits = Object.values(_worldExits(npc.nodeId));
        if(!exits.length) return;
        const prevNode = npc.nodeId;
        npc.nodeId = exits[Math.floor(Math.random() * exits.length)];
        movidos++;
        if(npc.nodeId === _playerPos()) eventos.push({ tipo:'npc_enter', entity:npc, nodeId:npc.nodeId });
        if(prevNode === _playerPos()) eventos.push({ tipo:'npc_leave', entity:npc, nodeId:prevNode });
      });
      if(eventos.length) _procesarEventos(eventos);
      if(movidos > 0) EventBus.emit('worldai:tick', { cycle, movidos, eventos:eventos.length });
      return movidos > 0;
    }

    function onNodeEnter(nodeId) {
      const n = _worldNode(nodeId);
      if(!n) return false;
      (n.enemies || []).forEach(e => { e.vio_jugador = true; });
      return true;
    }

    return { tick, onNodeEnter };
  }

  function api() {
    if(!global.__worldAIPluginApi) global.__worldAIPluginApi = createWorldAIApi();
    return global.__worldAIPluginApi;
  }

  global.pluginWorldAI = {
    id: 'plugin:world-ai',
    nombre: 'World AI',
    version: '2.0.0',
    descripcion: 'Migracion de enemigos, criaturas y roaming de NPCs.',
    onLoad() { api(); },
    hooks: {
      'world:tick': { fn() { api().tick(); } },
      'world:node_enter': { fn(payload) { api().onNodeEnter(payload?.nodeId); return payload; } },
    },
    services: {
      'runtime.world_ai.api': () => api(),
      'runtime.world_ai.tick': () => api().tick(),
    },
  };
})(globalThis);
