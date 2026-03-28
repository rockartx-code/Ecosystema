#!/usr/bin/env node
'use strict';

const fs = require('fs');
const assert = require('assert');

function read(file) { return fs.readFileSync(file, 'utf8'); }

(function testPluginGuaridaUsesRuntimeMemoryServices() {
  const src = read('plugins/plugin-guarida.js');
  assert.ok(src.includes("runtime.memory.data.get"), 'plugin-guarida debe usar runtime.memory.data.get');
  assert.ok(src.includes("runtime.memory.data.set"), 'plugin-guarida debe usar runtime.memory.data.set');
  assert.ok(src.includes("runtime.memory.save"), 'plugin-guarida debe usar runtime.memory.save');
})();

(function testPluginSombraUsesRuntimeMemoryServices() {
  const src = read('plugins/plugin-sombra-herrante.js');
  assert.ok(src.includes("runtime.memory.runs"), 'plugin-sombra-herrante debe usar runtime.memory.runs');
})();

console.log('OK plugins_memory_services_smoke');
