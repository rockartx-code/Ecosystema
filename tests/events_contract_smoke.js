#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function parseVersionFromEventsDoc() {
  const src = fs.readFileSync('docs/events.md', 'utf8');
  const m = src.match(/Version:\s*\*\*(\d+\.\d+\.\d+)\*\*/);
  return m ? m[1] : null;
}

function parseRuntimeEventsVersion() {
  const src = fs.readFileSync('core/main.js', 'utf8');
  const m = src.match(/eventsVersion:\s*'([^']+)'/);
  return m ? m[1] : null;
}

function semverCmp(a, b) {
  const A = a.split('.').map(n => Number(n) || 0);
  const B = b.split('.').map(n => Number(n) || 0);
  for(let i = 0; i < 3; i++) { if(A[i] > B[i]) return 1; if(A[i] < B[i]) return -1; }
  return 0;
}

function satisfies(version, req) {
  if(!req || req === '*') return true;
  if(req.startsWith('^')) {
    const base = req.slice(1);
    const [maj] = base.split('.').map(n => Number(n) || 0);
    const upper = `${maj + 1}.0.0`;
    return semverCmp(version, base) >= 0 && semverCmp(version, upper) < 0;
  }
  return semverCmp(version, req) === 0;
}

function validatePluginEventRequires(pluginDef, eventsVersion) {
  const req = pluginDef?.requires?.events || {};
  return Object.values(req).every(range => satisfies(eventsVersion, String(range || '*')));
}

(function testRuntimeAndDocsVersionSync() {
  const docsVersion = parseVersionFromEventsDoc();
  const runtimeVersion = parseRuntimeEventsVersion();
  assert.ok(docsVersion, 'docs/events.md debe declarar versión');
  assert.ok(runtimeVersion, 'core/main.js debe exponer eventsVersion');
  assert.strictEqual(runtimeVersion, docsVersion, 'runtime eventsVersion debe coincidir con docs/events.md');
})();

(function testPluginEventCompatibilityScenarios() {
  const eventsVersion = parseVersionFromEventsDoc();

  const pluginOk = {
    id:'plugin:test_ok',
    version:'1.0.0',
    requires: { events: { 'combat:resolve_habilidad': '^0.1.0' } },
  };
  const pluginBad = {
    id:'plugin:test_bad',
    version:'1.0.0',
    requires: { events: { 'combat:resolve_habilidad': '^0.2.0' } },
  };

  assert.strictEqual(validatePluginEventRequires(pluginOk, eventsVersion), true);
  assert.strictEqual(validatePluginEventRequires(pluginBad, eventsVersion), false);
})();

(function testPluginLoaderRequiresEventsCompatibility() {
  const coreSrc = fs.readFileSync('core/core.js', 'utf8') + '\n;globalThis.__core = { PluginLoader, EventBus };';
  const sandbox = { console, CTX:{ runtime:{ eventsVersion:'0.1.0' } }, globalThis:null };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(coreSrc, sandbox, { filename:'core/core.js' });
  const { PluginLoader, EventBus } = sandbox.__core;

  EventBus.defineEvent('combat:resolve_habilidad', { kind:'query' });
  PluginLoader.setEventsVersion('0.1.0');

  const ok = PluginLoader.register({
    id:'plugin:events_ok',
    version:'1.0.0',
    requires:{ events:{ 'combat:resolve_habilidad':'^0.1.0' } },
  });
  const bad = PluginLoader.register({
    id:'plugin:events_bad',
    version:'1.0.0',
    requires:{ events:{ 'combat:resolve_habilidad':'^0.2.0' } },
  });

  assert.strictEqual(ok, true, 'plugin compatible con eventsVersion debe cargar');
  assert.strictEqual(bad, false, 'plugin incompatible con eventsVersion no debe cargar');
})();

console.log('OK events_contract_smoke');
