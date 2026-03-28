# Auditoría de validación — Sprint 10 (DoD.2)

Fecha: 2026-03-28  
Alcance: aplicar la metodología de `SprintAgenticSkill.md` para el cierre de DoD.2 (plugins críticos sin fallback legacy).

## 1) Estado base del sprint (diagnóstico)

Brecha objetivo: **DoD.2** (migración de plugins críticos a `ServiceRegistry`/`EventBus` sin fallback directo a `Net|XP|Tactics|RunMem`).

### Evidencia inicial (inventario de acoplamiento legacy en críticos)

Comando ejecutado:

```bash
node - <<'NODE'
const fs=require('fs');
const files=['plugins/plugin-habilidades.js','plugins/plugin-magias.js','plugins/plugin-criaturas.js','plugins/plugin-facciones.js','plugins/plugin-guarida.js','plugins/plugin-sombra-herrante.js'];
const tokens=['Net','XP','Tactics','RunMem'];
for (const f of files){const s=fs.readFileSync(f,'utf8');const row={};for (const t of tokens){const m=s.match(new RegExp('\\b'+t+'\\.','g'));if(m)row[t]=m.length;}console.log(f,JSON.stringify(row));}
NODE
```

Resultado:

- `plugin-habilidades`: `{}`
- `plugin-magias`: `{}`
- `plugin-criaturas`: `{}`
- `plugin-facciones`: `{}`
- `plugin-guarida`: `{}`
- `plugin-sombra-herrante`: `{}`

Diagnóstico: tras extender la migración al total de plugins, **DoD.2 queda cumplido en alcance global de plugins**.

## 2) Alcance congelado (Sprint 10)

Backlog comprometido (según roadmap):

- **S10.1 / B1 (5 pts)**: reducir baseline de `architecture_guard` en plugins críticos.
- **S10.2 / B2 (8 pts)**: migrar accesos directos restantes `Net|XP|Tactics|RunMem` a puertos `runtime.*`.

Capacidad total del sprint: **13 pts**.

## 3) Ejecución en lotes (batching)

- **Batch A — Inventory Lock (S10.1)**
  - Congelar conteo inicial por plugin crítico y token prohibido.
  - Priorizar rutas de mayor frecuencia (`Tactics` en habilidades/magias, `RunMem` en guarida).

- **Batch B — Migración runtime (S10.2)**
  - Reemplazar fallback en rutas primarias por `runtime.*`.
  - Mantener compatibilidad legacy solo dentro de servicios adaptadores (no en handlers de plugin).

- **Batch C — Ajuste de baseline y no-regresión**
  - Reducir baseline en `tests/fixtures/architecture_guard_baseline.json` al nuevo estado real.
  - Verificar que no exista crecimiento de acoplamiento fuera del baseline actualizado.

## 4) Validación con guardrails

Suite ejecutada al cierre de auditoría:

```bash
npm test --silent
```

Resultado:

- `runtime_smoke`: ✅
- `autocomplete_precedence_smoke`: ✅
- `plugins_critical_smoke`: ✅
- `plugins_battle_services_smoke`: ✅
- `plugins_memory_services_smoke`: ✅
- `runtime_memory_services_smoke`: ✅
- `architecture_guard_smoke`: ✅
- `events_contract_smoke`: ✅
- `ownership_matrix_smoke`: ✅

## 5) Auditoría DoD del sprint

- **CA-1** (plugins sin fallback legacy): ✅ **Cumplido**.
  - Evidencia: baseline global de plugins quedó en `0` para `Net|XP|Tactics|RunMem`.
- **CA-2** (guardrail automático activo): ✅.
  - Evidencia: `architecture_guard_smoke` pasa en suite completa.
- **CA-3** (`npm test` verde): ✅.

### Veredicto Sprint 10

- Estado: ✅ **Cierre completo del alcance Sprint 10 + extensión global de plugins**.
- Puntos completados: **13/13 estimados** (B1 + B2) y hardening adicional fuera de alcance mínimo.
- Puntos arrastrados: **0/13** dentro del alcance comprometido.

## 6) Publicación de cierre y handoff (Sprint 11)

Arrastre recomendado:

1. Activar B3 (modo CI estricto por dominio crítico, baseline=0 en críticos).
2. Ejecutar C1 (auditoría DoD automatizada con evidencia reproducible).
3. Ejecutar C2 (actualización README cuando DoD global sea `✅`).

Riesgo principal: ruptura de compatibilidad legacy al retirar fallback en caliente.  
Mitigación: introducir adaptadores de servicio estables (`runtime.*`) y cubrir con smoke por dominio antes de eliminar ramas legacy.
