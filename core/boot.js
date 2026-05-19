// ════════════════════════════════════════════════════════════════
// BOOT — Secuencia de arranque del runtime
//
// Extraido de core/main.js para preservar SRP. main.js queda como
// construccion de CTX + contrato de eventos; boot.js se encarga de:
//   - Manifest declarativo de plugins de dominio
//   - Carga de plugins JSON desde DOM/bundle
//   - bootSeq()  — monta modulos, plugins, I/O
//   - init()     — restaura save o genera un mundo nuevo
//   - IIFE auto-arranque
// ════════════════════════════════════════════════════════════════
'use strict';

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

// Secuencia de boot. No toca el DOM directamente — usa Out.boot() para el
// boot screen y Renderer.setHeader() para la cabecera (unico punto de
// contacto UI).
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
  Renderer.setHeader(`v2.0 — ${ModuleLoader.list()[0] || '?'}`);
  InputAdapter.mount();
  Out.boot('b5', '✓ I/O montado', 'ok');

  await new Promise(r => setTimeout(r, 600));
  await Renderer.hideBoot();
}

// Inicializacion del juego. Cero referencias al DOM. Toda salida via Out.*.
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
  const initXP = ServiceRegistry.get('runtime.xp.init');
  if(typeof initXP === 'function') initXP(true);
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

// Arranque automatico (equivalente a singlefile). Ejecuta boot + init una
// sola vez cuando el documento esta listo.
(async () => {
  if(window.__ecoBooted) return;
  window.__ecoBooted = true;
  await bootSeq();
  await init();
  document.getElementById('inp')?.focus();
})();
