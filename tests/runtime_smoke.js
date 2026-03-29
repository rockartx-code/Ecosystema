#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
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

function loadCommandsSandbox() {
  const { EventBus, ServiceRegistry, PluginLoader, CommandRegistry } = loadCore();
  const outLines = [];
  const worldNodes = {
    n1: { id:'n1', name:'Nodo 1', tipo:'hub', estado:'calmo', atmos:'ok', exits:{ norte:'n2' }, loot:[], enemies:[], creatures:[], visitado:false, visitado_prev:false, dificultad:1, seccion:0 },
    n2: { id:'n2', name:'Nodo 2', tipo:'bosque', estado:'calmo', atmos:'ok', exits:{ norte:'n3', sur:'n1' }, loot:[], enemies:[], creatures:[], visitado:false, visitado_prev:false, dificultad:1, seccion:1 },
    n3: { id:'n3', name:'Nodo 3', tipo:'ruina', estado:'calmo', atmos:'ok', exits:{ sur:'n2' }, loot:[], enemies:[], creatures:[], visitado:false, visitado_prev:false, dificultad:1, seccion:1 },
  };
  const player = { id:'p1', name:'Tester', nodeId:'n1', flags:[], ext:{} };
  const battleStore = { current:null, sent:[], renders:0, aiTicks:0 };
  const probe = { xpAssign:0, xpAttrs:0, xpExp:0, rest:0, tactica:0 };
  const sandbox = {
    console,
    globalThis: null,
    setTimeout: (fn)=>{ fn(); return 0; },
    clearTimeout: ()=>{},
    EventBus,
    ServiceRegistry,
    PluginLoader: {
      list: () => [{ id:'plugin:a', version:'1.0.0', descripcion:'A' }],
      lastBatchOrder: () => ['plugin:a', 'plugin:b'],
      pending: () => [{ id:'plugin:pend', errors:['Falta servicio svc.x'] }],
      registerFromJSON: () => true,
    },
    CommandRegistry,
    ModuleLoader: { list: () => ['base'], get: () => ({}) },
    Out: {
      line: (text)=>{ outLines.push(String(text)); },
      sp: ()=>{},
      sep: ()=>{},
      clear: ()=>{},
    },
    Player: {
      get: ()=>player,
      pos: ()=>player.nodeId,
      setPos: (id)=>{ player.nodeId = id; },
      rename: (name)=>{ player.name = name; },
      findItem: ()=>null,
    },
    World: {
      seed: 'seed',
      sectionCount: 1,
      all: ()=>worldNodes,
      node: (id)=>worldNodes[id] || null,
      exits: (id)=>({ ...(worldNodes[id]?.exits || {}) }),
      visit: (id)=>{ if(worldNodes[id]) worldNodes[id].visitado = true; },
      isBorder: ()=>false,
      expandSection: ()=>null,
    },
    Clock: { cycle:0, tick:(n=1)=>{ sandbox.Clock.cycle += n; } },
    GS: {
      aliveNPCs: ()=>[],
      npcEnNodo: ()=>[],
      mision: ()=>null,
      allMisiones: ()=>[],
      activas: ()=>[],
    },
    U: {
      chance: ()=>false,
      clamp: (v,min,max)=>Math.max(min, Math.min(max, v)),
      rand: (a)=>a,
    },
    NPCEngine: { consecuenciaDesperación: ()=>{} },
    refreshStatus: ()=>{},
    save: ()=>{},
    localStorage: { removeItem: ()=>{} },
    init: async ()=>{},
    exportarPartida: ()=>{},
    importarPartida: ()=>{},
    Combat: { active:false },
    XP: {
      ganar: ()=>{},
      cmdAsignar: ()=>{ probe.xpAssign += 1; },
      cmdAtributos: ()=>{ probe.xpAttrs += 1; },
      cmdExperiencia: ()=>{ probe.xpExp += 1; },
      ATRIBUTOS:{},
    },
    Tactics: {
      cmdDescansar: async ()=>{ probe.rest += 1; },
      cmdTactica: ()=>{ probe.tactica += 1; },
    },
    Net: {
      isClient: ()=>false,
      sendAction: ()=>{},
      getMyBattle: ()=>battleStore.current,
      getBattleActor: (b)=>b?.cola?.[b.turno || 0] || null,
      renderBattle: ()=>{ battleStore.renders += 1; },
      sendBattleAction: (battleId, playerId, action, payload)=>{ battleStore.sent.push({ battleId, playerId, action, payload }); },
      tickAI: ()=>{ battleStore.aiTicks += 1; },
      battles: {},
      joinBattle: ()=>{},
      connect: async ()=>{},
      host: async ()=>{},
      acceptConexion: async ()=>{},
      disconnect: ()=>{},
      cmdJugadores: ()=>{},
      playersEnNodo: ()=>[],
      getPlayers: ()=>({}),
      isOnline: ()=>false,
      getTrade: ()=>null,
      initTrade: ()=>{},
      sendTradeMsg: ()=>{},
      renderTrade: ()=>{},
      handleTradeMsg: ()=>{},
    },
    D: {},
    __battleStore: battleStore,
    __probe: probe,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const src = fs.readFileSync('systems/commands.js', 'utf8');
  vm.runInContext(src, sandbox, { filename:'systems/commands.js' });
  sandbox.ServiceRegistry.register('runtime.xp.api', () => sandbox.XP, { pluginId:'test', version:'0.0.1' });
  sandbox.ServiceRegistry.register('runtime.tactics.api', () => sandbox.Tactics, { pluginId:'test', version:'0.0.1' });
  return { sandbox, outLines };
}

function withCapturedConsole(fn) {
  const logs = { warn: [], error: [] };
  const prevWarn = console.warn;
  const prevError = console.error;
  console.warn = (...args) => logs.warn.push(args.map(String).join(' '));
  console.error = (...args) => logs.error.push(args.map(String).join(' '));
  try {
    return fn(logs);
  } finally {
    console.warn = prevWarn;
    console.error = prevError;
  }
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
  withCapturedConsole(() => {
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
  });
})();

(function testPluginLoaderSemverAdvancedRanges() {
  withCapturedConsole(() => {
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
  });
})();

(function testPluginLoaderServiceDependencyOrderAndCycleDiagnostics() {
  withCapturedConsole(() => {
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
  });
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
  withCapturedConsole(() => {
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
  });
})();

(function testDiagnosticCommandsSmoke() {
  const { sandbox, outLines } = loadCommandsSandbox();

  sandbox.cmdPluginsOrden();
  assert.ok(outLines.some(l => l.includes('plugin:a')));
  assert.ok(outLines.some(l => l.includes('plugin:b')));

  sandbox.cmdPluginsPendientes();
  assert.ok(outLines.some(l => l.includes('plugin:pend')));
  assert.ok(outLines.some(l => l.includes('Falta servicio svc.x')));

  sandbox.EventBus.on('t:diag', (p)=>p, 'p:diag');
  sandbox.EventBus.emit('t:diag', { ok:true });
  sandbox.cmdEventosTrace(5);
  assert.ok(outLines.some(l => l.includes('t:diag')));
})();

(function testGameplayServicesWithWorldStubs() {
  const { sandbox } = loadCommandsSandbox();
  const { ServiceRegistry } = sandbox;

  assert.strictEqual(ServiceRegistry.has('gameplay.enter_node'), true);
  assert.strictEqual(ServiceRegistry.has('gameplay.move_and_tick'), true);

  const outEnter = ServiceRegistry.call('gameplay.enter_node', 'n2', { tick:2, showLook:false, saveAfter:false, grantXP:false });
  assert.strictEqual(outEnter, 'n2');
  assert.strictEqual(sandbox.Player.pos(), 'n2');
  assert.strictEqual(sandbox.Clock.cycle, 2);

  ServiceRegistry.call('gameplay.move_and_tick', 'norte');
  assert.strictEqual(sandbox.Player.pos(), 'n3');
  assert.strictEqual(sandbox.Clock.cycle, 3);
})();

(function testSecondPassPluginsAvoidLegacyNetBattleFallbacks() {
  const tricksters = fs.readFileSync('plugins/plugin-tricksters.js', 'utf8');
  const sombra = fs.readFileSync('plugins/plugin-sombra-herrante.js', 'utf8');

  assert.ok(!/Net\.startBattle\s*\(/.test(tricksters), 'plugin-tricksters no debe usar Net.startBattle directo');
  assert.ok(!/Net\.getMyBattle\s*\?/.test(tricksters), 'plugin-tricksters no debe consultar Net.getMyBattle directo');

  assert.ok(!/Net\.startBattle\s*\(/.test(sombra), 'plugin-sombra-herrante no debe usar Net.startBattle directo');
  assert.ok(!/Net\.getMyBattle\s*\?/.test(sombra), 'plugin-sombra-herrante no debe consultar Net.getMyBattle directo');
})();

(function testDomainSystemsDataLivesInModuleWithoutAdapters() {
  const moduleJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/module.json'), 'utf8'));
  const systemsFromModule = new Map((moduleJson.systems || []).map(s => [s.name, s.data]));
  const required = [
    { name:'tactics', plugin:'plugins/plugin-tacticas.js' },
    { name:'xp', plugin:'plugins/plugin-xp.js' },
    { name:'arc-engine', plugin:'plugins/plugin-arcos.js' },
    { name:'world-ai', plugin:'plugins/plugin-world-ai.js' },
    { name:'net', bootstrap:'systems/net.js', logic:'systems/net.js' },
    { name:'sfx', bootstrap:'systems/sfx.js', logic:'systems/sfx.js' },
    { name:'music', bootstrap:'systems/music.js', logic:'systems/music.js' },
  ];

  required.forEach((r) => {
    const artifact = r.plugin || r.logic;
    assert.strictEqual(fs.existsSync(artifact), true, `debe existir ${artifact}`);
    assert.ok(systemsFromModule.has(r.name), `module.json debe incluir systems[].name=${r.name}`);
    assert.strictEqual(typeof systemsFromModule.get(r.name), 'object', `systems[].data debe existir para ${r.name}`);
    if(r.bootstrap) {
      const src = fs.readFileSync(r.bootstrap, 'utf8');
      assert.ok(src.includes(`getSystemData?.('${r.name}'`), `${r.bootstrap} debe cargar data con getSystemData('${r.name}')`);
    }
  });

  [
    'systems/forge.js',
    'systems/item-system.js',
    'systems/arc-engine.js',
    'systems/npc-engine.js',
    'systems/tactics.js',
    'systems/xp.js',
    'systems/world-ai.js',
  ].forEach((file) => {
    assert.strictEqual(fs.existsSync(file), false, `${file} debe haber sido eliminado`);
  });
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


(function testRuntimeFacadeServicesSprint1() {
  const { sandbox } = loadCommandsSandbox();
  const { ServiceRegistry } = sandbox;
  [
    'runtime.battle.start',
    'runtime.battle.action',
    'runtime.battle.render',
    'runtime.battle.tick_ai',
    'runtime.battle.escape',
    'runtime.player.rest',
    'runtime.player.tactic',
    'runtime.xp.read',
    'runtime.xp.assign',
    'runtime.xp.show_attrs',
    'runtime.xp.show_exp',
    'runtime.xp.gain',
    'runtime.tactics.consume_stamina',
    'runtime.tactics.calc_wound',
    'runtime.tactics.wound_meta',
    'runtime.tactics.apply_element',
  ].forEach((name) => assert.strictEqual(ServiceRegistry.has(name), true, `missing service ${name}`));
})();

(async function testBattleDispatchUsesRuntimeFacades() {
  const { sandbox } = loadCommandsSandbox();
  const calls = [];
  sandbox.__battleStore.current = {
    id:'b1',
    estado:'activo',
    turno:0,
    cola:[{ tipo:'player', playerId:'p1', name:'Tester', hp:10, maxHp:10, atk:5, def:2, vivo:true }],
  };

  sandbox.ServiceRegistry.register('runtime.battle.action', (battleId, playerId, action, payload)=>{ calls.push({ battleId, playerId, action, payload }); return true; }, { pluginId:'test', version:'0.0.1' });

  await sandbox.dispatch({ verb:'atacar', args:['enemigo'], raw:'atacar enemigo' });
  assert.strictEqual(calls.length, 1, 'dispatch debe usar runtime.battle.action');
  assert.strictEqual(calls[0].action, 'atacar');
})();

(async function testProgressCommandsUseRuntimeFacades() {
  const { sandbox } = loadCommandsSandbox();
  const calls = { assign:0, rest:0, tactica:0 };

  sandbox.ServiceRegistry.register('runtime.xp.assign', () => { calls.assign += 1; return true; }, { pluginId:'test', version:'0.0.1' });
  sandbox.ServiceRegistry.register('runtime.player.rest', async () => { calls.rest += 1; return true; }, { pluginId:'test', version:'0.0.1' });
  sandbox.ServiceRegistry.register('runtime.player.tactic', () => { calls.tactica += 1; return true; }, { pluginId:'test', version:'0.0.1' });

  await sandbox.dispatch({ verb:'asignar', args:['combate'], raw:'asignar combate' });
  await sandbox.dispatch({ verb:'descansar', args:[], raw:'descansar' });
  await sandbox.dispatch({ verb:'tactica', args:[], raw:'tactica' });

  assert.strictEqual(calls.assign, 1, 'asignar debe usar runtime.xp.assign');
  assert.strictEqual(calls.rest, 1, 'descansar debe usar runtime.player.rest');
  assert.strictEqual(calls.tactica, 1, 'tactica debe usar runtime.player.tactic');
})();
console.log('OK runtime_smoke');
