#!/usr/bin/env node
'use strict';

const fs = require('fs');
const assert = require('assert');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function expectServices(file, services) {
  const src = read(file);
  services.forEach((name) => {
    assert.ok(src.includes(`'${name}'`) || src.includes(`"${name}"`), `${file} debe exponer ${name}`);
  });
}

(function testDomainPluginsExposeRuntimeContracts() {
  expectServices('plugins/plugin-forja.js', [
    'runtime.forge.api',
    'runtime.forge.run',
    'runtime.forge.calc_stat',
    'runtime.forge.build_stats',
    'runtime.imprint.gen',
  ]);

  expectServices('plugins/plugin-items.js', [
    'runtime.items.api',
    'runtime.items.create',
    'runtime.items.apply',
    'runtime.items.show',
    'runtime.items.catalog',
  ]);

  expectServices('plugins/plugin-arcos.js', [
    'runtime.arc.api',
    'runtime.arc.show',
    'runtime.arc.try_generate',
    'runtime.arc.on_mission_resolved',
  ]);

  expectServices('plugins/plugin-npcs.js', [
    'runtime.npc.api',
    'runtime.npc.dialogue',
    'runtime.npc.interact',
    'runtime.npc.observe',
    'runtime.npc.gen_mission',
    'runtime.npc.combat_stats',
    'runtime.npc.check_twists',
    'runtime.npc.despair',
  ]);

  expectServices('plugins/plugin-tacticas.js', [
    'runtime.tactics.api',
    'runtime.player.rest',
    'runtime.player.tactic',
    'runtime.tactics.consume_stamina',
    'runtime.tactics.calc_wound',
    'runtime.tactics.wound_meta',
    'runtime.tactics.apply_element',
    'runtime.tactics.get_sup',
    'runtime.tactics.reaction_meta',
    'runtime.tactics.climate_reac_mult',
    'runtime.tactics.apply_reaction',
    'runtime.tactics.update_surface',
    'runtime.tactics.element_color',
    'runtime.tactics.apply_poise_dmg',
  ]);

  expectServices('plugins/plugin-xp.js', [
    'runtime.xp.api',
    'runtime.xp.read',
    'runtime.xp.assign',
    'runtime.xp.show_attrs',
    'runtime.xp.show_exp',
    'runtime.xp.gain',
    'runtime.xp.init',
    'runtime.xp.load',
    'runtime.xp.state',
  ]);

  expectServices('plugins/plugin-world-ai.js', [
    'runtime.world_ai.api',
    'runtime.world_ai.tick',
  ]);

  expectServices('plugins/plugin-habilidades.js', [
    'runtime.combat.enemy.use_habilidad',
    'runtime.combat.enemy.tick_habilidad_buffs',
  ]);

  expectServices('plugins/plugin-magias.js', [
    'runtime.combat.enemy.cast_magia',
  ]);
})();

console.log('OK domain_runtime_contract_smoke');
