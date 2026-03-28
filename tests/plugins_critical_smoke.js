#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const CRITICAL = [
  ['plugins/plugin-habilidades.js', 'pluginHabilidades'],
  ['plugins/plugin-magias.js', 'pluginMagias'],
  ['plugins/plugin-criaturas.js', 'pluginCreaturas'],
  ['plugins/plugin-facciones.js', 'pluginFacciones'],
  ['plugins/plugin-invocaciones.js', 'pluginInvocaciones'],
];

function buildSandbox() {
  const sandbox = {
    console,
    globalThis: null,
    EventBus: { on(){}, emit(){ return {}; }, request(){ return null; } },
    ServiceRegistry: { register(){ return true; }, call(){ return null; }, has(){ return false; } },
    CommandRegistry: { register(){ return true; } },
    U: {
      rng: ()=>()=>0.5,
      rand: (a,b)=> (typeof b === 'number' ? a : a),
      chance: ()=>false,
      pickN: (arr,n)=>arr.slice(0,n),
      pick: (arr)=>arr[0],
      clamp: (v,min,max)=>Math.max(min, Math.min(max, v)),
      uid: ()=> 'ID001',
      cap: (s)=> String(s||'').charAt(0).toUpperCase()+String(s||'').slice(1),
    },
    D: {},
    GS: { aliveNPCs:()=>[], activas:()=>[], allMisiones:()=>[], npcEnNodo:()=>[] },
    Clock: { get:()=>({ cycle:0, name:'alba' }) },
    World: { node:()=>({ id:'n0', tipo:'hub', name:'Nodo' }), exits:()=>({}), all:()=>({}) },
    Entity: class Entity {},
    Player: {
      get:()=>({ id:'p1', name:'Tester', ext:{}, inventory:[], habilidades:[], magias:[], compañeros:[] }),
      pos:()=> 'n0',
      getSlot:()=> 3,
      hasFlag:()=> false,
      addFlag(){},
    },
    Out: { line(){}, sp(){}, sep(){} },
    Net: { getMyBattle:()=>null, startBattle(){}, sendBattleAction(){}, getBattleActor:()=>null },
    XP: { ganar(){}, ATRIBUTOS:{} },
    Tactics: {
      HERIDAS:{}, ELEMENTOS:{}, REACCIONES:{}, CLIMAS_NODO:{},
      aplicarElemento(){}, aplicarPoiseDmg(){}, actualizarSuperficie(){},
      calcularHerida:()=>null, consumirStamina(){}, getSup:()=>({ tipo:'normal' }),
    },
    battleLog(){},
    refreshStatus(){},
    save(){},
    setTimeout: (fn)=>{ if(typeof fn==='function') fn(); return 0; },
    clearTimeout(){},
  };
  sandbox.globalThis = sandbox;
  return sandbox;
}

(function smokeCriticalPlugins() {
  const sandbox = buildSandbox();
  vm.createContext(sandbox);

  for(const [file, symbol] of CRITICAL) {
    const src = fs.readFileSync(file, 'utf8') + `\n;globalThis.__plugin = ${symbol};`;
    vm.runInContext(src, sandbox, { filename:file });
    const plugin = sandbox.__plugin;

    assert.ok(plugin && typeof plugin === 'object', `${file} debe exponer ${symbol}`);
    assert.ok(typeof plugin.id === 'string' && plugin.id.startsWith('plugin:'), `${file} id inválido`);
    assert.ok(typeof plugin.version === 'string' && /^\d+\.\d+\.\d+/.test(plugin.version), `${file} version inválida`);
    assert.ok(plugin.hooks && typeof plugin.hooks === 'object', `${file} hooks faltantes`);

    const hookNames = Object.keys(plugin.hooks);
    assert.ok(hookNames.length > 0, `${file} sin hooks`);
    hookNames.forEach((ev) => {
      const h = plugin.hooks[ev];
      assert.ok(h && typeof h.fn === 'function', `${file} hook ${ev} sin fn válida`);
    });
  }
})();

console.log('OK plugins_critical_smoke');
