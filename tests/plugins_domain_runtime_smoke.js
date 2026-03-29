#!/usr/bin/env node
'use strict';

const fs = require('fs');
const assert = require('assert');

function read(file) { return fs.readFileSync(file, 'utf8'); }

function expectIncludes(file, checks) {
  const src = read(file);
  checks.forEach(({ needle, message }) => {
    assert.ok(src.includes(needle), message || `${file} debe usar ${needle}`);
  });
  return src;
}

(function testSombraHerranteUsesDomainRuntimeServices() {
  expectIncludes('plugins/plugin-sombra-herrante.js', [
    { needle: 'runtime.player.current', message: 'plugin-sombra-herrante debe usar runtime.player.current' },
    { needle: 'runtime.world.node', message: 'plugin-sombra-herrante debe usar runtime.world.node' },
    { needle: 'runtime.clock.current', message: 'plugin-sombra-herrante debe usar runtime.clock.current' },
    { needle: 'runtime.battle.start', message: 'plugin-sombra-herrante debe usar runtime.battle.start' },
  ]);
})();

(function testReinoPesadillaUsesRuntimeOnlyBattleWorldServices() {
  const src = expectIncludes('plugins/plugin-reino-pesadilla.js', [
    { needle: 'runtime.world.expand_section', message: 'plugin-reino-pesadilla debe usar runtime.world.expand_section' },
    { needle: 'runtime.player.set_position', message: 'plugin-reino-pesadilla debe usar runtime.player.set_position' },
    { needle: 'runtime.battle.start', message: 'plugin-reino-pesadilla debe usar runtime.battle.start' },
    { needle: 'runtime.world.enter_node', message: 'plugin-reino-pesadilla debe usar runtime.world.enter_node' },
  ]);
  assert.strictEqual(src.includes('gameplay.battle.start'), false, 'plugin-reino-pesadilla no debe depender de gameplay.battle.start');
  assert.strictEqual(src.includes('gameplay.combat.action'), false, 'plugin-reino-pesadilla no debe depender de gameplay.combat.action');
})();

(function testRuntimeOnlyPluginsUseRuntimeDomainServices() {
  const cultos = expectIncludes('plugins/plugin-cultos.js', [
    { needle: 'runtime.gs.all_npcs', message: 'plugin-cultos debe usar runtime.gs.all_npcs' },
    { needle: 'runtime.clock.current', message: 'plugin-cultos debe usar runtime.clock.current' },
    { needle: 'runtime.battle.start', message: 'plugin-cultos debe usar runtime.battle.start' },
  ]);
  const concentracion = expectIncludes('plugins/plugin-concentracion.js', [
    { needle: 'runtime.clock.tick', message: 'plugin-concentracion debe usar runtime.clock.tick' },
    { needle: 'runtime.battle.current', message: 'plugin-concentracion debe usar runtime.battle.current' },
    { needle: 'runtime.battle.action', message: 'plugin-concentracion debe usar runtime.battle.action' },
  ]);
  assert.strictEqual(concentracion.includes('gameplay.combat.action'), false, 'plugin-concentracion no debe depender de gameplay.combat.action');

  expectIncludes('plugins/plugin-facciones.js', [
    { needle: 'runtime.world.all', message: 'plugin-facciones debe usar runtime.world.all' },
    { needle: 'runtime.gs.npcs_in_node', message: 'plugin-facciones debe usar runtime.gs.npcs_in_node' },
    { needle: 'runtime.items.create', message: 'plugin-facciones debe usar runtime.items.create' },
  ]);

  expectIncludes('plugins/plugin-arbol-vida.js', [
    { needle: 'runtime.player.current', message: 'plugin-arbol-vida debe usar runtime.player.current' },
    { needle: 'runtime.world.node', message: 'plugin-arbol-vida debe usar runtime.world.node' },
    { needle: 'runtime.game.save', message: 'plugin-arbol-vida debe usar runtime.game.save' },
  ]);

  expectIncludes('plugins/plugin-transformaciones.js', [
    { needle: 'runtime.player.recalc_resonances', message: 'plugin-transformaciones debe usar runtime.player.recalc_resonances' },
    { needle: 'runtime.xp.gain', message: 'plugin-transformaciones debe usar runtime.xp.gain' },
    { needle: 'runtime.game.save', message: 'plugin-transformaciones debe usar runtime.game.save' },
  ]);

  expectIncludes('plugins/plugin-ia-batalla.js', [
    { needle: 'runtime.combat.enemy.use_habilidad', message: 'plugin-ia-batalla debe usar runtime.combat.enemy.use_habilidad' },
    { needle: 'runtime.combat.enemy.cast_magia', message: 'plugin-ia-batalla debe usar runtime.combat.enemy.cast_magia' },
    { needle: 'runtime.tactics.get_sup', message: 'plugin-ia-batalla debe usar runtime.tactics.get_sup' },
  ]);

  expectIncludes('plugins/plugin-bosses.js', [
    { needle: 'runtime.world.all', message: 'plugin-bosses debe usar runtime.world.all' },
    { needle: 'runtime.battle.start', message: 'plugin-bosses debe usar runtime.battle.start' },
    { needle: 'runtime.gs.add_twist', message: 'plugin-bosses debe usar runtime.gs.add_twist' },
  ]);

  expectIncludes('plugins/plugin-invocaciones.js', [
    { needle: 'runtime.memory.data.get', message: 'plugin-invocaciones debe usar runtime.memory.data.get' },
    { needle: 'runtime.battle.current', message: 'plugin-invocaciones debe usar runtime.battle.current' },
    { needle: 'runtime.player.add_item', message: 'plugin-invocaciones debe usar runtime.player.add_item' },
  ]);

  expectIncludes('plugins/plugin-tricksters.js', [
    { needle: 'runtime.battle.start', message: 'plugin-tricksters debe usar runtime.battle.start' },
    { needle: 'runtime.player.add_item', message: 'plugin-tricksters debe usar runtime.player.add_item' },
    { needle: 'runtime.player.current', message: 'plugin-tricksters debe usar runtime.player.current' },
  ]);
})();

console.log('OK plugins_domain_runtime_smoke');
