#!/usr/bin/env node
'use strict';

// ════════════════════════════════════════════════════════════════
// FUNCIONAL — Migracion C2 de handlers de commands.js a plugins
//
// Valida que los handlers de gameplay extraidos de systems/commands.js
// y migrados a plugins (plugin-npcs, plugin-forja, plugin-battle-engine,
// plugin-criaturas) siguen siendo invocables via CommandRegistry y
// producen las mismas mutaciones de estado y eventos.
//
// Cubre los handlers explicitamente listados en el audit C2:
//   - NPC narrativo: hablar, preguntar, observar, traicionar, npcs,
//                    misiones, legados, examinar (sobre NPC)
//   - Forja:         forjar, fusionar, recetas, materiales
//   - Batalla:       atacar (inicia battle), examinar (en combate)
//   - Criaturas:     compañeros, capturar, liberar, modo, nombrar,
//                    criar, anclas, vincular
//
// El sandbox carga los modulos de core (utils/event-bus/.../data-accessor)
// + plugin-helpers.js + los plugins reales del repo. Stub minimo de
// Player/World/GS/Out.
// ════════════════════════════════════════════════════════════════

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function loadSandbox() {
  const outLines = [];
  const events = [];
  const player = {
    id:'p1', name:'Tester', nodeId:'n1', hp:80, maxHp:100,
    atk:12, def:4, suerte:0, hunger:60, stamina:80, mana:40, level:1,
    stats:{ kills:0, steps:0, crafted:0 },
    equipped:{}, inventory:[], ext:{ magias:[], habilidades:[], compañeros:[] },
    magias:[], habilidades:[], reputacion:{}, fragmentos:[], heridas:[],
  };
  const npcAlice = {
    id:'npc_alice', nombre:'Alice', nodeId:'n1', estado:'vivo',
    arq_vis:'errante', arq_ocu:'vacío', lealtad:55, corrupcion:20,
    desesperacion:30, deseo:'una salida', necesidad:'silencio',
    miedo:'ruido', secreto:'mata por reflejo', trauma:'lo perdio todo',
    secreto_idx:0, vinculos:[], misiones_ofrecidas:[], interacciones:0,
    fragmentos:[], twists_activados:[], hp_combat:null,
    secreto_expuesto:false, arq_ocu_expuesto:false,
  };
  const nodes = {
    n1: { id:'n1', name:'Nodo 1', tipo:'ruina', estado:'calmo', atmos:'silencio frio',
          exits:{ norte:'n2' }, loot:[], enemies:[], creatures:[], npc_ids:['npc_alice'],
          visitado:false, dificultad:1, seccion:0 },
    n2: { id:'n2', name:'Nodo 2', tipo:'bosque', estado:'calmo', atmos:'verde',
          exits:{ sur:'n1' }, loot:[], enemies:[], creatures:[], npc_ids:[],
          visitado:false, dificultad:1, seccion:0 },
  };
  const battleStore = { saved:0, refreshed:0, started:[] };

  const sandbox = {
    console, Math, JSON, Date, Object, Array, Number, String, Boolean, Symbol, Promise, Error, Map, Set,
    setTimeout: (fn)=>{ fn(); return 0; },
    clearTimeout: ()=>{},
    globalThis: null,
    document: { getElementById: ()=>null, createElement: ()=>({className:'',id:'',innerHTML:'',appendChild(){},querySelector(){return null;},remove(){}}), querySelectorAll: ()=>[] },
    CTX: {},
    window: null,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;

  // Stubs core (Player/World/GS/Out/etc.)
  sandbox.Out = {
    line: (text, color='t-out', bold=false)=>{ outLines.push({ text:String(text), color, bold }); },
    sp:   ()=>{ outLines.push({ text:'', color:'sp' }); },
    sep:  (ch='─')=>{ outLines.push({ text:String(ch).repeat(5), color:'sep' }); },
    boot: ()=>{}, tw: async (t)=>{ outLines.push({ text:String(t), color:'tw' }); },
    echo: ()=>{}, clear: ()=>{}, status: ()=>{},
  };
  sandbox.battleLog = (battle, txt, color='t-out') => {
    battle.log = battle.log || [];
    battle.log.push({ txt:String(txt), color });
  };
  sandbox.Player = {
    s: player,
    get:    () => player,
    pos:    () => player.nodeId,
    setPos: (n) => { player.nodeId = n; },
    getAtk: () => player.atk,
    getDef: () => player.def,
    addItem:(it) => { player.inventory.push(it); return true; },
    rmItem: (id) => { const i = player.inventory.findIndex(x=>x.id===id); if(i>=0) player.inventory.splice(i,1); return i>=0; },
    findItem:(q='') => player.inventory.find(i => (i.nombre||i.blueprint||'').toLowerCase().includes(String(q).toLowerCase())),
    feed:   (n) => { player.hunger = Math.min(100, (player.hunger||0)+n); },
    heal:   (n) => { player.hp = Math.min(player.maxHp, player.hp+n); return n; },
    damage: (n) => { player.hp = Math.max(0, player.hp-n); return n; },
    getSlot:(t) => t === 'compañeros' ? 2 : 3,
    maxComp:() => 2, maxHab: () => 3, maxMag: () => 2,
    rename: (n) => { player.name = n; },
    equip:  (item, slot) => { player.equipped[slot || item.tipo || 'arma'] = item; },
    ser:    () => ({ ...player }),
    load:   (d) => Object.assign(player, d||{}),
  };
  sandbox.World = {
    seed:'test', sectionCount:1,
    all:    () => nodes,
    node:   (id) => nodes[id] || null,
    exits:  (id) => ({ ...(nodes[id]?.exits || {}) }),
    visit:  (id) => { if(nodes[id]) nodes[id].visitado = true; },
    isBorder:() => false,
    expandSection:() => null,
    rmEnemy:(id, eid) => { if(nodes[id]) nodes[id].enemies = nodes[id].enemies.filter(e=>e.id!==eid); },
    rmLoot: (id, bp) => { if(nodes[id]) nodes[id].loot = nodes[id].loot.filter(l => l !== bp); },
    ser:    () => ({ seed:'test' }),
    load:   () => {},
  };
  sandbox.GS = {
    npcs:{ npc_alice: npcAlice }, misiones:{}, twists:[], arcs:{}, destruidos:[],
    addNPC:(n)=>{ sandbox.GS.npcs[n.id]=n; },
    npc:(id)=>sandbox.GS.npcs[id]||null,
    allNPCs:()=>Object.values(sandbox.GS.npcs),
    aliveNPCs:()=>Object.values(sandbox.GS.npcs).filter(n=>['vivo','sometido','hostil'].includes(n.estado)),
    npcEnNodo:(nid)=>Object.values(sandbox.GS.npcs).filter(n=>n.nodeId===nid),
    addMision:(m)=>{ sandbox.GS.misiones[m.id]=m; },
    mision:(id)=>sandbox.GS.misiones[id]||null,
    allMisiones:()=>Object.values(sandbox.GS.misiones),
    activas:()=>Object.values(sandbox.GS.misiones).filter(m=>!m.completada&&!m.fallida),
    addArc:(a)=>{ sandbox.GS.arcs[a.id]=a; },
    arc:(id)=>sandbox.GS.arcs[id]||null,
    allArcs:()=>Object.values(sandbox.GS.arcs),
    arcsActivos:()=>[],
    addTwist:(t)=>{ sandbox.GS.twists.push(t); },
    ser:()=>({}),
    load:()=>{},
  };
  sandbox.Clock = {
    cycle:1, name:'amanecer',
    get:() => ({ cycle: sandbox.Clock.cycle, name: sandbox.Clock.name }),
    tick:(n=1)=>{ sandbox.Clock.cycle += n; },
    ser:()=>({ cycle: sandbox.Clock.cycle }),
    load:(d)=>{ if(d?.cycle != null) sandbox.Clock.cycle = d.cycle; },
  };
  sandbox.CombatResolution = { active:false };
  sandbox.Combat = sandbox.CombatResolution;
  sandbox._sonEnemigos = () => false;
  sandbox.refreshStatus = () => { battleStore.refreshed += 1; };
  sandbox.save = () => { battleStore.saved += 1; };
  sandbox.die = (causa) => { battleStore.died = causa; };
  sandbox.RunMem = { registrar:()=>{}, ecos:()=>[], runs:()=>[], load:()=>{}, save:()=>{} };
  sandbox.localStorage = { removeItem:()=>{}, getItem:()=>null, setItem:()=>{} };

  // Tras M1, core esta dividido en 7 ficheros que se cargan en orden.
  const { readCoreSource } = require('./helpers/load-core');
  vm.createContext(sandbox);
  vm.runInContext(readCoreSource(), sandbox, { filename:'core/*.js' });
  vm.runInContext(`
    U.chance = (p) => true;
    U.pick   = (arr) => arr[0];
    U.pickN  = (arr, n) => arr.slice(0, n);
    U.uid    = (() => { let i = 0; return () => 'UID' + (++i); })();
    U.rand   = (a,b) => Math.floor((a+b)/2);
    // D usa getters que leen ModuleLoader.get(...). Sembramos datos via
    // ModuleLoader.apply para que D.tagAff/D.mats/D.npcs devuelvan valores.
    ModuleLoader.apply({ meta:{ id:'test-fixtures' },
      npcs: {
        arquetipos_visibles:['errante'], arquetipos_ocultos:['vacío'],
        arquetipos_hostiles:['cazador'],
        deseos:['—'], necesidades:['—'], miedos:['—'],
        secretos:['—','—'], traumas:['—'], titulo_chance:0,
        nombres_prefijos:['X'], nombres_sufijos:[''], nombres_titulos:[''],
        tipos_vinculo:['deuda'], vinculos_historia:{ deuda:['—'] },
      },
      enemigos:[{ id:'lobo', nombre:'Lobo', hp:18, atk:8, def:1, loot:['piel_lobo'] }],
      materiales:{ piel_lobo:{ categoria:'físico', tags:['natural'], desc:'piel' } },
      tag_afinidades:{ 'fuego:hielo':{ resultado:'vapor', fuerza:2 } },
      tag_opuestos:[['fuego','hielo']],
      criaturas:{ eco_encarnado:{ anclas:['ancla_simple'] } },
      narrativa:{ mutaciones:['Mut1','Mut2'] },
    });
    // matTags/mat se construyen sobre los datos; los reconstruimos.
    D.matTags = (id) => ModuleLoader.get('materiales')?.[id]?.tags || [];
    D.mat     = (id) => ModuleLoader.get('materiales')?.[id] || null;
  `, sandbox);

  // Cargar plugin-helpers.js y core/entity.js (algunos plugins extienden Entity)
  vm.runInContext(fs.readFileSync('core/plugin-helpers.js','utf8'), sandbox, { filename:'core/plugin-helpers.js' });
  vm.runInContext(fs.readFileSync('core/entity.js','utf8'), sandbox, { filename:'core/entity.js' });

  // Registrar servicios runtime.* minimos que los plugins consumen
  const reg = (name, fn) => sandbox.ServiceRegistry.register(name, fn, { pluginId:'test' });
  reg('runtime.player.current', () => player);
  reg('runtime.player.position', () => player.nodeId);
  reg('runtime.player.combat_stats', () => ({ atk: player.atk, def: player.def }));
  reg('runtime.player.add_item', (it) => { sandbox.Player.addItem(it); return true; });
  reg('runtime.player.remove_item', (id) => sandbox.Player.rmItem(id));
  reg('runtime.world.node', (id) => sandbox.World.node(id));
  reg('runtime.world.all', () => sandbox.World.all());
  reg('runtime.world.exits', (id) => sandbox.World.exits(id));
  reg('runtime.world.remove_enemy', (nid, eid) => sandbox.World.rmEnemy(nid, eid));
  reg('runtime.output.line', (t,c,b) => sandbox.Out.line(t,c,b));
  reg('runtime.output.sp', () => sandbox.Out.sp());
  reg('runtime.output.sep', (ch,len) => sandbox.Out.sep(ch,len));
  reg('runtime.status.refresh', () => sandbox.refreshStatus());
  reg('runtime.game.save', () => sandbox.save());
  reg('runtime.game.die', (c) => sandbox.die(c));
  reg('runtime.gs.add_npc', (n) => sandbox.GS.addNPC(n));
  reg('runtime.gs.all_npcs', () => sandbox.GS.allNPCs());
  reg('runtime.gs.alive_npcs', () => sandbox.GS.aliveNPCs());
  reg('runtime.gs.npc', (id) => sandbox.GS.npc(id));
  reg('runtime.gs.npcs_in_node', (id) => sandbox.GS.npcEnNodo(id));
  reg('runtime.gs.add_mision', (m) => sandbox.GS.addMision(m));
  reg('runtime.gs.mision', (id) => sandbox.GS.mision(id));
  reg('runtime.gs.all_misiones', () => sandbox.GS.allMisiones());
  reg('runtime.gs.add_arc', (a) => sandbox.GS.addArc(a));
  reg('runtime.gs.arc', (id) => sandbox.GS.arc(id));
  reg('runtime.gs.all_arcs', () => sandbox.GS.allArcs());
  reg('runtime.gs.active_arcs', () => sandbox.GS.arcsActivos());
  reg('runtime.gs.add_twist', (t) => sandbox.GS.addTwist(t));
  reg('runtime.xp.gain', (b,a,r) => true);
  reg('runtime.memory.ecos', () => []);
  reg('runtime.memory.runs', () => []);
  // NPC services (lo expone plugin-npcs al cargarse pero stub aqui por orden)
  reg('runtime.npc.dialogue', (npc) => `${npc.nombre}: hola.`);
  reg('runtime.npc.interact', (npc) => null);
  reg('runtime.npc.observe', (npc) => [`${npc.nombre} es ${npc.arq_vis}`]);
  reg('runtime.npc.check_twists', () => []);
  reg('runtime.npc.gen_mission', (npc) => ({ id:`m_${npc.id}`, titulo:'misión test', desc:'desc', recompensa:'XP', tipo:'búsqueda', npc_id:npc.id, aceptada:false, completada:false, fallida:false }));
  reg('runtime.npc.despair', () => true);
  // Spy de eventos
  ['narrative:mission_fail','narrative:mission_complete','creature:breed_result','combat:start'].forEach(ev => {
    sandbox.EventBus.on(ev, (p) => { events.push({ ev, payload:{...(p||{})} }); return p; }, 'test-spy');
  });

  return { sandbox, outLines, events, player, npcAlice, nodes, battleStore };
}

function loadPlugin(sandbox, path) {
  vm.runInContext(fs.readFileSync(path, 'utf8'), sandbox, { filename: path });
}

// Reaplica stubs de servicios runtime.npc.* tras registrar el plugin,
// que sobrescribiria los stubs con su implementacion real (que requiere
// data del modulo que no esta en el sandbox).
function stubNpcServicesAfterRegister(sandbox) {
  const reg = (n, fn) => sandbox.ServiceRegistry.register(n, fn, { pluginId:'test' });
  reg('runtime.npc.dialogue', (npc) => `${npc.nombre}: hola.`);
  reg('runtime.npc.interact', () => null);
  reg('runtime.npc.observe',  (npc) => [`${npc.nombre} es ${npc.arq_vis}`]);
  reg('runtime.npc.check_twists', () => []);
  reg('runtime.npc.gen_mission',  (npc) => ({ id:`m_${npc.id}`, titulo:'misión test', desc:'desc', recompensa:'XP', tipo:'búsqueda', npc_id:npc.id, aceptada:false, completada:false, fallida:false, consecuencia_fallo:'—' }));
  reg('runtime.npc.despair', () => true);
}

function runCmd(sandbox, verb, args=[]) {
  const cmd = sandbox.CommandRegistry.resolve(verb);
  assert.ok(cmd, `Comando "${verb}" no esta registrado`);
  assert.ok(typeof cmd.handler === 'function', `handler de "${verb}" no es funcion`);
  return cmd.handler(args, sandbox.CTX);
}

// ════════════════════════════════════════════════════════════════
// TESTS
// ════════════════════════════════════════════════════════════════

(function testNPCHandlersRegistered() {
  const ctx = loadSandbox();
  loadPlugin(ctx.sandbox, 'plugins/plugin-npcs.js');
  ctx.sandbox.PluginLoader.register(ctx.sandbox.pluginNPCs); stubNpcServicesAfterRegister(ctx.sandbox);

  ['hablar','preguntar','observar','traicionar','npcs','misiones','aceptar','rechazar','completar']
    .forEach(verb => {
      assert.ok(ctx.sandbox.CommandRegistry.has(verb), `"${verb}" debe estar registrado por plugin-npcs`);
    });
})();

(function testCmdNPCsListsAlice() {
  const ctx = loadSandbox();
  loadPlugin(ctx.sandbox, 'plugins/plugin-npcs.js');
  ctx.sandbox.PluginLoader.register(ctx.sandbox.pluginNPCs); stubNpcServicesAfterRegister(ctx.sandbox);
  runCmd(ctx.sandbox, 'npcs', []);
  const hasAlice = ctx.outLines.some(l => /Alice/.test(l.text || ''));
  const hasHeader = ctx.outLines.some(l => /PERSONAS DEL MUNDO/.test(l.text || ''));
  assert.ok(hasHeader, 'cmdNPCs debe imprimir encabezado');
  assert.ok(hasAlice, 'cmdNPCs debe listar a Alice');
})();

(function testCmdHablarOnNpc() {
  const ctx = loadSandbox();
  loadPlugin(ctx.sandbox, 'plugins/plugin-npcs.js');
  ctx.sandbox.PluginLoader.register(ctx.sandbox.pluginNPCs); stubNpcServicesAfterRegister(ctx.sandbox);
  runCmd(ctx.sandbox, 'hablar', ['Alice']);
  const dialog = ctx.outLines.some(l => /Alice:/.test(l.text || ''));
  assert.ok(dialog, 'cmdHablar debe imprimir dialogo del NPC');
  assert.ok(ctx.battleStore.saved >= 1, 'cmdHablar debe llamar save() al terminar');
})();

(function testCmdPreguntarSecretoRespectsLealtad() {
  const ctx = loadSandbox();
  loadPlugin(ctx.sandbox, 'plugins/plugin-npcs.js');
  ctx.sandbox.PluginLoader.register(ctx.sandbox.pluginNPCs); stubNpcServicesAfterRegister(ctx.sandbox);
  // Alice tiene lealtad=55 (>50). Pregunta por "secreto" debe revelar.
  runCmd(ctx.sandbox, 'preguntar', ['Alice','secreto']);
  const reveal = ctx.outLines.some(l => /mata por reflejo/.test(l.text || ''));
  assert.ok(reveal, 'preguntar secreto con lealtad alta debe revelar');
  assert.strictEqual(ctx.npcAlice.secreto_expuesto, true, 'secreto_expuesto debe quedar true');
})();

(function testCmdObservarReadsNPC() {
  const ctx = loadSandbox();
  loadPlugin(ctx.sandbox, 'plugins/plugin-npcs.js');
  ctx.sandbox.PluginLoader.register(ctx.sandbox.pluginNPCs); stubNpcServicesAfterRegister(ctx.sandbox);
  runCmd(ctx.sandbox, 'observar', ['Alice']);
  const header = ctx.outLines.some(l => /OBSERVACIÓN: Alice/.test(l.text || ''));
  assert.ok(header, 'cmdObservar debe imprimir encabezado');
})();

(function testCmdTraicionarMutatesNPC() {
  const ctx = loadSandbox();
  loadPlugin(ctx.sandbox, 'plugins/plugin-npcs.js');
  ctx.sandbox.PluginLoader.register(ctx.sandbox.pluginNPCs); stubNpcServicesAfterRegister(ctx.sandbox);
  const desperBefore = ctx.npcAlice.desesperacion;
  runCmd(ctx.sandbox, 'traicionar', ['Alice']);
  assert.strictEqual(ctx.npcAlice.lealtad, 0, 'lealtad debe quedar en 0');
  assert.ok(ctx.npcAlice.desesperacion > desperBefore, 'desesperacion debe subir');
  assert.ok(ctx.battleStore.saved >= 1, 'save() llamado');
})();

(function testCmdMisionesListsActivas() {
  const ctx = loadSandbox();
  loadPlugin(ctx.sandbox, 'plugins/plugin-npcs.js');
  ctx.sandbox.PluginLoader.register(ctx.sandbox.pluginNPCs); stubNpcServicesAfterRegister(ctx.sandbox);
  // Crear una mision activa manualmente
  ctx.sandbox.GS.addMision({ id:'m1', titulo:'Test', desc:'d', tipo:'búsqueda', npc_id:'npc_alice', aceptada:true, completada:false, fallida:false, consecuencia_fallo:'—' });
  runCmd(ctx.sandbox, 'misiones', []);
  const hasMision = ctx.outLines.some(l => /Test/.test(l.text || ''));
  assert.ok(hasMision, 'cmdMisiones debe listar misiones activas');
})();

(function testCmdLegadosNoCrash() {
  const ctx = loadSandbox();
  loadPlugin(ctx.sandbox, 'plugins/plugin-npcs.js');
  ctx.sandbox.PluginLoader.register(ctx.sandbox.pluginNPCs); stubNpcServicesAfterRegister(ctx.sandbox);
  runCmd(ctx.sandbox, 'legados', []);
  const header = ctx.outLines.some(l => /ECOS DE RUNS|Primera run|Sin runs/.test(l.text || ''));
  assert.ok(header, 'cmdLegados debe imprimir mensaje (Primera run en sandbox)');
})();

(function testForgeHandlersRegistered() {
  const ctx = loadSandbox();
  loadPlugin(ctx.sandbox, 'plugins/plugin-forja.js');
  ctx.sandbox.PluginLoader.register(ctx.sandbox.pluginForja);
  ['forjar','recetas','materiales','fusionar'].forEach(verb => {
    assert.ok(ctx.sandbox.CommandRegistry.has(verb), `"${verb}" debe estar registrado por plugin-forja`);
  });
})();

(function testCmdRecetasShowsAffinities() {
  const ctx = loadSandbox();
  loadPlugin(ctx.sandbox, 'plugins/plugin-forja.js');
  ctx.sandbox.PluginLoader.register(ctx.sandbox.pluginForja);
  runCmd(ctx.sandbox, 'recetas', []);
  const hasGuia = ctx.outLines.some(l => /GUÍA DE AFINIDADES/.test(l.text || ''));
  const hasFuegoHielo = ctx.outLines.some(l => /fuego:hielo/.test(l.text || ''));
  assert.ok(hasGuia, 'cmdRecetas debe imprimir encabezado');
  assert.ok(hasFuegoHielo, 'cmdRecetas debe listar fuego:hielo de D.tagAff');
})();

(function testCmdMaterialesListsCatalog() {
  const ctx = loadSandbox();
  loadPlugin(ctx.sandbox, 'plugins/plugin-forja.js');
  ctx.sandbox.PluginLoader.register(ctx.sandbox.pluginForja);
  runCmd(ctx.sandbox, 'materiales', []);
  const hasMat = ctx.outLines.some(l => /piel_lobo/.test(l.text || ''));
  assert.ok(hasMat, 'cmdMateriales debe listar D.mats');
})();

(function testBattleEngineHasAtacar() {
  const ctx = loadSandbox();
  loadPlugin(ctx.sandbox, 'plugins/plugin-battle-engine.js');
  ctx.sandbox.PluginLoader.register(ctx.sandbox.pluginBattleEngine);
  assert.ok(ctx.sandbox.CommandRegistry.has('atacar'), '"atacar" debe estar registrado por plugin-battle-engine');
  assert.ok(ctx.sandbox.CommandRegistry.has('examinar'), '"examinar" debe estar registrado por plugin-battle-engine');
})();

(function testCmdAtacarStartsBattleAgainstEnemy() {
  const ctx = loadSandbox();
  loadPlugin(ctx.sandbox, 'plugins/plugin-battle-engine.js');
  ctx.sandbox.PluginLoader.register(ctx.sandbox.pluginBattleEngine);
  // Insertar un enemigo en el nodo
  ctx.nodes.n1.enemies.push({ id:'e1', nombre:'Lobo', hp:18, atk:8, def:1 });
  runCmd(ctx.sandbox, 'atacar', ['Lobo']);
  assert.ok(ctx.events.some(e => e.ev === 'combat:start'), 'cmdAtacar debe iniciar batalla');
})();

(function testCreatureHandlersRegistered() {
  const ctx = loadSandbox();
  loadPlugin(ctx.sandbox, 'plugins/plugin-criaturas.js');
  ctx.sandbox.PluginLoader.register(ctx.sandbox.pluginCreaturas);
  ['criaturas','comp','capturar','liberar','modo','nombrar','criar','anclas','vincular']
    .forEach(verb => {
      assert.ok(ctx.sandbox.CommandRegistry.has(verb), `"${verb}" debe estar registrado por plugin-criaturas`);
    });
})();

(function testCmdCompañerosEmptyState() {
  const ctx = loadSandbox();
  loadPlugin(ctx.sandbox, 'plugins/plugin-criaturas.js');
  ctx.sandbox.PluginLoader.register(ctx.sandbox.pluginCreaturas);
  runCmd(ctx.sandbox, 'criaturas', []);
  const empty = ctx.outLines.some(l => /Sin compañeros|COMPAÑEROS/.test(l.text || ''));
  assert.ok(empty, 'cmd criaturas/comp debe imprimir mensaje en sandbox vacio');
})();

(function testCmdAnclasListsInventory() {
  const ctx = loadSandbox();
  loadPlugin(ctx.sandbox, 'plugins/plugin-criaturas.js');
  ctx.sandbox.PluginLoader.register(ctx.sandbox.pluginCreaturas);
  ctx.player.inventory.push({ id:'i1', blueprint:'ancla_simple', nombre:'Ancla Simple', categoria:'ancla', tags:['ancla'] });
  runCmd(ctx.sandbox, 'anclas', []);
  const hasAncla = ctx.outLines.some(l => /Ancla Simple|ancla_simple/.test(l.text || ''));
  assert.ok(hasAncla, 'cmdAnclas debe listar anclas del inventario');
})();

console.log('OK commands_migration_smoke');
