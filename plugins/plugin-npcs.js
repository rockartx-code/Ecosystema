// ════════════════════════════════════════════════════════════════
// PLUGIN: NPCs v2.0
// Generacion, dialogo y misiones de NPCs movidos a plugin.
// ════════════════════════════════════════════════════════════════

(function initNPCPlugin(global) {
  function _svc(name) {
    return (typeof ServiceRegistry !== 'undefined' && typeof ServiceRegistry.get === 'function')
      ? ServiceRegistry.get(name)
      : null;
  }
  function _gainXP(rama, cantidad, motivo) {
    const fn = _svc('runtime.xp.gain');
    return typeof fn === 'function' ? fn(rama, cantidad, motivo) : false;
  }
  function _memoryEcos() {
    const fn = _svc('runtime.memory.ecos');
    return typeof fn === 'function' ? (fn() || []) : [];
  }
  function _player() {
    const fn = _svc('runtime.player.current');
    return typeof fn === 'function' ? fn() : null;
  }
  function _worldRead() {
    const fn = _svc('runtime.world.read');
    return typeof fn === 'function' ? (fn() || {}) : {};
  }
  function _clockCurrent() {
    const fn = _svc('runtime.clock.current');
    return typeof fn === 'function' ? (fn() || {}) : {};
  }
  function _allNPCs() {
    const fn = _svc('runtime.gs.all_npcs');
    return typeof fn === 'function' ? (fn() || []) : [];
  }
  function _aliveNPCs() {
    const fn = _svc('runtime.gs.alive_npcs');
    return typeof fn === 'function' ? (fn() || []) : [];
  }
  function _addNPC(npc) {
    const fn = _svc('runtime.gs.add_npc');
    return typeof fn === 'function' ? !!fn(npc) : false;
  }
  function _allMisiones() {
    const fn = _svc('runtime.gs.all_misiones');
    return typeof fn === 'function' ? (fn() || []) : [];
  }
  function _addMision(mision) {
    const fn = _svc('runtime.gs.add_mision');
    return typeof fn === 'function' ? !!fn(mision) : false;
  }
  function _line(text, color='t-out', bold=false) {
    const fn = _svc('runtime.output.line');
    if(typeof fn === 'function') fn(text, color, bold);
  }
  function _refreshStatus() {
    const fn = _svc('runtime.status.refresh');
    if(typeof fn === 'function') fn();
  }
  function _saveGame() {
    const fn = _svc('runtime.game.save');
    if(typeof fn === 'function') fn();
  }

  function createNPCApi() {
    const api = {
      nombre(rng) {
        const nd = D.npcs;
        const n = U.pick(nd.nombres_prefijos || ['X'], rng) + U.pick(nd.nombres_sufijos || [''], rng);
        return U.chance(nd.titulo_chance || 0.3) ? n + ' ' + U.pick(nd.nombres_titulos || [''], rng) : n;
      },
      gen(nodeId, wseed, idx, ecos, otros) {
        const rng = U.rng(wseed + nodeId + idx + Date.now());
        const nd = D.npcs;
        let npc = {
          id:U.uid(), nombre:api.nombre(rng), arq_vis:U.pick(nd.arquetipos_visibles || ['errante'], rng), arq_ocu:U.pick(nd.arquetipos_ocultos || ['vacío'], rng),
          deseo:U.pick(nd.deseos || ['—'], rng), necesidad:U.pick(nd.necesidades || ['—'], rng), miedo:U.pick(nd.miedos || ['—'], rng), secreto:U.pick(nd.secretos || ['—'], rng),
          secreto_idx:Math.floor(rng() * (nd.secretos || ['—']).length), trauma:U.pick(nd.traumas || ['—'], rng),
          lealtad:U.rand(10, 40) + (_player()?.presencia || 0) * 3, corrupcion:U.rand(5, 30), desesperacion:U.rand(10, 50),
          nodeId, estado:'vivo', secreto_expuesto:false, arq_ocu_expuesto:false, fragmentos:[], vinculos:[], misiones_ofrecidas:[], interacciones:0,
          eco_run_id:ecos?.length && U.chance(0.3) ? U.pick(ecos, rng).run_id : null, twists_activados:[], hp_combat:null, faccion:null,
        };
        if(otros?.length && U.chance(nd.vinculo_chance || 0.6)) {
          const otro = U.pick(otros, rng);
          const tipo = U.pick(nd.tipos_vinculo || ['deuda'], rng);
          const hp = nd.vinculos_historia?.[tipo] || ['Hay algo entre ellos.'];
          const hist = U.pick(hp, rng).replace(/{na}/g, npc.nombre).replace(/{nb}/g, otro.nombre);
          const v = { tipo, intensidad:U.rand(30, 90), historia:hist, estado:'activo', npc_a:npc.id, npc_b:otro.id };
          npc.vinculos.push(v);
          otro.vinculos.push({ ...v, npc_a:otro.id, npc_b:npc.id });
        }
        const result = EventBus.emit('narrative:npc_gen', { npc, nodeId, ecos, otros });
        if(result?.npc) npc = result.npc;
        return npc;
      },
      dialogo(npc, runs) {
        const rng = U.rng(npc.id + (Number(_clockCurrent().cycle) || 0) + Math.random());
        const dl = D.npcs.dialogos || {};
        let est = 'normal';
        if(npc.desesperacion > 75) est = 'desesperado';
        else if(npc.arq_ocu_expuesto && npc.arq_ocu === 'traidor') est = 'traicionando';
        else if(npc.corrupcion > 65) est = 'corrupto';
        else if(npc.secreto_expuesto) est = 'secreto_parcial';
        else if(npc.lealtad > 65) est = 'vinculo_alto';
        else if(npc.eco_run_id && runs?.length) est = 'eco_anterior';
        let pool = est === 'normal' ? (dl.saludo?.[npc.arq_vis] || []) : (dl.estados?.[est] || dl.saludo?.[npc.arq_vis] || []);
        if(!pool.length) pool = [`${npc.nombre} te mira en silencio.`];
        let text = U.pick(pool, rng).replace(/{n}/g, npc.nombre);
        if(npc.lealtad > 50 && U.chance(0.4) && !npc.fragmentos.includes('deseo')) { text += ` "${npc.deseo}."`; npc.fragmentos.push('deseo'); }
        if(npc.eco_run_id) {
          const er = runs?.find(r => r.id === npc.eco_run_id);
          if(er && U.chance(0.45)) text += ` "Hubo alguien antes de ti. ${er.player_name || 'Sin nombre'}."`;
        }
        const result = EventBus.emit('narrative:npc_speak', { text, npc, est });
        return result?.text || text;
      },
      interactuar(npc) {
        npc.interacciones++;
        npc.lealtad = U.clamp(npc.lealtad + U.rand(2, 8), 0, 100);
        EventBus.emit('narrative:npc_interact', { npc, lealtad:npc.lealtad });
        if(npc.lealtad > 60 && !npc.secreto_expuesto && U.chance(0.25)) { npc.secreto_expuesto = true; _gainXP('narrativa', 25, 'secreto descubierto'); return { tipo:'secreto', texto:`${npc.nombre}: "${npc.secreto}"` }; }
        if(npc.lealtad > 80 && !npc.arq_ocu_expuesto && U.chance(0.2)) { npc.arq_ocu_expuesto = true; _gainXP('narrativa', 40, 'naturaleza oculta revelada'); return { tipo:'arquetipo', texto:`${npc.nombre} deja de actuar. Es ${npc.arq_ocu}. Siempre lo fue.` }; }
        return null;
      },
      observar(npc) {
        const obs = [`${npc.nombre} — ${npc.arq_vis.toUpperCase()}`, `Lealtad:${npc.lealtad}  Corrupción:${npc.corrupcion}  Desesperación:${npc.desesperacion}`];
        if(npc.fragmentos.includes('deseo')) obs.push(`Deseo: "${npc.deseo}"`);
        if(npc.fragmentos.includes('miedo')) obs.push(`Miedo: "${npc.miedo}"`);
        if(npc.arq_ocu_expuesto) obs.push(`Naturaleza real: ${npc.arq_ocu.toUpperCase()}`);
        else if(npc.corrupcion > 60) obs.push('Algo en su comportamiento no encaja.');
        npc.vinculos.forEach(v => obs.push(`Vínculo [${v.tipo}]: "${v.historia}"`));
        if(npc.eco_run_id) obs.push('Hay algo en él que pertenece a otro ciclo.');
        return obs;
      },
      combatStats(npc) {
        const base = D.npcs.combat_stats?.[npc.arq_vis] || { hp:20, atk:5, def:1 };
        const dB = npc.desesperacion > 70 ? 4 : 0;
        const cB = Math.floor(npc.corrupcion / 20);
        const lM = npc.lealtad > 60 ? -1 : 0;
        const oB = (D.npcs.arquetipos_hostiles || []).includes(npc.arq_ocu) && npc.arq_ocu_expuesto ? 5 : 0;
        return { hp:base.hp + dB, atk:Math.max(1, base.atk + dB + cB + lM + oB), def:base.def };
      },
      checkTwists(npc, player, misiones, ecos) {
        const act = [];
        for(const def of (D.twistDefs || [])) {
          if(npc.twists_activados?.includes(def.id)) continue;
          const c = def.check || {};
          let ok = true;
          if(c.arq_vis && npc.arq_vis !== c.arq_vis) ok = false;
          if(c.corrupcion_min && npc.corrupcion < c.corrupcion_min) ok = false;
          if(c.lealtad_jugador_min && npc.lealtad < c.lealtad_jugador_min) ok = false;
          if(c.desesperacion_min && npc.desesperacion < c.desesperacion_min) ok = false;
          if(c.misiones_completadas_min && misiones.filter(m => m.npc_id === npc.id && m.completada).length < c.misiones_completadas_min) ok = false;
          if(c.mision_completada_trampa && !misiones.some(m => m.npc_id === npc.id && m.completada && m.es_trampa)) ok = false;
          if(c.tiene_eco_run && !npc.eco_run_id) ok = false;
          if(c.ecos_disponibles && (!ecos || !ecos.length)) ok = false;
          if(c.secreto_idx !== undefined && npc.secreto_idx !== c.secreto_idx) ok = false;
          if(ok) {
            const vars = { npc:npc.nombre, eco_nombre:ecos?.[0]?.nombre || 'alguien', arq_ocu:npc.arq_ocu };
            const twist = { id:def.id, titulo:def.titulo, texto:U.tmpl(def.texto, vars), npc_id:npc.id };
            act.push(twist);
            npc.twists_activados.push(def.id);
            EventBus.emit('narrative:npc_twist', { twist, npc });
          }
        }
        return act;
      },
      genMision(npc, npcs, ecos) {
        const rng = U.rng(npc.id + (Number(_clockCurrent().cycle) || 0) + Math.random());
        const md = D.missions;
        let pool = [...(md.tipos || [])];
        if(npc.desesperacion > 70) pool = md.tipo_por_desesperacion_alta || pool;
        const arqPool = md.tipo_por_arq_oculto?.[npc.arq_ocu];
        if(arqPool) pool = [...pool, ...arqPool];
        if(npc.eco_run_id && ecos?.length) { const b = md.legado_boost || 2; for(let i = 0; i < b; i++) pool.push('legado'); }
        const tipo = U.pick(pool, rng);
        const tpl = md.plantillas?.[tipo];
        if(!tpl) return null;
        const vic = npcs?.find(x => x.id !== npc.id);
        const eco = ecos?.length ? U.pick(ecos, rng) : null;
        const vars = { npc:npc.nombre, victima:vic?.nombre || 'alguien', eco:eco?.nombre || 'alguien', objetivo:tpl.objetivos?.length ? U.pick(tpl.objetivos, rng) : 'algo', costo:tpl.costos?.length ? U.pick(tpl.costos, rng) : 'algo', amenaza:tpl.amenazas?.length ? U.pick(tpl.amenazas, rng) : 'algo', verdad:tpl.verdades?.length ? U.pick(tpl.verdades, rng) : 'algo', ciclos:U.rand(...(tpl.ciclos_rng || [2, 10])) };
        let mision = { id:U.uid(), tipo, npc_id:npc.id, titulo:U.tmpl(tpl.titulo || tipo, vars), desc:U.tmpl(tpl.desc || '—', vars), objetivo:vars.objetivo, recompensa:tpl.recompensas?.length ? U.pick(tpl.recompensas, rng) : 'algo', consecuencia_fallo:U.tmpl(tpl.consecuencia || '—', vars), victima_id:vic?.id || null, eco_id:eco?.run_id || null, es_trampa:tipo === 'traición' && U.chance(tpl.trampa_chance || 0), es_imposible:tipo === 'imposible', completada:false, fallida:false, aceptada:false, ciclo:Number(_clockCurrent().cycle) || 0 };
        npc.misiones_ofrecidas.push(mision.id);
        const result = EventBus.emit('narrative:mission_gen', { mision, npc, vars });
        if(result?.mision) mision = result.mision;
        return mision;
      },
      consecuenciaDesperación(npc) {
        if(npc.estado !== 'vivo') return false;
        const nd = D.narrative.consecuencia_desesperacion || {};
        const r = Math.random();
        const vars = { npc:npc.nombre, deseo:npc.deseo, arq_ocu:npc.arq_ocu };
        if(r < (nd.muerte_chance || 0.3)) {
          npc.estado = 'muerto';
          _line(`⟁ ${U.tmpl(nd.texto_muerte || '{npc} muere.', vars)}`, 't-twi', true);
          _allMisiones().filter(m => m.npc_id === npc.id && !m.completada).forEach(m => m.fallida = true);
          EventBus.emit('narrative:npc_death', { npc, causa:'desesperación' });
        } else if(r < (nd.muerte_chance || 0.3) + (nd.desaparicion_chance || 0.3)) {
          npc.nodeId = '??'; npc.estado = 'desaparecido';
          _line(`⟁ ${U.tmpl(nd.texto_desaparicion || '{npc} desaparece.', vars)}`, 't-twi', true);
        } else {
          npc.arq_ocu_expuesto = true;
          npc.corrupcion = Math.min(100, npc.corrupcion + 25);
          _line(`⟁ ${U.tmpl(nd.texto_quiebre || '{npc} quiebra.', vars)}`, 't-twi', true);
        }
        _refreshStatus(); _saveGame();
        return true;
      },
      tickNPCs() {
        const cfg = D;
        _aliveNPCs().forEach(npc => {
          if(npc.estado !== 'vivo') return;
          if(U.chance(cfg.npc_desesperacion_tick_chance || 0.12) && npc.desesperacion < (cfg.npc_desesperacion_tick_max || 5) * 20) {
            npc.desesperacion = Math.min(100, npc.desesperacion + U.rand(3, 8));
            if(npc.desesperacion >= 90 && U.chance(cfg.npc_quiebre_chance || 0.15)) api.consecuenciaDesperación(npc);
          }
          if(U.chance(cfg.npc_corrupcion_tick_chance || 0.07) && npc.corrupcion < (cfg.npc_corrupcion_tick_max || 3) * 35) npc.corrupcion = Math.min(100, npc.corrupcion + U.rand(2, 6));
        });
        return true;
      },
      poblarMundo(payload = {}) {
        const nodes = payload?.nodes || {};
        const nodeIds = Object.keys(nodes);
        if(!nodeIds.length) return payload;
        const worldState = _worldRead();
        const rng = U.rng(`${payload?.seed || worldState.seed}:${Number(_clockCurrent().cycle) || 0}:npc-pop`);
        const npcChance = payload?.npcChance ?? D.world?.npc_chance ?? 0.55;
        const permitidos = Array.isArray(payload?.npcNodes) ? payload.npcNodes : (D.world?.npc_nodos_permitidos || []);
        const ecos = payload?.context?.ecos || _memoryEcos();
        nodeIds.forEach((nodeId, idx) => {
          const node = nodes[nodeId];
          if(!node || node.destruido) return;
          if(Array.isArray(permitidos) && permitidos.length && !permitidos.includes(node.tipo)) return;
          if(!U.chance(npcChance, rng)) return;
          const yaEnNodo = _allNPCs().filter(n => n.nodeId === nodeId && n.estado !== 'muerto');
          if(yaEnNodo.length >= 3) return;
          const npc = api.gen(nodeId, payload?.seed || worldState.seed, idx, ecos, yaEnNodo);
          _addNPC(npc);
          if(Array.isArray(node.npc_ids) && !node.npc_ids.includes(npc.id)) node.npc_ids.push(npc.id);
        });
        return payload;
      },
    };
    return api;
  }

  function api() {
    if(!global.__npcPluginApi) global.__npcPluginApi = createNPCApi();
    return global.__npcPluginApi;
  }

  global.pluginNPCs = {
    id: 'plugin:npcs',
    nombre: 'Motor de NPCs',
    version: '2.0.0',
    descripcion: 'Generacion, dialogo, misiones y quiebres narrativos de NPCs.',
    onLoad() { api(); },
    hooks: {
      'world:request_npcs': { fn(payload) { return api().poblarMundo(payload); } },
      'world:tick': { fn() { api().tickNPCs(); } },
    },
    services: {
      'runtime.npc.api': () => api(),
      'runtime.npc.dialogue': (npc, runs=[]) => api().dialogo(npc, runs),
      'runtime.npc.interact': (npc) => api().interactuar(npc),
      'runtime.npc.observe': (npc) => api().observar(npc),
      'runtime.npc.gen_mission': (npc, npcs=[], ecos=[]) => api().genMision(npc, npcs, ecos),
      'runtime.npc.combat_stats': (npc) => api().combatStats(npc),
      'runtime.npc.check_twists': (npc, player, misiones=[], ecos=[]) => api().checkTwists(npc, player, misiones, ecos),
      'runtime.npc.despair': (npc) => api().consecuenciaDesperación(npc),
    },
    comandos: {
      'npcs':      { fn: ()    =>{ if(typeof cmdNPCs==='function')      cmdNPCs(); },                           meta:{ titulo:'npcs',                  color:'t-npc', desc:'Ver todas las personas del mundo con estado y localización.' } },
      'personas':  { fn: ()    =>{ if(typeof cmdNPCs==='function')      cmdNPCs(); },                           meta:{ titulo:'personas (alias npcs)', color:'t-npc', desc:'Ver personas del mundo.' } },
      'hablar':    { fn: (args)=>{ if(typeof cmdHablar==='function')    cmdHablar(args.join(' ')); },           meta:{ titulo:'hablar [npc]',           color:'t-npc', desc:'Iniciar diálogo con un NPC del nodo.' } },
      'preguntar': { fn: (args)=>{ if(typeof cmdPreguntar==='function') cmdPreguntar(args[0], args.slice(1).join(' ')); }, meta:{ titulo:'preguntar [npc] [tema]', color:'t-npc', desc:'Preguntar a un NPC sobre un tema (secreto, miedo, deseo...).' } },
      'observar':  { fn: (args)=>{ if(typeof cmdObservar==='function')  cmdObservar(args.join(' ')); },         meta:{ titulo:'observar [npc]',         color:'t-npc', desc:'Observar el arquetipo y rasgos ocultos de un NPC.' } },
      'traicionar':{ fn: (args)=>{ if(typeof cmdTraicionar==='function') cmdTraicionar(args.join(' ')); },      meta:{ titulo:'traicionar [npc]',       color:'t-twi', desc:'Traicionar a un NPC, perdiendo su lealtad.' } },
      'misiones':  { fn: ()    =>{ if(typeof cmdMisiones==='function')  cmdMisiones(); },                       meta:{ titulo:'misiones',               color:'t-mis', desc:'Ver misiones activas, completadas y fallidas.' } },
      'mis':       { fn: ()    =>{ if(typeof cmdMisiones==='function')  cmdMisiones(); },                       meta:{ titulo:'mis (alias misiones)',   color:'t-mis', desc:'Ver misiones.' } },
      'aceptar':   { fn: (args)=>{ if(typeof cmdAceptar==='function')   cmdAceptar(args.join(' ')); },          meta:{ titulo:'aceptar [id]',           color:'t-mis', desc:'Aceptar una misión pendiente.' } },
      'rechazar':  { fn: (args)=>{ if(typeof cmdRechazar==='function')  cmdRechazar(args.join(' ')); },         meta:{ titulo:'rechazar [id]',          color:'t-pel', desc:'Rechazar una misión (consecuencias narrativas).' } },
      'completar': { fn: (args)=>{ if(typeof cmdCompletar==='function') cmdCompletar(args.join(' ')); },        meta:{ titulo:'completar [id]',         color:'t-cra', desc:'Marcar una misión como completada y recibir recompensas.' } },
    },
  };
})(globalThis);
