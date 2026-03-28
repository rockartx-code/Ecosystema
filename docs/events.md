# Event Catalog Spec

Version: **0.1.0**  
Estado: **draft operativo**  
Fuente de verdad: `EventBus.defineEvents(...)` en `core/main.js`.

## Contrato base

Cada evento define:

- `kind`: `command | query | domain | ui`
- `phase`: `pre | main | post | observe`
- `validateIn(payload)`
- `validateOut(payload)` (solo en eventos query con respuesta)

Convenciones:

- `required`: campos obligatorios.
- `optional`: campos opcionales.
- En eventos `query`, el handler debe devolver payload compatible con `validateOut`.

---

## Catálogo compacto (vigente)

### IO / UI

- `output:line` (`ui/observe`) → in: `{ text }`
- `output:status` (`ui/observe`) → in: `{ slots }`
- `input:command` (`command/pre`) → in: `{ verb, args }`

### Audio

- `audio:sfx.play` (`command/post`) → in: `{ cue|type }`
- `audio:music.play` (`command/post`) → in: `{ track|theme }`
- `audio:sfx.played` (`domain/observe`) → in: `{ cue? }`
- `audio:music.changed` (`domain/observe`) → in: `{ track? }`
- `audio:error` (`domain/observe`) → in: `object`

### Control / binding

- `control:action` (`command/pre`) → in: `{ verb }`
- `control:binding.request` (`query/pre`) → in: `object`, out: `object|null`
- `control:binding.changed` (`domain/post`) → in: `object`

### Módulo / plugins

- `module:loaded` (`domain/post`) → in: `{ meta? }`
- `plugin:loaded` (`domain/post`) → in: `{ id }`
- `plugin:unloaded` (`domain/post`) → in: `{ id }`

### Combate

- `combat:start` (`domain/main`) → in: `{ battle, enemy? }`
- `combat:before_attack` (`query/pre`) → in: `{ attacker }`, out: `object`
- `combat:before_damage_apply` (`query/pre`) → in: `{ dmg? }`, out: `{ dmg? }`
- `combat:after_attack` (`domain/post`) → in: `{ attacker }`
- `combat:after_damage_apply` (`domain/post`) → in: `{ actor|target }`
- `combat:resolve_magia` (`query/main`) → in: `{ actor }`, out: `{ handled:boolean, ... }`
- `combat:resolve_habilidad` (`query/main`) → in: `{ actor }`, out: `{ handled:boolean, ... }`
- `combat:resolve_ia` (`query/main`) → in: `{ actor, battle }`, out: `{ action?:string|null }`
- `combat:enemy_used_magia` (`domain/post`) → in: `{ actor? }`
- `combat:player_hit` (`domain/post`) → in: `{ damage? }`
- `combat:enemy_defeat` (`domain/post`) → in: `{ enemy? }`
- `combat:loot` (`domain/post`) → in: `{ items? }`

### Narrativa

- `narrative:npc_gen` (`domain/main`) → in: `{ npc? }`
- `narrative:npc_speak` (`domain/main`) → in: `{ text? }`
- `narrative:npc_interact` (`domain/main`) → in: `{ npc? }`
- `narrative:npc_death` (`domain/post`) → in: `{ npc? }`
- `narrative:npc_twist` (`domain/post`) → in: `{ twist? }`
- `narrative:mission_gen` (`domain/main`) → in: `{ mision? }`
- `narrative:mission_complete` (`domain/post`) → in: `{ mision? }`
- `narrative:mission_fail` (`domain/post`) → in: `{ mision? }`

### Player / World / Memory

- `player:create` (`domain/main`) → in: `{ player? }`
- `player:stat_change` (`domain/post`) → in: `{ stat? }`
- `player:item_add` (`domain/post`) → in: `{ item? }`
- `player:item_remove` (`domain/post`) → in: `{ item? }`
- `player:equip` (`domain/post`) → in: `{ item? }`
- `player:tick` (`domain/post`) → in: `{ player? }`
- `player:die` (`domain/post`) → in: `object`
- `world:tick` (`domain/post`) → in: `{ cycle? }`
- `memory:run_start` (`domain/main`) → in: `object`
- `memory:run_end` (`domain/post`) → in: `object`

---

## Ejemplos mínimos

```json
{ "name": "input:command", "payload": { "verb": "mirar", "args": [] } }
```

```json
{ "name": "combat:resolve_habilidad", "payload": { "actor": {}, "battle": {} } }
```

## Mantenimiento

1. Actualizar este archivo cuando cambie `defineEvents(...)`.
2. Sincronizar versión con `CTX.runtime.eventsVersion`.
3. Validar con `npm test` (incluye `events_contract_smoke`).
