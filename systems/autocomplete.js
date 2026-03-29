// ════════════════════════════════════════════════════════════════
// AUTOCOMPLETE — CLI helper (UI-only)
//
// Este módulo mantiene el autocompletado contextual del input.
// No ejecuta comandos ni toca estado fuera de lectura.
// ════════════════════════════════════════════════════════════════

const AC = (() => {
  const el = document.getElementById('ac');
  let items = [];
  let sel = -1;
  const providers = [];

  function _svc(name) {
    return (typeof ServiceRegistry !== 'undefined' && typeof ServiceRegistry.get === 'function')
      ? ServiceRegistry.get(name)
      : null;
  }

  function _xpRead() {
    const read = _svc('runtime.xp.read');
    return typeof read === 'function' ? (read() || { atributos:{} }) : { atributos:{} };
  }

  function _inp() {
    return document.getElementById('inp');
  }

  function _safe(fn, fallback = []) {
    try { return fn(); } catch(_) { return fallback; }
  }

  function _shortHash(obj) {
    const raw = String(obj?.imprint?.hash || obj?.hash || obj?.id || '').trim();
    if(!raw) return '';
    return raw.slice(0, 6).toUpperCase();
  }

  function registerProvider(def = {}) {
    if(!def?.id || typeof def.provide !== 'function') return false;
    providers.push({
      id: def.id,
      triggers: def.triggers || [],
      priority: Number(def.priority ?? 50),
      provide: def.provide,
      pluginId: def.pluginId || 'externo',
      layer: def.layer === 'base' ? 'base' : 'provider',
    });
    providers.sort((a,b)=>a.priority-b.priority);
    return true;
  }

  function requestProviders(ctx = {}) {
    const out = [];
    for(const p of providers) {
      const okTrigger = !p.triggers.length || p.triggers.includes(ctx.verb);
      if(!okTrigger) continue;
      try {
        const res = p.provide(ctx) || [];
        (Array.isArray(res)?res:[res]).forEach(i => i && out.push({ ...i, _acLayer:p.layer }));
      } catch(e) {
        console.warn(`[AC] provider ${p.id} falló:`, e);
      }
    }
    return out;
  }

  function registerCoreProviders() {
    const registerBase = (id, triggers, provide) => registerProvider({
      id: `core.autocomplete.${id}`,
      triggers,
      priority: 20,
      pluginId: 'core',
      layer: 'base',
      provide,
    });

    registerBase('movimiento', ['ir', 'go'], () => getSalidas());
    registerBase('npcs', ['hablar', 'observar', 'traicionar'], () => getNPCsAqui());
    registerProvider({
      id: 'core.autocomplete.preguntar',
      triggers: ['preguntar'],
      priority: 20,
      pluginId: 'core',
      layer: 'base',
      provide(ctx = {}) {
        const args = Array.isArray(ctx.args) ? ctx.args : [];
        const nargs = Number.isFinite(ctx.nargs) ? ctx.nargs : args.length;
        const endsSpace = !!ctx.endsSpace;
        if(nargs <= 1 || (!endsSpace && nargs === 1)) return getNPCsAqui();
        return _cfg('cli_autocomplete.temas_preguntar', ['deseo', 'miedo', 'secreto', 'pasado', 'anterior', 'vínculo'])
          .map(t => ({ label: t, value: t, hint: 'tema', color: 't-dim', group: 'tema' }));
      },
    });
    registerProvider({
      id: 'core.autocomplete.atacar',
      triggers: ['atacar'],
      priority: 20,
      pluginId: 'core',
      layer: 'base',
      provide() {
        return [...getNPCsAqui(), ...getEnemigosNodo(), ...getCriaturasNodo()];
      },
    });
    registerProvider({
      id: 'core.autocomplete.examinar',
      triggers: ['examinar', 'ex'],
      priority: 20,
      pluginId: 'core',
      layer: 'base',
      provide() {
        return [...getInventario(), ...getHabilidades(), ...getMagias(), ...getCompañeros(), ...getNPCsAqui()];
      },
    });
    registerBase('capturar', ['capturar'], () => getCriaturasNodo());
    registerBase('vincular', ['vincular'], () => getAnclas());
    registerBase('suelo', ['recoger', 'tomar'], () => getSuelo());
    registerBase('inventario', ['soltar', 'drop'], () => getInventario());
    registerBase('equipar', ['equipar'], () => getEquipables());
    registerBase('usar', ['usar'], () => getUsables());
    registerBase('forjar', ['forjar'], (ctx={}) => getMaterialesInv(ctx.yaEscritos || []));
    registerBase('encarnar', ['encarnar'], (ctx={}) => getMaterialesModo('corporal', ctx.yaEscritos || []));
    registerBase('conjurar', ['conjurar'], (ctx={}) => getMaterialesModo('mágico', ctx.yaEscritos || []));
    registerBase('fusionar', ['fusionar'], (ctx={}) => {
      const usedSet = new Set(ctx.yaEscritos || []);
      return [
        ...getInventario(i => !usedSet.has((i.nombre || i.blueprint || '').toLowerCase().replace(/\s+/g, '_'))),
        ...getHabilidades().filter(h => !usedSet.has(h.value)),
        ...getMagias().filter(m => !usedSet.has(m.value)),
      ];
    });
    registerBase('lanzar', ['lanzar'], () => getMagias(true));
    registerBase('recargar', ['recargar'], (ctx={}) => {
      const nargs = Number.isFinite(ctx.nargs) ? ctx.nargs : (ctx.args || []).length;
      const endsSpace = !!ctx.endsSpace;
      if(nargs <= 1 || (!endsSpace && nargs === 1)) return getMagias();
      return getMatRecarga();
    });
    registerBase('companeros', ['liberar', 'nombrar'], () => getCompañeros());
    registerBase('modo', ['modo'], (ctx={}) => {
      const nargs = Number.isFinite(ctx.nargs) ? ctx.nargs : (ctx.args || []).length;
      const endsSpace = !!ctx.endsSpace;
      if(nargs <= 1 || (!endsSpace && nargs === 1)) return getCompañeros();
      return MODOS.map(m => ({ label: m, value: m, hint: 'modo de IA', color: 't-cri', group: 'modo' }));
    });
    registerBase('criar', ['criar'], (ctx={}) => {
      const ya = new Set(ctx.yaEscritos || []);
      return getCompañeros(c => c.afinidad >= 60 && !ya.has(c.nombre.split('-')[0].toLowerCase()));
    });
    registerBase('misiones_aceptar', ['aceptar'], () => getMisiones(false).filter(m => !GS.mision(m.value)?.aceptada));
    registerBase('misiones_rechazar', ['rechazar'], () => getMisiones(false));
    registerBase('misiones_completar', ['completar'], () => getMisiones(true));
    registerBase('ayuda', ['ayuda', 'help', '?'], () => getTemasAyuda());
    registerBase('plugins', ['descargar_plugin'], () => getPlugins());
    registerBase('nombre', ['nombre'], () => [{ label: Player.get().name, value: Player.get().name.replace(/\s+/g, '_'), hint: 'nombre actual', color: 't-npc', group: 'nombre' }]);
    registerBase('asignar', ['asignar', 'assign'], () => {
      return Object.entries(_xpRead().atributos || {}).map(([k, def]) => ({ label: k, value: k, hint: def.desc, color: def.color, group: 'atributo' }));
    });
  }

  function getRegistryCommands(opts = {}) {
    if(typeof CommandRegistry === 'undefined' || !CommandRegistry) return [];
    if(typeof CommandRegistry.discover === 'function') return CommandRegistry.discover(opts);

    const entries = Object.entries(CommandRegistry.commands || {}).map(([verb, cfg]) => ({
      verb,
      pluginId: cfg?.pluginId || 'externo',
      owner: cfg?.owner || cfg?.meta?.owner || (cfg?.pluginId === 'core' ? 'core' : 'plugin'),
      ...(cfg?.meta || {}),
    }));

    const seen = new Set();
    return entries.filter((entry) => {
      if(opts.onlyVisible && entry.visible === false) return false;
      if(!opts.includeHidden && entry.hidden) return false;
      if(opts.mode && Array.isArray(entry.modes) && entry.modes.length && !entry.modes.includes(opts.mode)) return false;
      if(!opts.uniqueCanonical) return true;
      const key = entry.canonical || entry.verb;
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function getVerbs() {
    const mode = (typeof Net !== 'undefined' && Net.getMyBattle?.()) ? 'battle' : 'world';
    return getRegistryCommands({ onlyVisible:true, uniqueCanonical:false, mode }).map(entry => ({
      v: entry.verb,
      h: entry.desc || entry.titulo || `[${entry.owner || entry.pluginId || 'externo'}]`,
    }));
  }

  function getInventario(filtro) {
    const p = Player.get();
    return (p.inventory || [])
      .filter(i => !filtro || filtro(i))
      .map(i => ({
        blueprint: i.blueprint,
        label: i.nombre || i.blueprint,
        value: (i.nombre || i.blueprint).toLowerCase().replace(/\s+/g, '_'),
        hint: `[${i.tipo}]${i.imprint ? ' #' + i.imprint.hash.slice(0, 4) : ''}`,
        color: i.tipo === 'magia' ? 't-mag' : i.tipo === 'habilidad' ? 't-hab' : i.tipo === 'consumible' ? 't-cra' : 't-out',
        group: 'inventario',
      }));
  }

  function getNPCsAqui() {
    return _safe(() => GS.npcEnNodo(Player.pos()), []).map(n => ({
      label: n.nombre,
      value: n.id || n.nombre,
      hint: `[${n.arq_vis}] #${_shortHash(n) || '—'}${(n.misiones_ofrecidas || []).length ? ' ◈' : ''}${n.desesperacion > 75 ? ' ⚠' : ''}`,
      color: n.estado === 'sometido' ? 't-mem' : 't-npc',
      group: 'npc',
    }));
  }

  function _normToken(v) {
    return String(v || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, '_')
      .trim();
  }

  function getMaterialesInv(yaEscritos) {
    const used = new Set((yaEscritos || []).map(_normToken));
    return getInventario(i => i.tipo === 'material' && !used.has(_normToken(i.blueprint)) && !used.has(_normToken(i.nombre || i.blueprint)))
      .map(i => ({
        ...i,
        value: i.blueprint || _normToken(i.label),
        color: 't-cra',
      }));
  }

  function _cfg(path, fallback) {
    try {
      const v = ModuleLoader?.get?.(path);
      return Array.isArray(v) ? v : fallback;
    } catch { return fallback; }
  }
  function _cfgScalar(path, fallback) {
    try {
      const v = ModuleLoader?.get?.(path);
      return v == null ? fallback : v;
    } catch { return fallback; }
  }
  const TAGS_ENCARNAR = _cfg('cli_autocomplete.tags_encarnar', ['tendón', 'nervio', 'hueso', 'sangre', 'tejido', 'médula']);
  const TAGS_CONJURAR = _cfg('cli_autocomplete.tags_conjurar', ['resonante', 'corrupto', 'cristal', 'susurro', 'llama', 'vacío']);
  const PRECEDENCE_DEFAULT = String(_cfgScalar('cli_autocomplete.precedence', 'base_first'));

  function getPrecedencePolicy() {
    const raw = String(_cfgScalar('cli_autocomplete.precedence', PRECEDENCE_DEFAULT)).trim().toLowerCase();
    if(['providers_first', 'base_first', 'providers_only', 'base_only'].includes(raw)) return raw;
    return 'base_first';
  }

  function mergeSuggestions(baseList, providerList, policy) {
    if(policy === 'providers_only') return providerList;
    if(policy === 'base_only') return baseList;
    if(!baseList.length) return providerList;
    if(!providerList.length) return baseList;

    // Merge evitando duplicados por value/label.
    const seen = new Set();
    const merged = [];
    const pushUnique = (item) => {
      if(!item) return;
      const k = `${_normToken(item.value || item.label)}::${item.group || ''}`;
      if(seen.has(k)) return;
      seen.add(k);
      const { _acLayer, ...clean } = item;
      merged.push(clean);
    };

    const first = policy === 'providers_first' ? providerList : baseList;
    const second = policy === 'providers_first' ? baseList : providerList;
    first.forEach(pushUnique);
    second.forEach(pushUnique);
    return merged;
  }

  function getMaterialesModo(modo, yaEscritos) {
    const tagsObjetivo = modo === 'corporal' ? TAGS_ENCARNAR : TAGS_CONJURAR;
    return getMaterialesInv(yaEscritos).filter(i => {
      const tags = _safe(() => D.matTags(i.blueprint), []) || [];
      return tags.some(t => tagsObjetivo.includes(t));
    });
  }

  function getHabilidades() {
    const p = Player.get();
    return (p.habilidades || []).map(h => ({
      label: h.nombre,
      value: h.nombre.toLowerCase().replace(/\s+/g, '_'),
      hint: `efecto:${h.efecto}`,
      color: 't-hab',
      group: 'habilidad',
    }));
  }

  function getMagias(soloConCargas = false) {
    const p = Player.get();
    return (p.magias || [])
      .filter(m => !soloConCargas || m.cargas > 0)
      .map(m => ({
        label: m.nombre,
        value: m.nombre.toLowerCase().replace(/\s+/g, '_'),
        hint: `cargas:${m.cargas}/${m.cargas_max}`,
        color: m.cargas > 0 ? 't-mag' : 't-dim',
        group: 'magia',
      }));
  }

  function getCompañeros(filtro) {
    const p = Player.get();
    return (p.compañeros || p.ext?.compañeros || [])
      .filter(c => !filtro || filtro(c))
      .map(c => ({
        label: c.nombre,
        value: c.nombre.split('-')[0].toLowerCase(),
        hint: `[${c.arquetipo}]`,
        color: 't-cri',
        group: 'compañero',
      }));
  }

  function getMisiones(soloAceptadas) {
    return _safe(() => GS.activas(), []).filter(m => !soloAceptadas || m.aceptada).map(m => ({
      label: m.id,
      value: m.id,
      hint: `[${m.tipo}]${m.aceptada ? ' ✓' : ''}`,
      color: 't-mis',
      group: 'mision',
    }));
  }

  function getTemasAyuda() {
    const groups = new Map();
    getRegistryCommands({ onlyVisible:true, uniqueCanonical:true }).forEach((entry) => {
      const cat = entry.cat || 'OTROS';
      if(!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(entry);
    });
    return Array.from(groups.entries()).map(([cat, list]) => ({
      label: cat,
      value: cat,
      hint: list.slice(0, 3).map(entry => entry.verb).join(', '),
      color: list.find(entry => entry.color)?.color || 't-dim',
      group: 'tema',
    }));
  }

  function getPlugins() {
    return _safe(() => PluginLoader.order, []).map(id => ({ label: id, value: id, hint: 'plugin activo', color: 't-mag', group: 'plugin' }));
  }

  function getSalidas() {
    return _safe(() => Object.entries(World.exits(Player.pos())), []).map(([dir, nid]) => {
      const n = World.node(nid);
      return { label: dir, value: dir, hint: n ? `→ ${n.name} [${n.tipo}]` : '', color: 't-sis', group: 'salida' };
    });
  }

  function getSuelo() {
    return ((World.node(Player.pos())?.loot) || []).map(l => ({ label: l, value: l, hint: _safe(() => D.matTags(l).join(', '), ''), color: 't-cra', group: 'suelo' }));
  }

  function getCriaturasNodo() {
    return ((World.node(Player.pos())?.creatures) || []).map(c => {
      const hash = _shortHash(c);
      return {
        label: `${c.nombre}${hash ? ' #' + hash : ''}`,
        value: c.id || c.nombre,
        hint: `[${c.arquetipo}]${hash ? ' #' + hash : ''} HP:${c.hp}`,
        color: 't-cri',
        group: 'criatura',
      };
    });
  }

  function getAnclas() {
    return getInventario(i => i.categoria === 'ancla' || _safe(() => D.mat(i.blueprint)?.categoria === 'ancla', false))
      .map(i => ({ ...i, hint: `ancla ${i.hint || ''}`.trim(), color: 't-cri', group: 'ancla' }));
  }

  function getEnemigosNodo() {
    const enemies = (World.node(Player.pos())?.enemies) || [];
    const counts = enemies.reduce((acc, e) => {
      const k = (e?.nombre || '').toLowerCase();
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    return enemies.map(e => {
      const repeated = counts[(e?.nombre || '').toLowerCase()] > 1;
      const hash = _shortHash(e);
      return {
        label: repeated && hash ? `${e.nombre} #${hash}` : e.nombre,
        value: e.id || e.nombre,
        hint: `${hash ? '#' + hash + '  ' : ''}HP:${e.hp_current || e.hp} ATK:${e.atk}`,
        color: 't-pel',
        group: 'enemigo',
      };
    });
  }

  function getMatRecarga() {
    return getInventario(i => i.tipo === 'material' && _safe(() => D.matTags(i.blueprint).some(t => ['resonante', 'corrupto'].includes(t)), false))
      .map(i => ({ ...i, value: i.label, color: 't-mag', group: 'recarga' }));
  }

  function getEquipables() {
    return getInventario(i => ['arma', 'armadura', 'casco', 'guantes', 'peto', 'botas', 'accesorio', 'reliquia', 'mítico'].includes(i.tipo))
      .map(i => ({ ...i, group: i.group === 'inventario' ? 'equipo' : i.group }));
  }

  function getUsables() {
    return getInventario(i => {
      if(i.blueprint === 'huevo_impronta') return true;
      const m = D.mat(i.blueprint);
      return i.tipo === 'consumible' || m?.hp || m?.hunger || i.hp || i.hunger;
    }).map(i => ({ ...i, group: 'usable', color: i.blueprint === 'huevo_impronta' ? 't-cri' : 't-cra' }));
  }

  const MODOS = _cfg('cli_autocomplete.modos_compañero', ['activo', 'defensivo', 'caza', 'autónomo', 'latente']);

  function resolve(raw) {
    const parts = raw.split(' ');
    const verb = (parts[0] || '').toLowerCase();
    const args = parts.slice(1);
    const nargs = args.length;
    const endsSpace = raw.endsWith(' ');
    const partial = endsSpace ? '' : (args[args.length-1]||'');

    if(nargs === 0 || (nargs === 1 && !endsSpace)) {
      return { list: getVerbs().filter(b => b.v.startsWith(verb)).map(b => ({ label: b.v, value: b.v, hint: b.h, color: 't-acc', group: 'comando' })) };
    }

    const yaEscritos = endsSpace ? args : args.slice(0, -1);

    const result = { list: [] };
    const fromProviders = requestProviders({
      verb, args, partial,
      nargs,
      endsSpace,
      yaEscritos,
      precedence: getPrecedencePolicy(),
      mode: (typeof Net!=='undefined' && Net.getMyBattle?.()) ? 'battle' : 'world',
      player: _safe(()=>Player.get(), null),
      nodeId: _safe(()=>Player.pos(), null),
    });

    const legacyBaseList = (result && Array.isArray(result.list)) ? result.list : [];
    const baseProviderList = fromProviders.filter(i => i?._acLayer === 'base');
    const pluginProviderList = fromProviders.filter(i => i?._acLayer !== 'base');
    const baseList = [...legacyBaseList, ...baseProviderList];
    const policy = getPrecedencePolicy();
    return { list: mergeSuggestions(baseList, pluginProviderList, policy) };
  }

  function filter(list, partial) {
    if(!partial) return list;
    const q = partial.toLowerCase();
    return list.filter(i => (i.value || i.label).toLowerCase().startsWith(q) || i.label.toLowerCase().startsWith(q));
  }

  function render(list) {
    if(!el) return;
    el.innerHTML = '';
    if(!list.length) { hide(); return; }

    let lastGroup = '';
    list.slice(0, 18).forEach((item, i) => {
      if(item.group && item.group !== lastGroup) {
        const sep = document.createElement('div');
        sep.className = 'ac-sep';
        sep.textContent = item.group.toUpperCase();
        el.appendChild(sep);
        lastGroup = item.group;
      }
      const d = document.createElement('div');
      d.className = 'ac-item' + (i === sel ? ' ac-sel' : '');
      d.dataset.idx = i;
      d.innerHTML = `<span class="ac-verb ${item.color || 't-out'}">${item.label}</span><span class="ac-hint">${item.hint || ''}</span>`;
      d.addEventListener('mousedown', ev => { ev.preventDefault(); applyItem(item); });
      el.appendChild(d);
    });

    el.style.display = 'block';
    items = list.slice(0, 18);
  }

  function hide() {
    if(!el) return;
    el.style.display = 'none';
    sel = -1;
    items = [];
  }

  function setSel(idx) {
    if(!el) return;
    sel = U.clamp(idx, 0, items.length - 1);
    el.querySelectorAll('.ac-item').forEach((d, i) => d.classList.toggle('ac-sel', i === sel));
    const active = el.querySelectorAll('.ac-item')[sel];
    if(active) active.scrollIntoView({ block: 'nearest' });
  }

  function applyItem(item) {
    const inp = _inp();
    if(!inp) return;

    const raw = inp.value;
    const parts = raw.split(' ');
    const verb = parts[0];
    const args = parts.slice(1);
    const val = item.value || item.label;

    if(!raw.includes(' ')) {
      inp.value = val + ' ';
    } else {
      args[Math.max(0, args.length - 1)] = val;
      inp.value = verb + ' ' + args.join(' ') + ' ';
    }

    hide();
    inp.focus();
    setTimeout(() => update(), 50);
  }

  function update() {
    const inp = _inp();
    if(!inp || !el) return;

    const raw = inp.value;
    if(!raw.trim()) { hide(); return; }

    const parts = raw.split(' ');
    const endsWithSpace = raw.endsWith(' ');
    const args = parts.slice(1);
    const lastArg = endsWithSpace ? '' : (args[args.length - 1] || '');
    const { list } = resolve(endsWithSpace ? raw : raw.slice(0, raw.lastIndexOf(' ') + 1) || raw);

    if(!list.length) { hide(); return; }

    sel = -1;
    render(endsWithSpace ? list : filter(list, lastArg));
  }

  registerCoreProviders();

  return {
    hide,
    update,
    registerProvider,
    providers: () => providers.map(p=>({ id:p.id, triggers:[...p.triggers], priority:p.priority, pluginId:p.pluginId, layer:p.layer })),
    moveDown() { if(!items.length) return false; setSel(sel < 0 ? 0 : sel + 1); return true; },
    moveUp() { if(!items.length) return false; setSel(sel <= 0 ? 0 : sel - 1); return true; },
    accept() {
      if(sel >= 0 && sel < items.length) { applyItem(items[sel]); return true; }
      if(items.length === 1) { applyItem(items[0]); return true; }
      return false;
    },
    isOpen() { return !!el && el.style.display === 'block'; },
  };
})();

if(typeof ServiceRegistry !== 'undefined') {
  ServiceRegistry.register('cli.autocomplete.registerProvider', (def)=>AC.registerProvider(def), { pluginId:'core', version:'2.1.0' });
  ServiceRegistry.register('cli.autocomplete.providers', ()=>AC.providers(), { pluginId:'core', version:'2.1.0' });
}
