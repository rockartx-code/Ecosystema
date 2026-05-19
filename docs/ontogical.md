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

- `core/main.js` mantiene `globalThis.Combat = CombatResolution` como shim de compatibilidad. `systems/commands.js:280` y `systems/net.js:172` aun lo consumen. La frontera limpia llega cuando se extraiga la maquina de batalla de `net.js` a un plugin con servicios `runtime.battle.*` propios.
- `systems/net.js` aun contiene la maquina tactica completa (~350 lineas: `startBattle`, `sendBattleAction`, `_execSimpleAI`, gestion de cola/turnos/poise, loot). C1 del audit: extraer a un futuro `plugin-battle-engine` que registre `runtime.battle.*` directamente. Riesgo alto sin tests funcionales; sesion dedicada.
- `systems/commands.js` aun contiene handlers de gameplay (`cmdHablar`, `cmdForjar`, `cmdAtacar`, `cmdPreguntar`, `cmdObservar`, `cmdTraicionar`, `cmdNPCs`). En la fase 1.2 se migraron `cmdAceptar/Rechazar/Completar` a `plugin-npcs`. El resto sigue C2 incremental.
- `_zoneThemeFor` en `systems/music.js` consulta `data/module.json.music.zone_themes`; cualquier mapeo zona->tema nuevo debe vivir en data, no en el adapter.
- ISP en `CTX` (A5 del audit): el segundo argumento de los hooks expone ~30 namespaces a todos los plugins. Una version futura podria filtrar segun `def.permissions` declaradas. Cambio cross-plugin, requiere su propia fase.
- Split fisico de `core/core.js` (M1 del audit): el archivo agrupa 6 namespaces (U, EventBus, ServiceRegistry, ModuleLoader, PluginLoader, CommandRegistry, D). Sin un sistema de modulos ES en navegador, los tests dependen de cargar `core/core.js` como unico fichero (`vm.runInContext`). Split deferido hasta migrar a ESM o test harness con orquestacion multi-fichero.

## Invariantes para Fase 2

- Mover wrappers y facades legacy que hoy registran contratos de plugins desde `systems/commands.js` hacia ownership mas explicito.
- Tipar y versionar eventos runtime visibles que hoy siguen fuera de `defineEvents(...)` (cerrado parcialmente en Fase 1.1 con 41 specs nuevas en `core/events.js`).
- Reducir globals legacy sin cambiar la frontera documental acordada en esta fase.
