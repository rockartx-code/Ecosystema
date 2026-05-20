# Contrato ontologico: clasificacion de modulos

## Proposito

Este contrato fija la arquitectura objetivo final del repositorio como un monolito modular client-only, event-driven, con fronteras `core` / `systems` / `plugins` / `data`. La clasificacion responde a ownership y dependencias permitidas, no al nombre historico del archivo ni al lugar donde viva su configuracion declarativa.

## Capas

### `core`

`core` contiene el kernel del runtime: contratos estables, estado base, loaders, EventBus, ServiceRegistry, primitivas del mundo y reglas necesarias para que el motor exista como plataforma reutilizable.

Pertenece a `core`:

- contratos y puntos de extension del runtime
- estado base (`Player`, `World`, `GS`, `Clock`)
- infraestructura neutral al gameplay concreto
- adaptadores minimos de integracion definidos como contrato, no como feature de dominio

No pertenece a `core`:

- mecanicas opcionales o especializadas de gameplay
- narrativa concreta
- persistencia browser, audio, red o rendering especifico

### `systems`

`systems` contiene servicios transversales y adaptadores operativos del runtime browser-only. Su responsabilidad es conectar el kernel con el entorno de ejecucion y ofrecer puentes estables para comandos, persistencia, audio, red, renderer o memoria entre runs.

Pertenece a `systems`:

- I/O, renderer y adaptadores de interfaz
- persistencia (`save-load`, `run-memory`)
- audio (`music`, `sfx`)
- networking y sincronizacion (`net`)
- orquestacion operativa (`commands`, `autocomplete`)

No pertenece a `systems`:

- reglas de gameplay cuya razon de existir sea una mecanica de dominio
- contenido declarativo

### `plugins`

`plugins` contiene verticales de gameplay y modulos de dominio cargados por `PluginLoader`. Un plugin puede exponer servicios `runtime.*`, escuchar eventos o ampliar la simulacion, pero sigue siendo ownership de dominio aunque parte de su configuracion viva en `data/module.json` bajo `systems[]` por legado del bundle consolidado.

Pertenece a `plugins`:

- progresion, tacticas, forja, items, NPCs, arcos, world AI y mecanicas similares
- reglas intercambiables o especializadas por experiencia de juego
- capacidades que pueden evolucionar detras de contratos `runtime.*`

No pertenece a `plugins`:

- contratos base del motor
- adaptadores browser puros
- datos declarativos sin logica ejecutable

### `data`

`data` contiene contenido declarativo y configuracion consumida por el runtime.

Pertenece a `data`:

- `data/module.json`
- tablas, catalogos, lore, textos, plantillas y balance
- configuracion para modulos core, systems o plugins

No pertenece a `data`:

- logica ejecutable
- adaptadores de runtime
- contratos de integracion

## Reglas de dependencia

- `core` depende solo de `core` y de primitivas minimas del runtime.
- `systems` pueden depender de `core` y del entorno browser.
- `systems` pueden invocar capacidades de plugins solo por `EventBus` o `ServiceRegistry`; eso no cambia el ownership del modulo consumido.
- `plugins` pueden depender de contratos de `core` y de servicios de `systems`.
- `plugins` pueden colaborar entre si solo mediante contratos `runtime.*` o eventos, no por acoplamiento directo entre archivos.
- `data` no depende de capas ejecutables.

## Regla de interpretacion importante

El namespace de configuracion en `data/module.json` NO define ownership arquitectonico. Ejemplos reales:

- `xp`, `tactics`, `arc-engine` y `world-ai` tienen data bajo `systems[]`, pero su implementacion vive en `plugins/` y su ownership final es `plugin`.
- `run-memory` usa `pluginId: 'core'` en algunos registros de servicio, pero su ownership final es `system` porque persiste estado browser y no define el kernel conceptual del motor.

## Clasificacion final fijada en Fase 1

| Modulo | Ownership final | Criterio |
| --- | --- | --- |
| `renderer` | `system` | Adaptador de salida/UI del runtime browser. |
| `run-memory` | `system` | Persistencia browser entre runs via `localStorage` y servicios `runtime.memory.*`. |
| `music` | `system` | Servicio transversal de audio. |
| `sfx` | `system` | Servicio transversal de audio reactivo. |
| `net` | `system` | Adaptador operativo de red/sincronizacion. |
| `save-load` | `system` | Persistencia de partida y ciclo de muerte/import-export. |
| `npc-engine` | `plugin` | Gameplay narrativo: generacion, dialogo, misiones y quiebres de NPCs. |
| `arc-engine` | `plugin` | Progresion narrativa sobre contratos `runtime.npc.*` y `runtime.memory.*`. |
| `xp` | `plugin` | Regla de progresion y atributos, reemplazable detras de `runtime.xp.*`. |
| `tactics` | `plugin` | Combate tactico y descanso como capa de gameplay. |
| `world-ai` | `plugin` | Simulacion de roaming y migracion, no adaptador tecnico. |
| `forge` | `plugin` | Mecanica de crafting/forja del dominio. |
| `item-system` | `plugin` | Catalogo y uso tactico de items como gameplay. |
| `criaturas` | `plugin` | Extension de dominio y contenido ejecutable. |
| `facciones` | `plugin` | Reglas de facciones y control territorial. |
| `magias` | `plugin` | Mecanicas especializadas de magia. |
| `bosses` | `plugin` | Vertical de encounters y rewards. |
| `supervivencia` | `plugin` | Regla de hambre y heridas persistentes sobre `player:tick`. |
| `dificultad` | `plugin` | Calculo de dificultad del mundo via `world:calc_difficulty`. |
| `enemigos` | `plugin` | Fabrica de entidad `enemy` y spawn por seccion via `world:request_enemies`. |

## Criterio de decision para futuros modulos

Resolver en este orden:

1. Si al quitarlo desaparece el kernel reutilizable, tiende a `core`.
2. Si conecta el runtime con browser, UI, audio, storage o red, tiende a `system`.
3. Si encapsula reglas de gameplay o simulacion intercambiable, tiende a `plugin`.
4. Si solo describe contenido o configuracion, pertenece a `data`.
5. Si hoy parece `core` por acoplamiento accidental, mantenerlo fuera de `core` hasta separar contrato de implementacion.

## Politica de versionado de plugins (semver)

Cada plugin declara su `version` segun semver:

- **mayor** (`1.x.x -> 2.0.0`): rompe contrato runtime (servicios, eventos, comandos). Otros plugins que requieren la version anterior deben actualizar.
- **menor** (`1.0.x -> 1.1.0`): agrega funcionalidad compatible (nuevo evento, nuevo comando, nuevo servicio).
- **parche** (`1.0.0 -> 1.0.1`): bugfix interno sin cambio de contrato.

Reglas:

- Plugins nuevos arrancan en `1.0.0`.
- Si un plugin expone una API publica (servicio `runtime.*`, hook publico), cualquier cambio incompatible obliga a subir mayor.
- El runtime versiona los eventos via `CTX.runtime.eventsVersion`. Plugins con `requires.events` declaran rango semver de compatibilidad.

## Deuda tecnica conocida (a cerrar en fase posterior)

- C2 ya esta cerrado para todos los handlers del audit (ver "Cerrado en fase 1.5"). Quedan en `systems/commands.js` los handlers neutrales (cmdIr, cmdMirar, cmdMapa, cmdInv, cmdEquipar, cmdUsar, cmdReparar, cmdRecoger, cmdSoltar, cmdEstado, cmdAyuda) y los de sistema/debug (cmdPlugins, cmdServicios, cmdEventos, etc.) que pertenecen al adaptador operativo. Tambien sigue ahi el trade multiplayer (`_cmdComerciar`, etc.) que conviene migrar cuando se cree `plugin-trade`.
- `_zoneThemeFor` en `systems/music.js` consulta `data/module.json.music.zone_themes`; cualquier mapeo zona->tema nuevo debe vivir en data, no en el adapter.
- ISP en `CTX` (A5 del audit): **infraestructura cerrada en fase 1.4**. Falta migrar los 22 plugins restantes a `permissions: { allow:[...], runtime:[...] }` para activar `setPermissionsPolicy('strict')` por defecto. Hoy 3 plugins (supervivencia, dificultad, enemigos) lo declaran como demostracion; el resto sigue recibiendo ctx completo (politica 'off' default mantiene backward compat).

## Cerrado en fase 1.3 (C1)

- **C1 del audit — `systems/net.js` maquina de batalla**: extraida a `plugins/plugin-battle-engine.js` (`runtime.battle.*` + `gameplay.battle.*` services). `net.js` queda como adaptador de red puro con wrappers de compat sobre el plugin. Validado por `tests/battle_engine_functional_smoke.js` (start, atacar, defender, IA fallback, victoria, huir, render, getMyBattle/Actor). El test corre en cada `npm test`.

## Cerrado en fase 1.4 (A5)

- **A5 del audit — ISP en CTX**: `PluginLoader._buildCtxView(def, ctx)` filtra la vista que recibe cada plugin segun `def.permissions = { allow:[...], runtime:[...] }`. Politica configurable via `PluginLoader.setPermissionsPolicy('off' | 'warn' | 'strict')`. Plugins sin `permissions` reciben ctx completo (backward compat). Las claves metadato de `runtime` (`version`, `eventsVersion`, `events`, `modules`, `plugins`, `commands`, `services`) siempre estan disponibles incluso si no se declaran, porque son primitivas de plataforma. Validado por `tests/plugin_permissions_smoke.js` (6 escenarios: backward compat, strict, warn, comandos filtrados, cambio de politica en runtime, metadata siempre visible). Tres plugins (`supervivencia`, `dificultad`, `enemigos`) declaran sus permissions como demostracion; los restantes pueden migrar incrementalmente sin romper nada mientras la politica siga en `'off'`.

## Cerrado en fase 1.7 (M1)

- **M1 del audit — split fisico de `core/core.js`**: el monolito de 833 lineas se reemplaza por siete modulos cohesivos en `core/`:
  - `utils.js` (U + helpers semver, 90 lineas)
  - `event-bus.js` (EventBus, 183)
  - `service-registry.js` (ServiceRegistry, 37)
  - `module-loader.js` (ModuleLoader, 51)
  - `command-registry.js` (CommandRegistry, 112)
  - `plugin-loader.js` (PluginLoader + ctx-view de A5, 390)
  - `data-accessor.js` (D, 38)
- Cada fichero termina con `globalThis.X = X` para que los `const` top-level (que en scripts clasicos no se enganchan al global object) sean visibles cross-script. El orden de carga en `index.html` respeta las dependencias topologicas.
- Desbloqueo del harness de tests: `tests/helpers/load-core.js` expone `readCoreSource()` que concatena los siete ficheros en orden de dependencia. Los seis tests que cargaban `core/core.js` via `fs.readFileSync` ahora usan el helper, sin cambiar su semantica.
- `core/core.js` eliminado del repositorio.
- Los 16 smoke tests (incluidos los funcionales de battle/permissions/migration) verdes despues del split.

## Cerrado en fase 1.6 (M6)

- **M6 del audit — shim legacy `globalThis.Combat.active`**: confirmado por inspeccion exhaustiva que ningun consumer leia el flag (`grep` produce solo escrituras: en `_setCombatActive` del plugin, en `commands.js:272` despues de huir, y en el shim mismo). Acciones:
  - `plugin-battle-engine` elimino `_setCombatActive` y sus dos call sites en `startBattle`/`_checkBattleEnd`.
  - `systems/commands.js:272` quita la asignacion `Combat.active=false` despues de huir (la maquina ya lo gestiona internamente via `battle.estado`).
  - `core/main.js` elimina el shim completo (`globalThis.Combat = CombatResolution` + `globalThis.Combat.active = false`) y el alias `CTX.Combat`.
  - `systems/net.js` elimina `Combat`/`CombatResolution`/`ConcentracionSystem` de los deps que pasa a `NetLogic.create` (dead code post-C1).
  - Tests actualizados: `battle_engine_functional_smoke.js` ahora valida via `Net.getMyBattle()?.estado` en vez de `Combat.active`; `runtime_smoke.js` y `e2e_8runs_smoke.js` ya no inyectan stubs muertos.
- El estado de batalla queda unicamente en `battle.estado` ('activo'|'fin'). Consultable desde commands/plugins via `runtime.battle.current()?.estado === 'activo'`.

## Cerrado en fase 1.5 (C2)

- **C2 del audit — migracion completa de handlers de gameplay**: los handlers narrativos, de forja, de batalla y de criaturas dejaron `systems/commands.js` y se implementan dentro de su plugin de dominio. Cada plugin registra el verbo en `CommandRegistry` via `def.comandos`:
  - **plugin-npcs** absorbe `hablar`, `preguntar`, `observar`, `traicionar`, `npcs`/`personas`, `misiones`/`mis`, `legados`, `aceptar`, `rechazar`, `completar`. Incluye `_findNpcEnNodo`/`_findNpcMundo`/`_pickNpcByQuery` migrados de los helpers homonimos de commands.js.
  - **plugin-forja** absorbe `forjar`, `encarnar`, `conjurar`, `fusionar`, `recetas`, `materiales`. Consume servicios `runtime.player.damage`/`add_hab`/`add_mag`/`remove_hab`/`remove_mag`/`find_hab`/`find_mag` que `systems/commands.js` ahora registra como parte del runtime de player.
  - **plugin-battle-engine** absorbe `atacar`/`a` y `examinar`/`ex` ademas de la maquina de batalla que ya cerro C1.
  - **plugin-criaturas** absorbe `capturar`, `vincular`, `liberar`, `modo`, `nombrar`, `criar`, `criaturas`/`comp`, `anclas`. Las implementaciones locales del plugin (ya existian en parte) ahora estan completas — `cmdAnclas` dejo de delegar al global.
- Validacion: `tests/commands_migration_smoke.js` (16 escenarios sobre los handlers migrados, cubriendo registro en CommandRegistry y comportamiento observable: mutaciones de estado, output, eventos). Corre en `npm test` y se cuenta como guardrail en `dod_audit_smoke`.
- `systems/commands.js` paso de ~1560 lineas a ~1340 (-220) y quedo enfocado en dispatch, movimiento, inventario base, status, ayuda, audio y debug.

## Invariantes para Fase 2

- Mover wrappers y facades legacy que hoy registran contratos de plugins desde `systems/commands.js` hacia ownership mas explicito.
- Tipar y versionar eventos runtime visibles que hoy siguen fuera de `defineEvents(...)` (cerrado parcialmente en Fase 1.1 con 41 specs nuevas en `core/events.js`).
- Reducir globals legacy sin cambiar la frontera documental acordada en esta fase.
