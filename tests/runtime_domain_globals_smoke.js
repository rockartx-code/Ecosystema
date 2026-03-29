#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

(function testRuntimeDomainServicesRegistered() {
  const coreSrc = fs.readFileSync('core/core.js', 'utf8') + '\n;globalThis.__core = { ServiceRegistry };';
  const commandsSrc = fs.readFileSync('systems/commands.js', 'utf8');

  const sandbox = {
    console,
    globalThis: null,
    window: null,
    document: {},
    EventBus: { emit: ()=>{}, emitCancellable: ()=>({ cancelled:false }) },
    ServiceRegistry: null,
    CommandRegistry: { run: async ()=>false },
    Net: {},
    Tactics: {},
    XP: {},
    ArcEngine: {},
    FactionSystem: {},
    BossSystem: {},
    Player: {
      get: ()=>({ id:'p1', atk:7, def:3, hp:20, maxHp:20, inventory:[] }),
      pos: ()=> 'n1',
      setPos: ()=>{},
      getAtk: ()=> 9,
      getDef: ()=> 4,
      addItem: ()=>{},
      findItem: ()=>null,
    },
    World: {
      all: ()=>({ n1:{ id:'n1' } }),
      node: ()=>({ id:'n1' }),
      exits: ()=>({ norte:'n2' }),
      visit: ()=>{},
      expandSection: ()=> 'n2',
      isBorder: ()=> true,
      seed: 'S1',
      sectionCount: 2,
    },
    Clock: { cycle:5, tick: ()=>{}, get: ()=>({ name:'alba' }) },
    GS: {
      allNPCs: ()=>[],
      aliveNPCs: ()=>[],
      addNPC: ()=>{},
      npc: ()=>null,
      allMisiones: ()=>[],
      addMision: ()=>{},
      mision: ()=>null,
    },
    Out: { line: ()=>{} },
    save: ()=>{},
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(coreSrc, sandbox, { filename:'core/core.js' });
  vm.runInContext(commandsSrc, sandbox, { filename:'systems/commands.js' });

  const { ServiceRegistry } = sandbox.__core;
  [
    'runtime.player.current',
    'runtime.player.position',
    'runtime.player.set_position',
    'runtime.player.combat_stats',
    'runtime.player.add_item',
    'runtime.player.get_slot',
    'runtime.player.find_item',
    'runtime.player.remove_item',
    'runtime.player.add_to_slot',
    'runtime.player.remove_from_slot',
    'runtime.player.find_in_slot',
    'runtime.world.all',
    'runtime.world.node',
    'runtime.world.exits',
    'runtime.world.visit',
    'runtime.world.expand_section',
    'runtime.world.is_border',
    'runtime.world.remove_enemy',
    'runtime.world.remove_creature',
    'runtime.world.read',
    'runtime.world.calc_difficulty',
    'runtime.clock.current',
    'runtime.clock.tick',
    'runtime.output.line',
    'runtime.output.sp',
    'runtime.output.sep',
    'runtime.status.refresh',
    'runtime.game.save',
    'runtime.gs.all_npcs',
    'runtime.gs.alive_npcs',
    'runtime.gs.add_npc',
    'runtime.gs.npc',
    'runtime.gs.npcs_in_node',
    'runtime.gs.all_misiones',
    'runtime.gs.add_mision',
    'runtime.gs.mision',
    'runtime.gs.add_arc',
    'runtime.gs.arc',
    'runtime.gs.all_arcs',
    'runtime.gs.active_arcs',
    'runtime.gs.add_twist',
  ].forEach((name) => assert.strictEqual(ServiceRegistry.has(name), true, `missing service ${name}`));
})();

console.log('OK runtime_domain_globals_smoke');
