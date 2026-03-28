#!/usr/bin/env node
'use strict';

const fs = require('fs');
const assert = require('assert');

const SRC = fs.readFileSync('docs/eda-audit.md', 'utf8');

function parseMatrix() {
  const m = SRC.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(m, 'docs/eda-audit.md debe incluir bloque JSON');
  return JSON.parse(m[1]);
}

(function testOwnershipMatrixFilesExist() {
  const data = parseMatrix();
  assert.ok(Array.isArray(data.domains) && data.domains.length > 0, 'matrix sin domains');

  data.domains.forEach((d) => {
    (d.systems || []).forEach((file) => assert.ok(fs.existsSync(file), `system inexistente en matrix: ${file}`));
    (d.plugins || []).forEach((file) => assert.ok(fs.existsSync(file), `plugin inexistente en matrix: ${file}`));
  });
})();

(function testEachDomainDeclaresContracts() {
  const data = parseMatrix();
  data.domains.forEach((d) => {
    assert.ok(Array.isArray(d.contracts) && d.contracts.length > 0, `domain sin contracts: ${d.name}`);
  });
})();

console.log('OK ownership_matrix_smoke');
