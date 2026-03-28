#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

(function testRuntimeMemoryServicesRegistered() {
  const coreSrc = fs.readFileSync('core/core.js', 'utf8') + '\n;globalThis.__core = { ServiceRegistry };';
  const runMemSrc = fs.readFileSync('systems/run-memory.js', 'utf8');

  const sandbox = {
    console,
    globalThis: null,
    localStorage: { getItem: ()=>null, setItem: ()=>{} },
    U: { uid: ()=> 'R1' },
    Clock: { cycle:0, get:()=>({ name:'alba' }) },
    ModuleLoader: { list: ()=>[] },
    PluginLoader: { order: [] },
    GS: { allArcs: ()=>[] },
    EventBus: { emit: (ev,p)=>p },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(coreSrc, sandbox, { filename:'core/core.js' });
  vm.runInContext(runMemSrc, sandbox, { filename:'systems/run-memory.js' });

  const { ServiceRegistry } = sandbox.__core;
  [
    'runtime.memory.runs',
    'runtime.memory.ecos',
    'runtime.memory.count',
    'runtime.memory.data.get',
    'runtime.memory.data.set',
    'runtime.memory.save',
  ].forEach((name)=> assert.strictEqual(ServiceRegistry.has(name), true, `missing service ${name}`));
})();

console.log('OK runtime_memory_services_smoke');
