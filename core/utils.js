// ════════════════════════════════════════════════════════════════
// UTILS — funciones puras sin dependencias
// ════════════════════════════════════════════════════════════════
'use strict';

const U = {
  hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h;
  },
  rng(seed) {
    let s = this.hash(String(seed));
    return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; s = s >>> 0; return s / 0xFFFFFFFF; };
  },
  pick(a, r)    { return a[Math.floor(r() * a.length)]; },
  pickN(a, n, r) {
    const c = [...a], res = [];
    for (let i = 0; i < n && c.length; i++) { const x = Math.floor(r() * c.length); res.push(c.splice(x, 1)[0]); }
    return res;
  },
  uid()         { return Math.random().toString(36).slice(2, 7).toUpperCase(); },
  hex(s)        { return this.hash(s).toString(16).slice(0, 6).toUpperCase(); },
  clamp(v, a, b){ return Math.max(a, Math.min(b, v)); },
  rand(a, b)    { return Math.floor(Math.random() * (b - a + 1)) + a; },
  chance(p)     { return Math.random() < p; },
  cap(s)        { return s.charAt(0).toUpperCase() + s.slice(1); },
  tmpl(str, vars){ return (str || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] || `{${k}}`); },
  deepMerge(base, ext) {
    const out = { ...base };
    for (const k of Object.keys(ext || {})) {
      if (Array.isArray(ext[k]) && Array.isArray(base[k]))      out[k] = [...base[k], ...ext[k]];
      else if (ext[k] && typeof ext[k] === 'object' && !Array.isArray(ext[k]) && base[k] && typeof base[k] === 'object')
        out[k] = U.deepMerge(base[k], ext[k]);
      else out[k] = ext[k];
    }
    return out;
  }
};
