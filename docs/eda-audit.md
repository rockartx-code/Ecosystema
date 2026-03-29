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
      "plugins": ["plugins/plugin-world-ai.js", "plugins/plugin-criaturas.js", "plugins/plugin-facciones.js"],
      "contracts": ["runtime.world_ai.*", "runtime.battle.*", "world:tick", "worldai:tick_creatures"]
    },
    {
      "name": "memory-and-runtime-services",
      "systems": ["systems/run-memory.js", "systems/autocomplete.js", "systems/commands.js"],
      "plugins": ["plugins/plugin-sombra-herrante.js", "plugins/plugin-guarida.js"],
      "contracts": ["runtime.memory.*", "runtime.player.*", "runtime.world.*", "runtime.output.*"]
    }
  ]
}
```
