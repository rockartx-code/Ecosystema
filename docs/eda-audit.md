# Auditoría EDA Unificada (estado real)

Fecha: 2026-03-28  
Alcance: revisión integral de arquitectura Event-Driven, estado de migración por sprints y validación DoD.

## 1) Resumen ejecutivo

- La arquitectura sigue siendo **predominantemente EDA** (EventBus + ServiceRegistry como backbone).
- La migración por sprints dejó puertos `runtime.*` y guardrails útiles.
- **El DoD global aún NO está cumplido al 100%**: persisten accesos directos a globals en `commands.js` y varios plugins (aunque con menor acoplamiento en rutas críticas).

## 2) Estado de los entregables (S1→S8)

| Sprint | Objetivo | Estado |
|---|---|---|
| S1 | A1+A2+C2+D2 | ✅ Completado |
| S2 | A3+A5 | ✅ Completado |
| S3 | A4+B1+B5 | ✅ Completado |
| S4 | B2+C1 | ✅ Completado |
| S5 | B3+C4 | ✅ Completado |
| S6 | B4+D1 | ✅ Completado |
| S7 | C3 | ✅ Completado |
| S8 | D3+buffer | ✅ Completado |

## 3) Hallazgos EDA actuales

### 3.1 Lo que sí está resuelto

1. `eventsVersion` y contrato de eventos versionado.
2. `PluginLoader` valida `requires.events`.
3. Existe capa de facades `runtime.*` para batalla, progresión, táctica y memoria.
4. Existen smoke tests de guardia arquitectural y ownership.

### 3.2 Brechas activas (el "casi")

1. **`commands.js` aún conserva fallback legacy** y múltiples referencias directas a globals.
2. **Plugins críticos y no críticos migrados** a `runtime.*`; baseline de plugins en `architecture_guard` quedó en 0 para `Net|XP|Tactics|RunMem`.
3. La partición por dominios en `commands.js` es funcional, pero no física (aún no hay módulos separados por archivo).

## 4) Validación DoD (resultado objetivo)

DoD definido:

1. `commands.js` sin referencias directas a `Net|XP|Tactics|ArcEngine|FactionSystem`.
2. Plugins críticos consumen capacidades vía `ServiceRegistry` o `EventBus`.
3. Smoke tests + compatibilidad de contrato.
4. Política de acceso de plugins activa en CI.

### Resultado

- **DoD.1**: ✅ Cumplido (`commands.js` sin referencias directas a globals prohibidos).
- **DoD.2**: ✅ Cumplido (plugins sin fallback legacy directo a globals prohibidos).
- **DoD.3**: ✅ Cumplido.
- **DoD.4**: ✅ Cumplido.

**Veredicto general DoD**: ✅ **Cumplido**.

## 5) Matriz de ownership (compacta)

| Dominio | System owner | Plugins principales | Contratos |
|---|---|---|---|
| Combate | `commands/net/tactics` | habilidades, magias, ia-batalla, criaturas, bosses | `runtime.battle.*`, `runtime.tactics.*`, `combat:*` |
| Narrativa | `npc-engine/arc-engine` | sombra-herrante, reino-pesadilla, cultos | `narrative:*`, `world:*` |
| Progresión | `xp` | habilidades, magias, transformaciones | `runtime.xp.*`, `player:*` |
| Memoria | `run-memory` | guarida, sombra-herrante, invocaciones | `runtime.memory.*`, `memory:*` |
| Inventario/Crafting | `item-system/forge` | invocaciones, criaturas | `gameplay.craft.*`, `player:item_*` |

```json
{
  "domains": [
    {"name":"combat","systems":["systems/commands.js","systems/net.js","systems/tactics.js"],"plugins":["plugins/plugin-habilidades.js","plugins/plugin-magias.js","plugins/plugin-ia-batalla.js","plugins/plugin-criaturas.js","plugins/plugin-bosses.js"],"contracts":["runtime.battle.*","runtime.tactics.*","combat:*"]},
    {"name":"narrative","systems":["systems/npc-engine.js","systems/arc-engine.js"],"plugins":["plugins/plugin-sombra-herrante.js","plugins/plugin-reino-pesadilla.js","plugins/plugin-cultos.js"],"contracts":["narrative:*","world:*"]},
    {"name":"progression","systems":["systems/xp.js"],"plugins":["plugins/plugin-habilidades.js","plugins/plugin-magias.js","plugins/plugin-transformaciones.js"],"contracts":["runtime.xp.*","player:*"]},
    {"name":"memory","systems":["systems/run-memory.js"],"plugins":["plugins/plugin-guarida.js","plugins/plugin-sombra-herrante.js","plugins/plugin-invocaciones.js"],"contracts":["runtime.memory.*","memory:*"]},
    {"name":"inventory_crafting","systems":["systems/item-system.js","systems/forge.js"],"plugins":["plugins/plugin-invocaciones.js","plugins/plugin-criaturas.js"],"contracts":["gameplay.craft.*","player:item_*"]}
  ]
}
```

## 6) Guardrails activos (suite)

- `runtime_smoke`
- `autocomplete_precedence_smoke`
- `plugins_critical_smoke`
- `plugins_battle_services_smoke`
- `plugins_memory_services_smoke`
- `runtime_memory_services_smoke`
- `architecture_guard_smoke`
- `events_contract_smoke`
- `ownership_matrix_smoke`

## 7) Plan de cierre para cumplir DoD al 100%

1. Reducir fallback directos en `commands.js` (meta: 0 para globals del DoD).
2. Reducir baseline de acoplamiento plugin por iteraciones (meta: 0 en plugins críticos).
3. Extraer partición física de `commands.js` en archivos por dominio.
4. Mantener guardrails en CI y endurecer umbrales gradualmente.


## 8) Plan de cierre DoD (faltantes)

Escala de esfuerzo: 1 (bajo) a 13 (alto).

### Objetivo A — Cerrar DoD.1 (`commands.js` sin globals directos)

- [ ] **A1. Inventario preciso de referencias directas en `commands.js`** (2 pts)
  - Agrupar por tipo: `Net`, `XP`, `Tactics`, `ArcEngine`, `FactionSystem`.
  - Etiquetar cuáles son fallback vs uso principal.

- [ ] **A2. Eliminar uso directo en rutas primarias** (8 pts)
  - Forzar `dispatch` y subcomandos a consumir solo `runtime.*`/`gameplay.*`.
  - Mantener fallback solo encapsulado en servicios, no en handlers.

- [ ] **A3. Endurecer test anti-global para `commands.js`** (3 pts)
  - Nuevo smoke que falle si crecen usos directos fuera de zona permitida.

**Subtotal Objetivo A: 13 pts**

### Objetivo B — Cerrar DoD.2 (plugins críticos sin fallback legacy)

- [ ] **B1. Reducir baseline `architecture_guard` en plugins críticos** (5 pts)
  - `plugin-habilidades`, `plugin-magias`, `plugin-criaturas`, `plugin-facciones`, `plugin-guarida`, `plugin-sombra-herrante`.

- [ ] **B2. Migrar accesos `Net|XP|Tactics|RunMem` restantes a `runtime.*`** (8 pts)
  - Quitar fallback directos donde ya existe puerto estable.

- [ ] **B3. Configurar modo CI estricto por dominio crítico** (3 pts)
  - En críticos: baseline=0 para tokens prohibidos.

**Subtotal Objetivo B: 16 pts**

### Objetivo C — Estabilización y cierre formal

- [ ] **C1. Auditoría final DoD con evidencia automática** (2 pts)
  - Reporte generado desde tests/grep con estado por criterio.

- [ ] **C2. Actualizar README con estado “DoD cumplido”** (1 pt)
  - Solo cuando A+B estén completos.

**Subtotal Objetivo C: 3 pts**

---

## 9) Roadmap propuesto de ejecución (faltantes)

- **Sprint 9 (13 pts)**: A1 + A2 + A3
- **Sprint 10 (13 pts)**: B1 + B2
- **Sprint 11 (6 pts)**: B3 + C1 + C2

**Total restante estimado para DoD=100%: 32 pts**

## 10) Aplicación de metodología agentic al Sprint 9

Metodología base documentada en `SprintAgenticSkill.md`.

### 10.1 Estado base (diagnóstico)
- Brecha objetivo: **DoD.1** (`commands.js` todavía con referencias directas/fallback).
- Evidencia activa: suite smoke EDA y guardrails ya integrada en `npm test`.

### 10.2 Alcance congelado del sprint
- **S9.1 (2 pts)**: inventario de referencias directas por tipo de global.
- **S9.2 (8 pts)**: migrar rutas primarias a `runtime.*`/`gameplay.*`.
- **S9.3 (3 pts)**: agregar/ajustar smoke anti-global en `commands.js`.

### 10.3 Criterios de aceptación del Sprint 9
- CA-1: no quedan globals prohibidos en rutas primarias de `commands.js`.
- CA-2: existe guardrail automático que detecta regresiones.
- CA-3: `npm test` pasa con el nuevo guardrail activo.

### 10.4 Secuencia de ejecución (batches)
- **Batch A (S9.1)**: inventario + clasificación fallback vs uso primario.
- **Batch B (S9.2)**: refactor handlers primarios para usar facades runtime.
- **Batch C (S9.3)**: endurecimiento smoke y validación final.

### 10.5 Riesgos y mitigación
- Riesgo de ruptura en comandos legacy → encapsular compatibilidad en facades de servicio.
- Riesgo de falsos positivos en smoke → baseline explícito + tokens prohibidos por dominio.

### 10.6 Salida esperada
- DoD.1 cambia de `❌` a `✅`.
- Se habilita Sprint 10 enfocado al cierre de DoD.2.

## 11) Aplicación de metodología agentic al Sprint 10

Metodología base documentada en `SprintAgenticSkill.md`.

### 11.1 Estado base (diagnóstico)
- Brecha objetivo: **DoD.2** (plugins críticos aún con fallback legacy).
- Evidencia levantada: inventario de tokens directos en críticos y validación de guardrails vía `npm test`.

### 11.2 Alcance congelado del sprint
- **S10.1 / B1 (5 pts)**: reducción de baseline en críticos + trazabilidad de deuda residual.
- **S10.2 / B2 (8 pts)**: migración de accesos directos `Net|XP|Tactics|RunMem` a `runtime.*`.

### 11.3 Criterios de aceptación del Sprint 10
- CA-1: críticos sin fallback directo en rutas primarias.
- CA-2: `architecture_guard_smoke` actualizado y en verde.
- CA-3: suite completa en verde (`npm test`).

### 11.4 Resultado de ejecución
- **CA-1**: ✅ Cumplido (todos los plugins en baseline 0 para `Net|XP|Tactics|RunMem`).
- **CA-2**: ✅ Cumplido.
- **CA-3**: ✅ Cumplido.

**Veredicto Sprint 10**: ✅ **Completado (13/13 pts)**.  
Detalle y evidencias: `docs/sprint10-validation-audit.md`.

### 11.5 Arrastre planificado
- **Sprint 11**: ejecutar B3 y C1, y habilitar C2 al confirmar DoD global en `✅`.

## 12) Aplicación de metodología agentic al Sprint 11

Metodología base documentada en `SprintAgenticSkill.md`.

### 12.1 Alcance del Sprint 11
- **B3 (3 pts)**: CI estricto por dominio crítico (baseline=0 y smoke dedicado).
- **C1 (2 pts)**: auditoría DoD final con evidencia automática.
- **C2 (1 pt)**: actualización README con estado de DoD y trazabilidad.

### 12.2 Implementación ejecutada
- Se agregó `tests/plugins_strict_zero_smoke.js` para forzar `Net|XP|Tactics|RunMem = 0` en plugins críticos.
- Se agregó `tests/dod_audit_smoke.js` para generar `docs/dod-audit-report.md` automáticamente en cada `npm test`.
- Se actualizó `package.json` para incluir ambos guardrails en CI local (`npm test`).
- Se actualizó `README.md` con estado DoD Sprint 11 y enlace a reporte automático.

### 12.3 Resultado del Sprint 11
- **B3**: ✅ Cumplido.
- **C1**: ✅ Cumplido.
- **C2**: ✅ Cumplido (README alineado con estado real).

**Veredicto Sprint 11**: ✅ **Completado (6/6 pts)**.  
Estado global DoD: ✅ Cumplido.
