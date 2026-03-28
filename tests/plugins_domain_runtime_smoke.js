#!/usr/bin/env node
'use strict';

const fs = require('fs');
const assert = require('assert');

function read(file) { return fs.readFileSync(file, 'utf8'); }

(function testSombraHerranteUsesDomainRuntimeServices() {
  const src = read('plugins/plugin-sombra-herrante.js');
  assert.ok(src.includes("runtime.player.current"), 'plugin-sombra-herrante debe usar runtime.player.current');
  assert.ok(src.includes("runtime.world.node"), 'plugin-sombra-herrante debe usar runtime.world.node');
  assert.ok(src.includes("runtime.clock.current"), 'plugin-sombra-herrante debe usar runtime.clock.current');
})();

(function testReinoPesadillaUsesRuntimeOnlyBattleWorldServices() {
  const src = read('plugins/plugin-reino-pesadilla.js');
  assert.ok(src.includes("runtime.world.expand_section"), 'plugin-reino-pesadilla debe usar runtime.world.expand_section');
  assert.ok(src.includes("runtime.player.set_position"), 'plugin-reino-pesadilla debe usar runtime.player.set_position');
  assert.strictEqual(src.includes('gameplay.battle.start'), false, 'plugin-reino-pesadilla no debe depender de gameplay.battle.start');
  assert.strictEqual(src.includes('gameplay.combat.action'), false, 'plugin-reino-pesadilla no debe depender de gameplay.combat.action');
})();

(function testCultosAndConcentracionUseRuntimeDomainServices() {
  const cultos = read('plugins/plugin-cultos.js');
  const concentracion = read('plugins/plugin-concentracion.js');
  assert.ok(cultos.includes("runtime.gs.all_npcs"), 'plugin-cultos debe usar runtime.gs.all_npcs');
  assert.ok(cultos.includes("runtime.clock.current"), 'plugin-cultos debe usar runtime.clock.current');
  assert.ok(concentracion.includes("runtime.clock.tick"), 'plugin-concentracion debe usar runtime.clock.tick');
  assert.strictEqual(concentracion.includes('gameplay.combat.action'), false, 'plugin-concentracion no debe depender de gameplay.combat.action');
})();

console.log('OK plugins_domain_runtime_smoke');
