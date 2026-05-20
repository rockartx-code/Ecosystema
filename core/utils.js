// ════════════════════════════════════════════════════════════════
// CORE / Utils — funciones puras (M1 del audit: split de core.js)
//
// `U` agrupa primitivas sin dependencias: hash/rng deterministicos,
// pickers, clamp, rand, chance, templates. `_semver*` resuelve rangos
// usados por PluginLoader para validar dependencias. Cualquier modulo
// (core, system, plugin) puede leer U; semver es interno de plugin-loader.
// ════════════════════════════════════════════════════════════════
'use strict';

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

// Cross-script expose: scripts clasicos NO enganchan `const X` a globalThis
// automaticamente. Lo hacemos explicito para que tests y otros scripts
// puedan leer U / semver helpers por property access.
globalThis.U = U;
globalThis._semverCmp = _semverCmp;
globalThis._satisfiesVersion = _satisfiesVersion;
