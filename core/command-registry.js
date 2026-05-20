// ════════════════════════════════════════════════════════════════
// CORE / CommandRegistry (M1 del audit: split de core.js)
//
// Despacha verbos a handlers con stack por pluginId, metadatos de
// ayuda y descubrimiento filtrable (visible/hidden, modos, canonical).
// Depende de la global `CTX` (lazy, solo en run()).
// ════════════════════════════════════════════════════════════════
'use strict';

const CommandRegistry = {
  commands: {},   // verb → { verb, handler, pluginId, owner, meta }
  _stacks: {},

  _normalizeMeta(verb, meta = {}, pluginId = 'core') {
    const out = { ...(meta || {}) };
    if(!out.canonical) out.canonical = String(meta?.canonical || verb);
    if(out.owner == null) out.owner = pluginId === 'core' ? 'core' : 'plugin';
    if(out.visible == null) out.visible = out.hidden ? false : true;
    return out;
  },

  _snapshot(verb) {
    const stack = this._stacks[verb] || [];
    const active = stack[stack.length - 1] || null;
    if(active) this.commands[verb] = active;
    else delete this.commands[verb];
    return active;
  },

  register(verb, handler, pluginId='core', meta={}) {
    const key = String(verb || '').trim();
    if(!key) return false;
    const entry = {
      verb: key,
      handler,
      pluginId,
      owner: meta?.owner ?? (pluginId === 'core' ? 'core' : 'plugin'),
      meta: this._normalizeMeta(key, meta, pluginId),
    };
    const stack = this._stacks[key] || [];
    const filtered = stack.filter(item => item.pluginId !== pluginId);
    filtered.push(entry);
    this._stacks[key] = filtered;
    this._snapshot(key);
    return true;
  },
  registerMeta(verb, meta, pluginId='core') {
    const key = String(verb || '').trim();
    if(!key) return false;
    if(!this._stacks[key]?.length) return this.register(key, null, pluginId, meta);
    const stack = this._stacks[key];
    const idx = stack.findIndex(item => item.pluginId === pluginId);
    if(idx < 0) return this.register(key, null, pluginId, meta);
    stack[idx] = {
      ...stack[idx],
      owner: meta?.owner ?? stack[idx].owner,
      meta: this._normalizeMeta(key, { ...stack[idx].meta, ...meta }, pluginId),
    };
    this._snapshot(key);
    return true;
  },
  unregister(pluginId) {
    for(const v of Object.keys(this._stacks)) {
      this._stacks[v] = (this._stacks[v] || []).filter(item => item.pluginId !== pluginId);
      if(!this._stacks[v].length) delete this._stacks[v];
      this._snapshot(v);
    }
  },
  resolve(verb) { return this.commands[String(verb || '').trim()] || null; },
  has(verb)     { return !!this.resolve(verb); },
  getMeta(verb) { return this.resolve(verb)?.meta || null; },
  listByPlugin(pluginId) {
    return Object.entries(this.commands)
      .filter(([,v])=>v.pluginId===pluginId)
      .map(([verb,v])=>({ verb, pluginId:v.pluginId, owner:v.owner, ...v.meta }));
  },
  listAll(options = {}) {
    const includeHidden = !!options.includeHidden;
    const onlyVisible = !!options.onlyVisible;
    const mode = options.mode || null;
    const uniqueCanonical = !!options.uniqueCanonical;
    const seen = new Set();
    return Object.values(this.commands)
      .filter((entry) => {
        const meta = entry?.meta || {};
        if(onlyVisible && meta.visible === false) return false;
        if(!includeHidden && meta.hidden) return false;
        if(mode && Array.isArray(meta.modes) && meta.modes.length && !meta.modes.includes(mode)) return false;
        return true;
      })
      .filter((entry) => {
        if(!uniqueCanonical) return true;
        const key = entry?.meta?.canonical || entry.verb;
        if(seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((entry)=>({ verb:entry.verb, pluginId:entry.pluginId, owner:entry.owner, ...entry.meta }));
  },
  discover(options = {}) {
    return this.listAll(options);
  },
  async run(verb, args, runtime = {}) {
    const cmd = this.resolve(verb); if(!cmd || typeof cmd.handler !== 'function') return false;
    const modes = cmd.meta?.modes;
    if(runtime?.mode && Array.isArray(modes) && modes.length && !modes.includes(runtime.mode)) return false;
    const out = await cmd.handler(args, CTX, runtime);
    return out === false ? false : true;
  },
};

globalThis.CommandRegistry = CommandRegistry;
