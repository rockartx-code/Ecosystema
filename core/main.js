// ════════════════════════════════════════════════════════════════
// MAIN — Construccion de CTX y contrato de eventos
//
// Tras la auditoria SOLID, main.js queda como orquestador minimo:
//   1. Helpers de compatibilidad (RCompat)
//   2. CTX — contexto compartido entre plugins
//   3. CTX.runtime — fachada estable de servicios (con eventsVersion)
//   4. defineRuntimeEvents() — contrato versionado de eventos
//
// La secuencia de arranque (bootSeq/init) vive en core/boot.js para
// preservar SRP. core/events.js define los specs de eventos.
// ════════════════════════════════════════════════════════════════
'use strict';

// CTX nunca expone document, window, ni ningun objeto DOM. Para output
// usar CTX.Out.*  Para leer estado usar CTX.Player, etc.
const RCompat = {
  w:   (text, color='t-out', bold=false)=>Out.line(text, color, bold),
  sp:  ()=>Out.sp(),
  sep: (ch='─', len=46)=>Out.sep(ch, len),
  tw:  (text, color='t-out', delay=18)=>Out.tw(text, color, delay),
  echo:(raw)=>Out.echo(raw),
  clr: ()=>Out.clear(),
  upd: ()=>refreshStatus(),
};

function _xpRead() {
  const read = (typeof ServiceRegistry !== 'undefined') ? ServiceRegistry.get('runtime.xp.read') : null;
  return typeof read === 'function' ? (read() || { ser:null, atributos:{} }) : { ser:null, atributos:{} };
}

const CTX = {
  // Core
  U, EventBus, ModuleLoader, PluginLoader, CommandRegistry, ServiceRegistry, D,
  EntityRegistry,

  // Estado del juego
  Player, World, GS, Clock,

  // Sistemas de combate
  CombatResolution, battleLog, _sonEnemigos,

  // I/O — el motor y los plugins usan Out.* para escribir output.
  Out, R: RCompat,
  In,
  refreshStatus,

  // Helpers de juego expuestos a plugins
  save:       ()=>save(),
  findNPC:    (q)=>findNPC(q),
  findMision: (q)=>findMision(q),
};

CTX.runtime = {
  version: '2.1.0',
  eventsVersion: '0.1.0',
  events: EventBus,
  modules: ModuleLoader,
  plugins: PluginLoader,
  commands: CommandRegistry,
  services: ServiceRegistry,
  data: {
    get: (path)=>ModuleLoader.get(path),
    listModules: ()=>ModuleLoader.list(),
  },
  player: {
    current: ()=>Player.get(),
    position: ()=>Player.pos(),
    setPosition: (nodeId)=>Player.setPos(nodeId),
    combatStats: ()=>({ atk: Player.getAtk(), def: Player.getDef() }),
    addItem: (item)=>Player.addItem(item),
    removeItem: (itemId)=>Player.rmItem(itemId),
    recalcResonances: ()=>Player._recalcResonancias?.(),
  },
  world: {
    all: ()=>World.all(),
    node: (nodeId)=>World.node(nodeId),
    exits: (nodeId)=>World.exits(nodeId),
    visit: (nodeId)=>World.visit(nodeId),
    expandSection: (fromNodeId, dir)=>World.expandSection(fromNodeId, dir),
    isBorder: (nodeId)=>World.isBorder(nodeId),
    read: ()=>({ seed: World.seed, sectionCount: World.sectionCount }),
    calcDifficulty: ()=>typeof World.calcDificultad === 'function' ? World.calcDificultad() : 1.0,
  },
  clock: {
    current: ()=>({ cycle: Clock.cycle, slot: Clock.get?.() || null }),
    tick: (delta=1)=>Clock.tick(delta),
  },
  output: {
    line: (text, color='t-out', bold=false)=>Out.line(text, color, bold),
    sp: ()=>Out.sp(),
    sep: (ch='─', len=46)=>Out.sep(ch, len),
  },
  status: {
    refresh: ()=>refreshStatus(),
  },
  game: {
    save: ()=>save(),
  },
  gs: {
    allNPCs: ()=>GS.allNPCs(),
    aliveNPCs: ()=>GS.aliveNPCs(),
    addNPC: (npc)=>GS.addNPC(npc),
    npc: (npcId)=>GS.npc(npcId),
    npcsInNode: (nodeId)=>GS.npcEnNodo(nodeId),
    allMisiones: ()=>GS.allMisiones(),
    addMision: (mision)=>GS.addMision(mision),
    mision: (misionId)=>GS.mision(misionId),
    addArc: (arc)=>GS.addArc(arc),
    arc: (arcId)=>GS.arc(arcId),
    allArcs: ()=>GS.allArcs(),
    activeArcs: ()=>GS.arcsActivos(),
    addTwist: (twist)=>GS.addTwist(twist),
  },
  xp: {
    read: ()=>_xpRead(),
  },
};
PluginLoader.setEventsVersion?.(CTX.runtime.eventsVersion);

// Definicion versionada de eventos. Implementacion en core/events.js.
defineRuntimeEvents(EventBus);

// M6 del audit cerrado en fase 1.6: el shim globalThis.Combat.active
// se elimino al confirmar que ningun consumer leia el flag. El estado
// de batalla vive en battle.estado y se consulta via
// runtime.battle.current()?.estado === 'activo'.
