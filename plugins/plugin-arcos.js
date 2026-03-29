// ════════════════════════════════════════════════════════════════
// PLUGIN: Arcos v2.0
// Arcos narrativos desacoplados a plugin de dominio.
// ════════════════════════════════════════════════════════════════

(function initArcPlugin(global) {
  function _svc(name) {
    return (typeof ServiceRegistry !== 'undefined' && typeof ServiceRegistry.get === 'function')
      ? ServiceRegistry.get(name)
      : null;
  }
  function _npcMission(npc, npcs, ecos) {
    const fn = _svc('runtime.npc.gen_mission');
    return typeof fn === 'function' ? fn(npc, npcs, ecos) : null;
  }
  function _gainXP(rama, cantidad, motivo) {
    const fn = _svc('runtime.xp.gain');
    return typeof fn === 'function' ? fn(rama, cantidad, motivo) : false;
  }
  function _ecos() {
    const fn = _svc('runtime.memory.ecos');
    return typeof fn === 'function' ? (fn() || []) : [];
  }

  function loadArcData() {
    const fallback = { temas:{}, plantillas_acto:{}, consecuencias_resultado:{}, epitafios:{}, titulos:{} };
    try { return ModuleLoader?.getSystemData?.('arc-engine', fallback) || fallback; }
    catch {}
    return fallback;
  }

  function createArcApi() {
    const data = loadArcData();
    const TEMAS = data?.temas || {};
    const PLANTILLAS_ACTO = data?.plantillas_acto ? JSON.parse(JSON.stringify(data.plantillas_acto)) : {};
    ['poder', 'pérdida', 'ascenso', 'redención'].forEach(t => {
      if(!PLANTILLAS_ACTO[t] && PLANTILLAS_ACTO.venganza) PLANTILLAS_ACTO[t] = PLANTILLAS_ACTO.venganza.map(a => ({ ...a }));
    });
    const CONSECUENCIAS_RESULTADO = data?.consecuencias_resultado || {};
    const EPITAFIOS = data?.epitafios || {};
    const TITLES = data?.titulos || {};

    function _genTitulo(tema, npcNombre, antNombre, rng) {
      const pool = TITLES[tema] || TITLES.venganza || ['Cuentas pendientes'];
      return U.pick(pool, rng).replace(/{npc}/g, npcNombre.split(' ')[0]).replace(/{ant}/g, antNombre.split(' ')[0]);
    }
    function _logArc(arc, txt) { arc.log_narrativo.push(txt); if(arc.log_narrativo.length > 20) arc.log_narrativo.shift(); }
    function _evalTrigger(trigger, mision, npc) {
      switch(trigger) {
        case 'completado': return mision.completada && !mision.fallida;
        case 'completado_lealtad_alta': return mision.completada && (npc?.lealtad || 0) >= 60;
        case 'fallido': return mision.fallida && !mision.completada;
        case 'traicionado': return mision.fallida && npc?.estado === 'hostil';
        case 'npc_muerto': return npc?.estado === 'muerto';
        default: return false;
      }
    }

    const api = {
      TEMAS,
      EPITAFIOS,
      genArc(npc, npcs) {
        if(GS.arcsActivos().length >= 2) return null;
        const temasDisponibles = Object.keys(TEMAS || {});
        if(!temasDisponibles.length) return null;
        const rng = U.rng(npc.id + Clock.cycle + Date.now());
        const sesgos = { protector:['sacrificio', 'redención'], corrompido:['traición', 'poder'], visionario:['ascenso', 'poder'], superviviente:['pérdida', 'venganza'], manipulador:['traición', 'secreto'], leal:['sacrificio', 'redención'], errante:['pérdida', 'secreto'], predador:['venganza', 'poder'] };
        const pool = [...temasDisponibles];
        const sesg = sesgos[npc.arq_vis] || sesgos[npc.arq_ocu];
        if(sesg) sesg.forEach(t => { if(TEMAS[t]) { pool.push(t); pool.push(t); } });
        const tema = U.pick(pool, rng);
        const def = TEMAS[tema];
        if(!tema || !def) return null;
        const plantillas = Array.isArray(PLANTILLAS_ACTO[tema]) ? PLANTILLAS_ACTO[tema] : (Array.isArray(PLANTILLAS_ACTO.venganza) ? PLANTILLAS_ACTO.venganza : []);
        if(!plantillas.length) return null;
        const secNPCs = npcs.filter(n => n.id !== npc.id && n.estado === 'vivo');
        const antagonista = secNPCs.find(n => (D.npcs?.arquetipos_hostiles || []).includes(n.arq_ocu)) || U.pick(secNPCs, rng) || npc;
        const actos = plantillas.map((ptpl, i) => ({ id:ptpl.id || `acto_${i}`, titulo:ptpl.titulo, tipo_mision:ptpl.tipo_mision, es_final:ptpl.es_final || false, resultado:ptpl.resultado || null, desviaciones:(ptpl.desviaciones || []).map(d => ({ ...d })), mision_id:null, completado:false, fallido:false, skipped:false }));
        return { id:U.uid(), tema, titulo:_genTitulo(tema, npc.nombre, antagonista.nombre, rng), desc:def.desc, color:def.color, icon:def.icon, npc_id:npc.id, antagonista_id:antagonista.id, actos, acto_actual_idx:0, estado:'latente', resultado:null, epitafio:null, ciclo_inicio:Clock.cycle, log_narrativo:[] };
      },
      activarArc(arc) {
        arc.estado = 'activo';
        api._generarMisionActo(arc, arc.actos[0]);
        _logArc(arc, `Arc iniciado en ciclo ${Clock.cycle}.`);
        GS.addArc(arc);
        Out.sp(); Out.sep('═');
        const def = TEMAS[arc.tema];
        Out.line(`${def.icon} ARC NARRATIVO — "${arc.titulo}"`, def.color, true);
        Out.line(arc.desc, 't-dim');
        Out.line(`Acto I: ${arc.actos[0].titulo}`, 't-acc');
        Out.sep('═'); Out.sp();
        EventBus.emit('arc:start', { arc });
        save();
        return arc;
      },
      _generarMisionActo(arc, acto) {
        const npc = GS.npc(arc.npc_id) || GS.aliveNPCs()[0];
        if(!npc) return null;
        const m = _npcMission(npc, GS.aliveNPCs(), _ecos());
        if(!m) return null;
        m.tipo = acto.tipo_mision; m.arc_id = arc.id; m.acto_id = acto.id; m.titulo = `[ARC] ${acto.titulo}`; m.es_arc = true;
        const antagonista = GS.npc(arc.antagonista_id);
        const enrichTpl = {
          deuda:`En el marco de "${arc.titulo}": ${npc.nombre} necesita que recuperes algo antes de que ${antagonista?.nombre || 'alguien'} lo tome.`,
          búsqueda:`El rastro de "${arc.titulo}" lleva a algo que ${antagonista?.nombre || 'alguien'} también busca.`,
          protección:`Dentro de "${arc.titulo}": ${npc.nombre} teme que ${antagonista?.nombre || 'alguien'} actúe antes.`,
          revelación:`"${arc.titulo}" exige descubrir una verdad que ${antagonista?.nombre || 'alguien'} prefiere oculta.`,
          traición:`"${arc.titulo}" llega a su momento más oscuro: alguien traicionó a ${npc.nombre}.`,
          sacrificio:`"${arc.titulo}": el siguiente paso tiene un precio real.`,
          venganza:`"${arc.titulo}" converge: ${npc.nombre} y ${antagonista?.nombre || 'alguien'} se acercan al ajuste.`,
          ambigua:`"${arc.titulo}" no tiene respuesta fácil.`,
          imposible:`"${arc.titulo}" ha colapsado.`,
        };
        m.desc = enrichTpl[acto.tipo_mision] || m.desc;
        m.aceptada = false; m.completada = false; m.fallida = false;
        acto.mision_id = m.id;
        GS.addMision(m); npc.misiones_ofrecidas.push(m.id);
        Out.sp(); Out.line(`◈ [ARC "${arc.titulo}" — ${acto.titulo}]`, 't-mis', true); Out.line(m.desc, 't-out'); Out.line(`"aceptar ${m.id}" para continuar el arc.`, 't-dim'); Out.sp();
        return m;
      },
      procesarActo(arcId, actoId) {
        const arc = GS.arc(arcId); if(!arc || arc.estado !== 'activo') return;
        const actoIdx = arc.actos.findIndex(a => a.id === actoId); if(actoIdx < 0) return;
        const acto = arc.actos[actoIdx];
        const mision = acto.mision_id ? GS.mision(acto.mision_id) : null;
        const npc = GS.npc(arc.npc_id);
        _logArc(arc, `Acto "${acto.titulo}" → ${mision?.completada ? 'completado' : mision?.fallida ? 'fallido' : 'pendiente'} (ciclo ${Clock.cycle}).`);
        if(acto.es_final) { api._cerrarArc(arc, acto.resultado || 'ambiguo', npc); return; }
        let siguienteId = null;
        for(const desv of (acto.desviaciones || [])) {
          if(_evalTrigger(desv.trigger, mision || { completada:false, fallida:false }, npc)) { siguienteId = desv.sig; _logArc(arc, `Desviación: "${desv.trigger}" → "${desv.sig}".`); break; }
        }
        if(!siguienteId) siguienteId = 'acto_colapso';
        const sigActo = arc.actos.find(a => a.id === siguienteId);
        if(!sigActo) { api._cerrarArc(arc, 'colapso', npc); return; }
        arc.acto_actual_idx = arc.actos.indexOf(sigActo);
        Out.sp(); Out.sep('─'); Out.line(`${TEMAS[arc.tema].icon} ARC "${arc.titulo}" — nuevo acto`, TEMAS[arc.tema].color, true); Out.line(`▶ ${sigActo.titulo}`, 't-acc'); if(sigActo.es_final) Out.line('Este es el acto final.', 't-dim'); Out.sep('─'); Out.sp();
        api._generarMisionActo(arc, sigActo);
        _gainXP('narrativa', 35, `avance arc: ${arc.titulo}`);
        EventBus.emit('arc:advance', { arc, acto_anterior:acto, acto_siguiente:sigActo });
        save();
      },
      _cerrarArc(arc, resultado, npc) {
        arc.estado = resultado === 'colapso' ? 'colapsado' : 'completo';
        arc.resultado = resultado;
        arc.epitafio = (EPITAFIOS[arc.tema] || {})[resultado] || 'El arc terminó.';
        const cons = CONSECUENCIAS_RESULTADO[resultado] || CONSECUENCIAS_RESULTADO.ambiguo || { xp_rama:'narrativa', xp:0, npc_lealtad:0, npc_desep:0, msg:'El arc terminó.', color:'t-dim' };
        _gainXP(cons.xp_rama, cons.xp, `arc: ${arc.tema} → ${resultado}`);
        if(npc) { npc.lealtad = U.clamp((npc.lealtad || 0) + cons.npc_lealtad, 0, 100); npc.desesperacion = U.clamp((npc.desesperacion || 0) + cons.npc_desep, 0, 100); }
        if(resultado === 'colapso' || resultado === 'tragedia') GS.allMisiones().filter(m => m.arc_id === arc.id && !m.completada).forEach(m => { m.fallida = true; m.es_imposible = true; });
        GS.addTwist({ id:`arc_fin_${arc.id}`, titulo:`Fin de "${arc.titulo}"`, texto:`${arc.epitafio} (${resultado.toUpperCase()})`, arc_id:arc.id, resultado });
        Out.sp(); Out.sep('═'); Out.line(`${TEMAS[arc.tema].icon} ARC COMPLETO — "${arc.titulo}"`, TEMAS[arc.tema].color, true); Out.line(cons.msg, cons.color); Out.line(`Epitafio: "${arc.epitafio}"`, 't-eco');
        if(arc.log_narrativo.length) { Out.sep('─'); Out.line('Decisiones que llevaron aquí:', 't-dim'); arc.log_narrativo.forEach(l => Out.line(`  · ${l}`, 't-dim')); }
        Out.sep('═'); Out.sp();
        EventBus.emit('arc:complete', { arc, resultado, epitafio:arc.epitafio });
        save();
      },
      onMisionResuelta(mision) { if(!mision.arc_id) return; const arc = GS.arc(mision.arc_id); if(!arc || arc.estado !== 'activo') return; setTimeout(() => api.procesarActo(mision.arc_id, mision.acto_id), 400); },
      onNPCMuerto(npcId) { GS.allArcs().filter(a => a.estado === 'activo' && (a.npc_id === npcId || a.antagonista_id === npcId)).forEach(arc => { const acto = arc.actos[arc.acto_actual_idx]; if(!acto) return; if(acto.desviaciones.some(d => d.trigger === 'npc_muerto')) { _logArc(arc, 'NPC clave murió.'); setTimeout(() => api.procesarActo(arc.id, acto.id), 600); } }); },
      intentarGenArc(npc) {
        if(GS.arcsActivos().length >= 2 || (npc.lealtad || 0) < 30) return null;
        if(!npc.vinculos?.length && !npc.secreto) return null;
        if(GS.arcsActivos().some(a => a.npc_id === npc.id)) return null;
        if(!U.chance(0.25)) return null;
        const arc = api.genArc(npc, GS.aliveNPCs());
        if(!arc) return null;
        return api.activarArc(arc);
      },
      cmdArcs() {
        Out.sp(); Out.line('— ARCOS NARRATIVOS —', 't-acc');
        const todos = GS.allArcs();
        if(!todos.length) { Out.line('Sin arcos activos. Habla con NPCs y completa misiones.', 't-dim'); Out.sp(); return true; }
        const activos = todos.filter(a => a.estado === 'activo');
        const cerrados = todos.filter(a => a.estado !== 'activo');
        if(activos.length) {
          Out.line('ACTIVOS:', 't-acc');
          activos.forEach(arc => {
            const def = TEMAS[arc.tema];
            const acto = arc.actos[arc.acto_actual_idx];
            const npc = GS.npc(arc.npc_id);
            const mAct = acto?.mision_id ? GS.mision(acto.mision_id) : null;
            Out.line(`  ${def.icon} "${arc.titulo}"  [${arc.tema.toUpperCase()}]`, def.color);
            Out.line(`    Acto: ${acto?.titulo || '—'}  (${arc.acto_actual_idx + 1}/${arc.actos.filter(a => !a.skipped).length})`, 't-dim');
            if(npc) Out.line(`    NPC: ${npc.nombre}  [lealtad:${npc.lealtad}]`, 't-npc');
            if(mAct) Out.line(`    Misión: "${mAct.titulo}"${mAct.aceptada ? ' ✓' : ''}`, 't-mis');
          });
        }
        if(cerrados.length) {
          Out.sp(); Out.line('CERRADOS:', 't-dim');
          cerrados.forEach(arc => { const col = arc.resultado === 'victoria' ? 't-cra' : arc.resultado === 'tragedia' ? 't-pel' : arc.resultado === 'colapso' ? 't-twi' : 't-mem'; Out.line(`  ${TEMAS[arc.tema]?.icon || ''} "${arc.titulo}"  → ${(arc.resultado || '?').toUpperCase()}`, col); if(arc.epitafio) Out.line(`    "${arc.epitafio}"`, 't-dim'); });
        }
        Out.sp();
        return true;
      },
    };
    return api;
  }

  function api() {
    if(!global.__arcPluginApi) global.__arcPluginApi = createArcApi();
    return global.__arcPluginApi;
  }

  global.pluginArcos = {
    id: 'plugin:arcos',
    nombre: 'Motor de Arcos',
    version: '2.0.0',
    descripcion: 'Arcos narrativos y su progresion como plugin de dominio.',
    onLoad() { api(); },
    hooks: {
      'narrative:mission_complete': { fn(payload) { api().onMisionResuelta(payload.mision); return payload; } },
      'narrative:mission_fail': { fn(payload) { api().onMisionResuelta(payload.mision); return payload; } },
      'narrative:npc_death': { fn(payload) { api().onNPCMuerto(payload?.npc?.id); return payload; } },
    },
    services: {
      'runtime.arc.api': () => api(),
      'runtime.arc.show': () => api().cmdArcs(),
      'runtime.arc.try_generate': (npc) => api().intentarGenArc(npc),
      'runtime.arc.on_mission_resolved': (mision) => api().onMisionResuelta(mision),
    },
  };
})(globalThis);
