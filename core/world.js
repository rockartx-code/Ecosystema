// ════════════════════════════════════════════════════════════════
// CLOCK — Ciclos y fases del mundo
//
// Al hacer tick:
//  1. EntityRegistry.tickAll()  → onTick() en cada entidad viva
//  2. player:tick               → plugins manejan hambre, heridas, flags
//  3. world:tick                → WorldAI, Factions, Boss, etc.
// ════════════════════════════════════════════════════════════════
const Clock = {
  cycle: 1, phase: 0,

  tick(n = 1) {
    for(let i = 0; i < n; i++) {
      this.phase = (this.phase + 1) % D.phases.length;
      if(!this.phase) this.cycle++;
    }
    const clock = this.get();

    // 1. Tick a todas las entidades del mundo
    EntityRegistry.tickAll(clock);

    // 2. Tick al jugador — hambre, heridas, efectos de duración
    //    El core NO implementa hambre. Eso es responsabilidad de un plugin.
    EventBus.emit('player:tick', { clock, player: Player.get() });

    // 3. Tick al mundo — WorldAI, Factions, BossSystem, etc.
    EventBus.emit('world:tick', { cycle: this.cycle, phase: this.phase });
  },

  get() {
    const p = D.phases[this.phase] || D.phases[0];
    return {
      cycle:     this.cycle,
      phase:     this.phase,
      name:      p.id,
      col:       p.color,
      bonusTags: p.bonus_tags || [],
      statMult:  p.stat_mult  || 1,
    };
  },

  ser()  { return { cycle:this.cycle, phase:this.phase }; },
  load(d){ this.cycle=d.cycle; this.phase=d.phase; },
};

// ════════════════════════════════════════════════════════════════
// WORLD — Nodos, aristas y generación del mundo
//
// La creación de entidades (creatures, enemies, NPCs) se delega
// completamente al EventBus. El core solo reserva el "hueco"
// en el nodo y emite el evento; el plugin rellena las entidades.
//
// Contratos de generación:
//   world:before_gen           → plugins pueden alterar seed/count
//   world:request_creatures    → plugin creatures devuelve [Entity]
//   world:request_enemies      → plugin enemies devuelve [Entity]
//   world:request_npc          → plugin NPCEngine devuelve Entity|null
//   world:after_gen            → plugins reciben el mapa completo
//   world:node_enter           → plugins reaccionan a la entrada
//   world:node_exit            → plugins reaccionan a la salida
//   world:section_expand       → plugins reciben los nuevos nodos
// ════════════════════════════════════════════════════════════════
const World = {
  nodes: {}, edges: {}, seed: '', startId: '',
  sectionCount: 0,
  DIRS: ['norte','sur','este','oeste'],
  OPP:  { norte:'sur', sur:'norte', este:'oeste', oeste:'este' },

  gen(wseed, context = {}) {
    this.seed = wseed || U.uid()+U.uid();
    this.nodes = {}; this.edges = {};
    const wd  = D.world;
    const rng = U.rng(this.seed);
    const ids = [], COUNT = wd.node_count || 32;

    EventBus.emit('world:before_gen', { seed:this.seed, count:COUNT });

    for(let i = 0; i < COUNT; i++) {
      const id   = U.hex(this.seed + i);
      const tipo = U.pick(wd.tipos_nodo || ['hub'], rng);

      // ── Loot ─────────────────────────────────────────────────
      const lp   = wd.loot_por_tipo?.[tipo] || Object.keys(D.mats).slice(0,3);
      const loot = U.chance(wd.loot_chance || .6) ? U.pickN(lp, U.rand(1,3), rng) : [];

      // ── Enemies: delegado a plugin ────────────────────────────
      // El plugin escucha world:request_enemies y devuelve
      // payload.enemies = [Entity, ...] (ya escalados y con ID)
      const enemyPayload = EventBus.emit('world:request_enemies', {
        tipo, nodeId:id, rng, seed:this.seed, enemies: [],
      });
      const enemies = enemyPayload?.enemies || [];

      // ── Creatures: delegado a plugin ──────────────────────────
      const creaturePayload = EventBus.emit('world:request_creatures', {
        tipo, nodeId:id, rng, nodeEstado:'virgen', creatures: [],
      });
      const creatures = creaturePayload?.creatures || [];

      this.nodes[id] = {
        id, tipo,
        name:      U.pick(wd.nombres_nodo?.[tipo] || [tipo], rng),
        atmos:     U.pick(wd.atmósferas || ['...'], rng),
        loot, enemies, creatures,
        estado:    'virgen',
        visitado:  false,
        npc_ids:   [],
        destruido: false,
      };
      ids.push(id);
    }

    // ── Construir grafo ───────────────────────────────────────
    for(let i=1; i<ids.length; i++) {
      const from=ids[i], to=ids[Math.floor(rng()*i)];
      const dir=U.pick(this.DIRS,rng), opp=this.OPP[dir];
      if(!this.edges[from]) this.edges[from]={};
      if(!this.edges[to])   this.edges[to]={};
      this.edges[from][dir]=to;
      this.edges[to][opp]=from;
    }
    for(let i=0; i<Math.floor(COUNT*.4); i++) {
      const a=U.pick(ids,rng), b=U.pick(ids,rng); if(a===b) continue;
      const dir=U.pick(this.DIRS,rng), opp=this.OPP[dir];
      if(!this.edges[a]) this.edges[a]={};
      if(!this.edges[b]) this.edges[b]={};
      if(!this.edges[a][dir]) { this.edges[a][dir]=b; this.edges[b][opp]=a; }
    }
    this.startId = ids[0];

    // ── NPCs: delegado a plugin ───────────────────────────────
    // NPCEngine escucha world:request_npcs y puebla los nodos
    EventBus.emit('world:request_npcs', {
      nodes: this.nodes, seed: this.seed,
      npcNodes: wd.npc_nodos_permitidos || [],
      npcChance: wd.npc_chance || .55,
      context,
    });

    EventBus.emit('world:after_gen', {
      nodes: this.nodes, edges: this.edges,
      seed: this.seed,
    });

    return { startId: this.startId };
  },

  // ── Expansión de sección (frontera) ─────────────────────────
  expandSection(fromNodeId, dir) {
    const wd  = D.world;
    const opp = this.OPP[dir];
    this.sectionCount = (this.sectionCount || 0) + 1;
    const seccion = this.sectionCount;
    const rng = U.rng(Date.now() + fromNodeId + dir);
    const SIZE = U.rand(5, 10);
    const ids  = [];

    // La dificultad la calcula un plugin (o el motor si no hay)
    const difPayload = EventBus.emit('world:calc_difficulty', {
      player: Player.get(), cycle: Clock.cycle, difficulty: 1.0,
    });
    const dif = difPayload?.difficulty ?? 1.0;

    const tipos = this._tiposPorProfundidad(seccion);

    Out.sp(); Out.sep('═');
    Out.line(`◉ FRONTERA CRUZADA — Sección ${seccion}`, 't-eco', true);
    Out.line(`Dificultad: ×${dif.toFixed(2)}  ·  ${SIZE} nuevos nodos`, 't-dim');

    for(let i = 0; i < SIZE; i++) {
      const id   = U.hex(this.seed + seccion + i + dir);
      const tipo = U.pick(tipos, rng);
      const lp   = wd.loot_por_tipo?.[tipo] || Object.keys(D.mats).slice(0,3);
      const loot = U.chance(0.7) ? U.pickN(lp, U.rand(1,3), rng) : [];

      const enemyPayload = EventBus.emit('world:request_enemies', {
        tipo, nodeId:id, rng, difficulty:dif, seccion, enemies:[],
      });
      const creatures_p = EventBus.emit('world:request_creatures', {
        tipo, nodeId:id, rng, difficulty:dif,
        nodeEstado: dif >= 2 ? 'corrompido' : 'virgen', creatures:[],
      });

      const difTag = dif >= 3 ? '[PELIGROSO] ' : dif >= 2 ? '[HOSTIL] ' : '';
      this.nodes[id] = {
        id, tipo,
        name:      difTag + U.pick(wd.nombres_nodo?.[tipo] || [tipo], rng),
        atmos:     U.pick(wd.atmósferas || ['...'], rng),
        loot,
        enemies:   enemyPayload?.enemies   || [],
        creatures: creatures_p?.creatures || [],
        estado:    'virgen', visitado:false, npc_ids:[],
        destruido: false, seccion, dificultad: dif,
      };
      ids.push(id);
    }

    // Conectar internamente
    for(let i=1; i<ids.length; i++) {
      const from=ids[i], to=ids[i-1];
      const d=U.pick(this.DIRS,rng), op=this.OPP[d];
      if(!this.edges[from]) this.edges[from]={};
      if(!this.edges[to])   this.edges[to]={};
      if(!this.edges[from][d]) { this.edges[from][d]=to; this.edges[to][op]=from; }
    }
    for(let i=0; i<Math.floor(SIZE*.3); i++) {
      const a=U.pick(ids,rng), b=U.pick(ids,rng); if(a===b) continue;
      const d=U.pick(this.DIRS,rng), op=this.OPP[d];
      if(!this.edges[a]) this.edges[a]={};
      if(!this.edges[b]) this.edges[b]={};
      if(!this.edges[a][d]) { this.edges[a][d]=b; this.edges[b][op]=a; }
    }

    // Conectar al nodo origen
    const entryId = ids[0];
    if(!this.edges[fromNodeId]) this.edges[fromNodeId]={};
    if(!this.edges[entryId])    this.edges[entryId]={};
    this.edges[fromNodeId][dir] = entryId;
    this.edges[entryId][opp]    = fromNodeId;

    // NPCs en la nueva sección
    EventBus.emit('world:request_npcs', {
      nodes: Object.fromEntries(ids.map(id=>[id,this.nodes[id]])),
      seed: this.seed + seccion, seccion, dificultad: dif,
      npcNodes: D.world?.npc_nodos_permitidos || [],
      npcChance: Math.max(0.2, 0.55 - seccion * 0.1),
    });

    Out.line(`Acceso a: ${this.nodes[entryId].name}  [${this.nodes[entryId].tipo.toUpperCase()}]`, 't-eco');
    Out.line(`Enemigos ×${dif.toFixed(1)}  ·  ${ids.length} nodos`, 't-pel');
    Out.sep('═'); Out.sp();

    EventBus.emit('world:section_expand', {
      seccion, dificultad:dif, nodeIds:ids, fromNodeId, dir,
    });

    return entryId;
  },

  // ── API ──────────────────────────────────────────────────────
  node(id)    { return this.nodes[id] || null; },
  exits(id)   { return this.edges[id] || {}; },
  all()       { return this.nodes; },

  isBorder(nodeId) { return Object.keys(this.exits(nodeId)).length < 3; },

  visit(id) {
    if(this.nodes[id]) {
      this.nodes[id].visitado = true;
      this.nodes[id].estado   = 'visitado';
    }
    EventBus.emit('world:node_enter', { nodeId:id, node:this.nodes[id], player:Player.get() });
  },

  rmLoot(id, item) {
    if(!this.nodes[id]) return;
    const i = this.nodes[id].loot.indexOf(item);
    if(i >= 0) this.nodes[id].loot.splice(i, 1);
  },
  rmEnemy(id, eid) {
    if(!this.nodes[id]) return;
    this.nodes[id].enemies = this.nodes[id].enemies.filter(e=>e.id!==eid);
  },
  rmCreature(id, cid) {
    if(!this.nodes[id]) return;
    this.nodes[id].creatures = this.nodes[id].creatures.filter(c=>c.id!==cid);
  },

  _tiposPorProfundidad(seccion) {
    if(seccion <= 1) return ['hub','bosque','ruina','caverna'];
    if(seccion <= 2) return ['ruina','caverna','pantano','yermo'];
    if(seccion <= 3) return ['yermo','umbral','abismo','templo'];
    return ['abismo','umbral','templo','abismo'];
  },

  ser()  { return { nodes:this.nodes, edges:this.edges, seed:this.seed, startId:this.startId, sectionCount:this.sectionCount||0 }; },
  load(d){ this.nodes=d.nodes; this.edges=d.edges; this.seed=d.seed; this.startId=d.startId; this.sectionCount=d.sectionCount||0; },
};

// ════════════════════════════════════════════════════════════════
// GAME STATE — Colecciones globales de NPCs, misiones, arcos
// ════════════════════════════════════════════════════════════════
const GS = {
  npcs:{}, misiones:{}, twists:[], destruidos:[], arcs:{},

  addNPC(n)       { this.npcs[n.id]=n; },
  npc(id)         { return this.npcs[id]||null; },
  allNPCs()       { return Object.values(this.npcs); },
  aliveNPCs()     { return Object.values(this.npcs).filter(n=>['vivo','sometido','hostil'].includes(n.estado)); },
  npcEnNodo(nid)  { return Object.values(this.npcs).filter(n=>n.nodeId===nid&&n.estado==='vivo'); },

  addMision(m)    { this.misiones[m.id]=m; },
  mision(id)      { return this.misiones[id]||null; },
  allMisiones()   { return Object.values(this.misiones); },
  activas()       { return Object.values(this.misiones).filter(m=>!m.completada&&!m.fallida); },

  addTwist(t)     { this.twists.push(t); },
  addArc(a)       { this.arcs[a.id]=a; },
  arc(id)         { return this.arcs[id]||null; },
  allArcs()       { return Object.values(this.arcs); },
  arcsActivos()   { return Object.values(this.arcs).filter(a=>a.estado==='activo'); },

  ser()  { return { npcs:this.npcs, misiones:this.misiones, twists:this.twists, destruidos:this.destruidos, arcs:this.arcs }; },
  load(d){ this.npcs=d.npcs||{}; this.misiones=d.misiones||{}; this.twists=d.twists||[]; this.destruidos=d.destruidos||[]; this.arcs=d.arcs||{}; },
};
