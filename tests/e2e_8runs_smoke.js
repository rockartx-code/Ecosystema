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

function buildRuntimeSandbox() {
  const { EventBus, ServiceRegistry, PluginLoader, CommandRegistry } = loadCore();

  const worldNodes = {
    n1: { id:'n1', name:'Nodo 1', tipo:'hub', estado:'calmo', atmos:'ok', exits:{ norte:'n2' }, loot:[], enemies:[], creatures:[], visitado:false, visitado_prev:false, dificultad:1, seccion:0 },
    n2: { id:'n2', name:'Nodo 2', tipo:'bosque', estado:'calmo', atmos:'ok', exits:{ norte:'n3', sur:'n1' }, loot:[], enemies:[], creatures:[], visitado:false, visitado_prev:false, dificultad:1, seccion:1 },
    n3: { id:'n3', name:'Nodo 3', tipo:'ruina', estado:'calmo', atmos:'ok', exits:{ sur:'n2' }, loot:[], enemies:[], creatures:[], visitado:false, visitado_prev:false, dificultad:1, seccion:1 },
  };

  const player = { id:'p1', name:'Tester', nodeId:'n1', hp:100, maxHp:100, atk:10, def:3, flags:[], ext:{}, inventory:[], equipped:{} };
  const battleStore = { current:null };

  const sandbox = {
    console,
    globalThis: null,
    setTimeout: (fn)=>{ fn(); return 0; },
    clearTimeout: ()=>{},

    EventBus,
    ServiceRegistry,
    PluginLoader,
    CommandRegistry,
    ModuleLoader: { list: () => ['base'], get: () => ({}) },

    Out: { line: ()=>{}, sp: ()=>{}, sep: ()=>{}, clear: ()=>{} },
    refreshStatus: ()=>{},
    save: ()=>{},

    Player: {
      get: ()=>player,
      pos: ()=>player.nodeId,
      setPos: (id)=>{ player.nodeId = id; },
      rename: (n)=>{ player.name = n; },
      findItem: ()=>null,
      getAtk: ()=>player.atk,
      getDef: ()=>player.def,
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

    Clock: { cycle:0, tick:(n=1)=>{ sandbox.Clock.cycle += n; }, ser:()=>({cycle:sandbox.Clock.cycle}), load:(d)=>{ sandbox.Clock.cycle = d?.cycle || 0; } },

    GS: {
      aliveNPCs: ()=>[], npcEnNodo: ()=>[], mision: ()=>null, allMisiones: ()=>[], activas: ()=>[],
      ser: ()=>({}), load: ()=>{},
    },

    XP: { ganar: ()=>{}, ser: ()=>({}), load: ()=>{} },

    U: {
      chance: ()=>false,
      clamp: (v,min,max)=>Math.max(min, Math.min(max, v)),
      rand: (a,b)=> (typeof b === 'number' ? a : a),
      uid: ()=>`uid_${Math.random().toString(16).slice(2)}`,
    },

    NPCEngine: { consecuenciaDesperación: ()=>{} },
    localStorage: { removeItem: ()=>{} },
    init: async ()=>{},
    exportarPartida: ()=>{},
    importarPartida: ()=>{},

    Combat: { active:false },
    D: {},

    Net: {
      isClient: ()=>false,
      isOnline: ()=>true,
      playersEnNodo: ()=>[],
      getPlayers: ()=>({}),
      startBattle: (nodeId, actors)=>{
        battleStore.current = { id:`b_${Date.now()}`, nodeId, estado:'activo', cola:actors, turno:0, ronda:1, log:[] };
      },
      getMyBattle: ()=>battleStore.current,
      getBattleActor: (battle)=> battle?.cola?.[0] || null,
      sendBattleAction: ()=>{},
      renderBattle: ()=>{},
      tickAI: ()=>{},
      sendAction: ()=>{},
      initTrade: ()=>{},
      sendTradeMsg: ()=>{},
      getTrade: ()=>null,
      renderTrade: ()=>{},
      handleTradeMsg: ()=>{},
    },
  };

  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const commandsSrc = fs.readFileSync('systems/commands.js', 'utf8');
  vm.runInContext(commandsSrc, sandbox, { filename:'systems/commands.js' });

  return { sandbox, player, battleStore, worldNodes };
}

(function e2eEightRunsSimulator() {
  const { sandbox, player, battleStore, worldNodes } = buildRuntimeSandbox();
  const { ServiceRegistry } = sandbox;

  const requiredServices = [
    'gameplay.enter_node',
    'gameplay.move_and_tick',
    'gameplay.battle.start',
    'gameplay.battle.current',
    'gameplay.combat.action',
    'gameplay.combat.escape',
  ];
  requiredServices.forEach((name) => assert.strictEqual(ServiceRegistry.has(name), true, `missing service ${name}`));

  let runsOk = 0;

  for(let run = 1; run <= 8; run++) {
    // Reset soft state between runs.
    player.nodeId = 'n1';
    player.hp = player.maxHp = 100;
    battleStore.current = null;
    sandbox.Clock.cycle = 0;
    Object.values(worldNodes).forEach(n => { n.visitado = false; n.visitado_prev = false; });

    // Simulate movement + tick flow.
    const entered = ServiceRegistry.call('gameplay.enter_node', 'n2', { tick:1, showLook:false, saveAfter:false, grantXP:false });
    assert.strictEqual(entered, 'n2');
    assert.strictEqual(player.nodeId, 'n2');

    ServiceRegistry.call('gameplay.move_and_tick', 'norte');
    assert.strictEqual(player.nodeId, 'n3');
    assert.ok(sandbox.Clock.cycle >= 2, 'clock should advance during run');

    // Simulate one battle lifecycle.
    const actors = [
      { tipo:'player', id:player.id, playerId:player.id, name:player.name, hp:player.hp, maxHp:player.maxHp, atk:player.atk, def:player.def, vivo:true },
      { tipo:'enemy', id:`e_${run}`, name:`Enemy ${run}`, hp:20, maxHp:20, atk:5, def:1, vivo:true },
    ];
    const started = ServiceRegistry.call('gameplay.battle.start', player.nodeId, actors);
    assert.strictEqual(started, true);
    const b = ServiceRegistry.call('gameplay.battle.current');
    assert.ok(b && b.estado === 'activo', 'battle should be active');

    // Exercise combat service calls (should not throw).
    const actionOk = ServiceRegistry.call('gameplay.combat.action', b.id, player.id, 'atacar', 'enemy');
    assert.strictEqual(actionOk, true);
    const escapeOk = ServiceRegistry.call('gameplay.combat.escape', b, player.id);
    assert.strictEqual(escapeOk, true);

    runsOk++;
  }

  assert.strictEqual(runsOk, 8, 'el simulador debe completar 8 runs');
})();

console.log('OK e2e_8runs_smoke');
