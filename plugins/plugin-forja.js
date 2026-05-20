// ════════════════════════════════════════════════════════════════
// PLUGIN: Forja v2.0
// Motor de forja desacoplado y registrado como plugin.
// ════════════════════════════════════════════════════════════════

(function initForgePlugin(global) {
  // Helpers compartidos via core/plugin-helpers.js (_svc, _clockCurrent).

  function createForgeApi() {
    const Imprint = {
      gen(blueprint, materials, ctx, tension = 0) {
        const muts = D.narrative?.mutaciones || [];
        const pay = `${blueprint}|${materials.join(',')}|${ctx.nodeId}|${ctx.cycle}|${ctx.pid}|${Date.now()}|${Math.random()}`;
        const seed = U.hash(pay);
        const rng = U.rng(seed);
        const picked = muts.length ? U.pickN(muts, Math.floor(rng() * (2 + tension * 4)), rng) : [];
        let result = { seed, blueprint, materials:[...materials], ctx:{...ctx}, mutations:picked, hash:U.hex(pay + seed), tension, created:Date.now(), parent_hash:null };
        result = EventBus.emit('forge:imprint_gen', result) || result;
        return result;
      },
    };

    const Tags = {
      aff(tags) {
        let best = null, bs = 0;
        for(let i = 0; i < tags.length; i++) {
          for(let j = i + 1; j < tags.length; j++) {
            const k1 = `${tags[i]}:${tags[j]}`;
            const k2 = `${tags[j]}:${tags[i]}`;
            const af = D.tagAff?.[k1] || D.tagAff?.[k2];
            if(af && af.fuerza > bs) { best = af; bs = af.fuerza; }
          }
        }
        return best;
      },
      tension(tags) {
        let t = 0;
        (D.tagOpp || []).forEach(([a, b]) => { if(tags.includes(a) && tags.includes(b)) t += 0.3; });
        return U.clamp(t, 0, 1);
      },
    };

    const Forge = {
      calcStat(def, s, t, rng) {
        if(!def) return 0;
        return U.clamp(Math.floor(def.base + (def.escala || 0) * s + (def.tension || 0) * t + rng() * (def.rng || 0)), def.min || 0, def.max || 999);
      },
      buildStats(arcId, s, t, rng) {
        const arc = D.archetypes?.[arcId];
        if(!arc) return null;
        const out = {};
        for(const [k, def] of Object.entries(arc.stats || {})) {
          const v = this.calcStat(def, s, t, rng);
          if(v > 0) out[k] = v;
        }
        return out;
      },
      forjar(matIds, ctx, nodeEstado, phaseName, modo) {
        const { cancelled } = EventBus.emitCancellable?.('forge:before', { matIds, ctx, nodeEstado, phaseName, cancelled:false }) || {};
        if(cancelled) return { cancelled:true };

        const rng = U.rng(Date.now() + Math.random());
        const allTags = matIds.flatMap(id => D.matTags(id));
        const freq = {};
        allTags.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
        const dom = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(e => e[0]);
        const tension = Tags.tension(dom);
        const afRes = Tags.aff(dom);
        const clock = _clockCurrent();
        const bonus = [...(clock.slot?.bonusTags || [])];
        if(nodeEstado === 'corrompido') bonus.push('corrupto');
        const allTagsPlus = [...dom, ...bonus];

        let rType = afRes?.resultado || 'consumible';
        let strength = afRes?.fuerza || 0.3;
        if(tension > 0.7 && rng() < tension - 0.4) rType = 'colapso';
        if((Number(clock.cycle) || 0) >= (ModuleLoader.get('mitico_chance_ciclo_min') || 10) && rng() < (ModuleLoader.get('mitico_chance') || 0.12)) rType = 'mítico';

        if(modo === 'corporal' && rType !== 'colapso' && rType !== 'mítico') { rType = 'habilidad'; strength = Math.max(strength, 0.6); }
        if(modo === 'mágico' && rType !== 'colapso' && rType !== 'mítico') { rType = 'magia'; strength = Math.max(strength, 0.6); }

        const resolved = EventBus.emit('forge:resolve_type', { rType, strength, dom, tension, bonus });
        if(resolved) { rType = resolved.rType || rType; strength = resolved.strength || strength; }
        if(rType === 'colapso') { EventBus.emit('forge:collapse', { tension, matIds }); return { colapso:true, tension }; }

        const baseStats = this.buildStats(rType, strength, tension, rng);
        if(!baseStats) return { colapso:true, tension };

        const arc = D.archetypes?.[rType];
        const adj = arc?.adjetivos?.length ? U.pick(arc.adjetivos, rng) : '?';
        const nou = arc?.sustantivos?.length ? U.pick(arc.sustantivos, rng) : '?';
        const nombre = `${adj} ${nou}`;
        const blueprint = nombre.toLowerCase().replace(/ /g, '_');
        const tipoMap = {
          habilidad:'habilidad', magia:'magia', arma:'arma', armadura:'armadura', consumible:'consumible',
          reliquia:'reliquia', anomalía:'anomalía', mítico:'mítico', híbrido:'arma', corrupto:'arma', resonante:'reliquia',
          casco:'casco', guantes:'guantes', peto:'peto', botas:'botas', accesorio:'accesorio',
        };
        const tipo = tipoMap[rType] || 'reliquia';

        let habData = null, magData = null;
        if(tipo === 'habilidad') {
          habData = U.pick(D.habPool, rng);
          Object.assign(baseStats, { efecto:habData.efecto, desc:habData.desc, nombre:habData.nombre, evolucion_umbral:habData.evolucion_umbral || 10 });
        }
        if(tipo === 'magia') {
          magData = U.pick(D.magPool, rng);
          Object.assign(baseStats, { efecto:magData.efecto, desc:magData.desc, nombre:magData.nombre, cargas:magData.cargas, cargas_max:magData.cargas, fragilidad:magData.fragilidad_base || 0 });
        }

        const imp = Imprint.gen(blueprint, matIds, ctx, tension);
        let item = { id:U.uid(), blueprint, nombre, tipo, tags:allTagsPlus.slice(0, 5), imprint:imp, estado:'nativo', ...baseStats, forjado:true, tension_origen:tension };
        if(habData) item.evolucion = { contador:0, umbral:habData.evolucion_umbral || 10 };
        item.encantamientos = [];
        item.encarnaciones = [];

        if(['arma', 'híbrido', 'corrupto'].includes(tipo) || tipo === 'arma') {
          item.durabilidad = Math.round(U.clamp(100 - tension * 30, 40, 100));
          item.mellada = false;
          item.poise_dmg = Math.floor((item.atk || 0) * 0.3);
          item.tension_bonus = Math.floor(tension * 4);
          item.equip_slot = dom.includes('dual') ? 'mano_izquierda' : 'mano_derecha';
        }
        if(tipo === 'armadura') {
          item.durabilidad = Math.round(U.clamp(100 - tension * 20, 50, 100));
          const slotDef = dom.includes('cabeza') ? 'casco' : dom.includes('mano') ? 'guantes' : dom.includes('pierna') ? 'botas' : 'peto';
          item.tipo = slotDef;
          item.equip_slot = slotDef;
          item.def = Math.max(1, item.def || Math.floor(2 + strength * 6));
        }
        if(['casco', 'guantes', 'peto', 'botas'].includes(tipo)) {
          item.equip_slot = tipo;
          item.def = Math.max(1, item.def || Math.floor(2 + strength * 5));
        }
        if(tipo === 'reliquia' && (dom.includes('resonante') || dom.includes('antiguo') || tension > 0.45)) {
          item.tipo = 'accesorio';
          item.equip_slot = rng() < 0.5 ? 'accesorio_1' : 'accesorio_2';
          const rareRoll = rng();
          item.raridad = rareRoll > 0.92 ? 'mítico' : rareRoll > 0.72 ? 'épico' : rareRoll > 0.45 ? 'raro' : 'común';
          const pool = [
            { stat:'atk', valor:2 }, { stat:'def', valor:2 }, { stat:'crit', valor:5 }, { stat:'evasion', valor:5 },
            { stat:'mana_max', valor:8 }, { stat:'stamina_max', valor:10 },
          ];
          const rarePool = [{ stat:'crit', valor:8 }, { stat:'evasion', valor:9 }, { stat:'atk', valor:4 }, { stat:'def', valor:4 }];
          item.efecto_accesorio = item.raridad === 'mítico' ? U.pick(rarePool, rng) : U.pick(pool, rng);
        }

        if(dom.includes('resonante')) item.encantamientos.push('latido resonante');
        if(dom.includes('corrupto')) item.encantamientos.push('sello corrupto');
        if(dom.includes('antiguo')) item.encarnaciones.push('instinto antiguo');
        if(dom.includes('vacío')) item.encarnaciones.push('núcleo vacío');
        if(tension > 0.5) item.encantamientos.push('cicatriz inestable');

        const hayAncla = matIds.some(id => D.mat(id)?.categoria === 'ancla');
        if(hayAncla) {
          let anclaId = 'ancla_resonante';
          if(dom.includes('corrupto') || dom.includes('metal')) anclaId = 'ancla_corrupta';
          else if(dom.includes('antiguo') || dom.includes('orgánico')) anclaId = 'ancla_antigua';
          else if(dom.includes('inestable') || dom.includes('vacío')) anclaId = 'ancla_inestable';
          const anclaItem = { id:U.uid(), blueprint:anclaId, nombre:anclaId.replace('_', ' '), tipo:'material', categoria:'ancla', tags:D.mat(anclaId)?.tags || dom.slice(0, 2), desc:D.mat(anclaId)?.desc || 'Ancla forjada.', imprint:imp, estado:'forjado', forjado:true };
          EventBus.emit('forge:after', { item:anclaItem, rType:'ancla', tension, domTags:dom, bonus });
          return { item:anclaItem, tension, rType:'ancla', domTags:dom, bonus };
        }

        if(tipo === 'consumible') {
          if(dom.includes('medicina') || dom.includes('curativo')) { item.efecto = 'hp'; item.valor = 10 + Math.floor(strength * 15); }
          else if(dom.includes('energía') || dom.includes('vital')) { item.efecto = 'stamina'; item.valor = 20 + Math.floor(strength * 20); }
          else if(dom.includes('resonante')) { item.efecto = 'elemento_arma'; item.elemento = 'RESONANTE'; item.dur = 3; }
          else if(dom.includes('fuego') || dom.includes('ardiente')) { item.efecto = 'elemento_arma'; item.elemento = 'ARDIENDO'; item.dur = 3; }
          else if(dom.includes('hielo') || dom.includes('frío')) { item.efecto = 'elemento_arma'; item.elemento = 'CONGELADO'; item.dur = 3; }
          else if(dom.includes('rayo') || dom.includes('eléctrico')) { item.efecto = 'elemento_arma'; item.elemento = 'ELECTRIZADO'; item.dur = 3; }
          else if(dom.includes('vacío') || dom.includes('corrupto')) { item.efecto = 'elemento_arma'; item.elemento = 'VACÍO'; item.dur = 2; }
        }

        const afterResult = EventBus.emit('forge:after', { item, rType, tension, domTags:dom, bonus });
        if(afterResult?.item) item = afterResult.item;
        return { item, tension, rType, domTags:dom, bonus };
      },
    };

    return { Forge, Imprint, Tags };
  }

  function api() {
    if(!global.__forgePluginApi) global.__forgePluginApi = createForgeApi();
    return global.__forgePluginApi;
  }

  // ── Handlers de forja (migrados de systems/commands.js en C2) ────
  // _player() viene de plugin-helpers.js; el inventario y equipo se
  // mutan via referencia al objeto del jugador.
  function _cmdForjar(args, modo) {
    if(!args.length) {
      _line('forjar [mat1] [mat2] ...', 't-dim');
      _line('encarnar — sesga a habilidades  ·  conjurar — sesga a magias', 't-dim');
      return;
    }
    const p = _player();
    if(!p) return;
    const used = [], ids = [];
    for(const q of args) {
      const item = (p.inventory || []).find(i => !used.includes(i.id) && (
        i.blueprint?.toLowerCase().includes(q.toLowerCase()) ||
        i.nombre?.toLowerCase().includes(q.toLowerCase())
      ));
      if(!item) { _line(`No tienes "${q}".`, 't-dim'); return; }
      if(!['material', 'ancla'].includes(item.tipo) && item.categoria !== 'ancla') {
        _line(`"${item.nombre || item.blueprint}" no es material forjable.`, 't-dim');
        return;
      }
      used.push(item.id);
      ids.push(item.blueprint);
    }
    if(ids.length < 2) { _line('Necesitas al menos 2 materiales.', 't-dim'); return; }
    if(modo === 'corporal') {
      const tagsCorp = ['tendón', 'nervio', 'hueso', 'sangre', 'tejido', 'médula'];
      if(!ids.some(id => D.matTags(id).some(t => tagsCorp.includes(t)))) {
        _line('Encarnar requiere material corporal.', 't-pel');
        return;
      }
    }
    if(modo === 'mágico') {
      const tagsMag = ['resonante', 'corrupto', 'cristal', 'susurro', 'llama', 'vacío'];
      if(!ids.some(id => D.matTags(id).some(t => tagsMag.includes(t)))) {
        _line('Conjurar requiere material mágico.', 't-pel');
        return;
      }
    }
    const ctx = {
      nodeId: _playerPos(),
      cycle:  Number(_clockCurrent().cycle) || 0,
      pid:    p.id,
      modo,
    };
    const nodeEstado = _worldNode(ctx.nodeId)?.estado;
    const phaseName  = _clockCurrent().name || '';
    const res = api().Forge.forjar(ids, ctx, nodeEstado, phaseName, modo);
    if(res?.cancelled) { _line('La forja fue cancelada.', 't-dim'); return; }
    _clockTick(2);
    EventBus.emit('player:tick', { player: p });
    if(res?.colapso) {
      _sp(); _line('⚠ COLAPSO DE FORJA', 't-pel', true);
      _line(`Tensión: ${(res.tension * 100).toFixed(0)}%`, 't-cor');
      const d = _playerDamage(U.rand(5, 15));
      _line(`−${d} HP`, 't-pel');
      used.forEach(id => _playerRemoveItem(id));
      _refreshStatus(); _saveGame();
      return;
    }
    const item = res.item;
    used.forEach(id => _playerRemoveItem(id));
    _sp();
    const col = item.tipo === 'habilidad' ? 't-hab'
              : item.tipo === 'magia'     ? 't-mag'
              : item.tipo === 'mítico'    ? 't-cor'
              : item.categoria === 'ancla' ? 't-cri' : 't-cra';
    _line(`FORJA — ${res.rType.toUpperCase()}`, 't-acc', true);
    _line(`${item.nombre}  [${item.tipo}]`, col);
    if(item.atk)   _line(`ATK +${item.atk}`, 't-pel');
    if(item.def)   _line(`DEF +${item.def}`, 't-sis');
    if(item.hp)    _line(`Cura ${item.hp}HP`, 't-cra');
    if(item.poder) _line(`Poder: ${item.poder}`, 't-mag');
    if(item.desc)  _line(item.desc, 't-dim');
    _line(`Tags: ${res.domTags.join(', ')}  #${item.imprint?.hash || '—'}`, 't-dim');
    if(p.stats) p.stats.crafted = (p.stats.crafted || 0) + 1;
    const xpForja = { arma:15, armadura:12, consumible:8, habilidad:30, magia:35, 'mítico':80, reliquia:20, ancla:12, colapso:5 };
    _xpGanar('forja', xpForja[res.rType] || 10, `forja: ${res.rType}`);
    if(item.tipo === 'habilidad') {
      if(!_playerAddHab(item)) { _line('Slots llenos. En inventario.', 't-dim'); _playerAddItem(item); }
      else _line('Habilidad encarnada.', 't-hab');
    } else if(item.tipo === 'magia') {
      if(!_playerAddMag(item)) { _line('Slots llenos. En inventario.', 't-dim'); _playerAddItem(item); }
      else _line('Magia conjurada.', 't-mag');
    } else {
      _playerAddItem(item);
    }
    _sp(); _refreshStatus(); _saveGame();
  }

  function _cmdFusionar(args) {
    if(args.length < 2) { _line('fusionar [id1] [id2] ...', 't-dim'); return; }
    const p = _player();
    if(!p) return;
    const items = args.map(q => _playerFindItem(q) || _playerFindHab(q) || _playerFindMag(q)).filter(Boolean);
    if(items.length < 2) { _line(`Solo encontré ${items.length} ítem(s).`, 't-dim'); return; }
    const allTags = items.flatMap(i => i.tags || []);
    const tension = api().Tags?.tension?.(allTags) || 0;
    _sp(); _line('CONVERGENCIA — FUSIÓN', 't-cor', true);
    _line(`Tensión: ${(tension * 100).toFixed(0)}%`, tension > 0.6 ? 't-pel' : 't-dim');
    if(tension > 0.8) {
      _line('Tensión demasiado alta. Colapso.', 't-pel');
      items.forEach(i => { _playerRemoveItem(i.id); _playerRemoveHab(i.id); _playerRemoveMag(i.id); });
      const d = _playerDamage(U.rand(10, 25));
      _line(`−${d} HP`, 't-pel');
      _refreshStatus(); _saveGame();
      return;
    }
    const rng = U.rng(Date.now());
    const pena = 1 - tension * 0.3;
    const totalAtk   = Math.floor(items.reduce((s, i) => s + (i.atk || 0) + (i.valor || 0) * 0.5, 0) * pena);
    const totalDef   = Math.floor(items.reduce((s, i) => s + (i.def || 0), 0) * pena);
    const totalPoder = Math.floor(items.reduce((s, i) => s + (i.poder || 0), 0) * pena);
    const muts = D.narrative?.mutaciones || [];
    const tier = tension > 0.55 ? 'inestable' : (items.length >= 4 ? 'sublime' : 'estable');
    const adj  = tier === 'inestable' ? ['Inestable', 'Corrupta', 'Fragmentada']
               : tier === 'sublime'   ? ['Ascendida', 'Soberana', 'Arcana']
               :                        ['Convergente', 'Primordial', 'Eterna'];
    const nombre = `${U.pick(adj, rng)} ${muts.length ? U.pick(muts, rng) : 'Reliquia'}`;
    const imp = api().Imprint?.gen?.('reliquia_viva', allTags, { nodeId: _playerPos(), cycle: Number(_clockCurrent().cycle) || 0, pid: p.id }, tension) || null;
    const tieneHab = items.some(i => i.tipo === 'habilidad');
    const tieneMag = items.some(i => i.tipo === 'magia');
    const tipoResultado = (items.some(i => ['casco', 'guantes', 'peto', 'botas', 'accesorio'].includes(i.tipo)) && U.chance(0.45)) ? 'accesorio' : 'mítico';
    const rel = {
      id: U.uid(), blueprint: 'reliquia_viva', nombre,
      tipo: tipoResultado, tags: allTags.slice(0, 6), imprint: imp,
      estado: 'convergente', es_mitico: tipoResultado === 'mítico',
      atk: totalAtk, def: totalDef, poder: totalPoder,
      efecto_pasivo: tieneHab && tieneMag ? '+1_slot_magia'
                   : tieneHab             ? 'atk_bonus'
                   : tieneMag             ? 'mana_max'
                   : null,
      encantamientos: U.pickN(['filo espectral', 'piel de eco', 'núcleo vacío', 'chispa ancestral', 'trama umbral'], 1 + (items.length >= 4 ? 1 : 0), rng),
      encarnaciones:  U.pickN(['eco del guardián', 'voz fractal', 'instinto antiguo', 'sombra binaria'], tension > 0.45 ? 2 : 1, rng),
      desc: `Convergencia ${tier}. Tensión:${(tension * 100).toFixed(0)}%.`,
    };
    if(rel.tipo === 'accesorio') {
      rel.raridad = tension > 0.5 ? 'legendario' : (items.length >= 4 ? 'épico' : 'raro');
      const pool = [
        { stat: 'atk', valor: 2 }, { stat: 'def', valor: 2 },
        { stat: 'crit', valor: 5 }, { stat: 'evasion', valor: 5 },
        { stat: 'mana_max', valor: 8 }, { stat: 'stamina_max', valor: 10 },
      ];
      rel.efecto_accesorio = U.pick(pool, rng);
    }
    items.forEach(i => { _playerRemoveItem(i.id); _playerRemoveHab(i.id); _playerRemoveMag(i.id); });
    _playerAddItem(rel);
    _xpGanar('forja', 60 + items.length * 10, 'fusión ontológica');
    _xpGanar('mente', 30, 'convergencia');
    _line(`${rel.nombre}  [${rel.tipo.toUpperCase()}]`, 't-cor', true);
    if(rel.atk) _line(`ATK +${rel.atk}`, 't-pel');
    if(rel.def) _line(`DEF +${rel.def}`, 't-sis');
    if(rel.efecto_pasivo)    _line(`Efecto pasivo: ${rel.efecto_pasivo}`, 't-cor');
    if(rel.efecto_accesorio) _line(`Accesorio: +${rel.efecto_accesorio.valor} ${rel.efecto_accesorio.stat}`, 't-mag');
    _line(`Encantamientos: ${rel.encantamientos.join(', ')}`, 't-mag');
    _line(`Encarnaciones: ${rel.encarnaciones.join(', ')}`, 't-hab');
    _sp(); _refreshStatus(); _saveGame();
  }

  function _cmdRecetas() {
    _sp(); _line('— GUÍA DE AFINIDADES —', 't-acc');
    Object.entries(D.tagAff || {}).forEach(([k, v]) => {
      _line(`  ${k.padEnd(28)} → ${v.resultado}  (${v.fuerza})`, 't-dim');
    });
    _sp(); _line('Tags opuestos:', 't-out');
    (D.tagOpp || []).forEach(([a, b]) => _line(`  ${a} ↔ ${b}`, 't-dim'));
    _sp();
  }

  function _cmdMateriales() {
    _sp(); _line('— MATERIALES —', 't-acc');
    const cats = {};
    Object.entries(D.mats || {}).forEach(([id, m]) => {
      const c = m.categoria || 'físico';
      if(!cats[c]) cats[c] = [];
      cats[c].push(id);
    });
    Object.entries(cats).forEach(([cat, ids]) => {
      _line(cat, 't-acc');
      ids.forEach(id => {
        const m = D.mat(id);
        _line(`  ${id.padEnd(24)} [${m?.tags?.join(',') || '—'}]`, 't-dim');
      });
    });
    _sp();
  }

  global.pluginForja = {
    id: 'plugin:forja',
    nombre: 'Sistema de Forja',
    version: '2.0.0',
    descripcion: 'Afinidades, tension e improntas de forja como plugin.',
    onLoad() { api(); },
    services: {
      'runtime.forge.api': () => api(),
      'runtime.forge.run': (matIds, ctx, nodeEstado, phaseName, modo) => api().Forge.forjar(matIds, ctx, nodeEstado, phaseName, modo),
      'runtime.forge.calc_stat': (def, s, t, rng) => api().Forge.calcStat(def, s, t, rng),
      'runtime.forge.build_stats': (arcId, s, t, rng) => api().Forge.buildStats(arcId, s, t, rng),
      'runtime.imprint.gen': (blueprint, materials = [], ctx = {}, tension = 0) => api().Imprint.gen(blueprint, materials, ctx, tension),
    },
    comandos: {
      'forjar':     { fn: (args)=>_cmdForjar(args),               meta:{ titulo:'forjar [mat] [mat]',   color:'t-hab', desc:'Forja ítems combinando materiales.' } },
      'encarnar':   { fn: (args)=>_cmdForjar(args, 'corporal'),   meta:{ titulo:'encarnar [mat] [mat]', color:'t-hab', desc:'Forja sesgada a habilidades corporales.' } },
      'conjurar':   { fn: (args)=>_cmdForjar(args, 'mágico'),     meta:{ titulo:'conjurar [mat] [mat]', color:'t-mag', desc:'Forja sesgada a magias.' } },
      'fusionar':   { fn: (args)=>_cmdFusionar(args),             meta:{ titulo:'fusionar [id] [id]',   color:'t-cor', desc:'Fusiona ítems en una reliquia viva.' } },
      'recetas':    { fn: ()    =>_cmdRecetas(),                  meta:{ titulo:'recetas',              color:'t-dim', desc:'Ver guía de afinidades de tags.' } },
      'materiales': { fn: ()    =>_cmdMateriales(),               meta:{ titulo:'materiales',           color:'t-dim', desc:'Ver catálogo de materiales por categoría.' } },
    },
  };
})(globalThis);
