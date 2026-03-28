# Event Catalog Spec

Version: **0.1.0**  
Estado: **draft**  
Fuente: eventos declarados en `EventBus.defineEvents(...)` del bootstrap.  
Runtime sync: `CTX.runtime.eventsVersion = '0.1.0'`.

## Contrato

- `kind`: `command | query | domain | ui`
- `phase`: `pre | main | post | observe`
- `validateIn(payload)`: contrato mínimo de entrada
- `validateOut(payload)`: contrato mínimo de salida (si aplica)

## Convenciones de payload

- `required`: campos obligatorios.
- `optional`: campos opcionales.
- `example`: payload mínimo recomendado.
- En eventos `query`, un handler debe devolver payload compatible con `validateOut`.

---

## IO / UI

### `output:line` (`ui/observe`)
- required: `text:string`
- optional: `color:string`, `bold:boolean`
- example:
```json
{ "text": "Hola", "color": "t-out", "bold": false }
```

### `output:status` (`ui/observe`)
- required: `slots:object`
- optional: —
- example:
```json
{ "slots": { "hp": { "text":"45/50", "color":"t-cra" } } }
```

### `input:command` (`command/pre`)
- required: `verb:string`, `args:array`
- optional: `raw:string`
- example:
```json
{ "verb":"mirar", "args":[], "raw":"mirar" }
```

---

## Audio

### `audio:sfx.play` (`command/post`)
- required: `cue:string` (o `type:string`)
- optional: `volume:number`
- example:
```json
{ "cue":"click" }
```

### `audio:music.play` (`command/post`)
- required: `track:string` (o `theme:string`)
- optional: `fadeMs:number`
- example:
```json
{ "track":"explore" }
```

### `audio:sfx.played` (`domain/observe`)
- required: —
- optional: `cue:string|null`
- example:
```json
{ "cue":"click" }
```

### `audio:music.changed` (`domain/observe`)
- required: —
- optional: `track:string|null`
- example:
```json
{ "track":"battle" }
```

### `audio:error` (`domain/observe`)
- required: objeto válido
- optional: `scope:string`, `message:string`
- example:
```json
{ "scope":"music", "message":"device unavailable" }
```

---

## Control / binding

### `control:action` (`command/pre`)
- required: `verb:string`
- optional: `args:array`
- example:
```json
{ "verb":"atacar", "args":["lobo"] }
```

### `control:binding.request` (`query/pre`)
- required: objeto válido
- optional: `verb:string`, `context:string`
- salida (`validateOut`): `object|null`
- example in:
```json
{ "verb":"atacar" }
```
- example out:
```json
{ "binding":"KeyA" }
```

### `control:binding.changed` (`domain/post`)
- required: objeto válido
- optional: `verb:string`, `binding:string`

---

## Module / plugin lifecycle

### `module:loaded` (`domain/post`)
- required: objeto válido
- optional: `meta:object|null`, `data:object`

### `plugin:loaded` (`domain/post`)
- required: `id:string`
- optional: `version:string`

### `plugin:unloaded` (`domain/post`)
- required: `id:string`
- optional: `reason:string`

---

## Combate

### `combat:start` (`domain/main`)
- required: `battle:object`
- optional: `enemy:object|null`

### `combat:before_attack` (`query/pre`)
- required: `attacker:object`
- optional: `target:object`, `battle:object`
- salida: `object`

### `combat:before_damage_apply` (`query/pre`)
- required: objeto válido
- optional: `dmg:number|null`, `target:object`
- salida: `object` (si devuelve `dmg`, debe ser número o `null`)

### `combat:after_attack` (`domain/post`)
- required: `attacker:object`
- optional: `target:object`, `battle:object`

### `combat:after_damage_apply` (`domain/post`)
- required: `actor:object` o `target:object`
- optional: `dmg:number`, `battle:object`

### `combat:resolve_magia` (`query/main`)
- required: `actor:object`
- optional: `target:object`, `battle:object`, `input:string`
- salida requerida: `{ handled:boolean, ... }`

### `combat:resolve_habilidad` (`query/main`)
- required: `actor:object`
- optional: `target:object`, `battle:object`, `input:string`
- salida requerida: `{ handled:boolean, ... }`

### `combat:resolve_ia` (`query/main`)
- required: `actor:object`, `battle:object`
- optional: `target:object`
- salida: `object` con `action:string|null` opcional

### `combat:enemy_used_magia` (`domain/post`)
- required: objeto válido
- optional: `actor:object|null`, `mag:object`, `battle:object`

### `combat:player_hit` (`domain/post`)
- required: objeto válido
- optional: `damage:number|null`, `source:object`

### `combat:enemy_defeat` (`domain/post`)
- required: objeto válido
- optional: `enemy:object|null`, `battle:object`

### `combat:loot` (`domain/post`)
- required: objeto válido
- optional: `items:array|null`, `source:string`

---

## Narrativa

### `narrative:npc_gen` (`domain/main`)
- required: objeto válido
- optional: `npc:object|null`, `context:object`

### `narrative:npc_speak` (`domain/main`)
- required: objeto válido
- optional: `text:string|null`, `npc:object`

### `narrative:npc_interact` (`domain/main`)
- required: objeto válido
- optional: `npc:object|null`, `action:string`

### `narrative:npc_death` (`domain/post`)
- required: objeto válido
- optional: `npc:object|null`, `cause:string`

### `narrative:npc_twist` (`domain/post`)
- required: objeto válido
- optional: `twist:object|null`, `npc:object`

### `narrative:mission_gen` (`domain/main`)
- required: objeto válido
- optional: `mision:object|null`, `npc:object`

### `narrative:mission_complete` (`domain/post`)
- required: objeto válido
- optional: `mision:object|null`, `reward:object`

### `narrative:mission_fail` (`domain/post`)
- required: objeto válido
- optional: `mision:object|null`, `reason:string`

---

## Player / World / Memory

### `player:create` (`domain/main`)
- required: objeto válido
- optional: `player:object|null`

### `player:stat_change` (`domain/post`)
- required: objeto válido
- optional: `stat:string|null`, `before:number`, `after:number`

### `player:item_add` (`domain/post`)
- required: objeto válido
- optional: `item:object|null`

### `player:item_remove` (`domain/post`)
- required: objeto válido
- optional: `item:object|null`

### `player:equip` (`domain/post`)
- required: objeto válido
- optional: `item:object|null`, `slot:string`

### `player:tick` (`domain/post`)
- required: objeto válido
- optional: `player:object|null`, `cycle:number`

### `player:die` (`domain/post`)
- required: objeto válido
- optional: `reason:string`, `battle:object`

### `world:tick` (`domain/post`)
- required: objeto válido
- optional: `cycle:number|null`

### `memory:run_start` (`domain/main`)
- required: objeto válido
- optional: `seed:string`, `meta:object`

---

## Compatibilidad recomendada para plugins

Se recomienda añadir en cada plugin:

```js
requires: {
  events: {
    'combat:resolve_habilidad': '^0.1.0',
    'player:tick': '^0.1.0'
  }
}
```

Y validar contra una versión publicada del catálogo (`CTX.runtime.eventsVersion`).

El `PluginLoader` valida `requires.events` contra `CTX.runtime.eventsVersion`;
si el evento no existe o el rango no coincide, el plugin no carga.
