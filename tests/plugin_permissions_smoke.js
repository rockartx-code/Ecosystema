#!/usr/bin/env node
'use strict';

// ════════════════════════════════════════════════════════════════
// FUNCIONAL — ISP (Interface Segregation) en CTX (A5 audit)
//
// Valida que PluginLoader puede filtrar la vista de CTX que reciben
// los handlers segun def.permissions. Tres politicas:
//   - 'off'    : sin filtro (backward compat, default).
//   - 'warn'   : loggea cualquier acceso no declarado y deja pasar.
//   - 'strict' : devuelve undefined para accesos no declarados.
//
// Plugins sin permissions reciben ctx completo siempre, en cualquier
// politica. Solo plugins que opt-in via def.permissions ven el filtro.
// ════════════════════════════════════════════════════════════════

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function loadCore() {
  const src = fs.readFileSync('core/core.js', 'utf8') +
    '\n;globalThis.EventBus = EventBus; globalThis.ServiceRegistry = ServiceRegistry; globalThis.PluginLoader = PluginLoader; globalThis.CommandRegistry = CommandRegistry; globalThis.ModuleLoader = ModuleLoader;';
  const sandbox = {
    console, document: { getElementById: ()=>null, createElement: ()=>({ className:'', id:'', innerHTML:'', appendChild(){}, querySelector(){return null;}, remove(){} }) },
    CTX: {}, Player: { get: ()=>({}) },
    globalThis: null,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename:'core/core.js' });
  return sandbox;
}

function buildFakeCtx() {
  return {
    U: { uid: () => 'UID' },
    EventBus: { emit: () => null, on: () => null },
    D: { enemies: [] },
    secretGlobal: 'no-debe-filtrarse',
    Out: { line: () => null },
    runtime: {
      version: '2.1.0',
      eventsVersion: '0.1.0',
      events: {},
      modules: {},
      plugins: {},
      commands: {},
      services: {},
      data: { get: () => null },
      player: { current: () => ({ id:'p1' }) },
      world: { node: () => null },
      clock: { current: () => ({ cycle: 1 }) },
      output: { line: () => null },
      status: { refresh: () => null },
    },
  };
}

(function testNoPermissionsDeliversFullCtx() {
  const sb = loadCore();
  const ctx = buildFakeCtx();
  let received = null;
  const def = {
    id: 'plugin:no-perms',
    hooks: { 't:noperms': { fn: (p, c) => { received = c; return p; } } },
  };
  sb.PluginLoader.register(def);
  sb.EventBus._listeners['t:noperms'].forEach(l => l.handler({ ok:true }, ctx));
  assert.strictEqual(received, ctx, 'sin permissions debe entregar ctx tal cual');
  assert.strictEqual(received.secretGlobal, 'no-debe-filtrarse');
  assert.strictEqual(received.runtime.player.current().id, 'p1');
})();

(function testPermissionsButPolicyOffDeliversFullCtx() {
  const sb = loadCore();
  sb.PluginLoader.setPermissionsPolicy('off');
  const ctx = buildFakeCtx();
  let received = null;
  const def = {
    id: 'plugin:perms-off',
    permissions: { allow: ['U'], runtime: ['player'] },
    hooks: { 't:permsoff': { fn: (p, c) => { received = c; return p; } } },
  };
  sb.PluginLoader.register(def);
  sb.EventBus._listeners['t:permsoff'].forEach(l => l.handler({ ok:true }, ctx));
  assert.strictEqual(received.secretGlobal, 'no-debe-filtrarse', 'policy off bypasea el filtro');
  assert.strictEqual(received.runtime.world.node(), null);
})();

(function testStrictModeFiltersUndeclaredAccess() {
  const sb = loadCore();
  sb.PluginLoader.setPermissionsPolicy('strict');
  const ctx = buildFakeCtx();
  let received = null;
  const def = {
    id: 'plugin:strict',
    permissions: { allow: ['U', 'D'], runtime: ['player'] },
    hooks: { 't:strict': { fn: (p, c) => { received = c; return p; } } },
  };
  sb.PluginLoader.register(def);
  sb.EventBus._listeners['t:strict'].forEach(l => l.handler({ ok:true }, ctx));

  // Allowed
  assert.ok(received.U, 'U declarado debe estar disponible');
  assert.ok(received.D, 'D declarado debe estar disponible');
  assert.ok(received.runtime.player, 'runtime.player declarado debe estar disponible');

  // Metadata always available
  assert.strictEqual(received.runtime.version, '2.1.0', 'runtime.version siempre disponible');
  assert.strictEqual(received.runtime.eventsVersion, '0.1.0');
  assert.ok(received.runtime.services, 'runtime.services (ServiceRegistry) siempre disponible');

  // Undeclared
  assert.strictEqual(received.secretGlobal, undefined, 'top-level no declarado debe quedar undefined');
  assert.strictEqual(received.Out, undefined, 'Out no declarado debe quedar undefined');
  assert.strictEqual(received.runtime.world, undefined, 'runtime.world no declarado debe quedar undefined');
  assert.strictEqual(received.runtime.clock, undefined, 'runtime.clock no declarado debe quedar undefined');
})();

(function testWarnModeLogsButPassesValue() {
  const sb = loadCore();
  sb.PluginLoader.setPermissionsPolicy('warn');
  const ctx = buildFakeCtx();
  let received = null;
  const def = {
    id: 'plugin:warn',
    permissions: { allow: ['U'], runtime: ['player'] },
    hooks: { 't:warn': { fn: (p, c) => { received = c; return p; } } },
  };
  sb.PluginLoader.register(def);

  const warnings = [];
  const prevWarn = console.warn;
  console.warn = (msg) => warnings.push(String(msg || ''));
  try {
    sb.EventBus._listeners['t:warn'].forEach(l => l.handler({ ok:true }, ctx));
    // Acceder a propiedades no declaradas → warn pero el valor pasa
    const value = received.Out;
    const value2 = received.runtime.world;
    assert.ok(value, 'warn mode: valor undeclared se devuelve igual');
    assert.ok(value2, 'warn mode: runtime undeclared se devuelve igual');
  } finally {
    console.warn = prevWarn;
  }

  assert.ok(warnings.some(w => w.includes('plugin:warn') && w.includes('Out')), 'warn debio loggear acceso a Out');
  assert.ok(warnings.some(w => w.includes('runtime.world')), 'warn debio loggear acceso a runtime.world');
})();

(function testCommandHandlerAlsoFiltered() {
  const sb = loadCore();
  sb.PluginLoader.setPermissionsPolicy('strict');
  const ctx = buildFakeCtx();
  let received = null;
  const def = {
    id: 'plugin:cmd',
    permissions: { allow: ['U'], runtime: ['player'] },
    comandos: {
      'mycmd': { fn: (args, c) => { received = c; return true; } },
    },
  };
  sb.PluginLoader.register(def);
  // El handler registrado en CommandRegistry recibe ctx via EventBus's CTX,
  // pero en el sandbox CTX es un objeto vacio. Llamamos directo al handler:
  const cmd = sb.CommandRegistry.resolve('mycmd');
  assert.ok(cmd, 'comando registrado');
  cmd.handler([], ctx);
  assert.strictEqual(received.secretGlobal, undefined, 'cmd handler tambien filtra ctx');
  assert.ok(received.U, 'cmd handler ve lo declarado');
})();

(function testPolicySwitchTakesEffectImmediately() {
  const sb = loadCore();
  sb.PluginLoader.setPermissionsPolicy('off');
  const ctx = buildFakeCtx();
  let received = null;
  const def = {
    id: 'plugin:switch',
    permissions: { allow: ['U'], runtime: ['player'] },
    hooks: { 't:switch': { fn: (p, c) => { received = c; return p; } } },
  };
  sb.PluginLoader.register(def);

  // Off: ctx completo
  sb.EventBus._listeners['t:switch'].forEach(l => l.handler({ ok:true }, ctx));
  assert.strictEqual(received.secretGlobal, 'no-debe-filtrarse');

  // Cambio a strict: misma def, nuevo dispatch, ctx filtrado
  sb.PluginLoader.setPermissionsPolicy('strict');
  sb.EventBus._listeners['t:switch'].forEach(l => l.handler({ ok:true }, ctx));
  assert.strictEqual(received.secretGlobal, undefined, 'cambio de politica debe aplicar al siguiente dispatch');
})();

console.log('OK plugin_permissions_smoke');
