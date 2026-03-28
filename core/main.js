// ════════════════════════════════════════════════════════════════
// MAIN — Bootstrap de ECOSISTEMA v2.0
//
// Orden de inicialización:
//   1. Core (U, EventBus, ModuleLoader, PluginLoader, CommandRegistry, D)
//   2. Entity + EntityRegistry
//   3. Player, Clock, World, GS
//   4. CombatResolution + battleLog
//   5. CTX — contexto compartido disponible para todos los plugins
//   6. Sistemas internos (WorldAI, FactionSystem, NPCEngine, Forge…)
//      que se registran en EventBus pero no en PluginLoader
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

  // Sistemas de juego (se asignan tras su declaración):
  //   CTX.Forge = Forge;  CTX.NPCEngine = NPCEngine;
  //   CTX.RunMem = RunMem; CTX.XP = XP; CTX.Net = Net;
  //   CTX.Imprint = Imprint; CTX.Tags = Tags;
  //   CTX.Tactics = Tactics; CTX.ItemSystem = ItemSystem;
  //   CTX.FactionSystem = FactionSystem; CTX.BossSystem = BossSystem;
  //   CTX.ArcEngine = ArcEngine;

  // Helpers de juego expuestos a plugins
  save:       ()=>save(),
  findNPC:    (q)=>findNPC(q),
  findMision: (q)=>findMision(q),
};

CTX.runtime = {
  version: '2.1.0',
  events: EventBus,
  modules: ModuleLoader,
  plugins: PluginLoader,
  commands: CommandRegistry,
  services: ServiceRegistry,
  data: {
    get: (path)=>ModuleLoader.get(path),
    listModules: ()=>ModuleLoader.list(),
  },
};

const _isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const _isStr = (v) => typeof v === 'string';
const _isNum = (v) => typeof v === 'number' && Number.isFinite(v);

EventBus.defineEvents({
  'output:line': {
    kind:'ui', phase:'observe',
    validateIn: (p)=>_isObj(p) && _isStr(p.text),
  },
  'output:status': {
    kind:'ui', phase:'observe',
    validateIn: (p)=>_isObj(p) && _isObj(p.slots),
  },
  'input:command': {
    kind:'command', phase:'pre',
    validateIn: (p)=>_isObj(p) && _isStr(p.verb) && Array.isArray(p.args),
  },
  'audio:sfx.play': {
    kind:'command', phase:'post',
    validateIn: (p)=>_isObj(p) && _isStr(p.cue || p.type || ''),
  },
  'audio:music.play': {
    kind:'command', phase:'post',
    validateIn: (p)=>_isObj(p) && _isStr(p.track || p.theme || ''),
  },
  'audio:sfx.played': {
    kind:'domain', phase:'observe',
    validateIn: (p)=>_isObj(p) && (_isStr(p.cue || '') || p.cue == null),
  },
  'audio:music.changed': {
    kind:'domain', phase:'observe',
    validateIn: (p)=>_isObj(p) && (_isStr(p.track || '') || p.track == null),
  },
  'audio:error': {
    kind:'domain', phase:'observe',
    validateIn: (p)=>_isObj(p),
  },
  'control:action': {
    kind:'command', phase:'pre',
    validateIn: (p)=>_isObj(p) && _isStr(p.verb || ''),
  },
  'control:binding.request': {
    kind:'query', phase:'pre',
    validateIn: (p)=>_isObj(p),
    validateOut: (p)=>_isObj(p) || p == null,
  },
  'control:binding.changed': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p),
  },
  'module:loaded': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && (_isObj(p.meta || {}) || p.meta == null),
  },
  'plugin:loaded': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && _isStr(p.id || ''),
  },
  'plugin:unloaded': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && _isStr(p.id || ''),
  },
  'combat:resolve_magia': {
    kind:'query', phase:'main',
    validateIn: (p)=>_isObj(p) && _isObj(p.actor || {}),
    validateOut: (p)=>_isObj(p) && typeof p.handled === 'boolean',
  },
  'combat:resolve_habilidad': {
    kind:'query', phase:'main',
    validateIn: (p)=>_isObj(p) && _isObj(p.actor || {}),
    validateOut: (p)=>_isObj(p) && typeof p.handled === 'boolean',
  },
  'combat:resolve_ia': {
    kind:'query', phase:'main',
    validateIn: (p)=>_isObj(p) && _isObj(p.actor || {}) && _isObj(p.battle || {}),
    validateOut: (p)=>_isObj(p) && (p.action == null || _isStr(p.action)),
  },
  'world:tick': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && (_isNum(p.cycle) || p.cycle == null),
  },
  'combat:start': {
    kind:'domain', phase:'main',
    validateIn: (p)=>_isObj(p) && _isObj(p.battle || {}) && (_isObj(p.enemy || {}) || p.enemy == null),
  },
  'combat:before_attack': {
    kind:'query', phase:'pre',
    validateIn: (p)=>_isObj(p) && _isObj(p.attacker || {}),
    validateOut: (p)=>_isObj(p),
  },
  'combat:before_damage_apply': {
    kind:'query', phase:'pre',
    validateIn: (p)=>_isObj(p) && (_isNum(p.dmg) || p.dmg == null),
    validateOut: (p)=>_isObj(p) && (_isNum(p.dmg) || p.dmg == null),
  },
  'combat:after_attack': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && _isObj(p.attacker || {}),
  },
  'combat:after_damage_apply': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && (_isObj(p.actor || {}) || _isObj(p.target || {})),
  },
  'combat:enemy_used_magia': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && (_isObj(p.actor || {}) || p.actor == null),
  },
  'combat:player_hit': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && (_isNum(p.damage) || p.damage == null),
  },
  'combat:enemy_defeat': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && (_isObj(p.enemy || {}) || p.enemy == null),
  },
  'combat:loot': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && (Array.isArray(p.items) || p.items == null),
  },
  'narrative:npc_gen': {
    kind:'domain', phase:'main',
    validateIn: (p)=>_isObj(p) && (_isObj(p.npc || {}) || p.npc == null),
  },
  'narrative:npc_speak': {
    kind:'domain', phase:'main',
    validateIn: (p)=>_isObj(p) && (_isStr(p.text || '') || p.text == null),
  },
  'narrative:npc_interact': {
    kind:'domain', phase:'main',
    validateIn: (p)=>_isObj(p) && (_isObj(p.npc || {}) || p.npc == null),
  },
  'narrative:npc_death': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && (_isObj(p.npc || {}) || p.npc == null),
  },
  'narrative:npc_twist': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && (_isObj(p.twist || {}) || p.twist == null),
  },
  'narrative:mission_gen': {
    kind:'domain', phase:'main',
    validateIn: (p)=>_isObj(p) && (_isObj(p.mision || {}) || p.mision == null),
  },
  'narrative:mission_complete': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && (_isObj(p.mision || {}) || p.mision == null),
  },
  'narrative:mission_fail': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && (_isObj(p.mision || {}) || p.mision == null),
  },
  'player:stat_change': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && (_isStr(p.stat || '') || p.stat == null),
  },
  'player:create': {
    kind:'domain', phase:'main',
    validateIn: (p)=>_isObj(p) && (_isObj(p.player || {}) || p.player == null),
  },
  'player:item_add': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && (_isObj(p.item || {}) || p.item == null),
  },
  'player:item_remove': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && (_isObj(p.item || {}) || p.item == null),
  },
  'player:equip': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && (_isObj(p.item || {}) || p.item == null),
  },
  'player:tick': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p) && (_isObj(p.player || {}) || p.player == null),
  },
  'player:die': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p),
  },
  'memory:run_start': {
    kind:'domain', phase:'main',
    validateIn: (p)=>_isObj(p),
  },
  'memory:run_end': {
    kind:'domain', phase:'post',
    validateIn: (p)=>_isObj(p),
  },
});


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

function _registerCoreSystems() {
  const corePluginDefs = [
    typeof pluginCreaturas        !== 'undefined' ? pluginCreaturas : null,
    typeof pluginHabilidades      !== 'undefined' ? pluginHabilidades : null,
    typeof pluginMagias           !== 'undefined' ? pluginMagias : null,
    typeof pluginIABatalla        !== 'undefined' ? pluginIABatalla : null,
    typeof pluginFacciones        !== 'undefined' ? pluginFacciones : null,
    typeof pluginBosses           !== 'undefined' ? pluginBosses : null,
    typeof pluginTricksters       !== 'undefined' ? pluginTricksters : null,
    typeof pluginSombraHerrante   !== 'undefined' ? pluginSombraHerrante : null,
    typeof pluginArbolVida        !== 'undefined' ? pluginArbolVida : null,
    typeof pluginTransformaciones !== 'undefined' ? pluginTransformaciones : null,
    typeof pluginGuarida          !== 'undefined' ? pluginGuarida : null,
    typeof pluginInvocaciones     !== 'undefined' ? pluginInvocaciones : null,
    typeof pluginCultos           !== 'undefined' ? pluginCultos : null,
    typeof pluginReinoPesadilla   !== 'undefined' ? pluginReinoPesadilla : null,
    typeof pluginConcentracion    !== 'undefined' ? pluginConcentracion : null,
  ].filter(Boolean);
  PluginLoader.registerMany(corePluginDefs);

  // ── Plugin: Supervivencia (hambre, heridas fuera de combate) ──
  // Antes era Player.hungerTick() inline en cmdIr.
  // Ahora escucha player:tick y gestiona hambre y heridas.
  PluginLoader.register({
    id: 'plugin:supervivencia',
    nombre: 'Supervivencia',
    version: '2.0.0',
    hooks: {
      'player:create': {
        fn(payload) {
          // El módulo base define los valores de hambre
          payload.player.hunger    = D.playerDef?.hunger_base || 100;
          payload.player.maxHunger = D.playerDef?.hunger_base || 100;
          return payload;
        }
      },
      'player:tick': {
        fn(payload) {
          const p = payload.player;
          p.hunger -= ModuleLoader.get('ciclo_hunger_perdida') || 3;
          if(p.hunger <= 0) {
            p.hunger = 0;
            p.hp    -= ModuleLoader.get('hunger_cero_hp_perdida') || 2;
          }
          // Heridas persistentes
          const heridas = p.heridas || [];
          if(heridas.includes('HEMORRAGIA'))    p.hp = Math.max(1, p.hp - 2);
          if(heridas.includes('ENVENENAMIENTO'))p.hp = Math.max(1, p.hp - 1);
          return payload;
        }
      },
    },
  });

  // ── Plugin: Dificultad del mundo ──────────────────────────────
  // Antes era World.calcDificultad() hardcodeado.
  // Ahora escucha world:calc_difficulty.
  PluginLoader.register({
    id: 'plugin:dificultad',
    nombre: 'Escalado de Dificultad',
    version: '2.0.0',
    hooks: {
      'world:calc_difficulty': {
        fn(payload) {
          const p  = payload.player;
          const atk = Player.getAtk();
          const def = Player.getDef();
          const equipPoder = atk*1.5 + def*2 + (p.equipped?.arma?.durabilidad||100)/20 + (p.equipped?.armadura?5:0);
          const ciclos = Clock.cycle || 1;
          const kills  = p.stats?.kills || 0;
          const score  = (equipPoder/20*0.5) + (ciclos/5*0.3) + (kills/10*0.2);
          payload.difficulty = Math.max(1.0, score);
          return payload;
        }
      },
    },
  });

  // ── Plugin: Enemigos ─────────────────────────────────────────
  // Registra la fábrica y maneja world:request_enemies.
  PluginLoader.register({
    id: 'plugin:enemigos',
    nombre: 'Sistema de Enemigos',
    version: '2.0.0',

    onLoad() {
      EntityRegistry.register('enemy', (data) => {
        // Los enemigos son Entity planos sin comportamiento especial por ahora
        return new Entity({ ...data, tipo:'enemy' });
      });
    },

    hooks: {
      'world:request_enemies': {
        fn(payload) {
          const wd  = D.world;
          const ep  = D.enemies;
          if(!ep.length || !U.chance(wd?.enemy_chance || .38)) return payload;

          const dif  = payload.difficulty || 1.0;
          const base = { ...U.pick(ep, payload.rng) };
          base.id         = U.uid();
          base.tipo       = 'enemy';
          base.hp         = Math.round((base.hp || 10) * dif);
          base.atk        = Math.round((base.atk|| 4) * Math.sqrt(dif));
          base.def        = Math.round((base.def|| 0) * Math.sqrt(dif) * 0.8);
          base.hp_current = base.hp;

          // Añadir tags elementales en secciones avanzadas
          if(dif >= 2.5) {
            const el = U.pick(['fuego','hielo','rayo','vacío','resonante'], payload.rng);
            base.tags = [...(base.tags||[]), el];
            base.nombre = `${base.nombre} [${el.toUpperCase()}]`;
          }

          payload.enemies.push(EntityRegistry.create('enemy', base));
          return payload;
        }
      },
    },
  });
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

  Out.boot('b3', '▸ Registrando sistemas de dominio...', 'pending');
  _registerCoreSystems();
  Out.boot('b3', '✓ Sistemas: criaturas, habilidades, magias, supervivencia, dificultad, enemigos', 'ok');

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
  if(typeof XP !== 'undefined') XP.init?.(true);
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
