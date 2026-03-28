// ════════════════════════════════════════════════════════════════
// WORLD-AI Logic — motor desacoplado de datos
// ════════════════════════════════════════════════════════════════
(function initWorldAILogic(global) {
  function create({ data, getCfgObj, deps }) {
    const {
      Player, World, Clock, GS, EventBus, Out, refreshStatus,
    } = deps;

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
      const exits = Object.values(World.exits(nodeId));
      if (!exits.length) return null;
      return exits[Math.floor(Math.random() * exits.length)];
    }

    const COMPORTAMIENTOS = {
      cazador(entity, nodeId) {
        const playerNode = Player.pos();
        const exits = World.exits(nodeId);
        const dirHacia = Object.entries(exits).find(([, destId]) => destId === playerNode);
        if (dirHacia && entity.vio_jugador) return dirHacia[1];
        return _randomExit(nodeId);
      },
      patrullero(entity, nodeId) {
        const exits = Object.values(World.exits(nodeId));
        if (!exits.length) return null;
        if (entity._patrol_idx == null) entity._patrol_idx = 0;
        entity._patrol_idx = (entity._patrol_idx + 1) % Math.max(1, exits.length);
        return exits[entity._patrol_idx];
      },
      migrante(entity, nodeId) {
        const prefs = PREFERENCIAS[entity.tipo || 'enemy'] || {};
        const exits = Object.entries(World.exits(nodeId));
        if (!exits.length) return null;
        let best = null; let bestScore = -1;
        exits.forEach(([, destId]) => {
          const destNode = World.node(destId);
          const score = (prefs[destNode?.tipo] || 1) + Math.random() * 0.5;
          if (score > bestScore) { bestScore = score; best = destId; }
        });
        return best;
      },
      errante(entity, nodeId) {
        return _randomExit(nodeId);
      },
    };

    function _matchesAnyKeyword(nameLower, list) {
      return (list || []).some(k => nameLower.includes(k));
    }

    function _asignarComportamiento(entity) {
      if (entity.comportamiento) return entity.comportamiento;
      const n = (entity.nombre || entity.name || '').toLowerCase();
      if (_matchesAnyKeyword(n, PATROLLERO_KEYWORDS)) return 'patrullero';
      if (_matchesAnyKeyword(n, ERRANTE_KEYWORDS)) return 'errante';
      if (_matchesAnyKeyword(n, CAZADOR_KEYWORDS)) return 'cazador';
      if (entity.tipo === 'creature') return Math.random() < CREATURE_MIGRANTE_CHANCE ? 'migrante' : 'errante';
      return Math.random() < ENEMY_CAZADOR_CHANCE ? 'cazador' : 'migrante';
    }

    function _procesarEventos(eventos) {
      eventos.forEach(ev => {
        setTimeout(() => {
          switch (ev.tipo) {
            case 'enemy_enter':
              Out.sp();
              Out.line(`⚠ ${ev.entity.nombre || ev.entity.name} entra en tu nodo.`, 't-pel');
              Out.line(`HP:${ev.entity.hp}  ATK:${ev.entity.atk}  — "atacar" para iniciar combate.`, 't-dim');
              refreshStatus();
              break;
            case 'enemy_leave':
              Out.line(`${ev.entity.nombre || ev.entity.name} abandona el nodo.`, 't-dim');
              break;
            case 'creature_enter':
              Out.sp();
              Out.line(`✦ ${ev.entity.nombre} merodea por aquí.`, 't-cri');
              Out.line(`"capturar ${ev.entity.nombre.split('-')[0].toLowerCase()}" para intentar vincularlo.`, 't-dim');
              refreshStatus();
              break;
            case 'npc_enter':
              Out.sp();
              Out.line(`◈ ${ev.entity.nombre} llega a este nodo.`, 't-npc');
              Out.line(`"hablar ${ev.entity.nombre.split(' ')[0].toLowerCase()}" para interactuar.`, 't-dim');
              refreshStatus();
              break;
            case 'npc_leave':
              Out.line(`${ev.entity.nombre} se marcha.`, 't-dim');
              break;
          }
        }, 200);
      });
    }

    function tick() {
      const cycle = Clock.cycle;
      if (cycle - lastMigrationCycle < MIGRATION_INTERVAL) return;
      lastMigrationCycle = cycle;

      let movidos = 0;
      const eventos = [];

      Object.values(World.all()).forEach(nodo => {
        (nodo.enemies || []).forEach(enemy => {
          if (!enemy.id) return;
          const comp = _asignarComportamiento({ ...enemy, tipo: 'enemy' });
          enemy.comportamiento = comp;
          const destId = COMPORTAMIENTOS[comp]?.(enemy, nodo.id);
          if (!destId || destId === nodo.id) return;
          const destNode = World.node(destId);
          if (!destNode) return;

          destNode.enemies = destNode.enemies || [];
          destNode.enemies.push(enemy);
          nodo.enemies = nodo.enemies.filter(e => e.id !== enemy.id);
          movidos++;

          const invisible = Player.get().flags?.some(f => f.tipo === 'invisible' && (f.ciclos || 0) > 0);
          if (destId === Player.pos() && !invisible) {
            enemy.vio_jugador = true;
            eventos.push({ tipo: 'enemy_enter', entity: enemy, nodeId: destId });
          }
          if (nodo.id === Player.pos()) eventos.push({ tipo: 'enemy_leave', entity: enemy, nodeId: nodo.id });
        });
      });

      Object.values(World.all()).forEach(nodo => {
        (nodo.creatures || []).forEach(creature => {
          if (creature.estado !== 'libre') return;
          const comp = _asignarComportamiento({ ...creature, tipo: 'creature' });
          creature.comportamiento = comp;
          const destId = COMPORTAMIENTOS[comp]?.(creature, nodo.id);
          if (!destId || destId === nodo.id) return;
          const destNode = World.node(destId);
          if (!destNode) return;

          destNode.creatures = destNode.creatures || [];
          destNode.creatures.push(creature);
          nodo.creatures = nodo.creatures.filter(c => c.id !== creature.id);
          movidos++;

          if (destId === Player.pos()) eventos.push({ tipo: 'creature_enter', entity: creature, nodeId: destId });
        });
      });

      GS.aliveNPCs().forEach(npc => {
        if (!npc.id || npc.estado !== 'vivo') return;
        const esAmbulante = NPC_ROAMING_ROLES.includes(npc.arq_vis || '');
        if (!esAmbulante || Math.random() > NPC_MOVE_CHANCE) return;

        const exits = Object.values(World.exits(npc.nodeId));
        if (!exits.length) return;
        const prevNode = npc.nodeId;
        npc.nodeId = exits[Math.floor(Math.random() * exits.length)];
        movidos++;

        if (npc.nodeId === Player.pos()) eventos.push({ tipo: 'npc_enter', entity: npc, nodeId: npc.nodeId });
        if (prevNode === Player.pos()) eventos.push({ tipo: 'npc_leave', entity: npc, nodeId: prevNode });
      });

      if (eventos.length) _procesarEventos(eventos);
      if (movidos > 0) EventBus.emit('worldai:tick', { cycle, movidos, eventos: eventos.length });
    }

    EventBus.on('world:tick', () => tick(), 'worldai');
    EventBus.on('world:node_enter', ({ nodeId }) => {
      const n = World.node(nodeId);
      if (!n) return;
      (n.enemies || []).forEach(e => { e.vio_jugador = true; });
    }, 'worldai_sight');

    return { tick };
  }

  global.WorldAILogic = { create };
})(globalThis);
