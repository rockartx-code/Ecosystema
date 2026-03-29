#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function createDomStub() {
  const ac = {
    id: 'ac',
    style: { display: 'none' },
    children: [],
    innerHTML: '',
    appendChild(node) { this.children.push(node); },
    querySelectorAll(selector) {
      if(selector !== '.ac-item') return [];
      return this.children.filter(c => c.className && c.className.includes('ac-item'));
    },
  };

  const inp = { id: 'inp', value: '', focus(){} };
  return {
    ac,
    inp,
    document: {
      getElementById(id) {
        if(id === 'ac') return ac;
        if(id === 'inp') return inp;
        return null;
      },
      createElement() {
        return {
          className: '',
          dataset: {},
          textContent: '',
          innerHTML: '',
          style: {},
          addEventListener() {},
          appendChild() {},
          scrollIntoView() {},
          classList: { toggle() {} },
        };
      },
    },
  };
}

function loadAutocomplete(precedence = null) {
  const dom = createDomStub();
  let cfgPrecedence = precedence;

  const sandbox = {
    console,
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    document: dom.document,
    ModuleLoader: {
      get(path) {
        if(path === 'cli_autocomplete.precedence') return cfgPrecedence;
        return null;
      },
    },
    Player: {
      pos: () => 'n0',
      get: () => ({
        name: 'Tester',
        inventory: [{ blueprint:'mat_base', nombre:'Mat Base', tipo:'material' }],
        habilidades: [],
        magias: [],
        compañeros: [],
      }),
    },
    World: {
      node: () => ({ loot: [], creatures: [], enemies: [] }),
      exits: () => ({}),
    },
    GS: { npcEnNodo: () => [], activas: () => [], mision: () => null },
    D: { mat: () => ({}), matTags: () => [] },
    U: { clamp: (x, a, b) => Math.max(a, Math.min(b, x)) },
    PluginLoader: { order: [] },
    CommandRegistry: { commands: {} },
    Net: { getMyBattle: () => null },
    ServiceRegistry: {
      register() {},
      get(name) {
        if(name === 'runtime.xp.read') return () => ({ atributos:{} });
        return null;
      },
    },
    globalThis: null,
  };
  sandbox.globalThis = sandbox;

  const src = fs.readFileSync('systems/autocomplete.js', 'utf8') + '\n;globalThis.__AC = AC;';
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename:'systems/autocomplete.js' });

  function labels() {
    return dom.ac.children
      .filter(c => c.className && c.className.includes('ac-item'))
      .map(c => {
        const m = String(c.innerHTML || '').match(/>([^<]+)<\/span><span class="ac-hint">/);
        return m ? m[1] : '';
      });
  }

  function resolveForjar(policy) {
    cfgPrecedence = policy;
    dom.ac.children = [];
    dom.ac.innerHTML = '';
    dom.inp.value = 'forjar ';
    sandbox.__AC.update();
    return labels();
  }

  return { AC: sandbox.__AC, resolveForjar };
}

(function testAutocompletePrecedencePolicies() {
  const { AC, resolveForjar } = loadAutocomplete(null);
  AC.registerProvider({
    id: 'test.forjar.provider',
    triggers: ['forjar'],
    priority: 10,
    pluginId: 'test',
    provide: () => [
      { label:'Mat Provider', value:'mat_provider', hint:'provider', group:'inventario', color:'t-mag' },
      { label:'Mat Base Duplicada', value:'mat_base', hint:'dup', group:'inventario', color:'t-mag' },
    ],
  });

  const baseFirst = resolveForjar('base_first');
  assert.deepStrictEqual(baseFirst, ['Mat Base', 'Mat Provider']);

  const providersFirst = resolveForjar('providers_first');
  assert.deepStrictEqual(providersFirst, ['Mat Provider', 'Mat Base Duplicada']);

  const providersOnly = resolveForjar('providers_only');
  assert.deepStrictEqual(providersOnly, ['Mat Provider', 'Mat Base Duplicada']);

  const baseOnly = resolveForjar('base_only');
  assert.deepStrictEqual(baseOnly, ['Mat Base']);
})();

console.log('OK autocomplete_precedence_smoke');
