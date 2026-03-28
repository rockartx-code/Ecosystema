#!/usr/bin/env node
'use strict';

const fs = require('fs');
const assert = require('assert');

const TOKENS = ['Net', 'XP', 'Tactics', 'RunMem'];
const CRITICAL_PLUGINS = [
  'plugins/plugin-habilidades.js',
  'plugins/plugin-magias.js',
  'plugins/plugin-criaturas.js',
  'plugins/plugin-facciones.js',
  'plugins/plugin-guarida.js',
  'plugins/plugin-sombra-herrante.js',
];

function countToken(content, token) {
  const re = new RegExp(`\\b${token}\\.`, 'g');
  const m = content.match(re);
  return m ? m.length : 0;
}

for(const file of CRITICAL_PLUGINS) {
  const src = fs.readFileSync(file, 'utf8');
  TOKENS.forEach((token) => {
    const count = countToken(src, token);
    assert.strictEqual(
      count,
      0,
      `Acoplamiento prohibido en plugin crítico: ${file} usa ${token}.${count > 0 ? ` (${count})` : ''}`,
    );
  });
}

console.log('OK plugins_strict_zero_smoke');
