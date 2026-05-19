#!/usr/bin/env node
'use strict';

// ════════════════════════════════════════════════════════════════
// FUNCIONAL — Maquina de batalla (C1 audit)
//
// Verifica comportamiento end-to-end de la maquina tactica:
//   - startBattle inicializa cola por iniciativa, marca Combat.active
//   - sendBattleAction('atacar') reduce HP y emite combat:* events
//   - sendBattleAction('defender') marca defendiendo
//   - _execSimpleAI (fallback) golpea al jugador en turno enemigo
//   - _checkBattleEnd dispara loot + XP + combat:enemy_defeat al ganar
//   - Combat.active vuelve a false al terminar
//
// El mismo archivo se ejecuta antes y despues de migrar la maquina
// a plugin-battle-engine.js. Si los asserts pasan en ambos casos, el
// comportamiento esta preservado.
// ════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function loadSandbox() {
  // Lugar comun para todos los stubs.
  const outLines = [];
  const player = {
    id: 'p1', name: 'Tester', nodeId: 'n1', hp: 80, maxHp: 100,
    atk: 12, def: 4, suerte: 2, stats: { kills: 0 },
    equipped: {}, inventory: [], ext: {}, magias: [], habilidades: [],
  };
  const eventBus = { _listeners:{}, _specs:{}, _history:[] };
  const battleStore = { saved: 0, refreshed: 0, lootAdded: [], xpGains: [], enemiesRemoved: [] };
  const events = [];
  const nodes = {
    n1: { id:'n1', name:'Nodo 1', tipo:'ruina', exits:{}, enemies:[], creatures:[], loot:[], dificultad:1, seccion:0 },
  };

  const sandbox = {
    console,
    globalThis: null,
    setTimeout: (fn)=>{ fn(); return 0; },
    clearTimeout: ()=>{},
    Date: { now: () => 1700000000000 },
    Math,
    JSON,
    Object, Array, Number, String, Boolean, Symbol, Promise, Error,
    Map, Set,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.CTX = {};  // EventBus.emit pasa CTX como segundo arg al handler.

  // Stubs de core
  sandbox.U = {
    uid:   () => 'UID' + (++sandbox.__uidCounter),
    hash:  (s='') => { let h=2166136261; for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=(h*16777619)>>>0;} return h; },
    rng:   (seed) => { let s = sandbox.U.hash(String(seed)); return () => { s^=s<<13;s^=s>>17;s^=s<<5;s=s>>>0; return s/0xFFFFFFFF; }; },
    pick:  (arr, r) => arr[Math.floor((r? r() : 0.5) * arr.length)],
    pickN: (arr, n, r) => { const c=[...arr], out=[]; for(let i=0;i<n&&c.length;i++) out.push(c.splice(Math.floor((r? r() : 0.5)*c.length),1)[0]); return out; },
    rand:  (a,b) => Math.floor((a+b)/2),
    chance:(_p) => true,
    clamp: (v,a,b) => Math.max(a, Math.min(b, v)),
    cap:   (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1),
    tmpl:  (s, vars) => String(s).replace(/\{(\w+)\}/g,(_,k)=>vars?.[k]||`{${k}}`),
  };
  sandbox.__uidCounter = 0;

  sandbox.Out = {
    line: (text, color='t-out', bold=false)=>{ outLines.push({ text:String(text), color, bold }); },
    sp:   ()=>{ outLines.push({ text:'', color:'sp' }); },
    sep:  (ch='─')=>{ outLines.push({ text:String(ch).repeat(5), color:'sep' }); },
    boot: ()=>{},
    tw:   async (text)=>{ outLines.push({ text:String(text), color:'tw' }); },
    echo: ()=>{},
    clear:()=>{},
    status:()=>{},
  };
  sandbox.battleLog = (battle, txt, color='t-out') => {
    battle.log = battle.log || [];
    battle.log.push({ txt:String(txt), color });
  };
  sandbox.D = {
    enemies: [{ id:'lobo', nombre:'Lobo', hp:18, atk:8, def:1, loot:['piel_lobo','colmillo'] }],
    matTags: () => ['natural'],
    mat:     () => ({ desc:'material de prueba' }),
  };

  sandbox.Player = {
    s: player,
    get:    () => player,
    pos:    () => player.nodeId,
    setPos: (n) => { player.nodeId = n; },
    getAtk: () => player.atk,
    getDef: () => player.def,
    addItem:(it) => { player.inventory.push(it); battleStore.lootAdded.push(it); return true; },
    rmItem: (id) => { const i = player.inventory.findIndex(x=>x.id===id); if(i>=0) player.inventory.splice(i,1); return i>=0; },
    findItem: () => null,
    ser:    () => ({ ...player }),
    load:   (d) => Object.assign(player, d||{}),
  };
  sandbox.World = {
    seed: 'test', sectionCount: 1,
    all:    () => nodes,
    node:   (id) => nodes[id] || null,
    exits:  (id) => ({ ...(nodes[id]?.exits || {}) }),
    visit:  (id) => { if(nodes[id]) nodes[id].visitado = true; },
    rmEnemy:(id, eid) => { if(nodes[id]) nodes[id].enemies = nodes[id].enemies.filter(e=>e.id!==eid); battleStore.enemiesRemoved.push({id,eid}); return true; },
    isBorder:() => false,
    expandSection:() => null,
    ser:    () => ({ seed:'test' }),
    load:   () => {},
  };
  sandbox.GS = {
    npcs:{}, misiones:{}, twists:[], arcs:{},
    addNPC:(n)=>{ sandbox.GS.npcs[n.id]=n; },
    npc:(id)=>sandbox.GS.npcs[id]||null,
    allNPCs:()=>Object.values(sandbox.GS.npcs),
    aliveNPCs:()=>Object.values(sandbox.GS.npcs),
    npcEnNodo:()=>[],
    addMision:(m)=>{ sandbox.GS.misiones[m.id]=m; },
    mision:(id)=>sandbox.GS.misiones[id]||null,
    allMisiones:()=>Object.values(sandbox.GS.misiones),
    activas:()=>[],
    addArc:(a)=>{ sandbox.GS.arcs[a.id]=a; },
    arc:(id)=>sandbox.GS.arcs[id]||null,
    allArcs:()=>Object.values(sandbox.GS.arcs),
    arcsActivos:()=>[],
    addTwist:(t)=>sandbox.GS.twists.push(t),
    ser:()=>({}),
    load:()=>{},
  };
  sandbox.Clock = {
    cycle: 1, name: 'amanecer',
    get:  () => ({ cycle: sandbox.Clock.cycle, name: sandbox.Clock.name }),
    tick: (n=1) => { sandbox.Clock.cycle += n; },
    ser:  () => ({ cycle: sandbox.Clock.cycle }),
    load: (d) => { if(d?.cycle != null) sandbox.Clock.cycle = d.cycle; },
  };
  sandbox.CombatResolution = { active: false };
  sandbox.Combat = sandbox.CombatResolution;
  sandbox._sonEnemigos = () => false;
  sandbox.refreshStatus = () => { battleStore.refreshed += 1; };
  sandbox.save = () => { battleStore.saved += 1; };
  sandbox.die = (causa) => { battleStore.died = causa; };
  sandbox.RunMem = { registrar:()=>{}, ecos:()=>[], runs:()=>[], load:()=>{}, save:()=>{} };
  sandbox.localStorage = { removeItem:()=>{}, getItem:()=>null, setItem:()=>{} };
  sandbox.ModuleLoader = {
    get:  (path) => null,
    list: () => ['test'],
    getSystemData: (name, fb) => fb,
  };
  sandbox.PluginLoader = { list:()=>[], lastBatchOrder:()=>[], pending:()=>[], registerFromJSON:()=>true, order:[] };
  sandbox.CommandRegistry = { register:()=>true, run:()=>true, has:()=>false, resolve:()=>null };
  sandbox.ConcentracionSystem = undefined;

  // Cargar core/core.js: provee EventBus y ServiceRegistry reales.
  // Las consts de core no se enganchan a globalThis automaticamente —
  // exportamos manualmente al final, igual que runtime_smoke.js.
  const coreSrc = fs.readFileSync('core/core.js', 'utf8') +
    '\n;globalThis.EventBus = EventBus; globalThis.ServiceRegistry = ServiceRegistry;';
  vm.createContext(sandbox);
  vm.runInContext(coreSrc, sandbox, { filename:'core/core.js' });

  // core/core.js declara U/D al top-level y los crea en la sandbox scope.
  // Reescribimos chance/pick/rand para determinismo en tests.
  vm.runInContext(`
    U.chance = (p) => true;
    U.pick   = (arr) => arr[0];
    U.pickN  = (arr, n) => arr.slice(0, n);
    U.uid    = (() => { let i = 0; return () => 'UID' + (++i); })();
    U.rand   = (a,b) => Math.floor((a+b)/2);
    D.enemies = [{ id:'lobo', nombre:'Lobo', hp:18, atk:8, def:1, loot:['piel_lobo','colmillo'] }];
    D.matTags = () => ['natural'];
    D.mat     = () => ({ desc:'material de prueba' });
  `, sandbox);

  // Cargar plugin-helpers.js (puro, sin DOM).
  vm.runInContext(fs.readFileSync('core/plugin-helpers.js','utf8'), sandbox, { filename:'core/plugin-helpers.js' });

  // Registrar servicios runtime.* que la batalla consume.
  sandbox.ServiceRegistry.register('runtime.player.current', () => player, { pluginId:'test' });
  sandbox.ServiceRegistry.register('runtime.player.position', () => player.nodeId, { pluginId:'test' });
  sandbox.ServiceRegistry.register('runtime.player.combat_stats', () => ({ atk: player.atk, def: player.def }), { pluginId:'test' });
  sandbox.ServiceRegistry.register('runtime.player.add_item', (it) => { sandbox.Player.addItem(it); return true; }, { pluginId:'test' });
  sandbox.ServiceRegistry.register('runtime.player.remove_item', (id) => sandbox.Player.rmItem(id), { pluginId:'test' });
  sandbox.ServiceRegistry.register('runtime.world.node', (id) => sandbox.World.node(id), { pluginId:'test' });
  sandbox.ServiceRegistry.register('runtime.world.remove_enemy', (nid, eid) => sandbox.World.rmEnemy(nid, eid), { pluginId:'test' });
  sandbox.ServiceRegistry.register('runtime.output.line', (t,c,b) => sandbox.Out.line(t,c,b), { pluginId:'test' });
  sandbox.ServiceRegistry.register('runtime.output.sp',   () => sandbox.Out.sp(), { pluginId:'test' });
  sandbox.ServiceRegistry.register('runtime.output.sep',  (ch,len) => sandbox.Out.sep(ch,len), { pluginId:'test' });
  sandbox.ServiceRegistry.register('runtime.status.refresh', () => sandbox.refreshStatus(), { pluginId:'test' });
  sandbox.ServiceRegistry.register('runtime.game.save',   () => sandbox.save(), { pluginId:'test' });
  sandbox.ServiceRegistry.register('runtime.game.die',    (causa) => sandbox.die(causa), { pluginId:'test' });
  sandbox.ServiceRegistry.register('runtime.xp.gain', (branch, amount, reason) => {
    battleStore.xpGains.push({ branch, amount, reason });
    return true;
  }, { pluginId:'test' });
  sandbox.ServiceRegistry.register('runtime.tactics.api', () => null, { pluginId:'test' });
  sandbox.ServiceRegistry.register('runtime.items.api', () => null, { pluginId:'test' });

  // Capturar eventos para asserts.
  ['combat:start','combat:before_damage_apply','combat:after_damage_apply',
   'combat:enemy_defeat','combat:post_resolve','combat:enemy_turn_announce',
   'combat:resolve_ia','combat:player_action','player:die'].forEach((ev) => {
    sandbox.EventBus.on(ev, (p) => { events.push({ ev, payload: { ...(p||{}) } }); return p; }, 'test-spy');
  });

  return { sandbox, outLines, battleStore, events, player, nodes };
}

function loadCurrentBattleEngine(sandbox) {
  // Tras C1, la maquina de batalla vive en plugins/plugin-battle-engine.js.
  // Lo cargamos primero (registra runtime.battle.* via su def.services),
  // luego cargamos net.js cuyos wrappers delegan a esos servicios.
  const pluginSrc = fs.readFileSync('plugins/plugin-battle-engine.js', 'utf8');
  vm.runInContext(pluginSrc, sandbox, { filename:'plugins/plugin-battle-engine.js' });
  // Registrar manualmente los servicios del plugin (sandbox no tiene PluginLoader real).
  const def = sandbox.pluginBattleEngine;
  for(const [name, fn] of Object.entries(def.services || {})) {
    sandbox.ServiceRegistry.register(name, fn, { pluginId: def.id, version: def.version });
  }

  const netSrc = fs.readFileSync('systems/net.js', 'utf8');
  vm.runInContext(netSrc, sandbox, { filename:'systems/net.js' });
  return sandbox.Net;
}

(function testStartBattleInitializesCorrectly() {
  const ctx = loadSandbox();
  const Net = loadCurrentBattleEngine(ctx.sandbox);

  const battle = Net.startBattle('n1', [
    { id:'p1', playerId:'p1', name:'Tester', tipo:'player',  hp:80, maxHp:100, atk:12, def:4, iniciativa:10 },
    { id:'e1',                 name:'Lobo',   tipo:'enemy',   hp:18, maxHp:18,  atk:8,  def:1, iniciativa:5  },
  ]);

  assert.ok(battle, 'startBattle debe devolver el battle');
  assert.strictEqual(battle.estado, 'activo');
  assert.strictEqual(battle.ronda, 1);
  assert.strictEqual(battle.cola.length, 2);
  assert.strictEqual(battle.cola[0].name, 'Tester', 'iniciativa mayor primero');
  assert.strictEqual(ctx.sandbox.Combat.active, true, 'Combat.active queda en true');
  assert.ok(ctx.events.some(e => e.ev === 'combat:start'), 'combat:start emitido');
})();

(function testAttackReducesHpAndEmitsEvents() {
  const ctx = loadSandbox();
  const Net = loadCurrentBattleEngine(ctx.sandbox);

  const battle = Net.startBattle('n1', [
    { id:'p1', playerId:'p1', name:'Tester', tipo:'player', hp:80, maxHp:100, atk:12, def:4, iniciativa:10 },
    { id:'e1',                 name:'Lobo',   tipo:'enemy',  hp:18, maxHp:18,  atk:8,  def:1, iniciativa:5  },
  ]);

  const enemyBefore = battle.cola.find(c => c.tipo !== 'player').hp;
  Net.sendBattleAction(battle.id, 'p1', 'atacar', '');
  const enemy = battle.cola.find(c => c.tipo !== 'player');

  assert.ok(enemy.hp < enemyBefore, `HP enemigo debe bajar: ${enemyBefore} -> ${enemy.hp}`);
  assert.ok(ctx.events.some(e => e.ev === 'combat:before_damage_apply'));
  assert.ok(ctx.events.some(e => e.ev === 'combat:after_damage_apply'));
  assert.ok(ctx.battleStore.xpGains.some(g => g.branch === 'combate'), 'XP por daño otorgada');
})();

(function testDefenderMarksDefendiendo() {
  const ctx = loadSandbox();
  const Net = loadCurrentBattleEngine(ctx.sandbox);
  const battle = Net.startBattle('n1', [
    { id:'p1', playerId:'p1', name:'Tester', tipo:'player', hp:80, maxHp:100, atk:12, def:4, iniciativa:10 },
    { id:'e1',                 name:'Lobo',   tipo:'enemy',  hp:18, maxHp:18,  atk:8,  def:1, iniciativa:5  },
  ]);
  Net.sendBattleAction(battle.id, 'p1', 'defender', '');
  const actor = battle.cola.find(c => c.id === 'p1');
  assert.strictEqual(actor.defendiendo, true, 'defendiendo debe quedar true');
})();

(function testAiFallbackHitsPlayerOnEnemyTurn() {
  const ctx = loadSandbox();
  const Net = loadCurrentBattleEngine(ctx.sandbox);
  // Iniciativa: enemigo primero (atk alto).
  const battle = Net.startBattle('n1', [
    { id:'p1', playerId:'p1', name:'Tester', tipo:'player', hp:80, maxHp:100, atk:12, def:4, iniciativa:1  },
    { id:'e1',                 name:'Lobo',   tipo:'enemy',  hp:18, maxHp:18,  atk:8,  def:1, iniciativa:99 },
  ]);
  // El advanceTurnIfAI ya corrio en startBattle por iniciativa enemigo.
  // Con setTimeout sincronico el ataque del enemigo se ejecuto.
  const playerActor = battle.cola.find(c => c.id === 'p1');
  assert.ok(playerActor.hp < 80, `IA fallback debio reducir HP del jugador (es ${playerActor.hp})`);
})();

(function testVictoryGrantsLootAndXp() {
  const ctx = loadSandbox();
  const Net = loadCurrentBattleEngine(ctx.sandbox);

  const battle = Net.startBattle('n1', [
    { id:'p1', playerId:'p1', name:'Tester', tipo:'player', hp:80, maxHp:100, atk:12, def:4, iniciativa:10 },
    { id:'lobo',               name:'Lobo',   tipo:'enemy',  hp:5,  maxHp:18,  atk:8,  def:1, iniciativa:5  },
  ]);

  Net.sendBattleAction(battle.id, 'p1', 'atacar', '');

  assert.strictEqual(battle.estado, 'fin', 'battle debe terminar al matar al unico enemigo');
  assert.ok(ctx.events.some(e => e.ev === 'combat:enemy_defeat'), 'combat:enemy_defeat emitido');
  assert.ok(ctx.events.some(e => e.ev === 'combat:post_resolve'),  'combat:post_resolve emitido');
  assert.strictEqual(ctx.sandbox.Combat.active, false, 'Combat.active vuelve a false al terminar');
  assert.ok(ctx.battleStore.saved >= 1, 'save() llamado al terminar batalla');
  assert.ok(ctx.battleStore.enemiesRemoved.some(r => r.eid === 'lobo'), 'enemigo removido del mundo');
  assert.ok(ctx.battleStore.xpGains.some(g => g.branch === 'combate' && g.reason?.includes('kill')), 'XP de kill otorgada');
})();

(function testHuirSuccessRemovesPlayer() {
  const ctx = loadSandbox();
  const Net = loadCurrentBattleEngine(ctx.sandbox);
  const battle = Net.startBattle('n1', [
    { id:'p1', playerId:'p1', name:'Tester', tipo:'player', hp:80, maxHp:100, atk:12, def:4, iniciativa:10 },
    { id:'e1',                 name:'Lobo',   tipo:'enemy',  hp:18, maxHp:18,  atk:8,  def:1, iniciativa:5  },
  ]);
  Net.sendBattleAction(battle.id, 'p1', 'huir', '');
  const actor = battle.cola.find(c => c.id === 'p1');
  // U.chance retorna true en el sandbox → huir exitoso.
  assert.strictEqual(actor.huyó, true, 'jugador debe quedar marcado como huyó');
  assert.strictEqual(actor.vivo, false, 'jugador deja la batalla');
})();

(function testRenderBattleEscribeOutput() {
  const ctx = loadSandbox();
  const Net = loadCurrentBattleEngine(ctx.sandbox);
  const battle = Net.startBattle('n1', [
    { id:'p1', playerId:'p1', name:'Tester', tipo:'player', hp:80, maxHp:100, atk:12, def:4, iniciativa:10 },
    { id:'e1',                 name:'Lobo',   tipo:'enemy',  hp:18, maxHp:18,  atk:8,  def:1, iniciativa:5  },
  ]);
  Net.renderBattle(battle);
  const renderedRonda = ctx.outLines.some(l => /Ronda 1/.test(l.text || ''));
  assert.ok(renderedRonda, 'renderBattle debe escribir la ronda en Out');
})();

(function testGetMyBattleAndActor() {
  const ctx = loadSandbox();
  const Net = loadCurrentBattleEngine(ctx.sandbox);
  const battle = Net.startBattle('n1', [
    { id:'p1', playerId:'p1', name:'Tester', tipo:'player', hp:80, maxHp:100, atk:12, def:4, iniciativa:10 },
    { id:'e1',                 name:'Lobo',   tipo:'enemy',  hp:18, maxHp:18,  atk:8,  def:1, iniciativa:5  },
  ]);
  assert.strictEqual(Net.getMyBattle()?.id, battle.id, 'getMyBattle debe devolver battle activa');
  assert.strictEqual(Net.getBattleActor(battle)?.name, 'Tester', 'getBattleActor devuelve el actor en turno');
})();

console.log('OK battle_engine_functional_smoke');
