# ECOSISTEMA v2.1
### Motor RPG de texto modular, client-only, orientado a eventos

ECOSISTEMA es un runtime browser-only para una aventura RPG textual. La meta arquitectonica documentada en esta fase es un monolito modular con fronteras explicitas entre `core`, `systems`, `plugins` y `data`, usando `EventBus` + `ServiceRegistry` como contratos de integracion.

## Vista rapida

- **Core**: kernel del runtime, contratos estables, estado base, loaders, EventBus y primitivas del mundo.
- **Systems**: adaptadores browser/runtime y servicios transversales operativos como comandos, persistencia, audio, red, renderer y memoria entre runs.
- **Plugins**: mecanicas y verticales de gameplay cargadas por `PluginLoader` sobre contratos `runtime.*`.
- **Data**: configuracion y contenido declarativo consumido por `core`, `systems` y `plugins`.
- **Regla clave**: `data/module.json` es fuente de configuracion, no matriz de ownership. Que un modulo tenga data en `systems[]` no lo convierte en `system`.

## Estructura del proyecto

```text
core/      -> kernel y contratos base del runtime
systems/   -> adaptadores browser y servicios transversales
plugins/   -> modulos de dominio/gameplay registrados por PluginLoader
data/      -> bundle declarativo y configuracion consolidada
docs/      -> contratos, auditorias y trazabilidad arquitectonica
tests/     -> smoke tests y guardrails arquitecturales
```

## Flujo de arranque

1. `index.html` carga scripts en orden (`core` -> `systems` -> `plugins` -> `main`).
2. `core/main.js` crea `CTX`, define eventos versionados y fija `CTX.runtime.eventsVersion`.
3. `ModuleLoader` carga `data/module.json` y publica configuracion declarativa.
4. `systems` montan adaptadores operativos; `PluginLoader` registra plugins y servicios `runtime.*`.
5. `bootSeq()` monta I/O; `init()` restaura save o crea una run nueva.

## Fronteras arquitectonicas finales

- `core` no toma dependencias de gameplay ni de plugins concretos.
- `systems` pueden consumir contratos de plugins solo via `EventBus` o `ServiceRegistry`, nunca por acoplamiento directo a archivos plugin.
- `plugins` encapsulan reglas de dominio como `xp`, `tactics`, `npc-engine`, `arc-engine`, `forge`, `item-system` y `world-ai`.
- `run-memory` queda documentado como `system`: usa `localStorage`, persiste ecos entre runs y expone servicios `runtime.memory.*`.

## Eventos y contratos

- Contrato versionado de eventos: `docs/events.md`
- Matriz de ownership y guardrails: `docs/eda-audit.md`
- Contrato ontologico de capas y ownership: `docs/ontogical.md`

## Documentacion clave

- Indice de documentacion: `docs/README.md`
- Contrato de ownership: `docs/ontogical.md`
- Catalogo de eventos y adaptadores: `docs/events.md`
- Auditoria EDA y matriz viva: `docs/eda-audit.md`
- Validacion de referencia Sprint 10: `docs/sprint10-validation-audit.md`
- Evidencia DoD automatica: `docs/dod-audit-report.md`

## Testing

Suite principal:

- `runtime_smoke`
- `autocomplete_precedence_smoke`
- `plugins_critical_smoke`
- `plugins_strict_zero_smoke`
- `plugins_battle_services_smoke`
- `plugins_memory_services_smoke`
- `runtime_memory_services_smoke`
- `architecture_guard_smoke`
- `events_contract_smoke`
- `ownership_matrix_smoke`
- `dod_audit_smoke` (genera `docs/dod-audit-report.md`)

Ejecutar:

```bash
npm test
```

## Ejecucion local

- Abrir `index.html` en un navegador moderno.
- Para resetear progreso, limpiar `localStorage` de las claves del juego.

---

Para detalle documental y criterios de ownership, arrancar por `docs/README.md`.
