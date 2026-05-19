// ════════════════════════════════════════════════════════════════
// MAIN — Bootstrap de ECOSISTEMA v2.0
//
// Orden de inicialización:
//   1. Core (U, EventBus, ModuleLoader, PluginLoader, CommandRegistry, D)
//   2. Entity + EntityRegistry
//   3. Player, Clock, World, GS
//   4. CombatResolution + battleLog
//   5. CTX — contexto compartido disponible para todos los plugins
//   6. Plugins de dominio registrados en PluginLoader
//   7. Plugins externos registrados vía PluginLoader
//   8. Módulo de datos base cargado en ModuleLoader
//   9. init() — genera mundo y arranca el juego
// ════════════════════════════════════════════════════════════════

// ── CTX — contexto compartido ────────────────────────────────────
// Disponible en cada call de handler/comando de plugin como segundo
// argumento. Los plugins NO importan directamente los sistemas;
// acceden a ellos a través de CTX.
//
// REGLA: CTX nunca expone document, window, ni ningún objeto DOM.
// Para output usar CTX.Out.*   Para leer estado usar CTX.Player, etc.
const RCompat = {
  w:   (text, color='t-out', bold=false)=>Out.line(text, color, bold),
  sp:  ()=>Out.sp(),
  sep: (ch='─', len=46)=>Out.sep(ch, len),
  tw:  (text, color='t-out', delay=18)=>Out.tw(text, color, delay),
  echo:(raw)=>Out.echo(raw),
  clr: ()=>Out.clear(),
  upd: ()=>refreshStatus(),
};

function _svc(name) {
  return (typeof ServiceRegistry !== 'undefined' && typeof ServiceRegistry.get === 'function')
    ? ServiceRegistry.get(name)
    : null;
}

function _xpRead() {
  const read = _svc('runtime.xp.read');
  return typeof read === 'function' ? (read() || { ser:null, atributos:{} }) : { ser:null, atributos:{} };
}

function _xpInit(reset = false) {
  const initXP = _svc('runtime.xp.init');
  return typeof initXP === 'function' ? !!initXP(reset) : false;
}

const CTX = {
  // Core
  U, EventBus, ModuleLoader, PluginLoader, CommandRegistry, ServiceRegistry, D,
  EntityRegistry,

  // Estado del juego
  Player, World, GS, Clock,

  // Sistemas de combate
  CombatResolution, Combat: CombatResolution, battleLog, _sonEnemigos,

  // I/O — el motor y los plugins usan Out.* para escribir output.
  // Nunca usan R.*, document.*, ni console.log para output visible.
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

// Definicion versionada de eventos (specs validateIn/validateOut).
// Implementacion en core/events.js para mantener SRP en main.js.
defineRuntimeEvents(EventBus);


// Compatibilidad global: algunos sistemas legacy referencian `Combat.active`.
if(typeof globalThis.Combat === 'undefined') {
  globalThis.Combat = CombatResolution;
}
if(typeof globalThis.Combat.active === 'undefined') {
  globalThis.Combat.active = false;
}

// ── Registro de plugins internos de dominio ───────────────────────
// Estos son los sistemas que antes eran monolíticos y ahora viven
// como plugins registrados. Cada uno recibe CTX en sus handlers.

// Manifest declarativo de plugins de dominio. Cada entrada es el nombre
// del binding global que el plugin expone al cargar su <script>. El orden
// fisico final lo resuelve PluginLoader.registerMany via dependencias.
const DOMAIN_PLUGIN_BINDINGS = [
  'pluginSupervivencia', 'pluginDificultad', 'pluginEnemigos',
  'pluginXP', 'pluginTacticas', 'pluginItems', 'pluginForja',
  'pluginNPCs', 'pluginArcos', 'pluginWorldAI', 'pluginCreaturas',
  'pluginHabilidades', 'pluginMagias', 'pluginIABatalla',
  'pluginFacciones', 'pluginBosses', 'pluginTricksters',
  'pluginSombraHerrante', 'pluginArbolVida', 'pluginTransformaciones',
  'pluginGuarida', 'pluginInvocaciones', 'pluginCultos',
  'pluginReinoPesadilla', 'pluginConcentracion',
];

function _registerDomainPlugins() {
  const defs = DOMAIN_PLUGIN_BINDINGS
    .map((name) => (typeof globalThis[name] !== 'undefined' ? globalThis[name] : null))
    .filter(Boolean);
  const missing = DOMAIN_PLUGIN_BINDINGS.filter((name) => typeof globalThis[name] === 'undefined');
  if(missing.length) console.warn('[Boot] plugins de dominio sin binding global:', missing.join(', '));
  PluginLoader.registerMany(defs);
}

// ── Registrar plugins JSON declarativos de los <script> tags ──────
function _registerJSONPluginsFromDOM() {
  document.querySelectorAll('script[type="application/json+plugin"]').forEach(el => {
    try {
      const def = JSON.parse(el.textContent);
      PluginLoader.registerFromJSON(def);
    } catch(e) {
      console.warn('[Boot] Error cargando plugin JSON:', el.id, e);
    }
  });
}

async function _loadConsolidatedModule() {
  const fallback = { module:null, plugins:[], systems:[] };
  try {
    if(typeof fetch !== 'function') return fallback;
    const res = await fetch('data/module.json', { cache:'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = await res.json();
    ModuleLoader.fromBundle(parsed);
    return {
      module: parsed?.module || null,
      plugins: Array.isArray(parsed?.plugins) ? parsed.plugins : [],
      systems: Array.isArray(parsed?.systems) ? parsed.systems : [],
    };
  } catch(e) {
    console.warn('[Boot] No se pudo cargar data/module.json:', e);
    return fallback;
  }
}

// ── Secuencia de boot ─────────────────────────────────────────────
// No toca el DOM directamente — usa Out.boot() para el boot screen
// y Renderer.setHeader() para la cabecera (único punto de contacto UI).
async function bootSeq() {
  if(typeof RunMem !== 'undefined') RunMem.load?.();

  Out.boot('b1', '▸ Cargando módulo consolidado...', 'pending');
  const consolidated = await _loadConsolidatedModule();
  if(!consolidated.module) ModuleLoader.fromElement('module-base');
  Out.boot('b1', '✓ Módulo base', 'ok');

  Out.boot('b2', '▸ Inicializando sistemas core...', 'pending');
  Out.boot('b2', '✓ Core: Entity, Player, World, Clock, GS, CombatResolution', 'ok');

  Out.boot('b3', '▸ Registrando plugins de dominio...', 'pending');
  _registerDomainPlugins();
  Out.boot('b3', '✓ Plugins: xp, tacticas, items, forja, npcs, arcos, world-ai y dominio', 'ok');

  Out.boot('b4', '▸ Cargando plugins JSON...', 'plug');
  if(consolidated.plugins.length) {
    ModuleLoader.getPluginDefs().forEach(def => PluginLoader.registerFromJSON(def));
  } else {
    _registerJSONPluginsFromDOM();
  }
  const pluginsJSON = PluginLoader.list().filter(p=>p).map(p=>p.nombre);
  Out.boot('b4',
    pluginsJSON.length
      ? `✓ Plugins JSON: ${pluginsJSON.join(', ')}`
      : '· Sin plugins JSON adicionales',
    pluginsJSON.length ? 'plug' : 'ok'
  );

  Out.boot('b5', '▸ Montando adaptador de I/O...', 'pending');
  // Renderer.setHeader es el único acceso al DOM permitido en boot.
  // Todo lo demás (input, output) fluye por EventBus.
  Renderer.setHeader(`v2.0 — ${ModuleLoader.list()[0] || '?'}`);
  InputAdapter.mount();   // monta los listeners del <input> HTML
  Out.boot('b5', '✓ I/O montado', 'ok');

  await new Promise(r => setTimeout(r, 600));
  await Renderer.hideBoot();
}

// ── Inicialización del juego ──────────────────────────────────────
// Cero referencias al DOM. Toda salida vía Out.*.
async function init() {
  if(loadSave()) {
    Out.sp();
    Out.line('— PARTIDA CARGADA —', 't-eco', true);
    Out.line(`${Player.get().name}  ·  Ciclo ${Clock.cycle}  ·  ${World.node(Player.pos())?.name||'?'}`, 't-dim');
    Out.sp();
    cmdMirar();
    refreshStatus();
    return;
  }

  EventBus.emit('game:new_world', {});
  Out.sp();
  await Out.tw('E C O S I S T E M A', 't-acc', 20);
  Out.line('v2.0 — arquitectura por plugins', 't-dim');
  Out.sp();

  Player.create();
  const { startId } = World.gen(U.uid()+U.uid(), { ecos: CTX.RunMem?.ecos?.() || [] });
  Player.setPos(startId);
  World.visit(startId);
  _xpInit(true);
  Clock.tick(0);

  D.itemsInicio.forEach(bp => {
    const mat = D.mat(bp);
    Player.addItem({ id:U.uid(), blueprint:bp, nombre:bp.replace(/_/g,' '),
      tipo:'material', tags:D.matTags(bp), estado:'nativo', desc:mat?.desc });
  });

  Out.line(`Mundo generado. ${Object.keys(World.all()).length} nodos.`, 't-dim');
  Out.line('"nombre [nombre]" para identificarte. "ayuda" para ver comandos.', 't-dim');
  Out.sp();
  cmdMirar();
  refreshStatus();
  save();
}

// ── Arranque automático (equivalente a singlefile) ─────────────
// Ejecuta boot + init una sola vez cuando el documento está listo.
(async () => {
  if(window.__ecoBooted) return;
  window.__ecoBooted = true;
  await bootSeq();
  await init();
  document.getElementById('inp')?.focus();
})();
