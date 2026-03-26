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

  function getVerbs() {
    const base = [
      { v:'ir', h:'norte/sur/este/oeste' }, { v:'n', h:'ir norte' }, { v:'s', h:'ir sur' },
      { v:'e', h:'ir este' }, { v:'o', h:'ir oeste' }, { v:'mirar', h:'describir nodo actual' },
      { v:'hablar', h:'[npc] iniciar conversación' }, { v:'preguntar', h:'[npc] [tema]' },
      { v:'observar', h:'[npc] análisis' }, { v:'traicionar', h:'[npc] romper vínculo' },
      { v:'npcs', h:'ver personas del nodo' }, { v:'misiones', h:'ver misiones' },
      { v:'aceptar', h:'[id] aceptar misión' }, { v:'rechazar', h:'[id] rechazar misión' },
      { v:'completar', h:'[id] completar misión' }, { v:'forjar', h:'[mat] [mat] ...' },
      { v:'encarnar', h:'[mat] [mat] → habilidad' }, { v:'conjurar', h:'[mat] [mat] → magia' },
      { v:'fusionar', h:'[id] [id]' }, { v:'recetas', h:'guía de afinidades' },
      { v:'materiales', h:'ver materiales' }, { v:'habilidades', h:'ver habilidades' },
      { v:'magias', h:'ver magias' }, { v:'lanzar', h:'[magia]' }, { v:'recargar', h:'[magia] [mat]' },
      { v:'criaturas', h:'ver compañeros' }, { v:'anclas', h:'ver anclas' },
      { v:'vincular', h:'[ancla]' }, { v:'capturar', h:'[criatura]' },
      { v:'liberar', h:'[comp]' }, { v:'modo', h:'[comp] [modo]' }, { v:'nombrar', h:'[comp] [nombre]' },
      { v:'criar', h:'[comp] [comp]' }, { v:'inventario', h:'ver inventario' },
      { v:'recoger', h:'[objeto]' }, { v:'soltar', h:'[objeto]' }, { v:'equipar', h:'[objeto]' },
      { v:'usar', h:'[objeto]' }, { v:'examinar', h:'[objeto/npc]' }, { v:'atacar', h:'[objetivo]' },
      { v:'estado', h:'ver stats' }, { v:'legados', h:'historial de runs' },
      { v:'atributos', h:'ver atributos' }, { v:'experiencia', h:'ver XP' }, { v:'asignar', h:'[atributo]' },
      { v:'musica', h:'estado/on/off/midi' }, { v:'plugins', h:'ver plugins' }, { v:'modulos', h:'ver módulos' }, { v:'eventos', h:'ver eventos' },
      { v:'guardar', h:'guardar partida' }, { v:'exportar', h:'exportar partida' },
      { v:'importar', h:'importar partida' }, { v:'semilla', h:'ver semilla' },
      { v:'nombre', h:'[nombre]' }, { v:'nuevo', h:'nueva run' },
      { v:'ayuda', h:'[tema]' }, { v:'limpiar', h:'limpiar pantalla' },
    ];

    if(typeof CommandRegistry !== 'undefined' && CommandRegistry?.commands) {
      for(const [verb, cfg] of Object.entries(CommandRegistry.commands)) {
        if(!base.find(b => b.v === verb)) {
          base.push({ v: verb, h: `[plugin: ${cfg?.pluginId || 'externo'}]` });
        }
      }
    }
    return base;
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

  const TAGS_ENCARNAR = ['tendón', 'nervio', 'hueso', 'sangre', 'tejido', 'médula'];
  const TAGS_CONJURAR = ['resonante', 'corrupto', 'cristal', 'susurro', 'llama', 'vacío'];

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
    if(typeof AYUDA_TEMAS === 'undefined') return [];
    return Object.keys(AYUDA_TEMAS).map(k => ({
      label: k,
      value: k,
      hint: AYUDA_TEMAS[k].desc?.slice(0, 40) || '',
      color: 't-dim',
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
    return getInventario(i => ['arma', 'armadura'].includes(i.tipo)).map(i => ({ ...i, group: i.group === 'inventario' ? 'arma' : i.group }));
  }

  function getUsables() {
    return getInventario(i => {
      if(i.blueprint === 'huevo_impronta') return true;
      const m = D.mat(i.blueprint);
      return i.tipo === 'consumible' || m?.hp || m?.hunger || i.hp || i.hunger;
    }).map(i => ({ ...i, group: 'usable', color: i.blueprint === 'huevo_impronta' ? 't-cri' : 't-cra' }));
  }

  const MODOS = ['activo', 'defensivo', 'caza', 'autónomo', 'latente'];

  function resolve(raw) {
    const parts = raw.split(' ');
    const verb = (parts[0] || '').toLowerCase();
    const args = parts.slice(1);
    const nargs = args.length;
    const endsSpace = raw.endsWith(' ');

    if(nargs === 0 || (nargs === 1 && !endsSpace)) {
      return { list: getVerbs().filter(b => b.v.startsWith(verb)).map(b => ({ label: b.v, value: b.v, hint: b.h, color: 't-acc', group: 'comando' })) };
    }

    const yaEscritos = endsSpace ? args : args.slice(0, -1);

    switch(verb) {
      case 'ir': case 'go': return { list: getSalidas() };
      case 'hablar': case 'observar': case 'traicionar': return { list: getNPCsAqui() };
      case 'preguntar':
        if(nargs <= 1 || (!endsSpace && nargs === 1)) return { list: getNPCsAqui() };
        return { list: ['deseo', 'miedo', 'secreto', 'pasado', 'anterior', 'vínculo'].map(t => ({ label: t, value: t, hint: 'tema', color: 't-dim', group: 'tema' })) };
      case 'atacar': return { list: [...getNPCsAqui(), ...getEnemigosNodo(), ...getCriaturasNodo()] };
      case 'capturar': return { list: getCriaturasNodo() };
      case 'vincular': return { list: getAnclas() };
      case 'recoger': case 'tomar': return { list: getSuelo() };
      case 'soltar': case 'drop': return { list: getInventario() };
      case 'equipar': return { list: getEquipables() };
      case 'usar': return { list: getUsables() };
      case 'examinar': case 'ex': return { list: [...getInventario(), ...getHabilidades(), ...getMagias(), ...getCompañeros(), ...getNPCsAqui()] };
      case 'forjar': return { list: getMaterialesInv(yaEscritos) };
      case 'encarnar': return { list: getMaterialesModo('corporal', yaEscritos) };
      case 'conjurar': return { list: getMaterialesModo('mágico', yaEscritos) };
      case 'fusionar': {
        const usedSet = new Set(yaEscritos);
        return { list: [...getInventario(i => !usedSet.has((i.nombre || i.blueprint || '').toLowerCase().replace(/\s+/g, '_'))), ...getHabilidades().filter(h => !usedSet.has(h.value)), ...getMagias().filter(m => !usedSet.has(m.value))] };
      }
      case 'lanzar': return { list: getMagias(true) };
      case 'recargar':
        if(nargs <= 1 || (!endsSpace && nargs === 1)) return { list: getMagias() };
        return { list: getMatRecarga() };
      case 'liberar': case 'nombrar': return { list: getCompañeros() };
      case 'modo':
        if(nargs <= 1 || (!endsSpace && nargs === 1)) return { list: getCompañeros() };
        return { list: MODOS.map(m => ({ label: m, value: m, hint: 'modo de IA', color: 't-cri', group: 'modo' })) };
      case 'criar': {
        const ya = new Set(yaEscritos);
        return { list: getCompañeros(c => c.afinidad >= 60 && !ya.has(c.nombre.split('-')[0].toLowerCase())) };
      }
      case 'aceptar': return { list: getMisiones(false).filter(m => !GS.mision(m.value)?.aceptada) };
      case 'rechazar': return { list: getMisiones(false) };
      case 'completar': return { list: getMisiones(true) };
      case 'ayuda': case 'help': case '?': return { list: getTemasAyuda() };
      case 'descargar_plugin': return { list: getPlugins() };
      case 'nombre':
        return { list: [{ label: Player.get().name, value: Player.get().name.replace(/\s+/g, '_'), hint: 'nombre actual', color: 't-npc', group: 'nombre' }] };
      case 'asignar': case 'assign':
        if(typeof XP === 'undefined') return { list: [] };
        return { list: Object.entries(XP.ATRIBUTOS || {}).map(([k, def]) => ({ label: k, value: k, hint: def.desc, color: def.color, group: 'atributo' })) };
      default: return { list: [] };
    }
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

  return {
    hide,
    update,
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
