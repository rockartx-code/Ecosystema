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

// ── EventBus ─────────────────────────────────────────────────────
// Pipeline mutable: cada listener recibe el payload del anterior.
// Si payload.cancelled === true, la cadena se detiene.
const EventBus = {
  _listeners: {},
  _history:   [],

  on(event, handler, pluginId='core', opts={}) {
    if(!this._listeners[event]) this._listeners[event]=[];
    this._listeners[event].push({
      handler, pluginId,
      priority: opts.priority ?? 50,
      once:     opts.once    ?? false,
    });
    this._listeners[event].sort((a,b)=>a.priority-b.priority);
  },

  once(event, handler, pluginId, opts={}) {
    this.on(event, handler, pluginId, { ...opts, once:true });
  },

  off(pluginId) {
    for(const ev of Object.keys(this._listeners))
      this._listeners[ev] = this._listeners[ev].filter(l=>l.pluginId!==pluginId);
  },

  emit(event, payload={}) {
    this._history.push({ event, ts:Date.now() });
    if(this._history.length>200) this._history.shift();

    const listeners = [...(this._listeners[event]||[])];
    let current = payload;
    const toRemove = [];

    for(const l of listeners) {
      try {
        const result = l.handler(current, CTX);
        if(result !== undefined) current = result;
        if(l.once) toRemove.push(l);
        if(current?.cancelled) break;
      } catch(e) {
        console.warn(`[EventBus] ${l.pluginId} → ${event}:`, e);
      }
    }

    if(toRemove.length && this._listeners[event])
      this._listeners[event] = this._listeners[event].filter(l=>!toRemove.includes(l));

    return current;
  },

  emitCancellable(event, payload={}) {
    const result = this.emit(event, { ...payload, cancelled:false });
    return { cancelled: result?.cancelled ?? false, payload: result };
  },

  events()      { return Object.keys(this._listeners); },
  history(n=20) { return this._history.slice(-n); },
};

// ── ModuleLoader ─────────────────────────────────────────────────
// Gestiona datos declarativos JSON. Los plugins y el módulo base
// escriben aquí; los sistemas leen de aquí.
const ModuleLoader = {
  loaded: [], data: {},

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
  list() { return this.loaded; },
};

// ── PluginLoader ─────────────────────────────────────────────────
// Registra plugins JS o JSON. Monta hooks en EventBus y comandos
// en CommandRegistry. Los plugins NO conocen el motor internamente;
// reciben CTX en cada llamada.
const PluginLoader = {
  plugins: {},
  order:   [],

  register(def) {
    if(this.plugins[def.id]) { console.warn(`Plugin "${def.id}" ya registrado.`); return false; }
    const store = {};
    this.plugins[def.id] = { def, store };
    this.order.push(def.id);

    // Fusionar datos del módulo declarativo
    if(def.modulo) ModuleLoader.apply({ meta:{ id:`plugin:${def.id}` }, ...def.modulo });

    // Registrar hooks en EventBus
    for(const [event, hookDef] of Object.entries(def.hooks||{})) {
      const handler = this._buildHandler(def, hookDef);
      if(handler) EventBus.on(event, handler, def.id, { priority: hookDef.priority ?? 50 });
    }

    // Registrar comandos con metadatos de ayuda
    for(const [verb, cmdDef] of Object.entries(def.comandos||{})) {
      const handler = this._buildCmdHandler(def, cmdDef);
      CommandRegistry.register(verb, handler, def.id, cmdDef.meta || {});
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
    this._unmountStatusBar(pluginId);
    if(typeof p.def.onUnload === 'function') p.def.onUnload(CTX);
    delete this.plugins[pluginId];
    this.order = this.order.filter(id=>id!==pluginId);
    EventBus.emit('plugin:unloaded', { id:pluginId });
  },

  get(id)           { return this.plugins[id]||null; },
  list()            { return this.order.map(id=>this.plugins[id]?.def); },
  getStore(pluginId){ return this.plugins[pluginId]?.store||{}; },

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
