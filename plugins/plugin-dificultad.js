// ════════════════════════════════════════════════════════════════
// PLUGIN — Escalado de dificultad del mundo
//
// Resuelve world:calc_difficulty combinando poder de equipo, ciclos
// y kills. Accede a Player y Clock via runtime.* (ServiceRegistry)
// para respetar la frontera entre plugins y core. Ownership: plugin.
// ════════════════════════════════════════════════════════════════
'use strict';

const pluginDificultad = (() => {
  // Helpers compartidos via core/plugin-helpers.js (_svc, _playerCombatStats,
  // _clockCurrent). _cycle() es alias local que extrae el numero.
  function _cycle() {
    return Number(_clockCurrent().cycle) || 0;
  }

  return {
    id: 'plugin:dificultad',
    nombre: 'Escalado de Dificultad',
    version: '2.0.0',
    descripcion: 'Calcula la dificultad del mundo en base a progresion.',
    // ISP (A5 audit): este plugin no usa ctx directamente. Toda
    // dependencia (player.combat_stats, clock.current) se resuelve via
    // helpers globales de core/plugin-helpers.js. Permissions vacias
    // documentan el contrato minimo.
    permissions: { allow: [], runtime: [] },
    hooks: {
      'world:calc_difficulty': {
        fn(payload) {
          const p = payload.player || {};
          const { atk = 0, def = 0 } = _playerCombatStats();
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
