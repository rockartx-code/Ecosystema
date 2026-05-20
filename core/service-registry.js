// ════════════════════════════════════════════════════════════════
// CORE / ServiceRegistry (M1 del audit: split de core.js)
//
// Registro de capacidades runtime (runtime.player.*, runtime.battle.*,
// runtime.npc.*, etc.). Plugins y systems se descubren entre si via
// register/get/has/call sin acoplarse a nombres de archivos.
// Sin dependencias: es la primera capa de aislamiento.
// ════════════════════════════════════════════════════════════════
'use strict';

const ServiceRegistry = {
  _services: {},

  register(name, fn, opts={}) {
    if(!name || typeof fn !== 'function') return false;
    this._services[name] = {
      fn,
      pluginId: opts.pluginId || 'core',
      version:  opts.version  || '0.0.0',
      meta:     opts.meta     || {},
    };
    return true;
  },
  get(name) { return this._services[name]?.fn || null; },
  info(name){ return this._services[name] || null; },
  has(name) { return !!this._services[name]; },
  call(name, ...args) { return this._services[name]?.fn?.(...args); },
  list() {
    return Object.entries(this._services).map(([name,s])=>({ name, pluginId:s.pluginId, version:s.version, meta:s.meta }));
  },
  unregisterByPlugin(pluginId) {
    for(const [k,s] of Object.entries(this._services))
      if(s.pluginId===pluginId) delete this._services[k];
  },
};

globalThis.ServiceRegistry = ServiceRegistry;
