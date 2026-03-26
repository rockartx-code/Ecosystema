# ECOSISTEMA v2.0
### Motor de RPG de texto modular — Guía completa

> Arquitectura · Plugins · Módulos · Referencia de API

---

## Tabla de contenidos

1. [Visión general](#1-visión-general)
2. [Arquitectura](#2-arquitectura)
3. [Módulos de datos (JSON)](#3-módulos-de-datos-json)
4. [Plugins JavaScript](#4-plugins-javascript)
5. [Extensiones del jugador](#5-extensiones-del-jugador)
6. [Registrar comandos de terminal](#6-registrar-comandos-de-terminal)
7. [Descripción de archivos](#7-descripción-de-archivos)
8. [module-builder.html](#8-module-builderhtml)
9. [Ejemplo completo: plugin de clima dinámico](#9-ejemplo-completo-plugin-de-clima-dinámico)
10. [Orden de carga estricto](#10-orden-de-carga-estricto)
11. [Referencia rápida de comandos](#11-referencia-rápida-de-comandos)

---

## 1. Visión general

ECOSISTEMA es un motor de RPG de texto que corre completamente en el navegador, sin servidor. Está diseñado alrededor de tres principios: separación estricta de entrada/salida, extensibilidad vía plugins y módulos JSON, y un bus de eventos que desacopla todos los sistemas entre sí.

### Qué incluye el proyecto

| Carpeta / archivo | Descripción |
|---|---|
| `core/` | Motor sin conocimiento de dominio: EventBus, Player, World, IO |
| `systems/` | 11 sistemas internos: Forge, Tactics, NPCEngine, ArcEngine, Net, XP… |
| `plugins/` | 6 plugins de dominio: Criaturas, Habilidades, Magias, Facciones, Bosses, IA |
| `index.html` | Shell HTML con datos JSON inline y orden de carga |
| `styles.css` | Estilos del terminal (clases t-acc, t-pel, t-npc…) |
| `module-builder.html` | Constructor visual de módulos y plugins |

### Cómo ejecutar

1. Descomprime el zip en cualquier carpeta.
2. Abre `index.html` en un navegador moderno (Chrome, Firefox, Edge).
3. No requiere servidor, npm ni build step. Todo corre en el cliente.

> **ℹ** El juego guarda estado en `localStorage` bajo la clave `eco_v12`. Para una partida limpia, escribe `nuevo` en el terminal del juego.

---

## 2. Arquitectura

### 2.1 Capas del sistema

El proyecto se divide en cuatro capas con dependencias estrictamente unidireccionales:

| Capa | Archivos | Responsabilidad |
|---|---|---|
| **1 — Core** | `core/*.js` | Motor puro. Sin conocimiento de dominio. Expone EventBus, Player, World, Out, In, CommandRegistry. |
| **2 — Systems** | `systems/*.js` | Sistemas internos que usan EventBus: Forge, Tactics, NPCEngine, ArcEngine, Net, XP, Commands… |
| **3 — Plugins** | `plugins/*.js` | Implementaciones de dominio. Se registran en PluginLoader. Nunca importan directamente otros archivos. |
| **4 — Data** | `index.html (JSON)` | Datos declarativos: enemigos, materiales, criaturas, arquetipos, diálogos, etc. |

### 2.2 EventBus

Todos los sistemas se comunican a través del EventBus. Ningún sistema llama directamente a otro; emite un evento y el destinatario lo escucha.

```js
// Emitir un evento
EventBus.emit('combat:enemy_defeat', { enemy, nodeId });

// Escuchar un evento (en un plugin o sistema)
EventBus.on('combat:enemy_defeat', ({ enemy, nodeId }) => {
  // reaccionar a la derrota del enemigo
}, 'mi_plugin');

// Evento cancelable (puede detenerse la cadena)
const { cancelled } = EventBus.emitCancellable('forge:before', { matIds, cancelled: false });
if (cancelled) return;
```

### 2.3 Catálogo de eventos disponibles (sockets)

Todos los eventos que el motor emite y que un plugin puede interceptar:

| Evento | Payload principal | Cuándo se emite |
|---|---|---|
| `world:before_gen` | `{ seed, count }` | Antes de generar el mundo |
| `world:after_gen` | `{ nodes, npcs, seed }` | Después de generar el mundo |
| `world:node_enter` | `{ nodeId, node, player }` | Al entrar a un nodo |
| `world:node_exit` | `{ fromId, toId, dir }` | Al salir de un nodo |
| `world:tick` | `{ cycle }` | Cada vez que avanza el ciclo |
| `world:section_expand` | `{ seccion, nodeIds, dif }` | Al expandir el mapa en frontera |
| `forge:before` | `{ matIds, ctx, cancelled }` | Antes de forjar (cancelable) |
| `forge:resolve_type` | `{ rType, strength, dom }` | Para cambiar el tipo de resultado |
| `forge:after` | `{ item, rType, tension }` | Tras generar el ítem forjado |
| `forge:collapse` | `{ tension, matIds }` | Al colapsar la forja por tensión |
| `forge:imprint_gen` | `result (impronta)` | Al generar la impronta de un objeto |
| `combat:start` | `{ enemy, nodeId, battle }` | Al iniciar un combate |
| `combat:before_attack` | `{ damage, attacker }` | Antes de atacar (puede modificar daño) |
| `combat:after_attack` | `{ damage, attacker }` | Después de atacar |
| `combat:player_hit` | `{ damage, enemy }` | Cuando el enemigo golpea al jugador |
| `combat:enemy_defeat` | `{ enemy, nodeId }` | Al derrotar un enemigo |
| `combat:loot` | `{ items, source }` | Al generar loot de combate |
| `combat:resolve_ia` | `{ actor, battle }` | Turno de IA (plugin puede manejarlo) |
| `combat:resolve_habilidad` | `{ actor, hab, target }` | Resolver uso de habilidad |
| `combat:resolve_magia` | `{ actor, mag, target }` | Resolver lanzamiento de magia |
| `narrative:npc_gen` | `{ npc, nodeId, ecos }` | Al generar un NPC |
| `narrative:npc_speak` | `{ text, npc, est }` | Al generar diálogo |
| `narrative:npc_interact` | `{ npc, lealtad }` | Al interactuar con un NPC |
| `narrative:npc_twist` | `{ twist, npc }` | Al activar un giro narrativo |
| `narrative:npc_death` | `{ npc, causa }` | Al morir un NPC |
| `narrative:mission_gen` | `{ mision, npc }` | Al generar una misión |
| `narrative:mission_complete` | `{ mision, npc }` | Al completar una misión |
| `narrative:mission_fail` | `{ mision }` | Al fallar una misión |
| `creature:gen` | `{ creature, arcId, nodeId }` | Al generar una criatura |
| `creature:capture_try` | `{ creature, ancla }` | Al intentar capturar |
| `creature:breed_result` | `{ parentA, parentB }` | Al criar dos compañeros |
| `player:create` | `{ player }` | Al crear el jugador (init) |
| `player:stat_change` | `{ stat, prev, current }` | Al cambiar una stat |
| `player:item_add` | `{ item, player }` | Al añadir ítem al inventario |
| `player:item_remove` | `{ item, player }` | Al quitar ítem del inventario |
| `player:equip` | `{ item, player }` | Al equipar un ítem |
| `player:die` | `{ player, causa }` | Al morir el jugador |
| `player:tick` | `{ player }` | Cada ciclo (hambre, heridas…) |
| `memory:run_end` | `{ run, player, npcs }` | Al registrar una run al morir |
| `memory:run_start` | `{ ecos }` | Al iniciar con ecos anteriores |
| `command:before` | `{ verb, args, cancelled }` | Antes de procesar un comando |
| `command:unknown` | `{ verb, args }` | Comando no reconocido por el motor |
| `command:after` | `{ verb, args }` | Después de ejecutar el comando |
| `output:collect_status` | `{ player, clock, slots }` | Para declarar slots en la status bar |
| `render:node_extra` | `{ nodeId, node, lines }` | Para añadir líneas al `cmdMirar` |
| `arc:start` | `{ arc }` | Al activar un arco narrativo |
| `arc:advance` | `{ arc, acto_sig }` | Al avanzar de acto en un arco |
| `arc:complete` | `{ arc, resultado }` | Al cerrar un arco |
| `boss:spawn` | `{ boss, nodeId }` | Al spawnear un boss |
| `boss:defeated` | `{ boss, loot, xp }` | Al derrotar un boss |
| `faction:init` | `{ controlNodos }` | Al inicializar territorios |
| `plugin:loaded` | `{ id, nombre }` | Al cargar un plugin |
| `module:loaded` | `{ meta, data }` | Al cargar un módulo de datos |

### 2.4 Separación I/O

El motor nunca escribe directamente en el DOM. Todo output pasa por `Out.*`, que emite eventos. El único archivo con acceso a `document.*` es `renderer.js`.

| Función | Descripción |
|---|---|
| `Out.line(text, color, bold)` | Escribe una línea de texto en el terminal |
| `Out.sep(char, len)` | Escribe un separador horizontal (ej: `─────`) |
| `Out.sp()` | Escribe una línea en blanco |
| `Out.echo(raw)` | Muestra el comando escrito por el jugador |
| `Out.tw(text, color, delay)` | Efecto typewriter (Promise). Solo para boot/intro |
| `Out.status(slots)` | Actualiza slots en la barra de estado |
| `Out.clear()` | Limpia el terminal |
| `Out.boot(id, text, state)` | Línea de boot con estado (`pending`/`ok`/`warn`/`plug`) |
| `refreshStatus()` | Recalcula y redibuja la barra de estado completa |
| `In.submit(text)` | Envía texto al motor como si el jugador lo escribiera |

### 2.5 Colores disponibles (clases CSS)

Cada llamada a `Out.line()` acepta una clase de color como segundo argumento:

```
t-acc   t-pel   t-cra   t-mem   t-npc   t-sis
t-mag   t-cri   t-cor   t-eco   t-dim   t-out
t-hab   t-mis   t-twi   t-mut
```

---

## 3. Módulos de datos (JSON)

Un módulo es un objeto JSON que modifica o extiende los datos del juego (`D`). Se carga a través de `ModuleLoader.apply()`. No contiene lógica, solo declaraciones.

### 3.1 Estructura de un módulo

```json
{
  "meta": {
    "id":          "mi_modulo",
    "nombre":      "Módulo de ejemplo",
    "version":     "1.0.0",
    "descripcion": "Añade enemigos y materiales nuevos"
  },

  "enemies": [
    {
      "nombre": "Devastador Arcano",
      "hp":     35,
      "atk":    12,
      "def":    3,
      "tags":   ["rayo", "corrupto"],
      "loot":   ["cristal_tormenta", "esencia_corrupta"],
      "desc":   "Una figura que condensa el vacío."
    }
  ],

  "mats": {
    "cristal_tormenta": {
      "categoria": "cristal",
      "tags":      ["rayo", "inestable"],
      "desc":      "Vibra con electricidad residual."
    }
  },

  "ciclo_hunger_perdida":    3,
  "hunger_cero_hp_perdida":  2,
  "mitico_chance":           0.12,
  "mitico_chance_ciclo_min": 10
}
```

### 3.2 Secciones disponibles en D

| Clave | Descripción |
|---|---|
| `enemies` | Array de enemigos con stats y loot |
| `mats` | Materiales forjables `{ id → { tags, categoria, desc } }` |
| `creatures` | Arquetipos de criaturas `{ id → { tags, hp, atk, anclas } }` |
| `creNames` | Nombres de criaturas `{ prefijos, sufijos }` |
| `archetypes` | Arquetipos de forja `{ id → { adjetivos, sustantivos, stats } }` |
| `tagAff` | Afinidades entre tags `{ "tag1:tag2" → { resultado, fuerza } }` |
| `tagOpp` | Pares de tags opuestos (generan tensión al forjar) |
| `habPool` | Pool de habilidades base que puede generar la Forja |
| `magPool` | Pool de magias base que puede generar la Forja |
| `npcs` | Config de generación de NPCs: nombres, arquetipos, diálogos, vínculos |
| `missions` | Plantillas de misiones por tipo |
| `narrative` | Mutaciones, loot narrativo, consecuencias de desesperación |
| `twistDefs` | Definiciones de giros narrativos con condiciones de activación |
| `playerDef` | Stats base del jugador: hp, atk, def, slots de habilidades/magias |
| `world` | Config del mundo: tipos de nodo, nombres, loot por tipo, chances |
| `facciones` | Config de facciones (leída por FactionSystem y plugin-facciones) |

### 3.3 Cargar un módulo en partida

```js
// Opción A — pegar JSON en el terminal del juego
cargar_modulo { "meta": { "id": "expansion" }, "enemies": [...] }

// Opción B — desde JavaScript
ModuleLoader.apply(miModuloJSON);

// Opción C — en index.html (carga automática al inicio)
// El bootstrap lee automáticamente todos los scripts con class="eco-module"
```

```html
<script type="application/json" id="mod-expansion" class="eco-module">
  { "meta": { "id": "expansion" }, ... }
</script>
```

> **ℹ** Los módulos se fusionan con `D` usando deep merge. Las claves nuevas se añaden; las existentes se reemplazan. Para arrays como `enemies`, la lista se concatena.

### 3.4 Leer valores de módulo en el código

```js
// Leer un valor simple
const hunger = ModuleLoader.get('ciclo_hunger_perdida') || 3;

// Leer datos anidados
const facs = ModuleLoader.get('facciones') || {};

// Leer datos directamente de D
const enemigo = D.enemies[0];
const mat  = D.mat('cristal_roto');       // helper: D.mat(id)
const tags = D.matTags('cristal_roto');   // helper: D.matTags(id)
```

---

## 4. Plugins JavaScript

Un plugin es un objeto JS con un `id`, `hooks` (listeners de eventos) y `comandos`. Se registra en `PluginLoader`. A diferencia de un módulo, un plugin contiene lógica.

### 4.1 Estructura mínima de un plugin

```js
const miPlugin = {
  id:          'plugin:mi_sistema',   // prefijo 'plugin:' obligatorio
  nombre:      'Mi Sistema',
  version:     '1.0.0',
  descripcion: 'Descripción breve del plugin.',

  // Datos declarativos opcionales — se fusionan en D igual que un módulo
  modulo: {
    mats: {
      mi_material: { tags: ['raro'], categoria: 'cristal', desc: 'Raro.' }
    }
  },

  // Hooks — listeners del EventBus declarados aquí
  hooks: {
    'combat:enemy_defeat': {
      priority: 50,       // prioridad en la cadena (mayor = antes), default 50
      fn(payload) {
        const { enemy, nodeId } = payload;
        // lógica...
        return payload;   // devolver el payload para la siguiente etapa
      }
    },
    'output:collect_status': {
      fn(payload) {
        payload.slots['mi_slot'] = { text: 'DATO', color: 't-acc' };
        return payload;
      }
    }
  },

  // Comandos de terminal registrados en CommandRegistry
  comandos: {
    'mi_comando': {
      fn: (args) => {
        Out.line('Hola desde mi_comando', 't-acc');
      },
      meta: {
        titulo: 'mi_comando [arg]',
        color:  't-acc',
        desc:   'Descripción para la ayuda del juego.'
      }
    }
  }
};

// Registrar el plugin
PluginLoader.register(miPlugin);
```

### 4.2 Hooks más usados

#### `player:create` — inicializar estado del jugador

```js
hooks: {
  'player:create': {
    fn(payload) {
      payload.player.mi_recurso = 100;
      payload.player.mi_log = [];
      return payload;
    }
  }
}
```

#### `output:collect_status` — declarar slots en la barra de estado

La barra de estado es declarativa. Los slots predefinidos del core son: `hp`, `hun`, `sta`, `mna`, `loc`, `cyc`, `inv`, `npc`, `mis`, `mod`. Los plugins añaden los suyos propios.

```js
hooks: {
  'output:collect_status': {
    fn(payload) {
      const p = payload.player;

      // Forma simple: solo texto
      payload.slots['mi_slot'] = `${p.mi_recurso}pts`;

      // Forma completa: texto + color
      payload.slots['mi_slot'] = {
        text:  `${p.mi_recurso}pts`,
        color: p.mi_recurso < 20 ? 't-pel' : 't-cra'
      };
      return payload;
    }
  }
}
```

```html
<!-- En index.html añadir el elemento HTML del slot -->
<span id="s-mi_slot" class="sbar-item"></span>
```

#### `forge:resolve_type` — cambiar el tipo de resultado al forjar

```js
hooks: {
  'forge:resolve_type': {
    fn(payload) {
      const { rType, dom, strength } = payload;
      if (dom.includes('sangre') && rType !== 'colapso') {
        payload.rType    = 'habilidad';
        payload.strength = Math.max(strength, 0.7);
      }
      return payload;
    }
  }
}
```

#### `render:node_extra` — añadir texto al describir un nodo

```js
hooks: {
  'render:node_extra': {
    fn(payload) {
      const { nodeId, node } = payload;
      if (node.tipo === 'templo' && MiSistema.estaActivo(nodeId)) {
        payload.lines.push({
          text:  '✦ Un altar antiguo pulsa aquí.',
          color: 't-eco'
        });
      }
      return payload;
    }
  }
}
```

#### `combat:resolve_ia` — controlar la IA del enemigo en batalla

```js
hooks: {
  'combat:resolve_ia': {
    fn(payload) {
      const { actor, battle } = payload;
      if (!actor.tags?.includes('mi_tipo')) return payload;

      const target = battle.cola.find(c => c.vivo && c.tipo === 'player');
      if (target) {
        const dmg = Math.max(1, actor.atk * 1.5);
        target.hp = Math.max(0, target.hp - dmg);
        battleLog(battle, `${actor.name} usa GOLPE ESPECIAL — −${dmg}HP`, 't-pel');
        if (target.hp <= 0) target.vivo = false;
      }
      payload.handled = true;  // marcar como manejado para que el motor no ejecute su IA
      return payload;
    }
  }
}
```

#### `combat:resolve_habilidad` y `combat:resolve_magia`

```js
hooks: {
  'combat:resolve_habilidad': {
    fn(payload) {
      const { actor, hab, target, battle } = payload;
      if (!hab) return payload;

      switch (hab.efecto) {
        case 'mi_efecto': {
          const dmg = Math.floor(actor.atk * (hab.valor || 1.5));
          target.hp = Math.max(0, target.hp - dmg);
          battleLog(battle, `${actor.name}: ${hab.nombre} — −${dmg}HP`, 't-hab');
          if (target.hp <= 0) target.vivo = false;
          payload.handled = true;
          break;
        }
      }
      return payload;
    }
  }
}
```

### 4.3 Plugins desde JSON (sin archivo .js)

Los plugins simples pueden definirse completamente en JSON y cargarse desde el terminal:

```json
{
  "id":          "plugin:mi_plugin_json",
  "nombre":      "Plugin JSON",
  "version":     "1.0.0",
  "descripcion": "Plugin declarativo sin archivo .js",

  "modulo": {
    "enemies": [
      { "nombre": "Eco Corrupto", "hp": 20, "atk": 8, "tags": ["corrupto"] }
    ]
  },

  "hooks": {
    "world:node_enter": {
      "fn": "function(p){ if(p.node.tipo==='templo') Out.line('Sientes la resonancia.','t-eco'); return p; }"
    }
  },

  "comandos": {
    "eco": {
      "fn": "function(args){ Out.line(args.join(' '), 't-eco'); }",
      "meta": { "titulo": "eco [texto]", "color": "t-eco", "desc": "Repite texto en el terminal." }
    }
  }
}
```

> **⚠** Las funciones en JSON deben ser strings serializados. El motor los evalúa con `new Function()`. Para lógica compleja, usa siempre un archivo `.js`.

### 4.4 Cargar y descargar plugins en partida

```
cargar_plugin { "id": "plugin:mi", "nombre": "Mi Plugin", ... }
descargar_plugin plugin:mi_plugin
```

---

## 5. Extensiones del jugador

El objeto `Player` tiene un campo `ext{}` para que los plugins almacenen sus datos propios sin colisionar con el estado del core.

### 5.1 Inicializar campos en `player:create`

```js
hooks: {
  'player:create': {
    fn(payload) {
      payload.player.ext = payload.player.ext || {};
      payload.player.ext.mi_recurso  = 100;
      payload.player.ext.habilidades = [];
      payload.player.ext.magias      = [];

      // Registrar slots personalizados
      payload.player.slots = payload.player.slots || {};
      payload.player.slots.habilidades = 3;
      payload.player.slots.magias      = 2;
      payload.player.slots.compañeros  = 1;
      return payload;
    }
  }
}
```

### 5.2 Acceder a `ext` desde otros sistemas

```js
// Los sistemas usan el mismo patrón de fallback
const habs = Player.get().ext?.habilidades || Player.get().habilidades || [];
```

---

## 6. Registrar comandos de terminal

### 6.1 Comando en plugin (forma recomendada)

```js
const miPlugin = {
  id: 'plugin:demo',
  // ...
  comandos: {
    'invocar': {
      fn: (args) => {
        const nombre = args.join(' ') || 'Eco';
        Out.line(`Invocas a ${nombre}.`, 't-mag');
        save(); // guardar si modificaste el estado
      },
      meta: {
        titulo: 'invocar [nombre]',
        color:  't-mag',
        desc:   'Invoca una entidad mágica.'
      }
    }
  }
};
```

### 6.2 Comando directo en CommandRegistry

```js
CommandRegistry.register('mi_cmd', {
  fn:   (args) => { Out.line('ok', 't-cra'); },
  meta: { titulo: 'mi_cmd', color: 't-cra', desc: 'Descripción.' }
});

// El motor llama a CommandRegistry.run(verb, args) en dispatch()
// Si devuelve true, el dispatch no continúa con el switch nativo
```

---

## 7. Descripción de archivos

### core/

| Archivo | Contenido |
|---|---|
| `core.js` | `U` (utilidades), `EventBus`, `ModuleLoader`, `PluginLoader`, `CommandRegistry`, `D` (datos) |
| `entity.js` | Clase `Entity` base y `EntityRegistry` para criaturas y NPCs |
| `player.js` | `Player`: stats, inventario, equipamiento, habilidades, magias, compañeros |
| `world.js` | `Clock`, `World` (mapa, nodos, edges), `GS` (estado: NPCs, misiones, arcos) |
| `combat-resolution.js` | `CombatResolution`: pipeline delegado de 4 fases. `battleLog()` |
| `io-bus.js` | `Out.*`, `In.submit()`, `refreshStatus()`. Cero DOM. Solo emite eventos. |
| `renderer.js` | Único archivo con `document.*`. Escucha `output:*` y escribe en el DOM. `InputAdapter`. |
| `main.js` | `CTX` (contexto compartido), `bootSeq()`, `init()`. Punto de entrada. |
| `utils.js` | `U.uid()`, `U.hash()`, `U.rng()`, `U.pick()`, `U.clamp()`, `U.tmpl()`, `U.rand()`, `U.chance()`… |

### systems/

| Archivo | Contenido |
|---|---|
| `run-memory.js` | `RunMem`: guarda ecos de runs anteriores en localStorage. Legados y epitafios. |
| `forge.js` | `Imprint`, `Tags` (afinidades/tensión), `Forge.forjar()`. Motor de crafteo libre. |
| `npc-engine.js` | `NPCEngine`: generación procedural, diálogo, interacción, misiones, twists. |
| `arc-engine.js` | `ArcEngine`: arcos narrativos procedurales con desviaciones según acciones del jugador. |
| `tactics.js` | `Tactics`: elementos, reacciones, superficies, heridas, poise, stamina, clima. |
| `item-system.js` | `ItemSystem`: catálogo de ítems tácticos, medicina, reparación, potenciadores. |
| `xp.js` | `XP`: 8 ramas de experiencia, curva logarítmica, atributos asignables. |
| `world-ai.js` | `WorldAI`: migración autónoma de enemigos, criaturas y NPCs entre nodos. |
| `net.js` | `Net`: sistema P2P (WebRTC-ready), batallas por turnos multijugador, trade. |
| `save-load.js` | `save()`, `loadSave()`, `die()`, `exportarPartida()`, `importarPartida()`. |
| `commands.js` | `dispatch()`, `cmdIr()`, `cmdMirar()`, `cmdHablar()`, `cmdForjar()`, `cmdAtacar()`… todos los comandos. |

### plugins/

| Archivo | Contenido |
|---|---|
| `plugin-criaturas.js` | Captura, vinculación, modos, breeding, aura en batalla. Slot `comp`. |
| `plugin-habilidades.js` | Habilidades de enemigos por nivel de ATK. Comando `copiar`. Slot `hab`. |
| `plugin-magias.js` | Magias de enemigos. Maldición, drenaje de maná, `canalizar`. Slots `mag`/`mna`. |
| `plugin-ia-batalla.js` | IA táctica con 8 perfiles y 4 capas de decisión. |
| `plugin-facciones.js` | `FactionSystem`: control territorial, reputación, emboscadas, servicios. Slot `fac`. |
| `plugin-bosses.js` | `BossSystem`: 3 bosses mundiales que se mueven, amenazan y dejan loot mítico. |

---

## 8. module-builder.html

La herramienta visual permite crear módulos y plugins sin escribir JSON a mano. Genera el JSON listo para copiar y cargar en el juego.

**Qué puede generar:**
- Módulos JSON: enemigos, materiales, criaturas, arquetipos de forja, datos de mundo
- Plugins JSON: hooks con código JS inline, comandos con metadatos
- Validación básica de campos requeridos antes de exportar

**Flujo de trabajo:**
1. Abre `module-builder.html` en el navegador.
2. Selecciona si quieres crear un **Módulo** o un **Plugin**.
3. Rellena los campos del formulario. Para plugins, el código JS de cada hook va en el campo de texto correspondiente.
4. Haz clic en **Exportar JSON**.
5. Copia el JSON resultante.
6. En el juego escribe: `cargar_modulo [json]` o `cargar_plugin [json]`.

---

## 9. Ejemplo completo: plugin de clima dinámico

Este ejemplo crea un plugin completo que añade un sistema de clima que afecta el combate: lluvia aumenta el daño eléctrico, sol amplifica el fuego.

### 9.1 El módulo de datos (`module-clima.json`)

```json
{
  "meta": { "id": "clima", "nombre": "Sistema de Clima" },
  "clima_tipos": {
    "lluvia":   { "elemento": "MOJADO",      "multiplicador": 1.3, "duracion": 5 },
    "sol":      { "elemento": "ARDIENDO",    "multiplicador": 1.2, "duracion": 8 },
    "tormenta": { "elemento": "ELECTRIZADO", "multiplicador": 1.6, "duracion": 3 },
    "niebla":   { "elemento": null,          "multiplicador": 0.8, "duracion": 6 }
  }
}
```

### 9.2 El plugin de lógica (`plugin-clima.js`)

```js
const ClimaSystem = (() => {
  let climaActual = null;
  let climaCiclosRestantes = 0;

  function cambiarClima() {
    const tipos = Object.keys(ModuleLoader.get('clima_tipos') || {});
    if (!tipos.length) return;
    climaActual = tipos[Math.floor(Math.random() * tipos.length)];
    const def = ModuleLoader.get(`clima_tipos.${climaActual}`);
    climaCiclosRestantes = def?.duracion || 5;
    Out.sp();
    Out.line(`☁ El clima cambia a: ${climaActual.toUpperCase()}`, 't-sis', true);
    Out.line(`Duración: ~${def?.duracion || '?'} ciclos`, 't-dim');
  }

  return { cambiarClima, getClima: () => climaActual };
})();

const pluginClima = {
  id:          'plugin:clima',
  nombre:      'Sistema de Clima Dinámico',
  version:     '1.0.0',
  descripcion: 'Clima que afecta multiplicadores de combate.',

  hooks: {
    // Cada 7 ciclos, posibilidad de cambio de clima
    'world:tick': {
      fn(payload) {
        if (Clock.cycle % 7 === 0 && Math.random() < 0.4) {
          ClimaSystem.cambiarClima();
        }
        return payload;
      }
    },

    // Aplicar multiplicador del clima antes de cada ataque
    'combat:before_attack': {
      priority: 60,
      fn(payload) {
        const clima = ClimaSystem.getClima();
        if (!clima) return payload;
        const def = ModuleLoader.get(`clima_tipos.${clima}`);
        if (!def?.elemento) return payload;

        const arma = Player.get().equipped?.arma;
        const esElementoClima = arma?.tags?.some(t => {
          const map = { MOJADO:'agua', ARDIENDO:'fuego', ELECTRIZADO:'rayo' };
          return t === map[def.elemento];
        });
        if (esElementoClima) {
          payload.damage = Math.floor(payload.damage * def.multiplicador);
        }
        return payload;
      }
    },

    // Slot en la barra de estado
    'output:collect_status': {
      fn(payload) {
        const clima = ClimaSystem.getClima();
        payload.slots['clima'] = clima
          ? { text: clima.slice(0, 4).toUpperCase(), color: 't-sis' }
          : { text: 'CLAR', color: 't-dim' };
        return payload;
      }
    },

    // Añadir clima a la descripción del nodo
    'render:node_extra': {
      fn(payload) {
        const clima = ClimaSystem.getClima();
        const def = ModuleLoader.get(`clima_tipos.${clima}`);
        if (clima && def) {
          payload.lines.push({
            text:  `☁ Clima: ${clima}  ×${def.multiplicador}  ${def.elemento || 'neutro'}`,
            color: 't-sis'
          });
        }
        return payload;
      }
    }
  },

  comandos: {
    'clima': {
      fn: () => {
        const c = ClimaSystem.getClima();
        const def = c ? ModuleLoader.get(`clima_tipos.${c}`) : null;
        Out.sp();
        Out.line('— CLIMA ACTUAL —', 't-sis');
        Out.line(
          c
            ? `${c.toUpperCase()}  ×${def?.multiplicador}  Elemento: ${def?.elemento || 'ninguno'}`
            : 'Cielo despejado.',
          't-dim'
        );
        Out.sp();
      },
      meta: { titulo: 'clima', color: 't-sis', desc: 'Ver el clima actual y sus efectos.' }
    },
    'cambiar_clima': {
      fn: () => { ClimaSystem.cambiarClima(); save(); },
      meta: { titulo: 'cambiar_clima', color: 't-sis', desc: 'Forzar cambio de clima (debug).' }
    }
  }
};

PluginLoader.register(pluginClima);
```

### 9.3 Añadir el slot a `index.html`

```html
<!-- Dentro de <div id="sbar"> -->
<span class="sbar-sep">·</span>
<span id="s-clima" class="sbar-item t-sis">CLAR</span>
```

### 9.4 Orden de carga

Añadir al final de la sección de plugins en `index.html`, antes de `core/main.js`:

```html
<!-- Datos del clima (se carga con el resto de eco-module) -->
<script type="application/json" class="eco-module">
  { "meta": { "id": "clima" }, "clima_tipos": { ... } }
</script>

<!-- Plugin (antes de main.js) -->
<script type="module" src="plugins/plugin-clima.js"></script>
```

---

## 10. Orden de carga estricto

Este es el orden correcto en `index.html`. No reordenar.

```html
<!-- 1. CORE — motor sin dominio -->
<script type="module" src="core/core.js"></script>
<script type="module" src="core/entity.js"></script>
<script type="module" src="core/player.js"></script>
<script type="module" src="core/world.js"></script>
<script type="module" src="core/combat-resolution.js"></script>
<script type="module" src="core/io-bus.js"></script>
<script type="module" src="core/renderer.js"></script>

<!-- 2. SISTEMAS INTERNOS -->
<script type="module" src="systems/run-memory.js"></script>
<script type="module" src="systems/forge.js"></script>
<script type="module" src="systems/npc-engine.js"></script>
<script type="module" src="systems/arc-engine.js"></script>
<script type="module" src="systems/tactics.js"></script>
<script type="module" src="systems/item-system.js"></script>
<script type="module" src="systems/xp.js"></script>
<script type="module" src="systems/world-ai.js"></script>
<script type="module" src="systems/net.js"></script>
<script type="module" src="systems/save-load.js"></script>
<script type="module" src="systems/commands.js"></script>

<!-- 3. PLUGINS DE DOMINIO (todos antes de main.js) -->
<script type="module" src="plugins/plugin-criaturas.js"></script>
<script type="module" src="plugins/plugin-habilidades.js"></script>
<script type="module" src="plugins/plugin-magias.js"></script>
<script type="module" src="plugins/plugin-ia-batalla.js"></script>
<script type="module" src="plugins/plugin-facciones.js"></script>
<script type="module" src="plugins/plugin-bosses.js"></script>
<!-- tus plugins personalizados aquí -->

<!-- 4. ENTRADA — siempre el último -->
<script type="module" src="core/main.js"></script>
```

> **⚠** `main.js` debe ir siempre al final. Es el único archivo que llama a `init()` y `bootSeq()`. Si cualquier plugin se carga después de `main.js`, sus hooks no estarán registrados cuando el mundo se genere.

---

## 11. Referencia rápida de comandos

### Exploración

| Comando | Descripción |
|---|---|
| `ir norte/sur/este/oeste` (n/s/e/o) | Mover al jugador. Expande mapa automáticamente en frontera. |
| `mirar` (l) | Describir el nodo actual: objetos, enemigos, criaturas, NPCs. |
| `mapa` | Estado del mundo: nodos explorados, secciones, dificultad. |
| `mapa [jugador]` | BFS hacia otro jugador conectado con ruta y distancia. |
| `semilla` | Ver la semilla del mundo actual. |

### NPCs y narrativa

| Comando | Descripción |
|---|---|
| `hablar [npc]` | Diálogo, interacción, generación de misión y arco narrativo. |
| `preguntar [npc] [tema]` | Preguntar sobre: secreto, miedo, deseo, trauma, anterior, vínculo. |
| `observar [npc]` | Ver stats internos del NPC: lealtad, corrupción, desesperación. |
| `traicionar [npc]` | Poner lealtad a 0 y posiblemente volverlo hostil. |
| `npcs` | Lista global de todos los NPCs del mundo. |
| `misiones` | Ver misiones activas, completadas y fallidas. |
| `aceptar [id]` | Aceptar una misión pendiente. |
| `rechazar [id]` | Rechazar y fallar una misión. |
| `completar [id]` | Marcar una misión como completada. |
| `arcos` | Ver arcos narrativos activos y su estado. |

### Forja y crafteo

| Comando | Descripción |
|---|---|
| `forjar [mat] [mat]…` | Forja libre por afinidades de tags. |
| `encarnar [mat] [mat]…` | Sesgar resultado hacia habilidades (requiere material corporal). |
| `conjurar [mat] [mat]…` | Sesgar resultado hacia magias (requiere material mágico). |
| `fusionar [id] [id]…` | Convergencia ontológica: varios ítems → reliquia mítica. |
| `recetas` | Ver tabla de afinidades y tags opuestos. |
| `materiales` | Ver catálogo de materiales por categoría. |

### Combate y táctica

| Comando | Descripción |
|---|---|
| `atacar [objetivo]` | Iniciar combate con enemigo o NPC. |
| `atacar / defender / magia / habilidad` | Acciones de turno en batalla por turnos. |
| `huir` | Intentar escapar del combate. |
| `tactica` | Ver clima táctico, superficie, heridas y estados del nodo. |
| `descansar` | Recuperar HP, stamina y maná. Riesgo de emboscada fuera de HUB. |
| `items` | Ver ítems tácticos: medicinas, reparación, potenciadores. |
| `usar [ítem]` | Usar un ítem táctico o consumible. |
| `examinar [objetivo]` | Inspeccionar enemigo, ítem o NPC en detalle. |

### Criaturas y compañeros

| Comando | Descripción |
|---|---|
| `criaturas` | Ver compañeros vinculados y sus stats. |
| `capturar [criatura]` | Intentar vincular una criatura del nodo (requiere ancla). |
| `liberar [comp]` | Liberar un compañero de vuelta al nodo. |
| `modo [comp] [modo]` | Cambiar modo: activo · caza · defensivo · autónomo · latente |
| `nombrar [comp] [nombre]` | Renombrar un compañero. |
| `criar [compA] [compB]` | Criar dos compañeros para generar descendencia. |
| `anclas` | Ver anclas en inventario y criaturas del nodo. |
| `copiar [enemigo]` | Aprender la última habilidad usada por un enemigo en batalla. |
| `canalizar [enemigo]` | Aprender la última magia usada por un enemigo en batalla. |

### Sistema de XP

| Comando | Descripción |
|---|---|
| `experiencia` (xp) | Ver progreso en las 8 ramas de XP con barra visual. |
| `atributos` | Ver atributos asignables y sus efectos. |
| `asignar [atributo]` | Gastar un punto de atributo. Ej: `asignar fuerza` |

### Facciones y bosses

| Comando | Descripción |
|---|---|
| `facciones` | Ver facciones, territorios y reputación. |
| `reputacion` | Ver resumen de reputación por facción. |
| `bosses` | Ver bosses activos, distancia y loot mítico disponible. |

### Multijugador P2P

| Comando | Descripción |
|---|---|
| `host` | Crear sala y generar código para compartir. |
| `conectar [código]` | Unirse a la sala de otro jugador. |
| `aceptar_conexion [resp]` | Aceptar la respuesta SDP de un cliente (solo host). |
| `jugadores` | Ver jugadores conectados y su posición. |
| `desconectar` | Salir de la sala. |
| `comerciar [jugador]` | Iniciar comercio con jugador en el mismo nodo. |
| `ofrecer [ítem]` | Añadir ítem a la oferta de comercio. |
| `confirmar_trade` | Confirmar y ejecutar el intercambio. |
| `batalla` | Ver estado de la batalla por turnos activa. |

### Sistema y meta

| Comando | Descripción |
|---|---|
| `guardar` | Guardar partida en localStorage. |
| `exportar` | Exportar partida como archivo `.ecohex`. |
| `importar` | Importar partida desde archivo `.ecohex`. |
| `nuevo` | Nueva partida (borra el save actual). |
| `nombre [texto]` | Cambiar el nombre del jugador. |
| `limpiar` (cls) | Limpiar la pantalla del terminal. |
| `plugins` | Ver plugins cargados y sus comandos. |
| `modulos` | Ver módulos de datos cargados. |
| `eventos` | Ver todos los eventos del EventBus y sus listeners. |
| `cargar_plugin [json]` | Cargar un plugin desde JSON en partida. |
| `cargar_modulo [json]` | Cargar un módulo de datos desde JSON en partida. |
| `descargar_plugin [id]` | Descargar y desactivar un plugin. |
| `ayuda` (? / help) | Ver ayuda completa de todos los comandos. |

---

*ECOSISTEMA v2.0 — motor de RPG de texto modular para el navegador*
