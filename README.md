# ECOSISTEMA v2.1
### Motor RPG de texto modular, orientado a eventos y extensiones

ECOSISTEMA es un runtime **client-only** (sin backend) para una aventura RPG textual. La arquitectura está centrada en eventos y permite extender gameplay con systems internos y plugins de dominio.

## Vista rápida

- **Arquitectura EDA**: `EventBus` como backbone para input/output, mundo, combate, narrativa y ciclo de plugins.
- **Core desacoplado**: estado, contratos base, loaders y renderer.
- **Systems internos**: lógica transversal (comandos, forja, IA, persistencia, audio, etc.).
- **Plugins de dominio**: reglas especializadas (criaturas, facciones, bosses, magias, invocaciones, etc.).
- **Datos declarativos**: `data/module.json` como fuente principal de configuración.

## Estructura del proyecto

```text
core/      -> runtime base (EventBus, estado, renderer, boot)
systems/   -> capacidades transversales
plugins/   -> verticales de gameplay
data/      -> configuración consolidada
docs/      -> auditorías, contratos y validación
tests/     -> smoke tests y guardrails arquitecturales
```

## Flujo de arranque (resumido)

1. `index.html` carga scripts en orden (`core` → `systems` → `plugins` → `main`).
2. `core/main.js` inicializa contexto global y el catálogo de eventos.
3. `ModuleLoader` carga `data/module.json` (con fallback seguro si falla).
4. `PluginLoader` registra systems/plugins y enlaza servicios.
5. Se monta renderer/input, se restaura save (si existe) o se genera sesión nueva.

## Eventos y contratos

El contrato de eventos y su versionado vive en:

- `docs/events.md` (catálogo y convenciones de payload).
- `docs/eda-audit.md` (estado arquitectural y guardrails).

## Documentación clave

- Índice de documentación: `docs/README.md`
- Auditoría EDA unificada: `docs/eda-audit.md`
- Especificación de eventos: `docs/events.md`
- Validación Sprint 10: `docs/sprint10-validation-audit.md`
- Evidencia DoD automática: `docs/dod-audit-report.md`
- Metodología agentic reusable: `SprintAgenticSkill.md`

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

## Ejecución local

- Abrir `index.html` en navegador moderno para jugar.
- Para reset de progreso, limpiar `localStorage` de la clave del juego.

---

Si quieres profundizar en arquitectura y trazabilidad histórica, consulta `docs/README.md`.
