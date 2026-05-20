// ════════════════════════════════════════════════════════════════
// PLUGIN — Spawn de enemigos
//
// Registra la fábrica 'enemy' en EntityRegistry y resuelve
// world:request_enemies generando enemigos escalados por dificultad.
// Otros plugins (habilidades, magias, invocaciones, arbol-vida)
// hookean el mismo evento con prioridad > 50 para enriquecerlos.
// Ownership: plugin de dominio.
// ════════════════════════════════════════════════════════════════
'use strict';

const pluginEnemigos = {
  id: 'plugin:enemigos',
  nombre: 'Sistema de Enemigos',
  version: '2.0.0',
  descripcion: 'Fábrica de entidad enemy y spawn por sección.',
  // ISP (A5 audit): el plugin consume D (catalogo enemies), U (random),
  // Entity y EntityRegistry directamente desde globales. No accede a
  // ctx.* en sus handlers, asi que permissions queda vacio.
  permissions: { allow: [], runtime: [] },

  onLoad() {
    EntityRegistry.register('enemy', (data) => new Entity({ ...data, tipo:'enemy' }));
  },

  hooks: {
    'world:request_enemies': {
      fn(payload) {
        const wd = D.world;
        const ep = D.enemies;
        if(!ep.length || !U.chance(wd?.enemy_chance || .38)) return payload;

        const dif  = payload.difficulty || 1.0;
        const base = { ...U.pick(ep, payload.rng) };
        base.id         = U.uid();
        base.tipo       = 'enemy';
        base.hp         = Math.round((base.hp || 10) * dif);
        base.atk        = Math.round((base.atk || 4) * Math.sqrt(dif));
        base.def        = Math.round((base.def || 0) * Math.sqrt(dif) * 0.8);
        base.hp_current = base.hp;

        if(dif >= 2.5) {
          const el = U.pick(['fuego','hielo','rayo','vacío','resonante'], payload.rng);
          base.tags   = [...(base.tags || []), el];
          base.nombre = `${base.nombre} [${el.toUpperCase()}]`;
        }

        payload.enemies.push(EntityRegistry.create('enemy', base));
        return payload;
      },
    },
  },
};
