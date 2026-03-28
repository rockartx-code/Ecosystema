// ════════════════════════════════════════════════════════════════
// FORGE — Impronta, Tags y Motor de Forja
// ════════════════════════════════════════════════════════════════

// ── Imprint — identidad única de cada objeto forjado ─────────────
const Imprint = {
  gen(blueprint, materials, ctx, tension = 0) {
    const muts = D.narrative?.mutaciones || [];
    const pay  = `${blueprint}|${materials.join(',')}|${ctx.nodeId}|${ctx.cycle}|${ctx.pid}|${Date.now()}|${Math.random()}`;
    const seed = U.hash(pay);
    const rng  = U.rng(seed);
    const picked = muts.length ? U.pickN(muts, Math.floor(rng() * (2 + tension * 4)), rng) : [];
    let result = { seed, blueprint, materials:[...materials], ctx:{...ctx}, mutations:picked, hash:U.hex(pay+seed), tension, created:Date.now(), parent_hash:null };
    result = EventBus.emit('forge:imprint_gen', result) || result;
    return result;
  },
};

// ── Tags Engine — afinidades y tensiones entre tags ───────────────
const Tags = {
  aff(tags) {
    let best = null, bs = 0;
    for(let i = 0; i < tags.length; i++)
      for(let j = i + 1; j < tags.length; j++) {
        const k1 = `${tags[i]}:${tags[j]}`, k2 = `${tags[j]}:${tags[i]}`;
        const af = D.tagAff?.[k1] || D.tagAff?.[k2];
        if(af && af.fuerza > bs) { best = af; bs = af.fuerza; }
      }
    return best;
  },
  tension(tags) {
    let t = 0;
    (D.tagOpp || []).forEach(([a,b]) => { if(tags.includes(a) && tags.includes(b)) t += .3; });
    return U.clamp(t, 0, 1);
  },
};

// ── Forge Engine — crafteo libre por afinidades ───────────────────
const Forge = {
  calcStat(def, s, t, rng) {
    if(!def) return 0;
    return U.clamp(
      Math.floor(def.base + (def.escala||0)*s + (def.tension||0)*t + rng()*(def.rng||0)),
      def.min || 0, def.max || 999
    );
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
    const { cancelled } = EventBus.emitCancellable?.('forge:before',
      { matIds, ctx, nodeEstado, phaseName, cancelled:false }) || {};
    if(cancelled) return { cancelled:true };

    const rng      = U.rng(Date.now() + Math.random());
    const allTags  = matIds.flatMap(id => D.matTags(id));
    const freq     = {};
    allTags.forEach(t => { freq[t] = (freq[t]||0) + 1; });
    const dom      = Object.entries(freq).sort((a,b) => b[1]-a[1]).map(e => e[0]);
    const tension  = Tags.tension(dom);
    const afRes    = Tags.aff(dom);
    const c        = Clock.get();
    const bonus    = [...(c.bonusTags||[])];
    if(nodeEstado === 'corrompido') bonus.push('corrupto');
    const allTagsPlus = [...dom, ...bonus];

    let rType    = afRes?.resultado || 'consumible';
    let strength = afRes?.fuerza    || .3;
    if(tension > .7 && rng() < tension - .4) rType = 'colapso';
    if(Clock.cycle >= (ModuleLoader.get('mitico_chance_ciclo_min')||10) && rng() < (ModuleLoader.get('mitico_chance')||.12)) rType = 'mítico';

    if(modo === 'corporal' && rType !== 'colapso' && rType !== 'mítico') { rType = 'habilidad'; strength = Math.max(strength, 0.6); }
    if(modo === 'mágico'   && rType !== 'colapso' && rType !== 'mítico') { rType = 'magia';     strength = Math.max(strength, 0.6); }

    const resolved = EventBus.emit('forge:resolve_type', { rType, strength, dom, tension, bonus });
    if(resolved) { rType = resolved.rType || rType; strength = resolved.strength || strength; }

    if(rType === 'colapso') { EventBus.emit('forge:collapse', { tension, matIds }); return { colapso:true, tension }; }

    const baseStats = this.buildStats(rType, strength, tension, rng);
    if(!baseStats) return { colapso:true, tension };

    const arc     = D.archetypes?.[rType];
    const adj     = arc?.adjetivos?.length   ? U.pick(arc.adjetivos,   rng) : '?';
    const nou     = arc?.sustantivos?.length  ? U.pick(arc.sustantivos, rng) : '?';
    const nombre  = `${adj} ${nou}`;
    const blueprint = nombre.toLowerCase().replace(/ /g,'_');
    const tipoMap   = {
      habilidad:'habilidad', magia:'magia', arma:'arma', armadura:'armadura', consumible:'consumible',
      reliquia:'reliquia', anomalía:'anomalía', mítico:'mítico', híbrido:'arma', corrupto:'arma', resonante:'reliquia',
      casco:'casco', guantes:'guantes', peto:'peto', botas:'botas', accesorio:'accesorio',
    };
    const tipo    = tipoMap[rType] || 'reliquia';

    let habData = null, magData = null;
    if(tipo === 'habilidad') {
      habData = U.pick(D.habPool, rng);
      Object.assign(baseStats, { efecto:habData.efecto, desc:habData.desc, nombre:habData.nombre, evolucion_umbral:habData.evolucion_umbral||10 });
    }
    if(tipo === 'magia') {
      magData = U.pick(D.magPool, rng);
      Object.assign(baseStats, { efecto:magData.efecto, desc:magData.desc, nombre:magData.nombre, cargas:magData.cargas, cargas_max:magData.cargas, fragilidad:magData.fragilidad_base||0 });
    }

    const imp = Imprint.gen(blueprint, matIds, ctx, tension);
    let item = { id:U.uid(), blueprint, nombre, tipo, tags:allTagsPlus.slice(0,5), imprint:imp, estado:'nativo', ...baseStats, forjado:true, tension_origen:tension };
    if(habData) item.evolucion = { contador:0, umbral:habData.evolucion_umbral||10 };
    item.encantamientos = [];
    item.encarnaciones  = [];

    if(['arma','híbrido','corrupto'].includes(tipo) || tipo === 'arma') {
      item.durabilidad  = Math.round(U.clamp(100 - tension*30, 40, 100));
      item.mellada      = false;
      item.poise_dmg    = Math.floor((item.atk||0) * 0.3);
      item.tension_bonus= Math.floor(tension * 4);
      item.equip_slot   = dom.includes('dual') ? 'mano_izquierda' : 'mano_derecha';
    }
    if(tipo === 'armadura') {
      item.durabilidad = Math.round(U.clamp(100 - tension*20, 50, 100));
      const slotDef = dom.includes('cabeza') ? 'casco'
        : dom.includes('mano') ? 'guantes'
        : dom.includes('pierna') ? 'botas'
        : 'peto';
      item.tipo = slotDef;
      item.equip_slot = slotDef;
      item.def = Math.max(1, item.def || Math.floor(2 + strength*6));
    }
    if(['casco','guantes','peto','botas'].includes(tipo)) {
      item.equip_slot = tipo;
      item.def = Math.max(1, item.def || Math.floor(2 + strength*5));
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

    // Encantamientos + encarnaciones básicos
    if(dom.includes('resonante')) item.encantamientos.push('latido resonante');
    if(dom.includes('corrupto'))  item.encantamientos.push('sello corrupto');
    if(dom.includes('antiguo'))   item.encarnaciones.push('instinto antiguo');
    if(dom.includes('vacío'))     item.encarnaciones.push('núcleo vacío');
    if(tension > 0.5)             item.encantamientos.push('cicatriz inestable');

    // Anclas
    const hayAncla = matIds.some(id => D.mat(id)?.categoria === 'ancla');
    if(hayAncla) {
      let anclaId = 'ancla_resonante';
      if(dom.includes('corrupto') || dom.includes('metal'))        anclaId = 'ancla_corrupta';
      else if(dom.includes('antiguo') || dom.includes('orgánico')) anclaId = 'ancla_antigua';
      else if(dom.includes('inestable') || dom.includes('vacío'))  anclaId = 'ancla_inestable';
      const anclaItem = { id:U.uid(), blueprint:anclaId, nombre:anclaId.replace('_',' '), tipo:'material', categoria:'ancla', tags:D.mat(anclaId)?.tags||dom.slice(0,2), desc:D.mat(anclaId)?.desc||'Ancla forjada.', imprint:imp, estado:'forjado', forjado:true };
      EventBus.emit('forge:after', { item:anclaItem, rType:'ancla', tension, domTags:dom, bonus });
      return { item:anclaItem, tension, rType:'ancla', domTags:dom, bonus };
    }

    if(tipo === 'consumible') {
      if(dom.includes('medicina')||dom.includes('curativo'))   { item.efecto='hp';item.valor=10+Math.floor(strength*15); }
      else if(dom.includes('energía')||dom.includes('vital'))  { item.efecto='stamina';item.valor=20+Math.floor(strength*20); }
      else if(dom.includes('resonante'))                       { item.efecto='elemento_arma';item.elemento='RESONANTE';item.dur=3; }
      else if(dom.includes('fuego')||dom.includes('ardiente')) { item.efecto='elemento_arma';item.elemento='ARDIENDO';item.dur=3; }
      else if(dom.includes('hielo')||dom.includes('frío'))     { item.efecto='elemento_arma';item.elemento='CONGELADO';item.dur=3; }
      else if(dom.includes('rayo')||dom.includes('eléctrico')) { item.efecto='elemento_arma';item.elemento='ELECTRIZADO';item.dur=3; }
      else if(dom.includes('vacío')||dom.includes('corrupto')) { item.efecto='elemento_arma';item.elemento='VACÍO';item.dur=2; }
    }

    const afterResult = EventBus.emit('forge:after', { item, rType, tension, domTags:dom, bonus });
    if(afterResult?.item) item = afterResult.item;
    return { item, tension, rType, domTags:dom, bonus };
  },
};

if(typeof ServiceRegistry !== 'undefined') {
  ServiceRegistry.register('runtime.imprint.gen', (blueprint, materials = [], ctx = {}, tension = 0) => {
    return Imprint.gen(blueprint, materials, ctx, tension);
  }, {
    pluginId:'core',
    version:'0.1.0',
  });
}
