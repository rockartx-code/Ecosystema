#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASELINE_PATH = path.join('tests', 'fixtures', 'architecture_guard_baseline.json');
const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

const TOKENS = baseline.forbidden_globals || ['Net', 'XP', 'Tactics', 'RunMem'];

function countToken(content, token) {
  const re = new RegExp(`\\b${token}\\.`, 'g');
  const m = content.match(re);
  return m ? m.length : 0;
}

function currentCounts() {
  const out = {};
  const files = fs.readdirSync('plugins').filter(f => f.endsWith('.js')).map(f => path.join('plugins', f));
  files.forEach((file) => {
    const src = fs.readFileSync(file, 'utf8');
    const row = {};
    TOKENS.forEach((token) => {
      const c = countToken(src, token);
      if(c > 0) row[token] = c;
    });
    if(Object.keys(row).length) out[file] = row;
  });
  return out;
}

(function guardNoNewLegacyCoupling() {
  const current = currentCounts();
  const allowed = baseline.counts || {};

  Object.entries(current).forEach(([file, counters]) => {
    Object.entries(counters).forEach(([token, count]) => {
      const maxAllowed = Number(allowed[file]?.[token] || 0);
      assert.ok(
        count <= maxAllowed,
        `Acoplamiento legacy creció: ${file} usa ${token}. ${count} > baseline ${maxAllowed}`,
      );
    });
  });
})();

console.log('OK architecture_guard_smoke');
