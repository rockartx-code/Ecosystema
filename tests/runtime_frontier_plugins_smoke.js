#!/usr/bin/env node
'use strict';

const fs = require('fs');
const assert = require('assert');

const FORBIDDEN = [
  /\bPlayer\./g,
  /\bWorld\./g,
  /\bGS\./g,
  /\bClock\./g,
  /\bOut\./g,
  /\brefreshStatus\(/g,
  /\bsave\(/g,
];

const TARGETS = fs.readdirSync('plugins')
  .filter((file) => /^plugin-.*\.js$/.test(file))
  .map((file) => `plugins/${file}`)
  .sort();

for(const file of TARGETS) {
  const src = fs.readFileSync(file, 'utf8');
  FORBIDDEN.forEach((pattern) => {
    const matches = src.match(pattern);
    assert.strictEqual(
      matches ? matches.length : 0,
      0,
      `${file} no debe usar frontera legacy directa: ${pattern}`,
    );
  });
}

console.log('OK runtime_frontier_plugins_smoke');
