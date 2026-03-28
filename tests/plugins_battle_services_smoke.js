#!/usr/bin/env node
'use strict';

const fs = require('fs');
const assert = require('assert');

function read(file) { return fs.readFileSync(file, 'utf8'); }

(function testPluginFaccionesUsesServiceBattleStart() {
  const src = read('plugins/plugin-facciones.js');
  assert.ok(src.includes("ServiceRegistry.get('runtime.battle.start')") || src.includes('ServiceRegistry?.get?.(\'runtime.battle.start\')'), 'plugin-facciones debe usar runtime.battle.start');
})();

(function testPluginCriaturasUsesServiceBattleStartAndEscape() {
  const src = read('plugins/plugin-criaturas.js');
  assert.ok(src.includes("ServiceRegistry?.get?.('runtime.battle.start')"), 'plugin-criaturas debe usar runtime.battle.start');
  assert.ok(src.includes("ServiceRegistry?.get?.('runtime.battle.escape')"), 'plugin-criaturas debe usar runtime.battle.escape');

  const directStart = (src.match(/\bNet\.startBattle\s*\(/g) || []).length;
  const directAction = (src.match(/\bNet\.sendBattleAction\s*\(/g) || []).length;

  // Se permite fallback legacy único mientras migra el ecosistema.
  assert.ok(directStart <= 1, `demasiados fallback Net.startBattle: ${directStart}`);
  assert.ok(directAction <= 1, `demasiados fallback Net.sendBattleAction: ${directAction}`);
})();

console.log('OK plugins_battle_services_smoke');
