#!/usr/bin/env node
'use strict';

const fs = require('fs');
const assert = require('assert');

const PLUGINS = fs.readdirSync('plugins')
  .filter((file) => /^plugin-.*\.js$/.test(file))
  .map((file) => `plugins/${file}`)
  .sort();

const FORBIDDEN = [
  /\bPlayer\b/,
  /\bWorld\b/,
  /\bGS\b/,
  /\bClock\b/,
  /\bOut\b/,
  /\brefreshStatus\b/,
  /\bRunMem\b/,
  /(?<!runtime\.game\.)\bsave\s*\(/,
  /gameplay\./,
];

for(const file of PLUGINS) {
  const src = fs.readFileSync(file, 'utf8');
  for(const re of FORBIDDEN) {
    assert.strictEqual(re.test(src), false, `${file} no debe depender de ${re}`);
  }
}

console.log('OK plugins_no_globals_smoke');
