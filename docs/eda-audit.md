# Auditoría EDA unificada (estado vigente)

Fecha de actualización: 2026-03-28  
Alcance: arquitectura Event-Driven, guardrails y estado DoD.

## Resumen ejecutivo

- La arquitectura se mantiene **EDA-first** con `EventBus` como contrato central.
- `ServiceRegistry` y puertos `runtime.*` cubren capacidades críticas (combate, progresión, táctica, memoria).
- La suite de smoke tests protege regresiones de acoplamiento.
- **DoD global actual: ✅ Cumplido**.

## Estado DoD

Criterios validados:

1. `commands.js` sin referencias directas prohibidas (`Net|XP|Tactics|ArcEngine|FactionSystem`).
2. Plugins críticos consumen capacidades vía servicios/eventos.
3. Contrato de eventos y smoke tests en verde.
4. Guardrails de acceso y ownership activos.

## Ownership funcional (compacto)

| Dominio | Systems owner | Plugins principales | Contratos |
|---|---|---|---|
| Combate | `commands/net/tactics` | habilidades, magias, ia-batalla, criaturas, bosses | `runtime.battle.*`, `runtime.tactics.*`, `combat:*` |
| Narrativa | `npc-engine/arc-engine` | sombra-herrante, reino-pesadilla, cultos | `narrative:*`, `world:*` |
| Progresión | `xp` | habilidades, magias, transformaciones | `runtime.xp.*`, `player:*` |
| Memoria | `run-memory` | guarida, sombra-herrante, invocaciones | `runtime.memory.*`, `memory:*` |
| Inventario/Crafting | `item-system/forge` | invocaciones, criaturas | `gameplay.craft.*`, `player:item_*` |

## Guardrails activos

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
- `dod_audit_smoke`


## Matriz machine-readable

```json
{
  "domains": [
    {
      "name": "combat",
      "systems": ["systems/commands.js", "systems/net.js", "systems/tactics.js"],
      "plugins": ["plugins/plugin-habilidades.js", "plugins/plugin-magias.js", "plugins/plugin-ia-batalla.js", "plugins/plugin-criaturas.js", "plugins/plugin-bosses.js"],
      "contracts": ["runtime.battle.*", "runtime.tactics.*", "combat:*"]
    },
    {
      "name": "narrative",
      "systems": ["systems/npc-engine.js", "systems/arc-engine.js"],
      "plugins": ["plugins/plugin-sombra-herrante.js", "plugins/plugin-reino-pesadilla.js", "plugins/plugin-cultos.js"],
      "contracts": ["narrative:*", "world:*"]
    },
    {
      "name": "progression",
      "systems": ["systems/xp.js"],
      "plugins": ["plugins/plugin-habilidades.js", "plugins/plugin-magias.js", "plugins/plugin-transformaciones.js"],
      "contracts": ["runtime.xp.*", "player:*"]
    },
    {
      "name": "memory",
      "systems": ["systems/run-memory.js"],
      "plugins": ["plugins/plugin-guarida.js", "plugins/plugin-sombra-herrante.js", "plugins/plugin-invocaciones.js"],
      "contracts": ["runtime.memory.*", "memory:*"]
    },
    {
      "name": "inventory_crafting",
      "systems": ["systems/item-system.js", "systems/forge.js"],
      "plugins": ["plugins/plugin-invocaciones.js", "plugins/plugin-criaturas.js"],
      "contracts": ["gameplay.craft.*", "player:item_*"]
    }
  ]
}
```

## Evidencia y referencias

- Contrato de eventos: `docs/events.md`
- Evidencia automática de DoD: `docs/dod-audit-report.md`
- Trazabilidad de ejecución por sprint: `docs/sprint10-validation-audit.md`
- Metodología reusable de entrega: `SprintAgenticSkill.md`

## Próximo mantenimiento recomendado

1. Mantener `eventsVersion` sincronizado con cambios en catálogo de eventos.
2. Seguir particionando módulos grandes cuando crezca complejidad funcional.
3. Evitar duplicar planes históricos cerrados en esta auditoría consolidada.
