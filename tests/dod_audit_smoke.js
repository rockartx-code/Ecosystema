#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, 'docs', 'dod-audit-report.md');
const TOKENS_DOD1 = ['Net', 'XP', 'Tactics', 'ArcEngine', 'FactionSystem'];
const TOKENS_DOD2 = ['Net', 'XP', 'Tactics', 'RunMem'];

const criticalPlugins = [
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

function scanFile(file, tokens) {
  const src = fs.readFileSync(file, 'utf8');
  const out = {};
  tokens.forEach((t) => {
    const c = countToken(src, t);
    if(c > 0) out[t] = c;
  });
  return out;
}

const commandsHits = scanFile('systems/commands.js', TOKENS_DOD1);
const dod1Ok = Object.keys(commandsHits).length === 0;

const pluginHits = {};
for(const file of criticalPlugins) {
  const row = scanFile(file, TOKENS_DOD2);
  if(Object.keys(row).length) pluginHits[file] = row;
}
const dod2Ok = Object.keys(pluginHits).length === 0;

const guardFiles = [
  'tests/runtime_smoke.js',
  'tests/autocomplete_precedence_smoke.js',
  'tests/plugins_critical_smoke.js',
  'tests/plugins_battle_services_smoke.js',
  'tests/plugins_memory_services_smoke.js',
  'tests/runtime_memory_services_smoke.js',
  'tests/architecture_guard_smoke.js',
  'tests/events_contract_smoke.js',
  'tests/ownership_matrix_smoke.js',
  'tests/plugins_strict_zero_smoke.js',
];
const dod3Ok = guardFiles.every((f) => fs.existsSync(path.join(ROOT, f)));

const baselinePath = path.join(ROOT, 'tests/fixtures/architecture_guard_baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const dod4Ok = baseline && baseline.scope === 'plugins' && typeof baseline.counts === 'object';

const fmt = (ok) => ok ? '✅' : '❌';
const lines = [
  '# Reporte automático DoD',
  '',
  `Fecha: ${new Date().toISOString()}`,
  '',
  '## Resultado por criterio',
  `- DoD.1 commands.js sin globals directos: ${fmt(dod1Ok)}`,
  `- DoD.2 plugins críticos vía runtime/eventbus: ${fmt(dod2Ok)}`,
  `- DoD.3 guardrails presentes: ${fmt(dod3Ok)}`,
  `- DoD.4 política plugins activa (baseline): ${fmt(dod4Ok)}`,
  '',
  '## Evidencia',
  `- systems/commands.js tokens DoD.1: ${JSON.stringify(commandsHits)}`,
  `- plugins críticos tokens DoD.2: ${JSON.stringify(pluginHits)}`,
  `- guardrails verificados por presencia: ${guardFiles.length}`,
  `- baseline: ${baselinePath}`,
  '',
];

fs.writeFileSync(REPORT_PATH, lines.join('\n'));
console.log('OK dod_audit_smoke');
