// ════════════════════════════════════════════════════════════════
// PLUGIN — Escalado de dificultad del mundo
//
// Resuelve world:calc_difficulty combinando poder de equipo, ciclos
// y kills. Accede a Player y Clock via runtime.* (ServiceRegistry)
// para respetar la frontera entre plugins y core. Ownership: plugin.
// ════════════════════════════════════════════════════════════════
'use strict';

const pluginDificultad = (() => {
  function _svc(name) {
    return (typeof ServiceRegistry !== 'undefined' && typeof ServiceRegistry.get === 'function')
      ? ServiceRegistry.get(name)
      : null;
  }
  function _combatStats() {
    const fn = _svc('runtime.player.combat_stats');
    return typeof fn === 'function' ? (fn() || {}) : {};
  }
  function _cycle() {
    const fn = _svc('runtime.clock.current');
    const data = typeof fn === 'function' ? (fn() || {}) : {};
    return Number(data.cycle) || 0;
  }

  return {
    id: 'plugin:dificultad',
    nombre: 'Escalado de Dificultad',
    version: '2.0.0',
    descripcion: 'Calcula la dificultad del mundo en base a progresion.',
    hooks: {
      'world:calc_difficulty': {
        fn(payload) {
          const p = payload.player || {};
          const { atk = 0, def = 0 } = _combatStats();
          const equipPoder = atk*1.5
                           + def*2
                           + (p.equipped?.arma?.durabilidad || 100)/20
                           + (p.equipped?.armadura ? 5 : 0);
          const ciclos = _cycle() || 1;
          const kills  = p.stats?.kills || 0;
          const score  = (equipPoder/20*0.5) + (ciclos/5*0.3) + (kills/10*0.2);
          payload.difficulty = Math.max(1.0, score);
          return payload;
        },
      },
    },
  };
})();
