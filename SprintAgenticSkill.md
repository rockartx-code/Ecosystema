---
name: sprint-agentic
description: Definir y ejecutar metodología de trabajo por sprint orientada a cierre de DoD con evidencia verificable. Usar cuando se deba planificar, ejecutar o auditar un sprint técnico (por ejemplo S9/S10/S11), priorizando backlog, criterios de aceptación, pruebas, riesgos y reporte final.
---

# Sprint Agentic Skill

## Objetivo

Estandarizar la ejecución de sprints técnicos en 6 pasos: diagnóstico, selección de alcance, implementación incremental, validación automática, cierre documental y handoff.

## Flujo operativo (estándar)

1. **Levantar estado base del sprint**
   - Identificar DoD objetivo y brechas activas.
   - Registrar evidencia inicial (tests actuales, deuda y riesgos).

2. **Congelar alcance del sprint**
   - Traducir backlog a objetivos del sprint (`Sx.y`).
   - Definir criterios de aceptación verificables por comando/test.
   - Asignar esfuerzo en puntos y límite de capacidad.

3. **Ejecutar en lotes pequeños (batching)**
   - Implementar cambios en incrementos atómicos.
   - Evitar mezclar refactor masivo con cambios funcionales.
   - Mantener compatibilidad temporal solo donde sea estrictamente necesario.

4. **Validar con guardrails**
   - Ejecutar suite mínima por cada lote.
   - Ejecutar suite completa al cierre del sprint.
   - Registrar resultados (pass/warn/fail) y causa raíz en fallos.

5. **Auditar DoD del sprint**
   - Marcar cada criterio como `✅`, `⚠️`, `❌` con evidencia concreta.
   - Si existe deuda remanente, convertirla en backlog del siguiente sprint.

6. **Publicar cierre del sprint**
   - Actualizar documento de auditoría con resultados.
   - Publicar plan del siguiente sprint con puntos y riesgos.

## Plantilla mínima por sprint

Usar esta estructura para cualquier sprint:

- **Objetivo del sprint**
- **Historias/acciones comprometidas**
- **Criterios de aceptación**
- **Pruebas requeridas**
- **Riesgos y mitigaciones**
- **Resultado y evidencia**
- **Arrastre al siguiente sprint**

## Aplicación práctica: Sprint 9

### Objetivo
Cerrar **DoD.1**: eliminar referencias directas a globals del DoD en rutas primarias de `commands.js` y blindar no-regresión.

### Alcance comprometido (13 pts)
- **S9.1 (2 pts)** Inventario de referencias directas en `commands.js`.
- **S9.2 (8 pts)** Migración de rutas primarias para usar `runtime.*`/`gameplay.*`.
- **S9.3 (3 pts)** Smoke anti-global de `commands.js`.

### Criterios de aceptación
- `commands.js` no usa globals prohibidos en rutas primarias.
- Existe test/smoke que falla ante regresión de globals.
- `npm test` pasa con la suite de guardrails.

### Validación sugerida
- `npm test`
- `node tests/architecture_guard_smoke.js`
- `node tests/runtime_smoke.js`

### Riesgos y mitigación
- **Riesgo**: romper compatibilidad de comandos legacy.
  - **Mitigación**: encapsular compatibilidad en facades runtime, no en handlers.
- **Riesgo**: falso positivo/negativo en smoke anti-global.
  - **Mitigación**: baseline explícito y revisión por tokens prohibidos por dominio.

### Cierre esperado
Si S9.1+S9.2+S9.3 cierran en verde, DoD.1 pasa a `✅` y Sprint 10 inicia sobre DoD.2.
