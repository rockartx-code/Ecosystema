# Validación ontológica de segmentación (core / systems / plugins)

Fecha: 2026-03-28  
Alcance: revisión estructural de `core/`, `systems/` y `plugins/` para validar segmentación por responsabilidades.

## 1) Ontología de capas (definición operativa)

### Core
**Qué es:** infraestructura mínima, contratos y estado canónico del runtime.  
**Debe contener:** EventBus, registries/loaders, entidades base, estado jugador/mundo, ciclo y adaptadores IO canónicos.  
**No debe contener:** reglas de dominio específicas ni contenido de gameplay vertical.

### Systems
**Qué es:** capacidades transversales del runtime (persistencia, red, táctica, IA global, progresión, comandos, audio, etc.).  
**Debe contener:** lógica reutilizable entre múltiples plugins y servicios que puedan exponerse vía `ServiceRegistry` / `runtime.*`.  
**No debe contener:** variaciones de contenido temático que cambian por módulo.

### Plugins
**Qué es:** extensiones de dominio y variaciones de gameplay.  
**Debe contener:** hooks y comandos especializados, comportamiento opcional/incremental.  
**No debe contener:** acoplamiento directo innecesario a globals de systems si existe puerto de servicios (`runtime.*`).

## 2) Metodología de validación aplicada

1. Revisión de bootstrap y contratos en `core/main.js` y `core/core.js`.
2. Verificación de separación IO/DOM vs runtime.
3. Inspección de dependencias cruzadas (systems↔plugins y plugins→systems).
4. Ejecución de guardrails automáticos existentes (`npm test`).

## 3) Validación de lo bien segmentado

### 3.1 Core (estado general: **bien segmentado**, con observaciones)

- `core/core.js` mantiene primitives de plataforma (utilidades, EventBus, loaders, registries), sin lógica de fantasía/dominio. ✅
- `core/entity.js`, `core/player.js`, `core/world.js` modelan estado y contratos base apoyados en eventos. ✅
- `core/io-bus.js` define la frontera de IO y `core/renderer.js` concentra la interacción DOM en un único adaptador. ✅
- `core/main.js` centraliza bootstrap y define el catálogo de eventos versionado (`eventsVersion`). ✅

### 3.2 Systems (estado general: **segmentación funcional correcta**, pero con concentración alta)

- Hay systems bien delimitados por capacidad (`xp`, `tactics`, `run-memory`, `world-ai`, `music`, `sfx`, `net`, etc.). ✅
- `systems/commands.js` opera como orquestador transversal y punto único de dispatch. ✅
- `systems/save-load.js` centraliza persistencia/exportación/importación con hooks a estado global. ✅

### 3.3 Plugins (estado general: **mayormente bien segmentados**)

- Los plugins se mantienen como extensiones verticales registradas por `PluginLoader` y hooks sobre eventos. ✅
- La mayoría cumple el patrón de extensión por contrato, no por mutación de core. ✅

## 4) Hallazgos que requieren reestructuración (priorizados)

### H1 — `core/main.js` mezcla bootstrap con plugins embebidos

Actualmente, el bootstrap contiene registros de plugins internos (`plugin:supervivencia`, `plugin:dificultad`, `plugin:enemigos`) junto a la secuencia de arranque.  
**Riesgo ontológico:** mezcla capa core (plataforma) con capa plugin (dominio).

**Reestructuración recomendada:**
- Extraer esos plugins a `plugins/` (o `systems/internal-plugins/`) y dejar en `main` solo wiring/boot.

### H2 — `systems/commands.js` está sobredimensionado

`commands.js` concentra helpers, routing, bridges de servicios y múltiples dominios de comando en un único archivo.

**Riesgo ontológico:** la segmentación por dominio existe conceptualmente pero no físicamente.

**Reestructuración recomendada:**
- Dividir en módulos por dominio (`commands.core`, `commands.combat`, `commands.social`, `commands.meta`, etc.).
- Mantener un `commands/index` mínimo para registro y dispatch.

### H3 — Plugins con acoplamiento directo a globals de systems

Se observan accesos directos en plugins a systems concretos (ej. `ItemSystem`, `Tactics`, `ConcentracionSystem`).

**Riesgo ontológico:** plugins dependen de implementaciones concretas en lugar de puertos (`runtime.*`/servicios), reduciendo intercambiabilidad.

**Reestructuración recomendada:**
- Exponer puertos explícitos en `ServiceRegistry` y consumirlos desde plugins.
- Mantener fallback legacy solo temporal, detrás de wrappers.

### H4 — `systems/autocomplete.js` está en systems pero es UI-adapter

Aunque se declara como “UI-only”, su ubicación en `systems/` puede confundir su naturaleza de capa de presentación.

**Reestructuración recomendada:**
- Mover a `core/ui/` o `adapters/ui/` para reflejar ontología de presentación.
- Conservar providers de dominio como extensión (hooks), no lógica de rendering.

### H5 — `systems/save-load.js` acopla persistencia con concerns de red/UI

Además de serialización, contiene export/import con DOM y sincronización de red host.

**Reestructuración recomendada:**
- Separar: `persistence/save-load`, `persistence/transfer`, `persistence/import-export-ui`.
- Publicar interfaces de serialización por system para snapshot consistente.

## 5) Matriz de validación rápida

| Capa | Estado | Qué está bien | Qué ajustar |
|---|---|---|---|
| Core | Parcialmente óptima | Contratos, EventBus, estado y renderer bien definidos | Extraer plugins embebidos de `main` |
| Systems | Funcional | Capacidades transversales claras | Partición física de `commands` y separación en `save-load` |
| Plugins | Mayormente correcta | Modelo hook/comandos bien aplicado | Reducir acceso directo a globals de systems |

## 6) Plan de reestructuración incremental sugerido

1. **Sprint A**: extraer plugins embebidos de `core/main.js` + crear registro declarativo.
2. **Sprint B**: particionar `systems/commands.js` por dominios manteniendo compat API.
3. **Sprint C**: migrar plugins con globals directos a puertos de servicios (`runtime.*`).
4. **Sprint D**: separar `save-load` por responsabilidades y reubicar `autocomplete` a capa UI explícita.

## 7) Criterios de aceptación para dar segmentación “óptima”

- Core sin lógica de dominio embebida.
- Todos los plugins consumen capacidades por servicios/eventos (sin globals directos no justificados).
- `commands` dividido por dominios con router estable.
- Persistencia separada de concerns UI/red.
- Ownership y contratos versionados sincronizados con tests.
