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
const CTX = {
  // Core
  U, EventBus, ModuleLoader, PluginLoader, CommandRegistry, D,
  EntityRegistry,

  // Estado del juego
  Player, World, GS, Clock,

  // Sistemas de combate
  CombatResolution, battleLog, _sonEnemigos,

  // I/O — el motor y los plugins usan Out.* para escribir output.
  // Nunca usan R.*, document.*, ni console.log para output visible.
  Out,
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

// ── Registro de plugins internos de dominio ───────────────────────
// Estos son los sistemas que antes eran monolíticos y ahora viven
// como plugins registrados. Cada uno recibe CTX en sus handlers.

function _registerCoreSystems() {

  // ── Plugin: Criaturas ─────────────────────────────────────────
  PluginLoader.register(pluginCreaturas);

  // ── Plugin: Habilidades ───────────────────────────────────────
  PluginLoader.register(pluginHabilidades);

  // ── Plugin: Magias ────────────────────────────────────────────
  PluginLoader.register(pluginMagias);

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
function _registerJSONPlugins() {
  document.querySelectorAll('script[type="application/json+plugin"]').forEach(el => {
    try {
      const def = JSON.parse(el.textContent);
      PluginLoader.registerFromJSON(def);
    } catch(e) {
      console.warn('[Boot] Error cargando plugin JSON:', el.id, e);
    }
  });
}

// ── Secuencia de boot ─────────────────────────────────────────────
// No toca el DOM directamente — usa Out.boot() para el boot screen
// y Renderer.setHeader() para la cabecera (único punto de contacto UI).
async function bootSeq() {

  Out.boot('b1', '▸ Cargando módulo base...', 'pending');
  ModuleLoader.fromElement('module-base');
  Out.boot('b1', '✓ Módulo base', 'ok');

  Out.boot('b2', '▸ Inicializando sistemas core...', 'pending');
  Out.boot('b2', '✓ Core: Entity, Player, World, Clock, GS, CombatResolution', 'ok');

  Out.boot('b3', '▸ Registrando sistemas de dominio...', 'pending');
  _registerCoreSystems();
  Out.boot('b3', '✓ Sistemas: criaturas, habilidades, magias, supervivencia, dificultad, enemigos', 'ok');

  Out.boot('b4', '▸ Cargando plugins JSON...', 'plug');
  _registerJSONPlugins();
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
