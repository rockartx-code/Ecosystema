// ════════════════════════════════════════════════════════════════
// CORE / EventBus (M1 del audit: split de core.js)
//
// Pipeline mutable: cada listener recibe el payload del anterior y
// puede mutarlo. Si payload.cancelled === true, la cadena se detiene.
// Implementa fases (pre/main/post/observe), validacion de specs en
// politica configurable (dev/strict/prod), health tracking por plugin
// y traza historica.
//
// Depende de la global `CTX` (lazy: solo referenciada dentro de
// emit/request, tras que core/main.js la haya construido).
// ════════════════════════════════════════════════════════════════
'use strict';

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

globalThis.EventBus = EventBus;
