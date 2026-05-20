#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const { readCoreSource } = require('./helpers/load-core');

(function testRuntimeMemoryServicesRegistered() {
  const coreSrc = readCoreSource() + '\n;globalThis.__core = { ServiceRegistry };';
  const runMemSrc = fs.readFileSync('systems/run-memory.js', 'utf8');

  const sandbox = {
    console,
    globalThis: null,
    localStorage: { getItem: ()=>null, setItem: ()=>{} },
    Clock: { cycle:0, get:()=>({ name:'alba' }) },
    GS: { allArcs: ()=>[] },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(coreSrc, sandbox, { filename:'core/*.js' });
  // U.uid de los nuevos modulos de core ya esta disponible; lo
  // sobrescribimos a determinista solo para el test.
  vm.runInContext(`U.uid = () => 'R1';`, sandbox);
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
