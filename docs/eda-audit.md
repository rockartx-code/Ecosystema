# EDA Audit

Matriz viva de ownership para el runtime orientado a plugins.

```json
{
  "domains": [
    {
      "name": "progression",
      "systems": ["systems/commands.js", "systems/save-load.js"],
      "plugins": ["plugins/plugin-xp.js", "plugins/plugin-tacticas.js"],
      "contracts": ["runtime.xp.*", "runtime.tactics.*", "runtime.player.rest", "runtime.player.tactic"]
    },
    {
      "name": "crafting-and-items",
      "systems": ["systems/commands.js", "systems/net.js"],
      "plugins": ["plugins/plugin-forja.js", "plugins/plugin-items.js"],
      "contracts": ["runtime.forge.*", "runtime.imprint.gen", "runtime.items.*"]
    },
    {
      "name": "narrative",
      "systems": ["systems/commands.js", "systems/save-load.js"],
      "plugins": ["plugins/plugin-npcs.js", "plugins/plugin-arcos.js"],
      "contracts": ["runtime.npc.*", "runtime.arc.*"]
    },
    {
      "name": "world-simulation",
      "systems": ["systems/net.js", "systems/commands.js"],
      "plugins": ["plugins/plugin-world-ai.js", "plugins/plugin-criaturas.js", "plugins/plugin-facciones.js", "plugins/plugin-enemigos.js", "plugins/plugin-dificultad.js", "plugins/plugin-supervivencia.js"],
      "contracts": ["runtime.world_ai.*", "runtime.battle.*", "world:tick", "worldai:tick_creatures", "world:request_enemies", "world:calc_difficulty", "player:tick"]
    },
    {
      "name": "memory-and-runtime-services",
      "systems": ["systems/run-memory.js", "systems/autocomplete.js", "systems/commands.js"],
      "plugins": ["plugins/plugin-sombra-herrante.js", "plugins/plugin-guarida.js"],
      "contracts": ["runtime.memory.*", "runtime.player.*", "runtime.world.*", "runtime.output.*"]
    },
    {
      "name": "combat-and-abilities",
      "systems": ["systems/commands.js", "systems/net.js"],
      "plugins": ["plugins/plugin-battle-engine.js", "plugins/plugin-habilidades.js", "plugins/plugin-magias.js", "plugins/plugin-ia-batalla.js", "plugins/plugin-bosses.js", "plugins/plugin-invocaciones.js", "plugins/plugin-concentracion.js", "plugins/plugin-transformaciones.js"],
      "contracts": ["runtime.battle.*", "gameplay.battle.*", "runtime.habilidades.*", "runtime.magias.*", "combat:start", "combat:resolve_habilidad", "combat:resolve_magia", "combat:resolve_ia", "combat:before_damage_apply", "combat:after_damage_apply", "combat:enemy_defeat", "combat:post_resolve", "boss:defeated"]
    },
    {
      "name": "npc-extensions",
      "systems": ["systems/commands.js"],
      "plugins": ["plugins/plugin-cultos.js", "plugins/plugin-tricksters.js", "plugins/plugin-reino-pesadilla.js", "plugins/plugin-arbol-vida.js"],
      "contracts": ["narrative:npc_gen", "narrative:npc_interact", "world:node_enter", "world:request_enemies"]
    }
  ]
}
```
