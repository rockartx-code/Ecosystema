// ════════════════════════════════════════════════════════════════
// CORE / ModuleLoader (M1 del audit: split de core.js)
//
// Gestiona los datos declarativos del juego (data/module.json + bundles).
// Los plugins y el modulo base escriben aqui (apply/fromBundle); el
// resto del runtime lee via get(path) o getSystemData/getPluginDefs.
// Depende de U.deepMerge y EventBus.emit (carga en ese orden).
// ════════════════════════════════════════════════════════════════
'use strict';

const ModuleLoader = {
  loaded: [], data: {}, bundle: { plugins:[], systems:[] },

  get(path)    { return path.split('.').reduce((o,k)=>o?.[k], this.data); },
  apply(json)  {
    this.data = U.deepMerge(this.data, json);
    const id = json.meta?.id || '?';
    if(!this.loaded.includes(id)) this.loaded.push(id);
    EventBus.emit('module:loaded', { meta:json.meta, data:json });
  },
  fromElement(id) {
    const el = document.getElementById(id);
    if(!el) return null;
    this.apply(JSON.parse(el.textContent));
    return this.loaded[this.loaded.length-1];
  },
  fromString(str) { this.apply(JSON.parse(str)); return this.loaded[this.loaded.length-1]; },
  fromBundle(bundle={}) {
    const b = bundle && typeof bundle === 'object' ? bundle : {};
    this.bundle = {
      plugins: Array.isArray(b.plugins) ? b.plugins : [],
      systems: Array.isArray(b.systems) ? b.systems : [],
    };
    if(b.module && typeof b.module === 'object') this.apply(b.module);
    EventBus.emit('module:bundle_loaded', { meta:b.meta || null, plugins:this.bundle.plugins.length, systems:this.bundle.systems.length });
    return this.bundle;
  },
  getSystemData(name, fallback={}) {
    const row = (this.bundle.systems || []).find(s => s && s.name === name);
    const data = row?.data;
    return data && typeof data === 'object' && !Array.isArray(data) ? data : fallback;
  },
  getPluginDefs() {
    return (this.bundle.plugins || [])
      .map(p => p?.data)
      .filter(p => p && typeof p === 'object');
  },
  list() { return this.loaded; },
};

globalThis.ModuleLoader = ModuleLoader;
