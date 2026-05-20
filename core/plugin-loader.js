// ════════════════════════════════════════════════════════════════
// CORE / PluginLoader (M1 del audit: split de core.js)
//
// Registra plugins JS o JSON. Resuelve dependencias topologicamente
// (requires.plugins/services + load.after/before), valida semver, monta
// hooks en EventBus y comandos en CommandRegistry, expone servicios al
// ServiceRegistry y mantiene el ciclo de vida (onLoad/onUnload).
//
// Implementa la vista filtrada de CTX (`_buildCtxView`) que cierra A5
// del audit: cada plugin con `permissions` declaradas recibe solo lo
// listado segun la politica activa.
//
// Depende de: U/semver (utils.js), EventBus, ServiceRegistry,
// CommandRegistry, ModuleLoader. Tambien de la global `CTX` (lazy,
// solo en register/onLoad/run).
// ════════════════════════════════════════════════════════════════
'use strict';

const PluginLoader = {
  plugins: {},
  order:   [],
  _pending: [],
  _lastBatchOrder: [],
  _eventsVersion: '0.1.0',

  _parseDep(raw='') {
    const m = String(raw).match(/^([^<>=\s]+)\s*(.*)$/);
    if(!m) return { id:String(raw), range:'*' };
    return { id:m[1], range:(m[2]||'*').trim() || '*' };
  },
  _providedServices(def={}) {
    const fromInline = Object.keys(def.services || {});
    const fromManifest = (def.provides?.services || []).filter(Boolean);
    return [...new Set([...fromInline, ...fromManifest])];
  },
  setEventsVersion(v='0.1.0') {
    this._eventsVersion = String(v || '0.1.0');
  },
  eventsVersion() {
    return this._eventsVersion || '0.1.0';
  },
  _eventsVersionFromRuntime() {
    const v = CTX?.runtime?.eventsVersion;
    if(typeof v === 'string' && v.trim()) return v.trim();
    return this.eventsVersion();
  },
  _dependencyErrors(def) {
    const errs = [];
    const req = def.requires || {};
    const reqPlugins = req.plugins || [];
    for(const depRaw of reqPlugins) {
      const dep = this._parseDep(depRaw);
      const p = this.plugins[dep.id]?.def;
      if(!p) { errs.push(`Falta plugin requerido: ${dep.id}`); continue; }
      if(dep.range!=='*' && !_satisfiesVersion(p.version||'0.0.0', dep.range))
        errs.push(`Versión inválida para ${dep.id}: ${p.version||'0.0.0'} !~ ${dep.range}`);
    }
    const reqServices = req.services || [];
    for(const s of reqServices)
      if(!ServiceRegistry.has(s)) errs.push(`Falta servicio requerido: ${s}`);
    const reqEvents = req.events || {};
    const runtimeEventsVersion = this._eventsVersionFromRuntime();
    for(const [ev, range] of Object.entries(reqEvents)) {
      const spec = EventBus.spec(ev);
      if(!spec) { errs.push(`Falta evento requerido: ${ev}`); continue; }
      const wanted = String(range || '*').trim() || '*';
      if(wanted !== '*' && !_satisfiesVersion(runtimeEventsVersion, wanted))
        errs.push(`Versión de contrato de eventos inválida para ${ev}: ${runtimeEventsVersion} !~ ${wanted}`);
    }
    for(const c of (def.conflicts||[]))
      if(this.plugins[c]) errs.push(`Conflicto con plugin activo: ${c}`);
    const load = def.load || {};
    for(const afterId of (load.after||[]))
      if(!this.plugins[afterId]) errs.push(`Orden inválido: requiere cargar después de ${afterId}`);
    for(const beforeId of (load.before||[]))
      if(this.plugins[beforeId]) errs.push(`Orden inválido: debía cargar antes de ${beforeId}`);
    return errs;
  },
  _dependencyOrder(defs=[]) {
    const map = new Map(defs.filter(Boolean).map(d=>[d.id, d]));
    const serviceProviders = new Map();
    const indeg = new Map();
    const out = new Map();
    for(const id of map.keys()) { indeg.set(id, 0); out.set(id, new Set()); }
    for(const d of map.values()) {
      for(const svc of this._providedServices(d)) {
        if(!serviceProviders.has(svc)) serviceProviders.set(svc, new Set());
        serviceProviders.get(svc).add(d.id);
      }
    }

    const addEdge = (from, to) => {
      if(!map.has(from) || !map.has(to) || from===to) return;
      if(out.get(from).has(to)) return;
      out.get(from).add(to);
      indeg.set(to, (indeg.get(to)||0) + 1);
    };

    for(const d of map.values()) {
      const req = d.requires || {};
      (req.plugins||[]).forEach(raw => {
        const dep = this._parseDep(raw);
        addEdge(dep.id, d.id);
      });
      (req.services||[]).forEach(svc => {
        const providers = [...(serviceProviders.get(svc) || [])];
        providers.forEach(pid => addEdge(pid, d.id));
      });
      const load = d.load || {};
      (load.after||[]).forEach(afterId => addEdge(afterId, d.id));
      (load.before||[]).forEach(beforeId => addEdge(d.id, beforeId));
    }

    const q = [...map.keys()].filter(id => (indeg.get(id)||0)===0).sort();
    const sorted = [];
    while(q.length) {
      const id = q.shift();
      sorted.push(map.get(id));
      for(const to of out.get(id)||[]) {
        indeg.set(to, indeg.get(to)-1);
        if(indeg.get(to)===0) {
          q.push(to);
          q.sort();
        }
      }
    }
    const unresolved = [...map.keys()].filter(id => !sorted.find(d=>d.id===id)).map(id => map.get(id));
    const unresolvedSet = new Set(unresolved.map(d=>d.id));
    const cycles = [];
    for(const d of unresolved) {
      const deps = [];
      const req = d.requires || {};
      for(const raw of (req.plugins||[])) {
        const dep = this._parseDep(raw).id;
        if(unresolvedSet.has(dep)) deps.push(`plugin:${dep}`);
      }
      for(const svc of (req.services||[])) {
        const providers = [...(serviceProviders.get(svc) || [])].filter(pid => unresolvedSet.has(pid));
        if(providers.length) deps.push(`service:${svc}→[${providers.join(',')}]`);
      }
      for(const dep of (d.load?.after||[])) if(unresolvedSet.has(dep)) deps.push(`after:${dep}`);
      for(const dep of (d.load?.before||[])) if(unresolvedSet.has(dep)) deps.push(`before:${dep}`);
      if(deps.length) cycles.push({ id:d.id, deps });
    }
    return { sorted, unresolved, cycles };
  },
  registerMany(defs=[]) {
    const orderRes = this._dependencyOrder(defs);
    this._lastBatchOrder = orderRes.sorted.map(d=>d.id);
    const pending = [...orderRes.sorted, ...orderRes.unresolved];
    let loaded = 0;
    let advanced = true;
    while(pending.length && advanced) {
      advanced = false;
      for(let i=pending.length-1; i>=0; i--) {
        const def = pending[i];
        if(!this._dependencyErrors(def).length) {
          if(this.register(def)) loaded++;
          pending.splice(i,1);
          advanced = true;
        }
      }
    }
    if(pending.length) {
      const cycleById = new Map((orderRes.cycles||[]).map(c => [c.id, c]));
      this._pending = pending.map(d=>{
        const errors = this._dependencyErrors(d);
        const cyc = cycleById.get(d.id);
        if(cyc) errors.push(`Posible ciclo de dependencias: ${cyc.deps.join(' ; ')}`);
        return { id:d.id, errors };
      });
      pending.forEach(d=>{
        const cyc = cycleById.get(d.id);
        const errs = [...this._dependencyErrors(d)];
        if(cyc) errs.push(`Posible ciclo de dependencias: ${cyc.deps.join(' ; ')}`);
        console.warn(`[PluginLoader] pendiente ${d.id}:`, errs.join(' | '));
      });
    } else {
      this._pending = [];
    }
    return loaded;
  },

  register(def) {
    if(!def?.id) { console.warn('Plugin sin id.'); return false; }
    if(this.plugins[def.id]) { console.warn(`Plugin "${def.id}" ya registrado.`); return false; }
    const depErrs = this._dependencyErrors(def);
    if(depErrs.length) {
      console.warn(`[PluginLoader] ${def.id} no cargado por dependencias:`, depErrs.join(' | '));
      EventBus.emit('plugin:error', { id:def.id, errors:depErrs });
      return false;
    }
    const store = {};
    this.plugins[def.id] = { def, store };
    this.order.push(def.id);

    // Fusionar datos del módulo declarativo
    if(def.modulo) ModuleLoader.apply({ meta:{ id:`plugin:${def.id}` }, ...def.modulo });

    // Registrar hooks en EventBus
    for(const [event, hookDef] of Object.entries(def.hooks||{})) {
      const handler = this._buildHandler(def, hookDef);
      if(handler) EventBus.on(event, handler, def.id, { priority: hookDef.priority ?? 50, phase: hookDef.phase ?? 'main' });
    }

    // Registrar comandos con metadatos de ayuda
    for(const [verb, cmdDef] of Object.entries(def.comandos||{})) {
      const handler = this._buildCmdHandler(def, cmdDef);
      CommandRegistry.register(verb, handler, def.id, cmdDef.meta || {});
    }

    for(const [name, svcDef] of Object.entries(def.services||{})) {
      if(typeof svcDef === 'function') {
        ServiceRegistry.register(name, svcDef, { pluginId:def.id, version:def.version||'0.0.0' });
      } else if(typeof svcDef?.fn === 'function') {
        ServiceRegistry.register(name, svcDef.fn, { pluginId:def.id, version:svcDef.version||def.version||'0.0.0', meta:svcDef.meta||{} });
      }
    }

    // Montar entradas en la status bar
    if(def.statusBar?.length) this._mountStatusBar(def);

    if(typeof def.onLoad === 'function') def.onLoad(CTX);

    EventBus.emit('plugin:loaded', { id:def.id, nombre:def.nombre });
    return true;
  },

  registerFromJSON(json) {
    const handlers = json.handlers || {};
    const compiled = {
      id: json.id, nombre: json.nombre, version: json.version,
      descripcion: json.descripcion, modulo: json.modulo,
      statusBar: json.statusBar, hooks:{}, comandos:{},
      requires: json.requires, conflicts: json.conflicts,
      load: json.load,
      services: json.services || {},
    };
    for(const [event, hookDef] of Object.entries(json.hooks||{})) {
      const fnStr = handlers[hookDef.fn];
      if(!fnStr) continue;
      try { compiled.hooks[event] = { ...hookDef, _compiled: new Function('payload','ctx',fnStr) }; }
      catch(e) { console.warn(`Plugin ${json.id}: hook ${event}:`, e); }
    }
    for(const [verb, cmdDef] of Object.entries(json.comandos||{})) {
      const fnStr = handlers[cmdDef.fn];
      if(!fnStr) continue;
      try { compiled.comandos[verb] = { ...cmdDef, _compiled: new Function('args','ctx',fnStr) }; }
      catch(e) { console.warn(`Plugin ${json.id}: comando ${verb}:`, e); }
    }
    return this.register(compiled);
  },

  unregister(pluginId) {
    const p = this.plugins[pluginId]; if(!p) return;
    EventBus.off(pluginId);
    CommandRegistry.unregister(pluginId);
    ServiceRegistry.unregisterByPlugin(pluginId);
    this._unmountStatusBar(pluginId);
    if(typeof p.def.onUnload === 'function') p.def.onUnload(CTX);
    delete this.plugins[pluginId];
    this.order = this.order.filter(id=>id!==pluginId);
    EventBus.emit('plugin:unloaded', { id:pluginId });
  },

  get(id)           { return this.plugins[id]||null; },
  list()            { return this.order.map(id=>this.plugins[id]?.def); },
  getStore(pluginId){ return this.plugins[pluginId]?.store||{}; },
  pending()         { return [...this._pending]; },
  lastBatchOrder()  { return [...this._lastBatchOrder]; },

  ser() {
    const out={};
    for(const [id,p] of Object.entries(this.plugins))
      out[id] = typeof p.def.onSave==='function' ? p.def.onSave(CTX) : p.store;
    return out;
  },
  load(data) {
    for(const [id,d] of Object.entries(data||{})) {
      const p = this.plugins[id]; if(!p) continue;
      if(typeof p.def.onLoadSave==='function') p.def.onLoadSave(d,CTX);
      else Object.assign(p.store,d);
    }
  },

  _buildHandler(def, hookDef) {
    const inner = hookDef._compiled
      ? (payload, ctx)=>hookDef._compiled(payload, ctx)
      : (typeof hookDef.fn === 'function' ? hookDef.fn
      :  typeof hookDef === 'function'    ? hookDef
      :  null);
    if(typeof inner !== 'function') return null;
    if(!def.permissions) return inner;
    const self = this;
    return (payload, ctx) => inner(payload, self._buildCtxView(def, ctx));
  },
  _buildCmdHandler(def, cmdDef) {
    const inner = cmdDef._compiled
      ? (args, ctx)=>cmdDef._compiled(args, ctx)
      : (typeof cmdDef.fn === 'function' ? cmdDef.fn
      :  typeof cmdDef === 'function'    ? cmdDef
      :  null);
    if(typeof inner !== 'function') return null;
    if(!def.permissions) return inner;
    const self = this;
    return (args, ctx) => inner(args, self._buildCtxView(def, ctx));
  },
  _permissionsPolicy: 'off',
  setPermissionsPolicy(policy='off') {
    const p = String(policy || '').toLowerCase();
    this._permissionsPolicy = ['off', 'warn', 'strict'].includes(p) ? p : 'off';
  },
  permissionsPolicy() { return this._permissionsPolicy; },
  // Construye una vista filtrada de CTX segun def.permissions (A5 del audit).
  // permissions: { allow: ['U','EventBus','D',...], runtime: ['player','world',...] }
  // - Sin permissions: el handler ya devuelve ctx sin tocar (en _buildHandler).
  // - Policy 'off':    devuelve ctx tal cual (proxy desactivado).
  // - Policy 'warn':   proxy que loggea cualquier acceso no declarado y deja pasar.
  // - Policy 'strict': proxy que devuelve undefined para accesos no declarados.
  // Las claves metadatos de runtime (version, eventsVersion, events, modules,
  // plugins, commands, services) quedan siempre disponibles porque son
  // primitivas de plataforma, no de dominio.
  _buildCtxView(def, ctx) {
    if(!ctx) return ctx;
    const policy = this._permissionsPolicy;
    if(policy === 'off') return ctx;
    const perms = def.permissions || {};
    const allow        = new Set(perms.allow || []);
    const runtimeAllow = new Set(perms.runtime || []);
    const RUNTIME_META = new Set(['version','eventsVersion','events','modules','plugins','commands','services']);
    const warn = (key) => {
      if(policy === 'warn') console.warn(`[PluginLoader] ${def.id}: acceso a ctx.${key} no declarado en permissions`);
    };

    let runtimeView = null;
    const ctxRuntime = ctx.runtime;
    if(ctxRuntime && typeof ctxRuntime === 'object') {
      runtimeView = new Proxy(ctxRuntime, {
        get(target, key) {
          if(typeof key !== 'string') return target[key];
          if(RUNTIME_META.has(key) || runtimeAllow.has(key)) return target[key];
          warn(`runtime.${key}`);
          return policy === 'strict' ? undefined : target[key];
        },
      });
    }

    return new Proxy(ctx, {
      get(target, key) {
        if(typeof key !== 'string') return target[key];
        if(key === 'runtime') return runtimeView ?? target.runtime;
        if(allow.has(key)) return target[key];
        warn(key);
        return policy === 'strict' ? undefined : target[key];
      },
    });
  },
  _mountStatusBar(def) {
    const container = document.getElementById('plugin-stats'); if(!container) return;
    for(const sb of (def.statusBar||[])) {
      const el = document.createElement('div');
      el.className='st'; el.id=`psb-${def.id}-${sb.id}`;
      el.innerHTML=`${sb.label} <span class="${sb.color||''}">—</span>`;
      container.appendChild(el);
    }
  },
  _unmountStatusBar(pluginId) {
    const def = this.plugins[pluginId]?.def;
    for(const sb of (def?.statusBar||[]))
      document.getElementById(`psb-${pluginId}-${sb.id}`)?.remove();
  },
  updateStatusBar() {
    const player = Player.get();
    for(const [pid,p] of Object.entries(this.plugins)) {
      for(const sb of (p.def.statusBar||[])) {
        const el = document.getElementById(`psb-${pid}-${sb.id}`); if(!el) continue;
        let val='—';
        try {
          if(typeof sb.getValue==='function') val=sb.getValue(player,CTX);
          else if(typeof sb.getValue==='string')
            val=new Function('player','ctx',`return ${sb.getValue}`)(player,CTX);
        } catch{}
        const span=el.querySelector('span');
        if(span) { span.textContent=val; span.className=sb.color||''; }
      }
    }
  },
};

globalThis.PluginLoader = PluginLoader;
