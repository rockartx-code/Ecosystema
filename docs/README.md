# Documentacion de arquitectura

Este indice ordena los artefactos vigentes del runtime y deja claro que documento es contrato, cual es auditoria y cual es evidencia automatica.

## Documentos normativos

- `docs/ontogical.md` -> contrato de ownership, fronteras y dependencias permitidas entre `core`, `systems`, `plugins` y `data`.
- `docs/events.md` -> catalogo actual de eventos versionados, adaptadores expuestos y eventos legacy observados.

## Auditorias y evidencia

- `docs/eda-audit.md` -> matriz viva de ownership por dominio y contratos runtime observados.
- `docs/sprint10-validation-audit.md` -> snapshot de validacion funcional/arquitectonica usado como referencia documental de Sprint 10.
- `docs/dod-audit-report.md` -> evidencia automatica generada por `dod_audit_smoke`.

## Orden de lectura recomendado

1. `README.md`
2. `docs/ontogical.md`
3. `docs/events.md`
4. `docs/eda-audit.md`
5. `docs/dod-audit-report.md`

## Convenciones

- Los contratos normativos mandan sobre documentos historicos.
- Las auditorias describen estado observado y pueden exhibir deuda o drift.
- Si hay conflicto entre ownership y namespace de `data/module.json`, manda `docs/ontogical.md`.
