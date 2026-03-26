// ════════════════════════════════════════════════════════════════
// ARC ENGINE — Arcos narrativos procedurales con desviaciones
// ════════════════════════════════════════════════════════════════
const ArcEngine = (() => {

  const TEMAS = {
    venganza:  { color:'t-pel', icon:'⚔', desc:'Alguien debe pagar. La pregunta es quién y a qué precio.' },
    redención: { color:'t-mem', icon:'◎', desc:'Un pasado que pesa. Una oportunidad de cambiar el peso.' },
    poder:     { color:'t-cor', icon:'◈', desc:'Algo cambia el equilibrio. Todos quieren controlarlo.' },
    pérdida:   { color:'t-dim', icon:'◇', desc:'Lo que era ya no es. Queda la pregunta de qué hacer con eso.' },
    traición:  { color:'t-twi', icon:'⟁', desc:'Alguien no es lo que parece. O todos lo son.' },
    ascenso:   { color:'t-cra', icon:'▲', desc:'Una figura sube. Otras caen.' },
    secreto:   { color:'t-eco', icon:'◉', desc:'Algo se guarda. Descubrirlo tiene consecuencias.' },
    sacrificio:{ color:'t-mis', icon:'✦', desc:'Un precio que alguien debe pagar. ¿Quién?' },
  };

  // Plantillas de actos reutilizadas por múltiples temas
  const _actoVenganza = [
    { titulo:'La deuda pendiente',   tipo_mision:'deuda',    desviaciones:[{trigger:'completado',sig:'acto_1'},{trigger:'traicionado',sig:'acto_traicion'},{trigger:'npc_muerto',sig:'acto_colapso'}] },
    { id:'acto_1', titulo:'El rastro', tipo_mision:'búsqueda', desviaciones:[{trigger:'completado',sig:'acto_final'},{trigger:'fallido',sig:'acto_degradado'},{trigger:'npc_muerto',sig:'acto_colapso'}] },
    { id:'acto_traicion', titulo:'La verdad envenenada', tipo_mision:'traición', desviaciones:[{trigger:'completado',sig:'acto_final_oscuro'},{trigger:'fallido',sig:'acto_colapso'}] },
    { id:'acto_degradado', titulo:'Las consecuencias', tipo_mision:'protección', desviaciones:[{trigger:'completado',sig:'acto_final_ambiguo'},{trigger:'fallido',sig:'acto_colapso'}] },
    { id:'acto_final',        titulo:'El ajuste de cuentas',  tipo_mision:'venganza',   es_final:true, resultado:'victoria' },
    { id:'acto_final_oscuro', titulo:'Un precio justo',        tipo_mision:'sacrificio', es_final:true, resultado:'tragedia' },
    { id:'acto_final_ambiguo',titulo:'Lo que queda',           tipo_mision:'ambigua',    es_final:true, resultado:'ambiguo'  },
    { id:'acto_colapso',      titulo:'El fin prematuro',        tipo_mision:'imposible',  es_final:true, resultado:'colapso'  },
  ];

  const PLANTILLAS_ACTO = {
    venganza:   _actoVenganza,
    secreto: [
      { titulo:'El rumor', tipo_mision:'revelación', desviaciones:[{trigger:'completado',sig:'acto_1'},{trigger:'traicionado',sig:'acto_traicion'},{trigger:'npc_muerto',sig:'acto_colapso'}] },
      { id:'acto_1', titulo:'Lo que se guarda', tipo_mision:'búsqueda', desviaciones:[{trigger:'completado_lealtad_alta',sig:'acto_final'},{trigger:'completado',sig:'acto_1b'},{trigger:'fallido',sig:'acto_degradado'},{trigger:'npc_muerto',sig:'acto_colapso'}] },
      { id:'acto_1b', titulo:'Verdad a medias', tipo_mision:'protección', desviaciones:[{trigger:'completado',sig:'acto_final_ambiguo'},{trigger:'fallido',sig:'acto_final_oscuro'}] },
      { id:'acto_traicion', titulo:'El guardián del secreto', tipo_mision:'traición', desviaciones:[{trigger:'completado',sig:'acto_final_oscuro'},{trigger:'fallido',sig:'acto_colapso'}] },
      { id:'acto_degradado', titulo:'Fragmentos', tipo_mision:'búsqueda', desviaciones:[{trigger:'completado',sig:'acto_final_ambiguo'},{trigger:'fallido',sig:'acto_colapso'}] },
      { id:'acto_final',         titulo:'La revelación completa', tipo_mision:'revelación', es_final:true, resultado:'victoria' },
      { id:'acto_final_oscuro',  titulo:'El precio de saber',      tipo_mision:'sacrificio', es_final:true, resultado:'tragedia' },
      { id:'acto_final_ambiguo', titulo:'Suficiente verdad',        tipo_mision:'ambigua',    es_final:true, resultado:'ambiguo'  },
      { id:'acto_colapso',       titulo:'El secreto perduró',       tipo_mision:'imposible',  es_final:true, resultado:'colapso'  },
    ],
    traición: [
      { titulo:'La sospecha', tipo_mision:'revelación', desviaciones:[{trigger:'completado',sig:'acto_1'},{trigger:'npc_muerto',sig:'acto_colapso'}] },
      { id:'acto_1', titulo:'Confirmar', tipo_mision:'búsqueda', desviaciones:[{trigger:'completado',sig:'acto_final'},{trigger:'fallido',sig:'acto_degradado'},{trigger:'traicionado',sig:'acto_final_oscuro'}] },
      { id:'acto_degradado', titulo:'Sin pruebas', tipo_mision:'protección', desviaciones:[{trigger:'completado',sig:'acto_final_ambiguo'},{trigger:'fallido',sig:'acto_colapso'}] },
      { id:'acto_final',         titulo:'Desenmascarar',   tipo_mision:'traición',   es_final:true, resultado:'victoria' },
      { id:'acto_final_oscuro',  titulo:'Traicionado',      tipo_mision:'imposible',  es_final:true, resultado:'tragedia' },
      { id:'acto_final_ambiguo', titulo:'Sin respuesta',    tipo_mision:'ambigua',    es_final:true, resultado:'ambiguo'  },
      { id:'acto_colapso',       titulo:'La red persiste',  tipo_mision:'imposible',  es_final:true, resultado:'colapso'  },
    ],
    sacrificio: [
      { titulo:'El precio', tipo_mision:'sacrificio', desviaciones:[{trigger:'completado',sig:'acto_1'},{trigger:'fallido',sig:'acto_degradado'},{trigger:'npc_muerto',sig:'acto_colapso'}] },
      { id:'acto_1', titulo:'La decisión', tipo_mision:'ambigua', desviaciones:[{trigger:'completado',sig:'acto_final'},{trigger:'fallido',sig:'acto_final_oscuro'},{trigger:'traicionado',sig:'acto_colapso'}] },
      { id:'acto_degradado', titulo:'El peso', tipo_mision:'protección', desviaciones:[{trigger:'completado',sig:'acto_final_ambiguo'},{trigger:'fallido',sig:'acto_colapso'}] },
      { id:'acto_final',         titulo:'Valió la pena',       tipo_mision:'legado',     es_final:true, resultado:'victoria' },
      { id:'acto_final_oscuro',  titulo:'Todo para nada',       tipo_mision:'ambigua',    es_final:true, resultado:'tragedia' },
      { id:'acto_final_ambiguo', titulo:'Quizás valió',         tipo_mision:'ambigua',    es_final:true, resultado:'ambiguo'  },
      { id:'acto_colapso',       titulo:'El sacrificio vacío',  tipo_mision:'imposible',  es_final:true, resultado:'colapso'  },
    ],
  };
  // Temas con fallback a venganza
  ['poder','pérdida','ascenso','redención'].forEach(t => {
    PLANTILLAS_ACTO[t] = _actoVenganza.map(a => ({...a}));
  });

  const CONSECUENCIAS_RESULTADO = {
    victoria: { xp:120, xp_rama:'narrativa', npc_lealtad:+30, npc_desep:-25, msg:'⚑ El arco se cierra con resolución.',               color:'t-cra' },
    tragedia: { xp:80,  xp_rama:'narrativa', npc_lealtad:-20, npc_desep:+30, msg:'⚑ El arco termina en tragedia. Algo se perdió.',       color:'t-pel' },
    ambiguo:  { xp:90,  xp_rama:'narrativa', npc_lealtad:+5,  npc_desep:+5,  msg:'⚑ El arco queda sin respuesta clara.',                 color:'t-mem' },
    colapso:  { xp:30,  xp_rama:'narrativa', npc_lealtad:-10, npc_desep:+20, msg:'⚑ El arco colapsa. Misiones restantes imposibles.',     color:'t-twi' },
  };

  const EPITAFIOS = {
    venganza:  { victoria:'Cobró la deuda.',    tragedia:'La venganza lo consumió.',  ambiguo:'Nunca supo si fue suficiente.',colapso:'La venganza quedó sin cobrar.' },
    secreto:   { victoria:'Lo descubrió todo.', tragedia:'El secreto lo mató.',       ambiguo:'Murió sabiendo a medias.',     colapso:'El secreto sobrevivió.' },
    traición:  { victoria:'Desenmascaró la red.',tragedia:'Fue traicionado al final.', ambiguo:'No supo en quién confiar.',    colapso:'La traición quedó impune.' },
    redención: { victoria:'Se redimió.',         tragedia:'No pudo redimirse.',        ambiguo:'Tal vez fue suficiente.',      colapso:'La redención fue imposible.' },
    sacrificio:{ victoria:'Valió la pena.',      tragedia:'Nadie lo recordó.',         ambiguo:'El costo fue ambiguo.',        colapso:'El sacrificio fue en vano.' },
    poder:     { victoria:'Tomó el control.',    tragedia:'El poder lo destruyó.',     ambiguo:'El poder cambió de manos.',    colapso:'El poder se fragmentó.' },
    pérdida:   { victoria:'Encontró paz.',       tragedia:'Murió perdiendo más.',      ambiguo:'Aprendió a vivir con ello.',   colapso:'La pérdida fue total.' },
    ascenso:   { victoria:'Llegó a la cima.',    tragedia:'Cayó desde lo alto.',       ambiguo:'Subió lo suficiente.',         colapso:'Nunca ascendió.' },
  };

  function _genTitulo(tema, npcNombre, antNombre, rng) {
    const titles = {
      venganza:  ['La deuda de {npc}','Lo que {ant} debe','El precio de {npc}','Cuentas pendientes'],
      secreto:   ['Lo que {npc} guarda','El silencio de {ant}','La verdad enterrada','Lo que no se dice'],
      traición:  ['La red de {ant}','Quién traicionó a {npc}','Cara de dos lados','Lo que {npc} no vio'],
      redención: ['{npc} y el peso viejo','El camino de vuelta','Lo que {npc} debe','La oportunidad'],
      poder:     ['El ascenso de {ant}','Lo que {npc} controla','El equilibrio roto','Por encima de todo'],
      pérdida:   ['Lo que perdió {npc}','El vacío de {ant}','Lo que ya no está','El costo de existir'],
      sacrificio:['{npc} y el precio','Lo que {ant} pide','El costo final','Hasta dónde llega {npc}'],
      ascenso:   ['La subida de {ant}','El camino de {npc}','Quién llega primero','El trono vacío'],
    };
    const pool = titles[tema] || titles.venganza;
    return U.pick(pool,rng)
      .replace(/{npc}/g, npcNombre.split(' ')[0])
      .replace(/{ant}/g, antNombre.split(' ')[0]);
  }

  function genArc(npc, npcs) {
    if(GS.arcsActivos().length >= 2) return null;
    const rng        = U.rng(npc.id + Clock.cycle + Date.now());
    const sesgos     = { protector:['sacrificio','redención'], corrompido:['traición','poder'], visionario:['ascenso','poder'], superviviente:['pérdida','venganza'], manipulador:['traición','secreto'], leal:['sacrificio','redención'], errante:['pérdida','secreto'], predador:['venganza','poder'] };
    let pool         = Object.keys(TEMAS);
    const sesg       = sesgos[npc.arq_vis] || sesgos[npc.arq_ocu];
    if(sesg) sesg.forEach(t => { pool.push(t); pool.push(t); });
    const tema       = U.pick(pool, rng);
    const def        = TEMAS[tema];
    const plantillas = PLANTILLAS_ACTO[tema] || PLANTILLAS_ACTO.venganza;
    const secNPCs    = npcs.filter(n=>n.id!==npc.id&&n.estado==='vivo');
    const antagonista= secNPCs.find(n=>(D.npcs?.arquetipos_hostiles||[]).includes(n.arq_ocu)) || U.pick(secNPCs,rng) || npc;

    const actos = plantillas.map((ptpl,i) => ({
      id:          ptpl.id || `acto_${i}`,
      titulo:      ptpl.titulo,
      tipo_mision: ptpl.tipo_mision,
      es_final:    ptpl.es_final || false,
      resultado:   ptpl.resultado || null,
      desviaciones:(ptpl.desviaciones||[]).map(d=>({...d})),
      mision_id:   null,
      completado:  false, fallido:false, skipped:false,
    }));

    return {
      id: U.uid(), tema, titulo:_genTitulo(tema,npc.nombre,antagonista.nombre,rng),
      desc:def.desc, color:def.color, icon:def.icon,
      npc_id:npc.id, antagonista_id:antagonista.id,
      actos, acto_actual_idx:0,
      estado:'latente', resultado:null, epitafio:null,
      ciclo_inicio:Clock.cycle, log_narrativo:[],
    };
  }

  function activarArc(arc) {
    arc.estado = 'activo';
    _generarMisionActo(arc, arc.actos[0]);
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
  }

  function _generarMisionActo(arc, acto) {
    const npc = GS.npc(arc.npc_id) || GS.aliveNPCs()[0];
    if(!npc) return;
    const m = NPCEngine.genMision(npc, GS.aliveNPCs(), RunMem.ecos());
    if(!m) return;
    m.tipo = acto.tipo_mision;
    m.arc_id = arc.id; m.acto_id = acto.id;
    m.titulo = `[ARC] ${acto.titulo}`;
    m.es_arc = true;
    const antagonista = GS.npc(arc.antagonista_id);
    const enrichTpl = {
      deuda:`En el marco de "${arc.titulo}": ${npc.nombre} necesita que recuperes algo antes de que ${antagonista?.nombre||'alguien'} lo tome.`,
      búsqueda:`El rastro de "${arc.titulo}" lleva a algo que ${antagonista?.nombre||'alguien'} también busca.`,
      protección:`Dentro de "${arc.titulo}": ${npc.nombre} teme que ${antagonista?.nombre||'alguien'} actúe antes.`,
      revelación:`"${arc.titulo}" exige descubrir una verdad que ${antagonista?.nombre||'alguien'} prefiere oculta.`,
      traición:`"${arc.titulo}" llega a su momento más oscuro: alguien traicionó a ${npc.nombre}.`,
      sacrificio:`"${arc.titulo}": el siguiente paso tiene un precio real.`,
      venganza:`"${arc.titulo}" converge: ${npc.nombre} y ${antagonista?.nombre||'alguien'} se acercan al ajuste.`,
      ambigua:`"${arc.titulo}" no tiene respuesta fácil.`,
      imposible:`"${arc.titulo}" ha colapsado.`,
    };
    m.desc = enrichTpl[acto.tipo_mision] || m.desc;
    m.aceptada = false; m.completada = false; m.fallida = false;
    acto.mision_id = m.id;
    GS.addMision(m);
    npc.misiones_ofrecidas.push(m.id);
    Out.sp();
    Out.line(`◈ [ARC "${arc.titulo}" — ${acto.titulo}]`, 't-mis', true);
    Out.line(m.desc, 't-out');
    Out.line(`"aceptar ${m.id}" para continuar el arc.`, 't-dim');
    Out.sp();
    return m;
  }

  function _evalTrigger(trigger, mision, npc) {
    switch(trigger) {
      case 'completado':              return mision.completada && !mision.fallida;
      case 'completado_lealtad_alta': return mision.completada && (npc?.lealtad||0) >= 60;
      case 'fallido':                 return mision.fallida    && !mision.completada;
      case 'traicionado':             return mision.fallida    && npc?.estado === 'hostil';
      case 'npc_muerto':              return npc?.estado === 'muerto';
      default:                        return false;
    }
  }

  function procesarActo(arcId, actoId) {
    const arc = GS.arc(arcId);
    if(!arc || arc.estado !== 'activo') return;
    const actoIdx = arc.actos.findIndex(a => a.id === actoId);
    if(actoIdx < 0) return;
    const acto   = arc.actos[actoIdx];
    const mision = acto.mision_id ? GS.mision(acto.mision_id) : null;
    const npc    = GS.npc(arc.npc_id);
    _logArc(arc, `Acto "${acto.titulo}" → ${mision?.completada?'completado':mision?.fallida?'fallido':'pendiente'} (ciclo ${Clock.cycle}).`);

    if(acto.es_final) { _cerrarArc(arc, acto.resultado||'ambiguo', npc); return; }

    let siguienteId = null;
    for(const desv of (acto.desviaciones||[])) {
      if(_evalTrigger(desv.trigger, mision||{completada:false,fallida:false}, npc)) {
        siguienteId = desv.sig;
        _logArc(arc, `Desviación: "${desv.trigger}" → "${desv.sig}".`);
        break;
      }
    }
    if(!siguienteId) siguienteId = 'acto_colapso';

    const sigActo = arc.actos.find(a => a.id === siguienteId);
    if(!sigActo) { _cerrarArc(arc, 'colapso', npc); return; }

    arc.acto_actual_idx = arc.actos.indexOf(sigActo);
    Out.sp(); Out.sep('─');
    Out.line(`${TEMAS[arc.tema].icon} ARC "${arc.titulo}" — nuevo acto`, TEMAS[arc.tema].color, true);
    Out.line(`▶ ${sigActo.titulo}`, 't-acc');
    if(sigActo.es_final) Out.line('Este es el acto final.', 't-dim');
    Out.sep('─'); Out.sp();
    _generarMisionActo(arc, sigActo);
    if(typeof XP !== 'undefined') XP.ganar('narrativa', 35, `avance arc: ${arc.titulo}`);
    EventBus.emit('arc:advance', { arc, acto_anterior:acto, acto_siguiente:sigActo });
    save();
  }

  function _cerrarArc(arc, resultado, npc) {
    arc.estado   = resultado === 'colapso' ? 'colapsado' : 'completo';
    arc.resultado= resultado;
    arc.epitafio = (EPITAFIOS[arc.tema]||{})[resultado] || 'El arc terminó.';
    const cons   = CONSECUENCIAS_RESULTADO[resultado] || CONSECUENCIAS_RESULTADO.ambiguo;
    if(typeof XP !== 'undefined') XP.ganar(cons.xp_rama, cons.xp, `arc: ${arc.tema} → ${resultado}`);
    if(npc) { npc.lealtad = U.clamp((npc.lealtad||0)+cons.npc_lealtad,0,100); npc.desesperacion = U.clamp((npc.desesperacion||0)+cons.npc_desep,0,100); }
    if(resultado==='colapso'||resultado==='tragedia') GS.allMisiones().filter(m=>m.arc_id===arc.id&&!m.completada).forEach(m=>{m.fallida=true;m.es_imposible=true;});
    GS.addTwist({ id:`arc_fin_${arc.id}`, titulo:`Fin de "${arc.titulo}"`, texto:`${arc.epitafio} (${resultado.toUpperCase()})`, arc_id:arc.id, resultado });
    Out.sp(); Out.sep('═');
    Out.line(`${TEMAS[arc.tema].icon} ARC COMPLETO — "${arc.titulo}"`, TEMAS[arc.tema].color, true);
    Out.line(cons.msg, cons.color);
    Out.line(`Epitafio: "${arc.epitafio}"`, 't-eco');
    if(arc.log_narrativo.length) {
      Out.sep('─'); Out.line('Decisiones que llevaron aquí:', 't-dim');
      arc.log_narrativo.forEach(l => Out.line(`  · ${l}`, 't-dim'));
    }
    Out.sep('═'); Out.sp();
    EventBus.emit('arc:complete', { arc, resultado, epitafio:arc.epitafio });
    save();
  }

  function _logArc(arc, txt) { arc.log_narrativo.push(txt); if(arc.log_narrativo.length>20) arc.log_narrativo.shift(); }

  function onMisionResuelta(mision) { if(!mision.arc_id) return; const arc=GS.arc(mision.arc_id); if(!arc||arc.estado!=='activo') return; setTimeout(()=>procesarActo(mision.arc_id,mision.acto_id),400); }
  function onNPCMuerto(npcId) { GS.allArcs().filter(a=>a.estado==='activo'&&(a.npc_id===npcId||a.antagonista_id===npcId)).forEach(arc=>{const acto=arc.actos[arc.acto_actual_idx];if(!acto)return;if(acto.desviaciones.some(d=>d.trigger==='npc_muerto')){_logArc(arc,`NPC clave murió.`);setTimeout(()=>procesarActo(arc.id,acto.id),600);}}); }

  function intentarGenArc(npc) {
    if(GS.arcsActivos().length >= 2 || (npc.lealtad||0) < 30) return null;
    if(!npc.vinculos?.length && !npc.secreto) return null;
    if(GS.arcsActivos().some(a=>a.npc_id===npc.id)) return null;
    if(!U.chance(0.25)) return null;
    const arc = genArc(npc, GS.aliveNPCs());
    if(!arc) return null;
    return activarArc(arc);
  }

  function cmdArcs() {
    Out.sp(); Out.line('— ARCOS NARRATIVOS —', 't-acc');
    const todos = GS.allArcs();
    if(!todos.length) { Out.line('Sin arcos activos. Habla con NPCs y completa misiones.','t-dim'); Out.sp(); return; }
    const activos  = todos.filter(a=>a.estado==='activo');
    const cerrados = todos.filter(a=>a.estado!=='activo');
    if(activos.length) {
      Out.line('ACTIVOS:', 't-acc');
      activos.forEach(arc => {
        const def   = TEMAS[arc.tema];
        const acto  = arc.actos[arc.acto_actual_idx];
        const npc   = GS.npc(arc.npc_id);
        const mAct  = acto?.mision_id ? GS.mision(acto.mision_id) : null;
        Out.line(`  ${def.icon} "${arc.titulo}"  [${arc.tema.toUpperCase()}]`, def.color);
        Out.line(`    Acto: ${acto?.titulo||'—'}  (${arc.acto_actual_idx+1}/${arc.actos.filter(a=>!a.skipped).length})`, 't-dim');
        if(npc) Out.line(`    NPC: ${npc.nombre}  [lealtad:${npc.lealtad}]`, 't-npc');
        if(mAct) Out.line(`    Misión: "${mAct.titulo}"${mAct.aceptada?' ✓':''}`, 't-mis');
      });
    }
    if(cerrados.length) {
      Out.sp(); Out.line('CERRADOS:', 't-dim');
      cerrados.forEach(arc => {
        const col = arc.resultado==='victoria'?'t-cra':arc.resultado==='tragedia'?'t-pel':arc.resultado==='colapso'?'t-twi':'t-mem';
        Out.line(`  ${TEMAS[arc.tema]?.icon||''} "${arc.titulo}"  → ${(arc.resultado||'?').toUpperCase()}`, col);
        if(arc.epitafio) Out.line(`    "${arc.epitafio}"`, 't-dim');
      });
    }
    Out.sp();
  }

  EventBus.on('narrative:mission_complete', ({mision}) => onMisionResuelta(mision), 'arc_engine');
  EventBus.on('narrative:mission_fail',     ({mision}) => onMisionResuelta(mision), 'arc_engine');
  EventBus.on('narrative:npc_death',        ({npc})    => onNPCMuerto(npc.id),      'arc_engine');

  return { genArc, activarArc, intentarGenArc, onMisionResuelta, onNPCMuerto, cmdArcs, TEMAS, EPITAFIOS };
})();
