# Diagnóstico de acoplamiento Plugin ↔ Core y propuesta de arquitectura desacoplada

## Objetivo
Este documento identifica dónde el código actual mezcla lógica de plugins con la del motor (core/sistemas), dónde hay mezcla entre plugins, y propone una ruta para que:

1. Los plugins no inyecten lógica directamente en core/systems.
2. Los plugins no dependan entre sí por variables/funciones globales.
3. El EventBus sea más robusto (contratos, fases, trazabilidad y seguridad).
4. Exista un sistema formal de dependencias entre plugins.

## Estado de implementación (actualizado)
Se implementó una primera iteración en runtime para aterrizar la propuesta:

1. **EventBus mejorado**:
   - soporte de `phase` en listeners (`pre/main/post/observe`),
   - `defineEvent/defineEvents` para contratos,
   - `emitDomain`, `runPipeline`, `request`,
   - trazas (`trace`) e introspección de listeners (`listeners`).
2. **ServiceRegistry**:
   - registro/consulta de capacidades (`register/get/call/list`),
   - limpieza por plugin en unload.
3. **PluginLoader con dependencias básicas**:
   - validación de `requires.plugins`, `requires.services`, `conflicts`,
   - parseo de rangos semver simples,
   - `registerMany` para carga por rondas según dependencias.
4. **CTX/runtime expuesto**:
   - `CTX.runtime` ahora centraliza `events/modules/plugins/commands/services/data`.
5. **Autocomplete extensible**:
   - registro de providers dinámicos (`AC.registerProvider`),
   - puente por servicio (`cli.autocomplete.registerProvider`).
6. **Iteración de desacoplamiento adicional**:
   - `PluginLoader.registerMany` aplicado al boot de plugins core,
   - `EventBus.defineEvents` inicial para contratos base de I/O y plugins,
   - servicios `io.*` registrados para salida/entrada/status,
   - comando `servicios` para inspección operativa del runtime.
7. **Observabilidad y orden de carga (iteración continua)**:
   - `load.after/load.before` ya participa en validación de dependencias del `PluginLoader`,
   - `registerMany` usa orden topológico básico para el batch de plugins,
   - `eventos` usa introspección pública (`EventBus.listeners`) sin tocar `_listeners`,
   - comandos `eventos_trace [n]`, `plugins_orden` y `plugins_pendientes` para diagnóstico operativo.
8. **Etapa E5 (servicios de gameplay) — avance inicial**:
   - servicios `gameplay.command.dispatch`, `gameplay.move`, `gameplay.look`, `gameplay.enter_node`, `gameplay.move_and_tick`,
   - primer consumo desde plugin (`plugin-reino-pesadilla`) usando `gameplay.enter_node` para evitar duplicación de transición de nodo.
9. **Etapa E6 (calidad/hardening) — avance inicial**:
   - smoke tests automatizados de runtime en `tests/runtime_smoke.js` (EventBus/ServiceRegistry/PluginLoader),
   - checklist actualizado con marcas por etapa y etapa actual E6.
10. **Etapa E7 (contratos de eventos) — avance inicial**:
   - `EventSpec` base aplicado a eventos críticos de I/O, plugin lifecycle, mundo y resolución de combate,
   - validación `validateIn/validateOut` activa con warnings para detectar payloads inválidos.
11. **Etapa E8 (consolidación de pendientes) — avance inicial**:
   - smoke tests de runtime integrados en comando estándar (`npm test`),
   - compatibilidad JSON plugin (`requires/load`) validada en pruebas automatizadas.
12. **Etapa E9 (funcionalidad primero) — avance inicial**:
   - autocomplete ahora fusiona sugerencias base + providers de plugins,
   - fallback por providers corregido para comandos no hardcodeados.

> Nota: esta iteración es compatible hacia atrás; todavía conviven rutas legacy y nuevas APIs.

Ver seguimiento operativo en: `checklist_desacoplamiento.md` (incluye marca por etapa aplicada; etapa actual: **E9**).

---

## 1) Hallazgos: dónde hoy se mezcla lógica de plugins con core/sistemas

## A. El boot del core conoce plugins concretos (acoplamiento estático)
En `core/main.js`, `_registerCoreSystems()` registra plugins por nombre (`pluginCreaturas`, `pluginHabilidades`, `pluginMagias`, etc.) y además define plugins inline (`plugin:supervivencia`, `plugin:dificultad`, `plugin:enemigos`).

**Problema**: el core sabe qué plugins existen y en qué orden cargar. Eso convierte extensiones en parte del engine.

**Impacto**:
- Cambiar/quitar plugins obliga a tocar core.
- Difícil distribuir perfiles (minimal, full, multiplayer, etc.) sin editar motor.

---

## B. `systems/commands.js` tiene lógica de dominio que debería ser plugin
`dispatch` contiene comandos de múltiples dominios (criaturas, magia, habilidades, facciones, bosses, red, etc.). Además hay fallbacks “si plugin no está”.

Ejemplos de mezcla:
- comandos de criaturas (`cmdCapturar`, `cmdCriar`, `cmdVincular`) dentro del sistema central de comandos.
- fallbacks `_cmdHabilidadesBasic` y `_cmdMagiasBasic`.
- delegación por eventos sólo en partes (`combat:resolve_magia`) pero manteniendo lógica híbrida en el core de comandos.

**Problema**: Commands actúa como “mega-core” de features, no como enrutador puro.

---

## C. Plugins replican lógica de sistemas (duplicación de reglas de juego)
`plugin-reino-pesadilla.js` repite secuencia de movimiento/tick muy similar a `cmdIr`:
- `Clock.tick`
- `EventBus.emit('player:tick')`
- `World.visit`
- `EventBus.emit('world:tick')`
- ajuste de NPCs
- `save()` y `cmdMirar()`

**Problema**: los plugins reimplementan transacciones del engine, generando divergencia y bugs por drift.

---

## D. Plugins dependen de símbolos globales de otros plugins
`plugin-ia-batalla.js` invoca funciones globales con guardas de `typeof`:
- `_ejecutarHabilidadEnemigo`
- `_ejecutarMagiaEnemigo`

**Problema**: dependencia implícita no declarada (hard coupling entre IA y plugins de magia/habilidades).

**Impacto**:
- Orden de carga frágil.
- Difícil testear IA aislada.
- Si cambia el nombre de función global, IA rompe silenciosamente.

---

## E. Plugins y sistemas leen/escriben internals del bus directamente
`cmdEventos()` consulta `EventBus._listeners` directo.

**Problema**: no hay encapsulación de introspección ni contratos de observabilidad.

---

## F. EventBus actual es flexible, pero sin contratos estrictos
El bus permite mutar payload encadenado y cancelar por `payload.cancelled`, lo cual es potente, pero:
- no hay tipado/esquema por evento,
- no hay separación clara entre “command event”, “domain event”, “query/request”,
- no hay timeout/aislamiento por listener,
- no hay tracing por listener (duración/errores por plugin de forma utilizable en runtime),
- no existe control de side effects según fase.

---

## 2) Hallazgos: mezcla de lógica entre plugins

1. **IA ↔ Magias/Habilidades** por funciones globales no declaradas.
2. **Bosses/Facciones/otros** dependen de objetos globales (`FactionSystem`, `BossSystem`, `NPCEngine`) en vez de contratos por capacidad.
3. Varias features comparten eventos pero sin “owner/phase contract”, pudiendo pisarse payloads por prioridad implícita.

---

## 3) Arquitectura objetivo (target)

## A. Core minimalista y declarativo
El core debe quedarse en:
- ciclo de vida de runtime,
- EventBus,
- PluginManager,
- CommandRouter,
- persistencia,
- API/servicios estables.

Nada de lógica de dominio específica (criaturas/magia/facciones/etc.) en core/systems base.

---

## B. API de runtime explícita para plugins (capabilities)
En vez de exponer globals sueltas, entregar un objeto `runtime` versionado:

- `runtime.events` (bus)
- `runtime.commands` (register/unregister)
- `runtime.state` (lectura/escritura controlada)
- `runtime.services` (combat, movement, inventory, npc, world, save)
- `runtime.logger`
- `runtime.plugin` (store/metadata/dependencies)

Con esto, un plugin no llama `cmdMirar()` ni internals: llama un servicio estable (ej. `runtime.services.movement.moveAndTick(dir)` o `runtime.services.world.advanceTurn(...)`).

---

## C. Separar comandos de dominio del motor
`systems/commands.js` debe pasar a:
- parser + router + fallback de ayuda/error.

Cada dominio registra sus comandos como plugin.

Ejemplo:
- `plugin:criaturas` registra `capturar/liberar/criar/...`
- `plugin:magias` registra `magias/lanzar/recargar`
- `plugin:world-core` (si se desea) registra comandos base mínimos (`ir`, `mirar`, `estado`).

---

## C.1 ¿Cómo sabe el CLI qué objetos mostrar en autocomplete?
En la arquitectura propuesta, el autocomplete deja de “adivinar” estado global y pasa a consumir **proveedores declarados por capacidad**.

### Regla general
El CLI arma sugerencias con 3 fuentes:
1. **Comandos**: `runtime.commands.list()` (incluye metadata de uso/alias/categoría).
2. **Objetos de dominio**: `runtime.autocomplete.request(context)` (agrega providers activos).
3. **Contexto actual**: texto parcial + nodo + modo (exploración/batalla/comercio).

### Contrato de proveedor de autocomplete
Cada plugin puede registrar uno o más providers:

```js
runtime.autocomplete.registerProvider({
  id: 'plugin:criaturas.targets',
  triggers: ['capturar', 'liberar', 'nombrar', 'vincular'],
  priority: 50,
  provide(ctx) {
    // ctx = { verb, args, partial, mode, player, nodeId }
    return [
      { value:'lobo eco',  label:'lobo eco',  type:'creature', score:0.92 },
      { value:'ancla_eco', label:'ancla eco', type:'item',     score:0.80 }
    ];
  }
});
```

### Flujo recomendado de resolución
1. El usuario escribe (ej. `capturar lo...`).
2. El parser identifica `verb = capturar`.
3. El autocomplete consulta providers cuyo `trigger` coincide con `capturar`.
4. Cada provider devuelve candidatos tipados (`item`, `npc`, `enemy`, `spell`, etc.).
5. El agregador normaliza, deduplica y rankea por:
   - coincidencia textual (`prefix > contains`),
   - score del provider,
   - prioridad del provider,
   - contexto (si está en batalla, priorizar `enemy` y `habilidad`).
6. El CLI renderiza la lista final.

### Ventaja de este enfoque
- El core no conoce estructuras internas de cada plugin.
- Cuando se descarga un plugin, sus sugerencias desaparecen automáticamente.
- Evita acoplar `systems/autocomplete.js` a campos concretos (`Player.get().ext.*`) de cada feature.
- Parte de los catálogos de CLI (`temas/modos/tags`) ya puede provenir de `ModuleLoader` (`cli_autocomplete.*`) con fallback.

### Fallback seguro
Si no hay provider para un verbo:
- usar diccionario base de comandos + últimos objetivos usados + inventario simple.
- nunca fallar por ausencia de plugin (degrada, no rompe).

### Política de precedencia configurable (runtime)
El agregador de autocomplete soporta `cli_autocomplete.precedence` con estos valores:

- `base_first` (default): primero sugerencias base, luego providers.
- `providers_first`: primero providers, luego base.
- `providers_only`: usar sólo providers.
- `base_only`: usar sólo base.

Esto permite migraciones graduales por entorno sin romper comandos legacy.

Estrategia sugerida de migración para plugins:
1. Empezar en `base_first` para asegurar compatibilidad con comandos legacy.
2. Mover verbos de alto valor a providers y validar UX con `providers_first`.
3. Cuando un dominio esté 100% provider-driven, activar `providers_only` por entorno.
4. Mantener `base_only` como modo de contingencia/debug ante regresiones.

---

## C.2 ¿Cómo desacoplar SFX/Music del core y habilitar nuevos engines de control/salida?
La clave es mover audio/input/render a una arquitectura **ports & adapters** encima del EventBus (o de un `IOBus` especializado).

### Objetivo de desacoplamiento
- El core **emite intención**, no implementación concreta (ej. `audio:sfx.play`, no `SFXEngine.play()`).
- Los engines (SFX, Music, MIDI, TTS, gamepad, OSC, stream overlay, etc.) son **adaptadores enchufables**.
- Los módulos/plugins nuevos se comunican por contratos de evento/servicio, no por referencias globales.

### 1) Definir puertos explícitos de I/O
Separar puertos por dominio:

1. `OutputPort` (texto/UI): líneas, status, boot, overlays.
2. `AudioPort` (audio semántico): SFX, música, snapshots de intensidad.
3. `ControlPort` (entrada): teclado, gamepad, red, bot, replay.
4. `TelemetryPort` (observabilidad): métricas, traces, profiling.

El core sólo conoce estas interfaces, nunca clases concretas.

### 2) Contratos de eventos para audio/control
Crear namespace estable:

- Audio command/query:
  - `audio:sfx.play` `{ cue, volume?, bus?, tags? }`
  - `audio:music.play` `{ track, layer?, fadeMs? }`
  - `audio:music.state.request` `{}` -> `{ playing, track, bpm, layers }`
  - `audio:ducking.set` `{ bus:'music', amount:0.35, ttlMs:1200 }`
- Audio domain events:
  - `audio:sfx.played`, `audio:music.changed`, `audio:error`
- Control input:
  - `control:action` `{ source:'keyboard|gamepad|net|bot', verb, args }`
  - `control:binding.request` / `control:binding.changed`

Con esto, cualquier módulo nuevo dispara `audio:*` y no necesita saber qué engine está montado.

### 3) Runtime ServiceRegistry para capacidades multimedia
Además del bus, exponer capacidades versionadas:

```js
runtime.services.register('audio.sfx.play', (payload)=>{ ... }, { pluginId:'engine:sfx', version:'1.0.0' });
runtime.services.register('audio.music.play', (payload)=>{ ... }, { pluginId:'engine:music', version:'1.0.0' });
runtime.services.register('control.inject', (action)=>{ ... }, { pluginId:'engine:input_router' });
```

Un plugin puede usar:

```js
const playSfx = runtime.services.get('audio.sfx.play');
playSfx?.({ cue:'attack_light', bus:'fx' });
```

Si no existe el servicio, el módulo degrada sin romper.

### 4) Pluginizar engines actuales (SFX/Music)
Convertir `systems/sfx-engine.js` y `systems/music-engine.js` en plugins tipo `engine:*`:

- `engine:sfx`
  - subscribe a eventos de dominio (`combat:*`, `player:item_add`, `command:after`) o a `audio:sfx.play`.
  - publica capacidad `audio.sfx.play`.
- `engine:music`
  - subscribe a clima/contexto (`world:node_enter`, `combat:start/end`) o `audio:music.play`.
  - publica `audio.music.play` y `audio.music.state`.

El core sólo monta `IOManager` + `PluginLoader`; no monta SFX/Music directamente.

### 5) Añadir motor de ruteo (AudioRouter)
Para permitir múltiples salidas simultáneas (WebAudio + MIDI + stream):

- `AudioRouter` mantiene buses lógicos: `master`, `music`, `fx`, `voice`, `ui`.
- Un evento `audio:sfx.play` se rutea a uno o varios adapters según configuración.
- Soporta prioridades y ducking (ej. bajar music durante voz/TTS o eventos críticos).

### 6) Habilitar nuevos engines de control
`ControlRouter` normaliza entradas heterogéneas a `control:action`:

- keyboard engine -> `control:action`
- gamepad engine -> `control:action`
- network engine -> `control:action`
- automation/replay engine -> `control:action`

Luego `CommandRouter` consume ese evento único.
Esto evita que cada fuente de entrada toque internals de comandos.

### 7) Habilitar nuevos engines de salida
`OutputRouter` permite multiplexar:

- terminal/text UI,
- HUD web,
- websocket overlay para streaming,
- TTS/lectura accesible,
- logs estructurados.

Todos escuchan `output:*` + (si aplica) `audio:*`.

### 8) Configuración dinámica y perfiles
Agregar perfil de runtime:

```json
{
  "ioProfile": "web-default",
  "engines": {
    "engine:sfx":   { "enabled": true,  "bus": "fx" },
    "engine:music": { "enabled": true,  "bus": "music" },
    "engine:midi":  { "enabled": false },
    "engine:tts":   { "enabled": false },
    "engine:gamepad": { "enabled": true }
  }
}
```

El loader puede activar/desactivar engines sin cambiar core.

### 9) Seguridad y aislamiento
- Cada engine corre bajo contrato (timeouts, manejo de errores, health score).
- Fallo de `engine:music` no debe cortar gameplay.
- `IOManager` puede deshabilitar automáticamente un engine degradado.

### 10) Plan incremental para este desacoplamiento
1. Crear `audio:*` y `control:*` contracts + `EventSpec`.
2. Introducir `AudioRouter` y `ControlRouter` sin quitar engines actuales.
3. Envolver SFX/Music actuales como `engine:sfx` y `engine:music`.
4. Migrar llamadas directas a emisiones/servicios (`audio.sfx.play`, `audio.music.play`).
5. Añadir un engine nuevo piloto (ej. `engine:tts` o `engine:gamepad`) para validar extensibilidad.

---

## C.3 ¿Se puede pasar de CLI a animación/3D sin modificar el motor?
Sí: **si el motor sólo emite eventos/estado semántico**, puedes cambiar la salida de CLI a 2D animado o 3D añadiendo un nuevo renderer-adapter, sin tocar la lógica del gameplay.

### Condición para que funcione de verdad
El motor no debe emitir texto “acoplado” como única fuente de verdad (`Out.line("...")` como estado implícito), sino eventos de dominio + snapshots consumibles:

- `world:node_enter`, `world:tick`, `combat:start`, `combat:turn`, `combat:end`
- `entity:spawn`, `entity:update`, `entity:despawn`
- `player:stat_change`, `inventory:changed`
- `camera:focus.request`, `fx:shake`, `fx:flash`

El CLI sería sólo un adaptador más (`renderer:cli`).

### Patrón recomendado
1. **Domain State Store**: fuente canónica serializable del juego (sin UI).
2. **RenderBridge**: traduce eventos de dominio a eventos de presentación.
3. **Render Adapters**:
   - `renderer:cli` (actual),
   - `renderer:2d` (canvas/sprites),
   - `renderer:3d` (three.js/babylon/godot bridge).

Todos escuchan los mismos contratos; sólo cambia cómo dibujan.

### Contrato mínimo para renderer 3D/animado
- `render:scene.sync` `{ nodes, entities, player, time }`
- `render:entity.anim` `{ entityId, clip, speed, blendMs }`
- `render:vfx.spawn` `{ kind, position, ttlMs }`
- `render:ui.hud` `{ hp, stamina, mana, objetivos }`
- `render:camera` `{ mode, targetId, lerp }`

Un módulo de combate o quest no conoce nada de 3D: sólo emite estado/eventos de dominio.

### Qué NO cambia en el motor
- reglas de combate,
- generación de mundo,
- IA,
- inventario/progresión,
- sistema de plugins.

### Qué SÍ agregas
- plugin `renderer:3d`,
- adaptador de input opcional (`control:gamepad`, `control:pointer`),
- assets pipeline (modelos, animaciones, shaders), fuera del core.

### Riesgos comunes (y cómo evitarlos)
1. **UI como verdad de negocio**: evitar parsear texto del CLI para inferir estado.
2. **Eventos demasiado “textuales”**: emitir payload semántico, no strings renderizados.
3. **Timing no determinista** entre simulación y render:
   - separar `simTick` (motor) de `renderFrame` (adapter).
4. **Acoplar cámara/VFX al gameplay**:
   - usar eventos `render:*` derivados por `RenderBridge`.

### Estrategia práctica de migración
1. Congelar contratos de dominio (`EventSpec`).
2. Implementar `renderer:cli` sobre esos contratos (compatibilidad).
3. Crear `renderer:2d` piloto sin quitar CLI.
4. Añadir `renderer:3d` en paralelo.
5. Elegir renderer por perfil (`ioProfile`) en runtime.

Resultado: puedes ejecutar mismo save/mismo combate en CLI o 3D sólo cambiando adapters activos.

---

## D. Contratos por evento (schemas + intención)
Definir para cada evento:
- `name`
- `kind`: `command | query | domain | ui`
- `schema in/out`
- `cancellable`
- `phase`

Ejemplo:
- `combat:resolve_magia` -> `kind=query`, retorna `handled`, `dmg`, `effects`.
- `world:tick` -> `kind=domain`, no debería mutarse por retorno encadenado.

---

## E. Sustituir dependencia entre plugins por “services registry”
En lugar de funciones globales, usar:
- `runtime.services.register('combat.magic.enemyCast', fn, { pluginId })`
- `runtime.services.get('combat.magic.enemyCast')`

IA consulta servicio por capacidad; si no existe usa fallback.
Así la dependencia pasa a ser explícita y validable.

---

## 4) Fortalecimiento del EventBus (propuesta concreta)

## 4.1 Tipos de emisión
Agregar APIs separadas:

1. `emitDomain(event, payload)`
   - fire-and-forget.
   - listeners no alteran payload de entrada.

2. `runPipeline(event, state)`
   - para casos como combate/forja donde sí hay transformación.
   - requiere esquema de entrada/salida.

3. `request(event, query)`
   - espera una respuesta única o agregada.
   - ideal para “resolver magia”, “resolver IA”.

4. `emitCancellable(event, payload)`
   - cancelar explícitamente por token de cancelación, no por campo suelto mutable.

## 4.2 Fases de ejecución por evento
Para evitar guerras de prioridades:
- `pre` → validaciones/bloqueos
- `main` → lógica principal
- `post` → efectos secundarios
- `observe` → telemetría/UI

Cada listener declara `phase` + `priority` local.

## 4.3 Contratos (runtime validation)
Definir `EventSpec` por evento:
- validación de payload entrada/salida,
- validación de mutaciones permitidas,
- warnings en modo dev si un plugin viola contrato.

## 4.4 Trazabilidad y herramientas de diagnóstico
Registrar por dispatch:
- eventId,
- pluginId,
- duración listener,
- errores,
- mutaciones realizadas.

Exponer API (`EventBus.trace(n)`) en vez de acceder a `_listeners`.

## 4.5 Resiliencia
- timeout configurable por listener para eventos críticos.
- política de error por evento (`continue`, `fail-fast`, `disable-plugin-after-n-errors`).
- contador de salud por plugin.

---

## 5) Sistema de dependencias de plugins

## 5.1 Manifest formal
Cada plugin debe declarar:

```json
{
  "id": "plugin:ia_batalla",
  "version": "2.1.0",
  "engine": ">=2.0.0 <3.0.0",
  "requires": {
    "plugins": ["plugin:magias>=2.0.0", "plugin:habilidades>=2.0.0"],
    "services": ["combat.magic.enemyCast", "combat.skill.enemyUse"]
  },
  "optional": {
    "plugins": ["plugin:bosses>=2.0.0"],
    "services": ["combat.ai.advancedProfiles"]
  },
  "provides": {
    "services": ["combat.ai.resolve"],
    "events": ["combat:resolve_ia"]
  },
  "conflicts": ["plugin:ia_batalla_alt"],
  "load": {
    "before": ["plugin:bosses"],
    "after": ["plugin:magias", "plugin:habilidades"]
  }
}
```

## 5.2 Resolución de dependencias
En `PluginLoader.register`/boot:
1. construir grafo,
2. verificar versiones,
3. detectar ciclos,
4. ordenar topológicamente,
5. cargar en orden,
6. marcar faltantes como error de carga legible.

## 5.3 Niveles de dependencia
- **hard**: sin ella no carga.
- **soft**: carga degradado.
- **service-level**: depende de capacidad, no de plugin concreto.

## 5.4 Handshake de ciclo de vida
Hooks estándar:
- `onInit(runtime)`
- `onDependenciesResolved(ctx)`
- `onStart()`
- `onStop()`

`onStart` sólo corre si dependencias hard están satisfechas.

---

## 6) Evaluación de extracción de data vs lógica (JSON + JS por plugin)
Objetivo: que cada plugin tenga una frontera clara:

- **JSON/Data**: configuración, tablas de balance, catálogos, textos, probabilidades, thresholds, pools, aliases, metadata de comandos y hooks declarativos.
- **JS/Lógica**: algoritmos, validaciones, side effects, integraciones con servicios runtime, transformaciones de estado.

### 6.1 Criterio general de extracción
Mover a JSON todo lo que sea:
1. editable por diseño/balance sin tocar código,
2. estático o semiestático por release,
3. seleccionable por id/tabla/regla declarativa.

Mantener en JS todo lo que sea:
1. flujo transaccional (combate/movimiento),
2. cálculo derivado complejo,
3. coordinación entre servicios (Net, World, Player, Save, EventBus).

### 6.2 Estructura recomendada por plugin
Para cada plugin:

```txt
plugins/<plugin-id>/
  manifest.json        # id, version, requires/provides/load/conflicts
  data.json            # pools, configs, thresholds, copy textual, tablas
  commands.json        # metadata de comandos (uso, alias, help, hints)
  hooks.json           # declaración de suscripción (evento, fase, prioridad)
  logic.js             # handlers y funciones puras/imperativas
```

`logic.js` consume `runtime.data.get('<plugin-id>')` en lugar de constantes hardcodeadas.

### 6.3 Evaluación plugin por plugin (qué extraer a JSON)

1. **plugin-facciones**
   - Extraer a JSON:
     - `FACCIONES_BASE`, `RANGOS`, probabilidad de control inicial por tipo de nodo,
     - thresholds de hostilidad/alianza, textos de UI.
   - Mantener en JS:
     - cálculo territorial dinámico, efectos al entrar nodo, emboscadas y side effects.

2. **plugin-bosses**
   - Extraer a JSON:
     - `BOSSES_DEF`, loot tables, ASCII/iconografía, frases, timers base.
   - Mantener en JS:
     - pathing/movimiento, selección de spawn, integración con combate/red.

3. **plugin-magias**
   - Extraer a JSON:
     - `MAG_POOL_BASICO/MEDIO/ELITE`, restricciones (`BLOQUEADAS_JUGADOR`), heridas posibles, parámetros de fragilidad/cargas.
   - Mantener en JS:
     - resolución efectiva de magia en batalla, consumo/corrupción y sincronización actor/target.

4. **plugin-habilidades**
   - Extraer a JSON:
     - `HAB_POOL_*`, pesos de aparición, límites de slots, colores/hints por tipo.
   - Mantener en JS:
     - aplicación de efectos en tiempo real, copy/learn en combate, mutación de stats.

5. **plugin-ia-batalla**
   - Extraer a JSON:
     - `AI_PERFILES_V2`, pesos por contexto, matrices de decisión por arquetipo.
   - Mantener en JS:
     - evaluación táctica por estado vivo de batalla y ejecución de acciones.

6. **plugin-invocaciones**
   - Extraer a JSON:
     - `DJINN_DEFS`, `ESTADOS_ALTERADOS`, `DURATION_TURNS`, `COOLDOWN_BATTLES`, `TRANS_FAIL_CHANCE`.
   - Mantener en JS:
     - ciclo de invocación/transmutación y efectos de combate multi-turno.

7. **plugin-cultos**
   - Extraer a JSON:
     - definición de cultos, recompensas, hostilidad cruzada, mapeo misión/reliquia.
   - Mantener en JS:
     - generación procedural en mundo, emboscadas, invocación de dioses.

8. **plugin-criaturas**
   - Extraer a JSON:
     - arquetipos, anchors requeridas por especie, tablas de breeding, textos/feedback.
   - Mantener en JS:
     - captura/vinculación y validaciones contextuales de batalla.

9. **plugin-concentracion**
   - Extraer a JSON:
     - `VARIANTES`, `VINCULOS_OCULTOS`, verbos permitidos por cadena, riesgos base.
   - Mantener en JS:
     - construcción del plan y ejecución en tiempo de turno.

10. **plugin-reino-pesadilla**
    - Extraer a JSON:
      - `DIFICULTAD_MIN`, `CHANCE`, `TOTAL_MONSTRUOS`, escalados y copy narrativo.
    - Mantener en JS:
      - orquestación de gauntlet, cancelación de comandos y transición de estado.

11. **plugin-sombra-herrante / plugin-tricksters / plugin-arbol-vida / plugin-guarida / plugin-transformaciones**
    - Extraer a JSON:
      - catálogos de entidades, estados posibles, thresholds, textos, rewards, toggles.
    - Mantener en JS:
      - lógica situacional de aparición, resolución de eventos y side effects.

### 6.4 Contratos de data (schema)
Cada `data.json` debe validarse con esquema (ejemplo):

```json
{
  "pluginId": "plugin:magias",
  "version": "2.1.0",
  "pools": {
    "basico": [{ "id": "chispa", "peso": 10 }],
    "medio":  [{ "id": "marea",  "peso": 7 }],
    "elite":  [{ "id": "vacuum", "peso": 2 }]
  },
  "balance": {
    "fragilidadPorUso": 10,
    "fragilidadCorrupta": 100
  }
}
```

Si el schema falla, el plugin no inicia (o inicia degradado, según política).

### 6.5 Estrategia de migración para JSON+JS
1. Inventariar constantes por plugin (`const` de config, pools, thresholds).
2. Moverlas a `data.json` sin cambiar comportamiento.
3. Cargar vía `ModuleLoader`/`runtime.data`.
4. Agregar validación schema + defaults.
5. Separar metadata de comandos/hooks en JSON declarativo.
6. Dejar `logic.js` sólo con funciones de ejecución.

### 6.6 Beneficios directos
- Balanceo sin tocar código.
- Menor riesgo de regresión en refactors.
- Plugins más testeables (tests de data + tests de lógica).
- Posibilidad de toolchain para edición de data (UI de modding).

### 6.7 Validación específica: motor + systems + CLI (¿hay data incrustada?)
Resultado de auditoría: **sí, todavía hay data incrustada** en varios puntos de core/systems/CLI.  
Para cumplir la arquitectura objetivo, estos bloques deben migrarse a módulos de data/manifest.

#### A) Core (motor)
1. `core/main.js`
   - plugins internos hardcodeados en `_registerCoreSystems` (lista y orden),
   - reglas inline de `plugin:supervivencia`, `plugin:dificultad`, `plugin:enemigos`,
   - strings de boot/UI en el propio archivo.
2. `core/io-bus.js`
   - configuración de status base hardcodeada (`hp/hun/sta/mna/...`) y thresholds de color.
3. `core/world.js`
   - tablas de tipos por sección (`_tiposBySection`),
   - probabilidades default (`loot_chance`, `npcChance`, etc.),
   - copy de frontera y constantes de generación.
4. `core/combat-resolution.js`
   - mensajes fallback de magia/habilidad incrustados.

**Conclusión core**: el motor todavía mezcla infraestructura + defaults de dominio/presentación.

#### B) Systems
1. `systems/commands.js`
   - gran volumen de aliases/comandos, textos de ayuda y copy de UX hardcodeados,
   - parte de lógica de dominio aún en el propio dispatcher.
2. `systems/autocomplete.js` (CLI)
   - tags/materiales/modos/temas hardcodeados (`TAGS_ENCARNAR`, `TAGS_CONJURAR`, `MODOS`, temas de preguntar),
   - heurísticas de grupos/colores acopladas a conocimiento del dominio.
3. `systems/tactics.js`
   - catálogo completo de elementos/reacciones/heridas/climas/superficies incrustado en JS.
4. `systems/arc-engine.js`, `systems/xp.js`, `systems/world-ai.js`, `systems/net.js`, `systems/sfx-engine.js`, `systems/music-engine.js`
   - tablas/configs/temas/ASCII/colores/copies y thresholds definidos inline.

**Conclusión systems**: los systems contienen mucha data de balance y presentación que debería vivir en `data.json`.

#### C) CLI (entrada/salida)
1. **Autocomplete**:
   - no está 100% orientado a providers; todavía mantiene data de dominio local.
2. **Ayuda/UX textual**:
   - `cmdAyuda` y mensajes de comando en `commands.js` están centralizados con copy estático.
3. **Audio CLI commands**:
   - SFX/Music exponen listas/comandos/cues hardcodeados dentro de los engines.

**Conclusión CLI**: hay acoplamiento de UX + data de dominio en código.

#### D) Semáforo de estado (actual)
- **Core**: 🔴 (pendiente de extracción de defaults y catálogos).
- **Systems**: 🔴 (alto contenido declarativo incrustado).
- **CLI**: 🟠 (parcial; requiere providers y catálogos externos).

#### E) Plan de saneamiento (en orden recomendado)
1. Mover catálogos de `tactics`, `xp`, `arc`, `sfx/music`, `autocomplete` a `data/*.json`.
2. Convertir `commands.js` a router + registro declarativo de comandos por módulo/plugin.
3. Extraer status-slot defaults de `io-bus` a `core-ui-defaults.json` (o plugin `engine:statusbar`).
4. Quitar plugin registration hardcodeada de `core/main.js`; cargar por manifests + perfil.
5. Activar validación de schemas para todo `data.json`.

---

## 7) Plan de migración recomendado (incremental, bajo riesgo)

## Fase 1 — Observabilidad y contratos mínimos
- Añadir `EventSpec` + validación sólo en modo dev.
- Añadir trazas y API pública de inspección (`events(), listeners(), trace()`).
- Eliminar accesos directos a `EventBus._listeners` fuera del bus.

## Fase 2 — Servicios en lugar de globals
- Crear `ServiceRegistry` dentro de runtime.
- Migrar llamadas cruzadas IA↔magia/habilidades a servicios registrados.
- Deprecar funciones globales `_ejecutar*`.

## Fase 3 — Dependencias de plugins
- Añadir `manifest` con `requires/provides/conflicts`.
- Implementar resolución topológica y validación semver.
- Mostrar errores de carga en boot (no silenciosos).

## Fase 4 — Extraer dominio de `systems/commands.js`
- Mantener parser/router en commands.
- Mover comandos de criaturas/magia/habilidades/facciones/bosses a sus plugins.
- Dejar en core sólo comandos estructurales del motor.

## Fase 5 — Transacciones de gameplay como servicios
- Encapsular “movimiento + tick + post-proceso + save” en un servicio de runtime.
- Plugins como `reino_pesadilla` llaman el servicio en vez de duplicar secuencias.

---

## 8) Resultado esperado tras la migración

- Core estable y pequeño, orientado a infraestructura.
- Plugins realmente desacoplados y sustituibles.
- Interoperabilidad plugin↔plugin por contratos explícitos.
- Menos bugs por orden de carga y menos dependencia en globals.
- Mejor capacidad de test (unitaria por plugin + integración por contratos).
- Evolución del ecosistema sin tocar el motor para cada feature nueva.

---

## 9) Checklist de aceptación técnica

- [ ] Ningún plugin depende de funciones globales de otro plugin.
- [ ] `core/main.js` no conoce lista fija de plugins de dominio.
- [ ] `systems/commands.js` no contiene lógica de features de dominio.
- [ ] El autocomplete CLI consume providers declarados por plugins (sin acoplarse a estado interno de cada dominio).
- [ ] SFX/Music funcionan como engines pluginizables (`engine:*`) y el core sólo usa contratos `audio:*` / `control:*`.
- [ ] El renderer es intercambiable (`renderer:cli` / `renderer:2d` / `renderer:3d`) sin cambiar reglas del motor.
- [ ] Cada plugin separa `data.json` (balance/catálogos/textos/config) de `logic.js` (ejecución/side effects).
- [ ] Todo evento crítico tiene `EventSpec` (schema + tipo + fase).
- [ ] Hay resolución de dependencias (grafo + semver + ciclos).
- [ ] `PluginLoader` falla de forma explícita y observable ante dependencias rotas.
- [ ] Existe telemetría por listener/evento y comando para inspección segura.
