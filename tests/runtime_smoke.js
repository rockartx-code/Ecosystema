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

(function testPluginLoaderSemverAdvancedRanges() {
  const { PluginLoader } = loadCore();
  const base = { id:'plugin:semver_base', version:'1.4.2' };
  assert.strictEqual(PluginLoader.register(base), true);

  const okCaret = { id:'plugin:semver_caret', version:'1.0.0', requires:{ plugins:['plugin:semver_base ^1.4.0'] } };
  const okTilde = { id:'plugin:semver_tilde', version:'1.0.0', requires:{ plugins:['plugin:semver_base ~1.4.0'] } };
  const okOr = { id:'plugin:semver_or', version:'1.0.0', requires:{ plugins:['plugin:semver_base ^2.0.0 || ^1.4.0'] } };
  const badOr = { id:'plugin:semver_or_bad', version:'1.0.0', requires:{ plugins:['plugin:semver_base ^2.0.0 || ~1.5.0'] } };

  assert.strictEqual(PluginLoader.register(okCaret), true);
  assert.strictEqual(PluginLoader.register(okTilde), true);
  assert.strictEqual(PluginLoader.register(okOr), true);
  assert.strictEqual(PluginLoader.register(badOr), false);
})();

(function testPluginLoaderServiceDependencyOrderAndCycleDiagnostics() {
  const { PluginLoader } = loadCore();
  const defs = [
    { id:'plugin:consumer', version:'1.0.0', requires:{ services:['svc.dynamic'] } },
    { id:'plugin:provider', version:'1.0.0', services:{ 'svc.dynamic': ()=>true } },
  ];
  const loaded = PluginLoader.registerMany(defs);
  assert.strictEqual(loaded, 2);
  assert.deepStrictEqual(Array.from(PluginLoader.lastBatchOrder()), ['plugin:provider', 'plugin:consumer']);

  const cycDefs = [
    { id:'plugin:cyc_a', version:'1.0.0', requires:{ services:['svc.cyc_b'] }, services:{ 'svc.cyc_a': ()=>true } },
    { id:'plugin:cyc_b', version:'1.0.0', requires:{ services:['svc.cyc_a'] }, services:{ 'svc.cyc_b': ()=>true } },
  ];
  const loadedCyc = PluginLoader.registerMany(cycDefs);
  assert.strictEqual(loadedCyc, 0);
  const pending = PluginLoader.pending();
  assert.strictEqual(pending.length, 2);
  assert.ok(pending.every(p => (p.errors || []).some(e => String(e).includes('Posible ciclo de dependencias'))));
})();

(function testEventBusValidationPolicyAndRealEventChecks() {
  const { EventBus } = loadCore();
  const warnings = [];
  const prevWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(' '));

  try {
    EventBus.defineEvent('output:line', {
      validateIn: (p)=> !!p && typeof p.text === 'string',
      validateOut: (p)=> !!p && typeof p.text === 'string',
    });
    EventBus.on('output:line', (p)=>p, 'p:test');

    EventBus.setValidationPolicy('dev');
    EventBus.emit('output:line', { text: 123 });
    assert.ok(warnings.some(w => w.includes('validateIn(output:line)')), 'dev policy debe advertir validación');

    EventBus.setValidationPolicy('strict');
    assert.throws(() => EventBus.emit('output:line', { text: 123 }), /validateIn\(output:line\)/);

    EventBus.defineEvent('world:tick', {
      validateIn: (p)=> !!p && typeof p.cycle === 'number',
      validateOut: (p)=> !!p && typeof p.cycle === 'number',
    });
    EventBus.on('world:tick', (p)=>({ ...p, cycle: 'invalid' }), 'p:bad_out');
    assert.throws(() => EventBus.emit('world:tick', { cycle: 1 }), /validateOut\(world:tick\)/);

    EventBus.setValidationPolicy('prod');
    const out = EventBus.emit('world:tick', { cycle: 2 });
    assert.strictEqual(out.cycle, 'invalid');
  } finally {
    EventBus.setValidationPolicy('dev');
    console.warn = prevWarn;
  }
})();

(function testEventBusListenerTimeoutAndHealth() {
  const { EventBus } = loadCore();
  const busyWait = (ms) => { const t = Date.now(); while(Date.now() - t < ms){} };

  EventBus.on('t:slow_warn', (p)=>{ busyWait(3); return p; }, 'p:slow_warn', { timeoutMs:1, onTimeout:'warn' });
  const outWarn = EventBus.emit('t:slow_warn', { ok:true });
  assert.strictEqual(outWarn.ok, true);

  EventBus.on('t:slow_cancel', (p)=>{ busyWait(3); return p; }, 'p:slow_cancel', { timeoutMs:1, onTimeout:'cancel' });
  const outCancel = EventBus.emit('t:slow_cancel', { ok:true });
  assert.strictEqual(outCancel.cancelled, true);

  EventBus.on('t:slow_error', (p)=>{ busyWait(3); return p; }, 'p:slow_error', { timeoutMs:1, onTimeout:'error' });
  const outError = EventBus.emit('t:slow_error', { ok:true });
  assert.strictEqual(outError.ok, true);

  const hWarn = EventBus.health('p:slow_warn');
  const hCancel = EventBus.health('p:slow_cancel');
  const hError = EventBus.health('p:slow_error');
  assert.ok(hWarn && hWarn.timeouts >= 1);
  assert.ok(hCancel && hCancel.timeouts >= 1);
  assert.ok(hError && hError.errors >= 1);
})();

console.log('OK runtime_smoke');
