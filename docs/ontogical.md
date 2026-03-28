# Contrato onlogical: clasificacion de modulos

## Proposito del contrato

Este contrato define como clasificar modulos del repositorio en `core`, `system` o `plugin`, y como ubicar el contenido narrativo en `data`. Su objetivo es mantener limites claros de responsabilidad, dependencias permitidas y criterios consistentes para evolucionar la arquitectura sin mezclar el motor base, la comunicacion con el mundo exterior, las mecanicas especificas de cada juego y la narrativa o contenido declarativo.

## Definiciones

### `core`

`core` contiene capacidades base del producto o del dominio que sostienen el comportamiento general del ecosistema. `core` es el motor: provee reglas fundamentales, infraestructura conceptual y contratos estables para ejecutar juegos, pero no constituye un juego completo por si mismo.

### `data`

`data` contiene narrativa, contenido declarativo y configuracion de mundo o de juego. Si un elemento describe personajes, eventos, textos, escenas, lore o cualquier otro contenido autoral que el motor interpreta, pertenece a `data`.

### `system`

`system` contiene subsistemas tecnicos o funcionales reutilizables que prestan servicios concretos al resto del repositorio. Es la forma en que el motor se comunica con el mundo exterior: runtime, persistencia, red, audio, render, entrada/salida u otros servicios operativos. No define necesariamente la base conceptual del dominio, pero si resuelve una necesidad transversal, operativa o de soporte.

### `plugin`

`plugin` contiene extensiones, paquetes tematicos o capacidades opcionales que agregan contenido, variaciones o comportamientos no requeridos para la base del ecosistema. Las mecanicas especificas de cada juego viven en `plugins` cuando no forman parte del motor general. Un `plugin` se integra sobre contratos o puntos de extension ya existentes.

## Criterios de clasificacion

### Que pertenece a `core`

- Reglas base del dominio.
- Mecanicas genericas necesarias para que multiples juegos o modulos funcionen.
- Capacidades sin las cuales el ecosistema pierde su estructura principal.
- Contratos o abstracciones que otros modulos implementan o consumen.
- Puntos de extension estables para cargar narrativa o mecanicas especificas.

### Que no pertenece a `core`

- La narrativa concreta de un juego.
- Mecanicas especificas de un juego particular.
- Contenido tematico opcional.
- Integraciones accesorias.
- Servicios tecnicos de soporte que pueden cambiar sin redefinir la base del dominio.

### Que pertenece a `system`

- Subsistemas de soporte o runtime.
- Servicios transversales reutilizables.
- Capacidades operativas que habilitan ejecucion, persistencia, red, audio, render o similares.
- Modulos cuyo valor principal es proveer servicio a otros modulos.
- Adaptadores mediante los cuales el motor observa o afecta el mundo exterior.

### Que no pertenece a `system`

- Reglas nucleares del dominio si son la base conceptual del ecosistema.
- Contenido enchufable o paquetes opcionales orientados a una tematica concreta.

### Que pertenece a `plugin`

- Contenido opcional, especializado o tematico.
- Extensiones que pueden agregarse o quitarse sin romper la base arquitectonica.
- Modulos apoyados en contratos previos del `core` o en servicios de `system`.
- Mecanicas, reglas o modos de juego especificos de una experiencia concreta.

### Que no pertenece a `plugin`

- La narrativa declarativa o el lore cargado como datos.
- Servicios transversales requeridos por toda la plataforma.
- Abstracciones base sin las cuales otros modulos no tienen marco comun.

### Que pertenece a `data`

- Narrativa, lore, dialogos, escenas y textos.
- Configuracion declarativa de mundo, personajes, items o eventos.
- Contenido interpretable por `core` y enriquecido por `plugin` sin mezclar logica ejecutable.

### Que no pertenece a `data`

- Reglas de ejecucion del motor.
- Servicios de integracion con el mundo exterior.
- Mecanicas implementadas como codigo ejecutable.

## Reglas de dependencia permitidas entre capas

- `core` no debe depender de `plugin`.
- `core` puede depender solo de otros modulos `core` y, si la arquitectura lo admite, de contratos tecnicos minimos y estables.
- `system` puede depender de `core` cuando necesita reglas o contratos base.
- `system` no debe depender de `plugin`.
- `plugin` puede depender de `core` y de `system`.
- `plugin` no debe convertirse en requisito para que `core` o `system` funcionen.
- Las dependencias deben apuntar desde lo opcional hacia lo estable, nunca al reves.

## Reglas de diseno e invariantes arquitectonicos

- La clasificacion debe responder a responsabilidad arquitectonica, no al tamano del modulo.
- `core` debe seguir siendo motor reutilizable; no debe absorber narrativa ni asumir una unica experiencia de juego cerrada.
- Un modulo base no debe degradarse a `plugin` solo porque hoy tenga una implementacion concreta.
- Un modulo opcional no debe promoverse a `core` solo por ser usado por varios plugins.
- Los puntos de extension deben vivir en `core` o en contratos estables, no en plugins.
- `system` debe ofrecer servicios reutilizables; no debe absorber reglas de negocio nucleares por conveniencia.
- `system` debe mediar la relacion con el mundo exterior, no redefinir la ontologia del juego.
- `plugin` debe poder evolucionar con menor acoplamiento y sin imponer dependencias ascendentes.
- La narrativa debe residir en `data`, separada del motor y de las mecanicas implementadas.
- Cuando un modulo mezcla responsabilidades, debe priorizarse la clasificacion segun su funcion dominante y considerar futura separacion.

## Ejemplos concretos del repositorio actual

| Modulo | Clasificacion | Criterio aplicado |
| --- | --- | --- |
| `renderer` | `system` | Subsistema tecnico de soporte para representacion. |
| `run-memory` | `core` | Capacidad base necesaria para la logica general del ecosistema. |
| `music` | `system` | Servicio transversal de audio. |
| `sfx` | `system` | Servicio transversal de efectos de sonido. |
| `net` | `system` | Subsistema de red y conectividad. |
| `save-load` | `system` | Subsistema operativo de persistencia. |
| `criaturas` | `plugin` | Extension de contenido tematico. |
| `facciones` | `plugin` | Extension de contenido o comportamiento especializado. |
| `magias` | `plugin` | Extension opcional de mecanicas o contenido. |
| `bosses` | `plugin` | Extension tematica no base. |
| `npc-engine` | `core` o `plugin` | `core` si define comportamiento base universal; `plugin` si es un motor opcional o especializado. |
| `arc-engine` | `core` o `plugin` | `core` si sostiene una mecanica estructural del ecosistema; `plugin` si agrega una capa opcional. |
| `xp` | `core` o `plugin` | `core` si la progresion es parte fundacional; `plugin` si es una regla de juego intercambiable. |
| `tactics` | `core` o `plugin` | `core` si la tactica define la base de resolucion; `plugin` si es un modo o extension opcional. |
| `world-ai` | `core` o `plugin` | `core` si la inteligencia del mundo es estructural; `plugin` si es una mejora desacoplable. |
| `forge` | `core` o `plugin` | `core` si la forja es una capacidad basal del dominio; `plugin` si es un sistema adicional. |
| `item-system` | `core` o `plugin` | `core` si los items son parte universal del modelo; `plugin` si su presencia es opcional o acotada. |

## Regla de decision

Ante un caso ambiguo, decidir en este orden:

1. Si el modulo desaparece, ¿se rompe la base conceptual o solo se pierde una capacidad opcional?
2. Si expresa narrativa o contenido declarativo interpretable, debe vivir en `data`, no en `core`, `system` ni `plugin`.
3. Si otros modulos dependen de el como contrato estable del motor, tiende a `core`.
4. Si presta un servicio transversal de soporte o comunica el motor con el mundo exterior, tiende a `system`.
5. Si agrega contenido ejecutable, especializacion o una mecanica desacoplable de un juego concreto, tiende a `plugin`.
6. Si hoy parece imprescindible solo por acoplamiento accidental, no asumir `core` sin revisar su responsabilidad real.

## Plan de migracion sugerido

- Inventariar modulos actuales usando estos criterios antes de mover nombres o carpetas.
- Marcar explicitamente los casos ambiguos y resolverlos por responsabilidad dominante, no por costumbre.
- Separar contratos base de implementaciones opcionales cuando un modulo mezcle `core` y `plugin`.
- Revisar dependencias prohibidas, especialmente cualquier flecha desde `core` o `system` hacia `plugin`.
- Formalizar la clasificacion acordada en documentacion y validarla en futuras incorporaciones.
