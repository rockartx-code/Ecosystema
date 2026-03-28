// ════════════════════════════════════════════════════════════════
// CORE — Utilidades, Bus de Eventos, Loaders, Registro de Comandos
// Sin dependencias externas. Sin conocimiento del dominio del juego.
// ════════════════════════════════════════════════════════════════
'use strict';

// ── Utilidades puras ─────────────────────────────────────────────
const U = {
  hash(s)   { let h=2166136261; for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=(h*16777619)>>>0;} return h; },
  rng(seed) { let s=this.hash(String(seed)); return ()=>{ s^=s<<13;s^=s>>17;s^=s<<5;s=s>>>0; return s/0xFFFFFFFF; }; },
  pick(a,r)   { return a[Math.floor(r()*a.length)]; },
  pickN(a,n,r){ const c=[...a],res=[]; for(let i=0;i<n&&c.length;i++){const x=Math.floor(r()*c.length);res.push(c.splice(x,1)[0]);} return res; },
  uid()       { return Math.random().toString(36).slice(2,7).toUpperCase(); },
  hex(s)      { return this.hash(s).toString(16).slice(0,6).toUpperCase(); },
  clamp(v,a,b){ return Math.max(a,Math.min(b,v)); },
  rand(a,b)   { return Math.floor(Math.random()*(b-a+1))+a; },
  chance(p)   { return Math.random()<p; },
  cap(s)      { return s.charAt(0).toUpperCase()+s.slice(1); },
  tmpl(str,vars){ return (str||'').replace(/\{(\w+)\}/g,(_,k)=>vars[k]||`{${k}}`); },
  deepMerge(base,ext){
    const out={...base};
    for(const k of Object.keys(ext||{})){
      if(Array.isArray(ext[k])&&Array.isArray(base[k])) out[k]=[...base[k],...ext[k]];
      else if(ext[k]&&typeof ext[k]==='object'&&!Array.isArray(ext[k])&&base[k]&&typeof base[k]==='object') out[k]=U.deepMerge(base[k],ext[k]);
      else out[k]=ext[k];
    }
    return out;
  },
};

function _semverParse(v='0.0.0') {
  const [a='0',b='0',c='0'] = String(v).split('.');
  return [Number(a)||0, Number(b)||0, Number(c)||0];
}
function _semverCmp(a,b) {
  const A = _semverParse(a), B = _semverParse(b);
  for(let i=0;i<3;i++){ if(A[i] > B[i]) return 1; if(A[i] < B[i]) return -1; }
  return 0;
}
function _semverBumpMajor(v='0.0.0') {
  const [a] = _semverParse(v);
  return `${a+1}.0.0`;
}
function _semverBumpMinor(v='0.0.0') {
  const [a,b] = _semverParse(v);
  return `${a}.${b+1}.0`;
}
function _expandSemverToken(tok='') {
  const t = String(tok || '').trim();
  if(!t) return [];
  if(t.startsWith('^')) {
    const base = t.slice(1) || '0.0.0';
    const [maj,min] = _semverParse(base);
    const upper = maj > 0 ? _semverBumpMajor(base) : `0.${min+1}.0`;
    return [`>=${base}`, `<${upper}`];
  }
  if(t.startsWith('~')) {
    const base = t.slice(1) || '0.0.0';
    const [maj] = _semverParse(base);
    const upper = maj > 0 || base.includes('.') ? _semverBumpMinor(base) : _semverBumpMajor(base);
    return [`>=${base}`, `<${upper}`];
  }
  return [t];
}
function _satisfiesVersion(version='0.0.0', req='') {
  if(!req || req==='*') return true;
  const groups = String(req).split(/\s*\|\|\s*/).map(g => g.trim()).filter(Boolean);
  return groups.some(group => {
    const chunks = group.split(/\s+/).filter(Boolean).flatMap(_expandSemverToken);
    return chunks.every(tok => {
      if(tok === '*') return true;
      if(tok.startsWith('>=')) return _semverCmp(version, tok.slice(2)) >= 0;
      if(tok.startsWith('<=')) return _semverCmp(version, tok.slice(2)) <= 0;
      if(tok.startsWith('>'))  return _semverCmp(version, tok.slice(1)) > 0;
      if(tok.startsWith('<'))  return _semverCmp(version, tok.slice(1)) < 0;
      if(tok.startsWith('='))  return _semverCmp(version, tok.slice(1)) === 0;
      return _semverCmp(version, tok) === 0;
    });
  });
}

// ── EventBus ─────────────────────────────────────────────────────
// Pipeline mutable: cada listener recibe el payload del anterior.
// Si payload.cancelled === true, la cadena se detiene.
const EventBus = {
  _listeners: {},
  _history:   [],
  _traces:    [],
  _specs:     {},
  _dispatchId: 0,
  _validationPolicy: 'dev',
  _health: {},

  on(event, handler, pluginId='core', opts={}) {
    if(!this._listeners[event]) this._listeners[event]=[];
    this._listeners[event].push({
      handler, pluginId,
      priority: opts.priority ?? 50,
      once:     opts.once    ?? false,
      phase:    opts.phase   ?? 'main',
      timeoutMs: Number(opts.timeoutMs ?? 0) || 0,
      onTimeout: ['warn','cancel','error'].includes(opts.onTimeout) ? opts.onTimeout : 'warn',
    });
    this._listeners[event].sort((a,b)=>{
      const phaseOrder = { pre:0, main:1, post:2, observe:3 };
      const pa = phaseOrder[a.phase] ?? 1;
      const pb = phaseOrder[b.phase] ?? 1;
      if(pa!==pb) return pa-pb;
      return a.priority-b.priority;
    });
  },

  once(event, handler, pluginId, opts={}) {
    this.on(event, handler, pluginId, { ...opts, once:true });
  },

  off(pluginId) {
    for(const ev of Object.keys(this._listeners))
      this._listeners[ev] = this._listeners[ev].filter(l=>l.pluginId!==pluginId);
  },

  defineEvent(event, spec={}) {
    this._specs[event] = { ...this._specs[event], ...spec, event };
  },
  defineEvents(specs={}) {
    for(const [ev, spec] of Object.entries(specs||{})) this.defineEvent(ev, spec);
  },
  setValidationPolicy(policy='dev') {
    const p = String(policy || '').toLowerCase();
    this._validationPolicy = ['dev', 'strict', 'prod'].includes(p) ? p : 'dev';
  },
  validationPolicy() { return this._validationPolicy; },
  _validationIssue(event, phase, detail='') {
    const msg = `[EventBus] validate${phase}(${event}) ${detail}`.trim();
    if(this._validationPolicy === 'strict') throw new Error(msg);
    if(this._validationPolicy === 'dev') console.warn(msg);
  },
  _touchHealth(pluginId='core', patch={}) {
    const h = this._health[pluginId] || { calls:0, errors:0, timeouts:0, totalMs:0, lastMs:0, lastEvent:null, lastTs:null };
    const next = { ...h };
    if(patch.calls) next.calls += patch.calls;
    if(patch.errors) next.errors += patch.errors;
    if(patch.timeouts) next.timeouts += patch.timeouts;
    if(typeof patch.ms === 'number') {
      next.lastMs = patch.ms;
      next.totalMs += patch.ms;
    }
    if(patch.event) next.lastEvent = patch.event;
    next.lastTs = Date.now();
    this._health[pluginId] = next;
  },
  _validateIn(event, payload) {
    const spec = this._specs[event];
    if(typeof spec?.validateIn === 'function') {
      try {
        const ok = spec.validateIn(payload);
        if(ok===false) this._validationIssue(event, 'In', '→ payload inválido de entrada');
      } catch(e) { this._validationIssue(event, 'In', `falló: ${String(e?.message||e)}`); }
    }
  },
  _validateOut(event, payload) {
    const spec = this._specs[event];
    if(typeof spec?.validateOut === 'function') {
      try {
        const ok = spec.validateOut(payload);
        if(ok===false) this._validationIssue(event, 'Out', '→ payload inválido de salida');
      } catch(e) { this._validationIssue(event, 'Out', `falló: ${String(e?.message||e)}`); }
    }
  },

  emit(event, payload={}) {
    this._validateIn(event, payload);
    const dispatchId = ++this._dispatchId;
    this._history.push({ id:dispatchId, event, ts:Date.now() });
    if(this._history.length>200) this._history.shift();

    const listeners = [...(this._listeners[event]||[])];
    let current = payload;
    const toRemove = [];

    for(const l of listeners) {
      const t0 = Date.now();
      try {
        const result = l.handler(current, CTX);
        const elapsed = Date.now()-t0;
        const timedOut = l.timeoutMs > 0 && elapsed > l.timeoutMs;
        if(result !== undefined) current = result;
        if(l.once) toRemove.push(l);
        this._touchHealth(l.pluginId, { calls:1, ms:elapsed, event });
        if(timedOut) {
          this._touchHealth(l.pluginId, { timeouts:1, event });
          const msg = `[EventBus] timeout ${l.pluginId} → ${event}: ${elapsed}ms > ${l.timeoutMs}ms`;
          if(l.onTimeout === 'error') throw new Error(msg);
          if(l.onTimeout === 'cancel' && current && typeof current === 'object') current.cancelled = true;
          console.warn(msg);
        }
        if(current?.cancelled) break;
        this._traces.push({ id:dispatchId, event, pluginId:l.pluginId, phase:l.phase, ms:elapsed, ok:true, timeout:timedOut, ts:Date.now() });
      } catch(e) {
        console.warn(`[EventBus] ${l.pluginId} → ${event}:`, e);
        this._touchHealth(l.pluginId, { errors:1, ms:(Date.now()-t0), event });
        this._traces.push({ id:dispatchId, event, pluginId:l.pluginId, phase:l.phase, ms:(Date.now()-t0), ok:false, err:String(e?.message||e), ts:Date.now() });
      }
      if(this._traces.length>800) this._traces.shift();
    }

    if(toRemove.length && this._listeners[event])
      this._listeners[event] = this._listeners[event].filter(l=>!toRemove.includes(l));

    this._validateOut(event, current);
    return current;
  },

  emitCancellable(event, payload={}) {
    const token = payload?.cancelToken || { cancelled:false, reason:null };
    const result = this.emit(event, { ...payload, cancelToken:token, cancelled:false });
    return { cancelled: result?.cancelled ?? false, payload: result };
  },

  emitDomain(event, payload={}) {
    const frozen = (payload && typeof payload==='object') ? Object.freeze({ ...payload }) : payload;
    return this.emit(event, frozen);
  },
  runPipeline(event, state={}) {
    return this.emit(event, state);
  },
  request(event, payload={}, opts={ mode:'first' }) {
    const listeners = [...(this._listeners[event]||[])];
    const results = [];
    for(const l of listeners) {
      try {
        const r = l.handler(payload, CTX);
        if(r !== undefined) results.push(r);
      } catch(e) {
        console.warn(`[EventBus] request ${l.pluginId} → ${event}:`, e);
      }
    }
    if(opts?.mode==='all') return results;
    return results[0];
  },

  events()      { return Object.keys(this._listeners); },
  history(n=20) { return this._history.slice(-n); },
  listeners(event) { return [...(this._listeners[event]||[])].map(l=>({ pluginId:l.pluginId, priority:l.priority, phase:l.phase, once:l.once })); },
  trace(n=50)   { return this._traces.slice(-n); },
  health(pluginId=null) {
    if(pluginId) return this._health[pluginId] || null;
    return Object.entries(this._health).map(([id, h]) => ({ pluginId:id, ...h, avgMs:h.calls ? Number((h.totalMs/h.calls).toFixed(2)) : 0 }));
  },
  spec(event)   { return this._specs[event]||null; },
};

// ── ServiceRegistry ──────────────────────────────────────────────
// Registro de capacidades runtime para evitar dependencias globales
// entre plugins/sistemas.
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

// ── ModuleLoader ─────────────────────────────────────────────────
// Gestiona datos declarativos JSON. Los plugins y el módulo base
// escriben aquí; los sistemas leen de aquí.
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

// ── PluginLoader ─────────────────────────────────────────────────
// Registra plugins JS o JSON. Monta hooks en EventBus y comandos
// en CommandRegistry. Los plugins NO conocen el motor internamente;
// reciben CTX en cada llamada.
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
    if(hookDef._compiled) return (payload,ctx)=>hookDef._compiled(payload,ctx);
    if(typeof hookDef.fn==='function') return hookDef.fn;
    if(typeof hookDef==='function') return hookDef;
    return null;
  },
  _buildCmdHandler(def, cmdDef) {
    if(cmdDef._compiled) return (args,ctx)=>cmdDef._compiled(args,ctx);
    if(typeof cmdDef.fn==='function') return cmdDef.fn;
    if(typeof cmdDef==='function') return cmdDef;
    return null;
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

// ── CommandRegistry ───────────────────────────────────────────────
// Despacha verbos a handlers. Almacena metadatos de ayuda para que
// los plugins puedan documentar sus comandos en cmdAyuda().
const CommandRegistry = {
  commands: {},   // verb → { handler, pluginId, meta }

  register(verb, handler, pluginId='core', meta={}) {
    this.commands[verb] = { handler, pluginId, meta };
  },
  registerMeta(verb, meta, pluginId='core') {
    if(!this.commands[verb]) this.commands[verb] = { handler:null, pluginId, meta };
    else this.commands[verb].meta = { ...this.commands[verb].meta, ...meta };
  },
  unregister(pluginId) {
    for(const v of Object.keys(this.commands))
      if(this.commands[v].pluginId===pluginId) delete this.commands[v];
  },
  has(verb)     { return !!this.commands[verb]; },
  getMeta(verb) { return this.commands[verb]?.meta || null; },
  listByPlugin(pluginId) {
    return Object.entries(this.commands)
      .filter(([,v])=>v.pluginId===pluginId)
      .map(([verb,v])=>({ verb, ...v.meta }));
  },
  listAll() {
    return Object.entries(this.commands).map(([verb,v])=>({ verb, pluginId:v.pluginId, ...v.meta }));
  },
  async run(verb, args) {
    const cmd = this.commands[verb]; if(!cmd) return false;
    await cmd.handler(args, CTX); return true;
  },
};

// ── DataAccessor ─────────────────────────────────────────────────
// Interfaz tipada al ModuleLoader. El motor nunca llama
// ModuleLoader.get() directamente, siempre usa D.
const D = {
  get world()      { return ModuleLoader.get('world'); },
  get mats()       { return ModuleLoader.get('materiales')||{}; },
  get tagAff()     { return ModuleLoader.get('tag_afinidades')||{}; },
  get tagOpp()     { return ModuleLoader.get('tag_opuestos')||[]; },
  get archetypes() { return ModuleLoader.get('arquetipos_forja')||{}; },
  get habPool()    { return ModuleLoader.get('habilidades_pool')||[]; },
  get magPool()    { return ModuleLoader.get('magias_pool')||[]; },
  get enemyHabPools(){ return ModuleLoader.get('habilidades_enemigo_pool')||{}; },
  get enemyMagPools(){ return ModuleLoader.get('magias_enemigo_pool')||{}; },
  get aiProfiles() { return ModuleLoader.get('ia_perfiles_v2')||{}; },
  get effects()    { return ModuleLoader.get('efectos')||{}; },
  get enemies()    { return ModuleLoader.get('enemigos')||[]; },
  get creatures()  { return ModuleLoader.get('criaturas')||{}; },
  get creNames()   { return ModuleLoader.get('criatura_nombres')||{}; },
  get npcs()       { return ModuleLoader.get('npcs')||{}; },
  get missions()   { return ModuleLoader.get('misiones')||{}; },
  get twistDefs()  { return ModuleLoader.get('plot_twists')||[]; },
  get narrative()  { return ModuleLoader.get('narrativa')||{}; },
  get playerDef()  { return ModuleLoader.get('player')||{}; },
  get phases()     { return ModuleLoader.get('fases')||[]; },
  get itemsInicio(){ return ModuleLoader.get('items_inicio')||[]; },

  mat(id)     { return this.mats[id]||null; },
  matTags(id) { return this.mats[id]?.tags||[]; },
};
