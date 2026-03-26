// ════════════════════════════════════════════════════════════════
// WORLD AI — Migración autónoma de entidades
// Mueve enemigos, criaturas y NPCs ambulantes entre nodos
// cada MIGRATION_INTERVAL ciclos según su comportamiento.
// ════════════════════════════════════════════════════════════════
const WorldAI = (() => {

  const MIGRATION_INTERVAL = 5;
  let lastMigrationCycle   = 0;

  const PREFERENCIAS = {
    enemy:    { abismo:3, ruina:2, umbral:2, yermo:2, hub:0 },
    creature: { bosque:3, pantano:2, caverna:2, ruina:1, hub:0 },
    npc:      { hub:3, templo:2, ruina:1, bosque:1, abismo:0 },
  };

  const COMPORTAMIENTOS = {
    cazador(entity, nodeId) {
      const playerNode = Player.pos();
      const exits      = World.exits(nodeId);
      const dirHacia   = Object.entries(exits).find(([,destId]) => destId === playerNode);
      if(dirHacia && entity.vio_jugador) return dirHacia[1];
      return _randomExit(nodeId);
    },
    patrullero(entity, nodeId) {
      const exits = Object.values(World.exits(nodeId));
      if(!exits.length) return null;
      if(entity._patrol_idx == null) entity._patrol_idx = 0;
      entity._patrol_idx = (entity._patrol_idx + 1) % Math.max(1, exits.length);
      return exits[entity._patrol_idx];
    },
    migrante(entity, nodeId) {
      const prefs = PREFERENCIAS[entity.tipo||'enemy'] || {};
      const exits = Object.entries(World.exits(nodeId));
      if(!exits.length) return null;
      let best = null, bestScore = -1;
      exits.forEach(([,destId]) => {
        const destNode = World.node(destId);
        const score    = (prefs[destNode?.tipo] || 1) + Math.random() * 0.5;
        if(score > bestScore) { bestScore = score; best = destId; }
      });
      return best;
    },
    errante(entity, nodeId) { return _randomExit(nodeId); },
  };

  function _randomExit(nodeId) {
    const exits = Object.values(World.exits(nodeId));
    if(!exits.length) return null;
    return exits[Math.floor(Math.random() * exits.length)];
  }

  function _asignarComportamiento(entity) {
    if(entity.comportamiento) return entity.comportamiento;
    const n = (entity.nombre || entity.name || '').toLowerCase();
    if(n.includes('guardián') || n.includes('custodio')) return 'patrullero';
    if(n.includes('errante')  || n.includes('eco'))      return 'errante';
    if(n.includes('cazador')  || n.includes('grieta'))   return 'cazador';
    if(entity.tipo === 'creature') return Math.random() < 0.5 ? 'migrante' : 'errante';
    return Math.random() < 0.4 ? 'cazador' : 'migrante';
  }

  function tick() {
    const cycle = Clock.cycle;
    if(cycle - lastMigrationCycle < MIGRATION_INTERVAL) return;
    lastMigrationCycle = cycle;

    let movidos = 0;
    const eventos = [];

    Object.values(World.all()).forEach(nodo => {
      (nodo.enemies || []).forEach(enemy => {
        if(!enemy.id) return;
        const comp   = _asignarComportamiento({ ...enemy, tipo:'enemy' });
        enemy.comportamiento = comp;
        const destId = COMPORTAMIENTOS[comp]?.(enemy, nodo.id);
        if(!destId || destId === nodo.id) return;
        const destNode = World.node(destId);
        if(!destNode) return;

        destNode.enemies = destNode.enemies || [];
        destNode.enemies.push(enemy);
        nodo.enemies = nodo.enemies.filter(e => e.id !== enemy.id);
        movidos++;

        const invisible = Player.get().flags?.some(f => f.tipo === 'invisible' && (f.ciclos||0) > 0);
        if(destId === Player.pos() && !invisible) {
          enemy.vio_jugador = true;
          eventos.push({ tipo:'enemy_enter', entity:enemy, nodeId:destId });
        }
        if(nodo.id === Player.pos())
          eventos.push({ tipo:'enemy_leave', entity:enemy, nodeId:nodo.id });
      });
    });

    Object.values(World.all()).forEach(nodo => {
      (nodo.creatures || []).forEach(creature => {
        if(creature.estado !== 'libre') return;
        const comp   = _asignarComportamiento({ ...creature, tipo:'creature' });
        creature.comportamiento = comp;
        const destId = COMPORTAMIENTOS[comp]?.(creature, nodo.id);
        if(!destId || destId === nodo.id) return;
        const destNode = World.node(destId);
        if(!destNode) return;

        destNode.creatures = destNode.creatures || [];
        destNode.creatures.push(creature);
        nodo.creatures = nodo.creatures.filter(c => c.id !== creature.id);
        movidos++;

        if(destId === Player.pos())
          eventos.push({ tipo:'creature_enter', entity:creature, nodeId:destId });
      });
    });

    GS.aliveNPCs().forEach(npc => {
      if(!npc.id || npc.estado !== 'vivo') return;
      const esAmbulante = ['comerciante','errante','heraldo'].includes(npc.arq_vis||'');
      if(!esAmbulante || Math.random() > 0.3) return;

      const exits   = Object.values(World.exits(npc.nodeId));
      if(!exits.length) return;
      const prevNode = npc.nodeId;
      npc.nodeId     = exits[Math.floor(Math.random() * exits.length)];
      movidos++;

      if(npc.nodeId  === Player.pos()) eventos.push({ tipo:'npc_enter', entity:npc, nodeId:npc.nodeId });
      if(prevNode    === Player.pos()) eventos.push({ tipo:'npc_leave', entity:npc, nodeId:prevNode });
    });

    if(eventos.length) _procesarEventos(eventos);
    if(movidos > 0) EventBus.emit('worldai:tick', { cycle, movidos, eventos:eventos.length });
  }

  function _procesarEventos(eventos) {
    eventos.forEach(ev => {
      setTimeout(() => {
        switch(ev.tipo) {
          case 'enemy_enter':
            Out.sp();
            Out.line(`⚠ ${ev.entity.nombre||ev.entity.name} entra en tu nodo.`, 't-pel');
            Out.line(`HP:${ev.entity.hp}  ATK:${ev.entity.atk}  — "atacar" para iniciar combate.`, 't-dim');
            refreshStatus();
            break;
          case 'enemy_leave':
            Out.line(`${ev.entity.nombre||ev.entity.name} abandona el nodo.`, 't-dim');
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

  EventBus.on('world:tick', () => tick(), 'worldai');
  EventBus.on('world:node_enter', ({ nodeId }) => {
    const n = World.node(nodeId);
    if(!n) return;
    (n.enemies || []).forEach(e => { e.vio_jugador = true; });
  }, 'worldai_sight');

  return { tick };
})();
