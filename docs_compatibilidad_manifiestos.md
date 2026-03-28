# Matriz de compatibilidad — manifiestos JSON de plugins

Este documento resume los casos cubiertos por la suite automática (`tests/runtime_smoke.js`) para validar compatibilidad de manifiestos JSON y errores esperados.

## Casos válidos (deben cargar)

| Caso | Campos clave | Resultado esperado |
|---|---|---|
| `plugin:json_a` | `id`, `version`, `hooks`, `handlers` | `PluginLoader.registerFromJSON(...)` devuelve `true` |
| `plugin:json_b` | `requires.plugins`, `requires.services`, `load.after`, `comandos`, `handlers` | `registerFromJSON(...)` devuelve `true` y registra comando `json_b_ping` |

## Casos inválidos / de error esperado

| Caso | Campos clave | Resultado esperado |
|---|---|---|
| `plugin:json_before` registrado después de `plugin:json_late` | `load.before: ['plugin:json_late']` | `registerFromJSON(...)` devuelve `false` por orden inválido de carga |

## Cobertura actual en tests

La cobertura actual valida:

1. Dependencias por plugin (`requires.plugins`) con restricción de versión mínima.
2. Dependencias por servicio (`requires.services`) contra `ServiceRegistry`.
3. Reglas de orden de carga (`load.after`, `load.before`).
4. Registro de comandos provenientes de JSON.

Referencia directa del test: `testPluginLoaderRegisterFromJSONCompatibility` en `tests/runtime_smoke.js`.

## Soporte de rangos semver en `requires.plugins`

El runtime soporta ahora:

- Comparadores: `>=`, `<=`, `>`, `<`, `=`
- Exacto: `1.4.2`
- Caret: `^1.4.0`
- Tilde: `~1.4.0`
- OR lógico: `^2.0.0 || ^1.4.0`

Referencia directa del test: `testPluginLoaderSemverAdvancedRanges` en `tests/runtime_smoke.js`.
