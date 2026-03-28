# Checklist de implementación — Desacoplamiento Core/Plugins

**Etapa actual:** **10** (Consolidación de políticas runtime)

## ✅ Tareas terminadas (con etapa aplicada)

- [x] **[E1]** Añadir `ServiceRegistry` en core (`register/get/call/list/has/info/unregisterByPlugin`).
- [x] **[E1]** Extender `EventBus` con fases, trazas, introspección, contratos base y APIs nuevas.
- [x] **[E1]** Exponer `CTX.runtime` (events/modules/plugins/commands/services/data).
- [x] **[E1]** Añadir comandos de inspección runtime (`servicios`, `eventos_trace`, `plugins_pendientes`, `plugins_orden`).
- [x] **[E2]** Migrar bootstrap de plugins core a `PluginLoader.registerMany(...)`.
- [x] **[E2]** Registrar servicios `io.*` desde `core/io-bus.js`.
- [x] **[E3]** Validar dependencias básicas (`requires.plugins/services`, `conflicts`, `load.after/load.before`).
- [x] **[E3]** Resolver orden de carga con grafo/topological sort básico en batch (`registerMany`).
- [x] **[E4]** Implementar providers en autocomplete (`registerProvider/requestProviders`).
- [x] **[E4]** Exponer servicios de autocomplete (`cli.autocomplete.*`).
- [x] **[E4]** Añadir configuración de autocomplete desde `ModuleLoader` (`cli_autocomplete.*`) con fallback.
- [x] **[E5]** Exponer servicios de gameplay iniciales (`gameplay.command.dispatch`, `gameplay.move`, `gameplay.look`, `gameplay.enter_node`, `gameplay.move_and_tick`).
- [x] **[E5]** Consumir servicios gameplay desde plugin (primer caso: `plugin-reino-pesadilla` usa `gameplay.enter_node`).
- [x] **[E6]** Añadir smoke tests automatizados de runtime (`tests/runtime_smoke.js`) para EventBus, ServiceRegistry y PluginLoader.
- [x] **[E7]** Definir `EventSpec` base para eventos críticos (`output:*`, `input:command`, `plugin:*`, `combat:resolve_*`, `world:tick`).
- [x] **[E8]** Integrar comando estándar de pruebas (`npm test`) ejecutando smoke tests runtime.
- [x] **[E8]** Añadir pruebas de compatibilidad JSON plugin (`requires/load`) en smoke tests.
- [x] **[E9]** Habilitar fusión funcional de sugerencias base + providers en autocomplete (fallback real por plugins).

## 🟡 Tareas pendientes por etapa

### Pendientes de E3

- [x] **[E3]** Endurecer resolución topológica para dependencias por servicio dinámico y ciclos complejos multi-batch.
- [x] **[E3]** Añadir soporte semver más completo (`^`, `~`, rangos OR).

### Pendientes de E4
- [x] **[E4]** Migrar autocomplete totalmente a providers (reducir switches hardcodeados por verbo).

### Pendientes de E5
- [x] **[E5]** Extraer más transacciones de gameplay fuera de `systems/commands.js` hacia servicios (combate, trade, crafting).
- [x] **[E5]** Migrar más plugins al uso de servicios de gameplay (captura, trade, forja).

### Pendientes de E6
- [x] **[E6]** Añadir tests de regresión para comandos de diagnóstico (`plugins_orden`, `plugins_pendientes`, `eventos_trace`).
- [x] **[E6]** Añadir smoke de servicios gameplay (`gameplay.enter_node`, `gameplay.move_and_tick`) con stubs de mundo.

### Pendientes de E7
- [x] **[E7]** Completar `EventSpec` para más eventos de combate, narrativa, inventario y red.
- [x] **[E7]** Convertir warnings de validación en política configurable por entorno (dev/strict/prod).
- [x] **[E7]** Añadir tests de validación `validateIn/validateOut` sobre eventos reales del runtime.

### Pendientes de E8
- [x] **[E8]** Documentar matriz de compatibilidad de manifiestos JSON (válidos/inválidos) y errores esperados.
- [x] **[E8]** Integrar ejecución de smoke tests en CI/local standard (sin depender de ejecución manual).

### Pendientes de E9 (etapa actual)
- [x] **[E9]** Migrar comandos contextuales de `preguntar/atacar/examinar` a providers para reducir switch hardcodeado.
- [x] **[E9]** Añadir política configurable de precedencia (providers primero vs base primero) en autocomplete.

### Pendientes de E10 (etapa actual)
- [x] **[E10]** Añadir tests de regresión para política `cli_autocomplete.precedence` (`base_first`, `providers_first`, `providers_only`, `base_only`).
- [x] **[E10]** Documentar configuración de precedencia y estrategia de migración para plugins existentes.

### Transversales
- [x] Definir y aplicar `EventSpec` completos para eventos críticos (schema `in/out` real por evento).
- [x] Añadir timeout/políticas de error por listener en EventBus (health por plugin).
- [x] Separar data/lógica en `systems/tactics` con `data.json` + `logic.js`.
- [x] Separar data/lógica en `systems/xp` con `data.json` + `logic.js`.
- [x] Separar data/lógica en `systems/arc-engine` con `data.json` + `logic.js`.
- [x] Separar data/lógica en `systems/world-ai` con `data.json` + `logic.js`.
- [x] Separar data/lógica en `systems/net` con `data.json` + `logic.js`.
- [x] Separar data/lógica en `systems/sfx` con `data.json` + `logic.js`.
- [x] Separar data/lógica en `systems/music` con `data.json` + `logic.js`.
- [x] Pluginizar completamente SFX/Music como `engine:*` consumiendo sólo `audio:*`/servicios.
- [x] Introducir `ControlRouter`/`OutputRouter` desacoplados con adaptadores multi-salida.

## 🔴 Riesgos abiertos

- [x] Conviven rutas legacy y nuevas: posibilidad de divergencia funcional. (mitigado con smoke que bloquea fallback directo `Net.*` en plugins de segunda pasada).
- [x] Falta cobertura automática: riesgo de regresión al seguir migrando. (mitigado con smoke de estructura `data.json` + `logic.js` y chequeos service-first).
- [x] Persisten defaults de dominio en core/systems que deberían moverse a data declarativa. (mitigado en sistemas legacy listados: `tactics/xp/arc-engine/world-ai/net/sfx/music`).

## 📋 Inventario de migración plugin/evento (seguimiento)

### ✅ Plugins ya migrados a servicios gameplay
- [x] `plugin-reino-pesadilla` → `gameplay.enter_node`, `gameplay.look`, `gameplay.battle.current`, `gameplay.battle.actor`, `gameplay.combat.action`, `gameplay.battle.start`.
- [x] `plugin-criaturas` → `gameplay.capture.start`, `gameplay.combat.escape`.
- [x] `plugin-concentracion` → `gameplay.combat.action`.
- [x] `plugin-tricksters` → `gameplay.battle.start`, `gameplay.battle.current`.
- [x] `plugin-sombra-herrante` → `gameplay.battle.start`, `gameplay.battle.current`.

### 🟡 Plugins pendientes de revisar/migrar
- [x] `plugin-magias` (consulta de batalla por `gameplay.battle.current` y teleporte por `gameplay.enter_node`, con fallback legacy).
- [x] `plugin-habilidades` (consulta de batalla por `gameplay.battle.current`, con fallback legacy).
- [x] `plugin-invocaciones` (consulta de batalla por `gameplay.battle.current`, con fallback legacy).
- [x] `plugin-transformaciones` (revisado: opera por hooks `combat:*` y estado local del jugador; sin dependencia directa de `Net`).
- [x] `plugin-guarida` (revisado: flujo local de refugio/cofre persistente sin dependencia directa de red).
- [x] `plugin-arbol-vida` (revisado: progresión/siembra y resurrección por hooks runtime sin dependencia directa de `Net`).
- [x] `plugin-bosses` (inicio de combate migrado a `gameplay.battle.start`, con fallback legacy).
- [x] `plugin-facciones` (emboscadas migradas a `gameplay.battle.start`, con fallback legacy).
- [x] `plugin-tricksters` / `plugin-sombra-herrante` (segunda pasada: sin fallback directo a `Net` para iniciar/consultar batalla).

### 🟡 Eventos críticos pendientes de revisión de contrato (`EventSpec`)
- [x] `combat:*` adicionales no cubiertos por spec base (daño/aplicación de estado/turnos especiales de plugins).
- [x] `narrative:*` (diálogo, giro, muerte NPC, misión fail/complete).
- [x] `player:*` de inventario/equipo/estado extendido.
- [x] `memory:*` (inicio/fin de run y transferencia de ecos).
- [x] `audio:*` y `control:*` cuando se complete la pluginización de engines.
