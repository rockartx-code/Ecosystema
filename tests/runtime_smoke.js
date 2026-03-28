#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function loadCore() {
  const src = fs.readFileSync('core/core.js', 'utf8') + '\n;globalThis.__core = { EventBus, ServiceRegistry, PluginLoader, CommandRegistry };';
  const sandbox = {
    console,
    CTX: {},
    document: {
      getElementById: () => null,
      createElement: () => ({ className:'', id:'', innerHTML:'', appendChild(){}, querySelector(){ return null; }, remove(){} }),
    },
    Player: { get: () => ({}) },
    globalThis: null,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename:'core/core.js' });
  return sandbox.__core;
}

(function testEventBusPhasesAndTrace() {
  const { EventBus } = loadCore();
  const seq = [];
  EventBus.on('t:event', (p)=>{ seq.push('main'); return p; }, 'p:main', { phase:'main', priority:50 });
  EventBus.on('t:event', (p)=>{ seq.push('pre'); return p; }, 'p:pre', { phase:'pre', priority:50 });
  EventBus.on('t:event', (p)=>{ seq.push('post'); return p; }, 'p:post', { phase:'post', priority:50 });
  EventBus.emit('t:event', { ok:true });
  assert.deepStrictEqual(seq, ['pre', 'main', 'post']);
  const tr = EventBus.trace(3);
  assert.ok(tr.length >= 3, 'trace debe guardar ejecuciones');
})();

(function testEventBusSpecsAPI() {
  const { EventBus } = loadCore();
  EventBus.defineEvent('t:spec', {
    kind: 'query',
    validateIn:  (p)=>!!p && typeof p.a === 'number',
    validateOut: (p)=>!!p && typeof p.ok === 'boolean',
  });
  EventBus.on('t:spec', (p)=>({ ...p, ok:true }), 'p:spec');
  const out = EventBus.emit('t:spec', { a:1 });
  assert.strictEqual(out.ok, true);
  const spec = EventBus.spec('t:spec');
  assert.strictEqual(spec.kind, 'query');
})();

(function testServiceRegistryLifecycle() {
  const { ServiceRegistry } = loadCore();
  ServiceRegistry.register('x.sum', (a,b)=>a+b, { pluginId:'p:test', version:'1.0.0' });
  assert.strictEqual(ServiceRegistry.has('x.sum'), true);
  assert.strictEqual(ServiceRegistry.call('x.sum', 2, 3), 5);
  ServiceRegistry.unregisterByPlugin('p:test');
  assert.strictEqual(ServiceRegistry.has('x.sum'), false);
})();

(function testPluginLoaderDepsAndOrder() {
  const { PluginLoader, ServiceRegistry } = loadCore();
  ServiceRegistry.register('svc.core', ()=>true, { pluginId:'core' });

  const defs = [
    { id:'plugin:c', version:'1.0.0', requires:{ plugins:['plugin:b >=1.0.0'] } },
    { id:'plugin:a', version:'1.0.0', requires:{ services:['svc.core'] } },
    { id:'plugin:b', version:'1.0.0', load:{ after:['plugin:a'] } },
  ];

  const loaded = PluginLoader.registerMany(defs);
  assert.strictEqual(loaded, 3);
  const order = Array.from(PluginLoader.lastBatchOrder());
  assert.deepStrictEqual(order, ['plugin:a', 'plugin:b', 'plugin:c']);
  assert.strictEqual((PluginLoader.pending() || []).length, 0);
})();

(function testPluginLoaderRegisterFromJSONCompatibility() {
  const { PluginLoader, ServiceRegistry, CommandRegistry } = loadCore();
  ServiceRegistry.register('svc.external', ()=>true, { pluginId:'core' });

  const jsonA = {
    id:'plugin:json_a',
    nombre:'JSON A',
    version:'1.0.0',
    hooks: {
      't:json_a': { fn:'onA', priority:50, phase:'main' }
    },
    handlers: {
      onA: 'payload.ok = true; return payload;'
    }
  };
  const okA = PluginLoader.registerFromJSON(jsonA);
  assert.strictEqual(okA, true);

  const jsonB = {
    id:'plugin:json_b',
    nombre:'JSON B',
    version:'1.0.0',
    requires: { plugins:['plugin:json_a >=1.0.0'], services:['svc.external'] },
    load: { after:['plugin:json_a'] },
    comandos: {
      'json_b_ping': { fn:'cmdPing', meta:{ titulo:'json_b_ping' } }
    },
    handlers: {
      cmdPing: 'return true;'
    }
  };
  const okB = PluginLoader.registerFromJSON(jsonB);
  assert.strictEqual(okB, true);
  assert.strictEqual(CommandRegistry.has('json_b_ping'), true);

  const jsonLate = { id:'plugin:json_late', version:'1.0.0' };
  const jsonBefore = { id:'plugin:json_before', version:'1.0.0', load:{ before:['plugin:json_late'] } };
  assert.strictEqual(PluginLoader.registerFromJSON(jsonLate), true);
  assert.strictEqual(PluginLoader.registerFromJSON(jsonBefore), false);
})();

console.log('OK runtime_smoke');
