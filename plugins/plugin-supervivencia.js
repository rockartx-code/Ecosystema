// ════════════════════════════════════════════════════════════════
// PLUGIN — Supervivencia (hambre y heridas fuera de combate)
//
// Escucha player:create para inicializar hambre y player:tick para
// aplicar pérdida de hambre y daño por heridas persistentes
// (HEMORRAGIA, ENVENENAMIENTO). Ownership: plugin de dominio.
// ════════════════════════════════════════════════════════════════
'use strict';

const pluginSupervivencia = {
  id: 'plugin:supervivencia',
  nombre: 'Supervivencia',
  version: '2.0.0',
  descripcion: 'Hambre y heridas persistentes fuera de combate.',
  hooks: {
    'player:create': {
      fn(payload) {
        const base = D.playerDef?.hunger_base || 100;
        payload.player.hunger    = base;
        payload.player.maxHunger = base;
        return payload;
      },
    },
    'player:tick': {
      fn(payload) {
        const p = payload.player;
        p.hunger -= ModuleLoader.get('ciclo_hunger_perdida') || 3;
        if(p.hunger <= 0) {
          p.hunger = 0;
          p.hp    -= ModuleLoader.get('hunger_cero_hp_perdida') || 2;
        }
        const heridas = p.heridas || [];
        if(heridas.includes('HEMORRAGIA'))     p.hp = Math.max(1, p.hp - 2);
        if(heridas.includes('ENVENENAMIENTO')) p.hp = Math.max(1, p.hp - 1);
        return payload;
      },
    },
    'output:collect_status': {
      fn(payload) {
        const h = payload?.player?.hunger;
        if(typeof h === 'number' && payload.slots) {
          payload.slots.hun = {
            text:  h > 60 ? 'bien' : h > 30 ? 'hambre' : 'crítico',
            color: h > 60 ? 't-cra' : h > 30 ? 't-mem' : 't-pel',
          };
        }
        return payload;
      },
    },
  },
};
