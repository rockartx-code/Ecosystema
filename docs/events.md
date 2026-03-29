# Event Catalog Spec

Version: **0.1.0**
Estado: **draft operativo alineado al runtime actual**

## Fuentes de verdad

- Eventos versionados y validados: `EventBus.defineEvents(...)` en `core/main.js`.
- Adaptadores de I/O expuestos por runtime: `core/io-bus.js`.
- Eventos legacy observables: emisiones y listeners actuales en `systems/*.js` y `plugins/*.js`.

## Alcance del contrato

- **Tier 1 - versionado**: eventos definidos en `core/main.js`. Estos son los que entran en `eventsVersion` y en compatibilidad de plugins.
- **Tier 2 - adaptadores expuestos**: eventos visibles del runtime/browser usados por `Out`, `In`, `OutputRouter` y `ControlRouter`. Existen hoy, pero no todos estan versionados en `defineEvents(...)`.
- **Tier 3 - legacy/no tipado**: eventos reales observados en runtime que todavia no forman parte del contrato semver. Deben tratarse como internos hasta normalizacion en Fase 2.

## Tier 1 - catalogo versionado

Cada evento puede declarar:

- `kind`: `command | query | domain | ui`
- `phase`: `pre | main | post | observe`
- `validateIn(payload)`
- `validateOut(payload)` en queries

### UI / control

- `output:line` -> `ui/observe` -> in `{ text }`
- `output:status` -> `ui/observe` -> in `{ slots }`
- `input:command` -> `command/pre` -> in `{ verb, args }`
- `control:action` -> `command/pre` -> in `{ verb }`
- `control:binding.request` -> `query/pre` -> in `object`, out `object|null`
- `control:binding.changed` -> `domain/post` -> in `object`

### Audio

- `audio:sfx.play` -> `command/post` -> in `{ cue|type }`
- `audio:music.play` -> `command/post` -> in `{ track|theme }`
- `audio:sfx.played` -> `domain/observe` -> in `{ cue? }`
- `audio:music.changed` -> `domain/observe` -> in `{ track? }`
- `audio:error` -> `domain/observe` -> in `object`

### Boot / modules / plugins

- `module:loaded` -> `domain/post` -> in `{ meta? }`
- `plugin:loaded` -> `domain/post` -> in `{ id }`
- `plugin:unloaded` -> `domain/post` -> in `{ id }`
- `plugin:error` -> `domain/post` -> in `{ id, errors[] }`

### World / memory / meta

- `world:after_gen` -> `domain/post` -> in `{ nodes, edges, seed }`
- `world:node_enter` -> `domain/post` -> in `{ nodeId, node?, player? }`
- `world:section_expand` -> `domain/post` -> in `{ nodeIds, fromNodeId, dir }`
- `world:tick` -> `domain/post` -> in `{ cycle? }`
- `memory:run_start` -> `domain/main` -> in `object`
- `memory:run_end` -> `domain/post` -> in `object`
- `boss:defeated` -> `domain/post` -> in `{ boss?, loot?, xp? }`

### Combat

- `combat:start` -> `domain/main` -> in `{ battle, enemy? }`
- `combat:before_attack` -> `query/pre` -> in `{ attacker }`, out `object`
- `combat:before_damage_apply` -> `query/pre` -> in `{ dmg? }`, out `{ dmg? }`
- `combat:after_attack` -> `domain/post` -> in `{ attacker }`
- `combat:after_damage_apply` -> `domain/post` -> in `{ actor|target }`
- `combat:resolve_magia` -> `query/main` -> in `{ actor }`, out `{ handled:boolean, ... }`
- `combat:resolve_habilidad` -> `query/main` -> in `{ actor }`, out `{ handled:boolean, ... }`
- `combat:resolve_ia` -> `query/main` -> in `{ actor, battle }`, out `{ action?:string|null }`
- `combat:enemy_used_magia` -> `domain/post` -> in `{ actor? }`
- `combat:player_hit` -> `domain/post` -> in `{ damage? }`
- `combat:enemy_defeat` -> `domain/post` -> in `{ enemy? }`
- `combat:loot` -> `domain/post` -> in `{ items? }`

### Narrative

- `narrative:npc_gen` -> `domain/main` -> in `{ npc? }`
- `narrative:npc_speak` -> `domain/main` -> in `{ text? }`
- `narrative:npc_interact` -> `domain/main` -> in `{ npc? }`
- `narrative:npc_death` -> `domain/post` -> in `{ npc? }`
- `narrative:npc_twist` -> `domain/post` -> in `{ twist? }`
- `narrative:mission_gen` -> `domain/main` -> in `{ mision? }`
- `narrative:mission_complete` -> `domain/post` -> in `{ mision? }`
- `narrative:mission_fail` -> `domain/post` -> in `{ mision? }`

### Player

- `player:create` -> `domain/main` -> in `{ player? }`
- `player:stat_change` -> `domain/post` -> in `{ stat? }`
- `player:item_add` -> `domain/post` -> in `{ item? }`
- `player:item_remove` -> `domain/post` -> in `{ item? }`
- `player:equip` -> `domain/post` -> in `{ item? }`
- `player:tick` -> `domain/post` -> in `{ player? }`
- `player:die` -> `domain/post` -> in `object`

## Tier 2 - adaptadores realmente expuestos por runtime

`core/io-bus.js` expone estos eventos en tiempo de ejecucion:

### Salida (`Out` + `OutputRouter`)

- `output:line`
- `output:sep`
- `output:space`
- `output:echo`
- `output:typewriter`
- `output:status`
- `output:clear`
- `output:boot`
- `output:collect_status`

### Entrada (`In` + `ControlRouter`)

- `input:raw`
- `input:command`

### Servicios de adaptador publicados en `ServiceRegistry`

- `io.out.line`
- `io.out.status`
- `io.out.clear`
- `io.in.submit`
- `io.status.refresh`
- `io.output_router.register`
- `io.output_router.unregister`
- `io.output_router.list`
- `io.control_router.register`
- `io.control_router.unregister`
- `io.control_router.list`
- `io.control_router.submit`

Nota: solo `output:line`, `output:status` e `input:command` estan hoy versionados en `defineEvents(...)`. El resto siguen expuestos pero fuera del contrato semver.

## Tier 3 - eventos legacy/no tipados observados hoy

Estos eventos existen en runtime actual, pero no estan versionados por `eventsVersion`.

### Runtime / systems

- `command:before`
- `command:after`
- `command:unknown`
- `render:node_extra`
- `net:patch`
- `game:new_world`
- `world:calc_difficulty`
- `world:request_enemies`
- `world:request_npcs`
- `combat:player_action`
- `combat:enemy_turn_announce`
- `combat:post_resolve`
- `combat:enemy_used_habilidad`

### Plugins de dominio observados

- `arc:start`
- `arc:advance`
- `arc:complete`
- `boss:spawn`
- `creature:escaped`
- `creature:combat_start`
- `creature:capture_try`
- `creature:bound`
- `creature:breed_result`
- `faction:init`
- `forge:before`
- `forge:imprint_gen`
- `forge:resolve_type`
- `forge:collapse`
- `forge:after`
- `worldai:tick_creatures`
- `worldai:tick`

## Notas de compatibilidad

- `eventsVersion` cubre solo el Tier 1.
- Un plugin que requiera compatibilidad semver debe basarse en eventos definidos en `core/main.js`.
- Si un adapter o plugin usa eventos Tier 2 o Tier 3, asume contrato interno del runtime actual, no API estable.
- Fase 2 debe decidir cuales eventos Tier 2/Tier 3 se promueven a `defineEvents(...)` y cuales se retiran o renombraran.

## Mantenimiento

1. Cambiar este archivo cuando cambie `defineEvents(...)` en `core/main.js`.
2. Mantener sincronizada la version con `CTX.runtime.eventsVersion`.
3. Si se agrega un evento visible desde `core/io-bus.js`, documentarlo al menos en Tier 2.
4. No promover eventos legacy a Tier 1 sin validacion y versionado explicito.
