# Documentación técnica

Este directorio centraliza contratos, auditorías y evidencias del runtime EDA de ECOSISTEMA.

## Lectura recomendada (orden)

1. **`events.md`**: contrato de eventos y convenciones de payload.
2. **`eda-audit.md`**: estado arquitectural actual y guardrails activos.
3. **`dod-audit-report.md`**: evidencia automática más reciente del DoD.
4. **`sprint10-validation-audit.md`**: validación de cierre técnico del Sprint 10.
5. **`segmentacion-ontologica.md`**: validación de segmentación por capas y plan de reestructuración.
6. **`sprint8-validation-audit.md`**: referencia histórica de validación previa.

## Objetivo de cada documento

- **Especificación**: `events.md`
- **Estado actual consolidado**: `eda-audit.md`
- **Evidencia automática de cumplimiento**: `dod-audit-report.md`
- **Validación de segmentación de capas**: `segmentacion-ontologica.md`
- **Trazabilidad por sprint**: `sprint10-validation-audit.md`, `sprint8-validation-audit.md`

## Notas de mantenimiento

- Mantener `events.md` versionado cuando cambie `EventBus.defineEvents(...)`.
- No duplicar en auditorías planes ya cerrados; dejar solo estado vigente y próximos pasos reales.
- Regenerar `dod-audit-report.md` desde tests, no editar manualmente.
