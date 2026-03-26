// ════════════════════════════════════════════════════════════════
// COMMANDS — Dispatch y todos los comandos del juego
// ════════════════════════════════════════════════════════════════

// ── Helpers de búsqueda ───────────────────────────────────────
function findNPC(q) {
  if(!q) return null;
  const qn = q.toLowerCase().replace(/_/g,' ').trim();
  return GS.npcEnNodo(Player.pos()).find(n => n.id===q || n.nombre.toLowerCase().includes(qn)) || null;
}
function findNPCMundo(q) {
  if(!q) return null;
  return GS.aliveNPCs().find(n => n.id===q || n.nombre.toLowerCase().includes(q.toLowerCase())) || null;
}
function npcNoAqui(q) {
  const en = findNPCMundo(q);
  if(en) { const nodo=World.node(en.nodeId); Out.line(`${en.nombre} no está aquí.${nodo?' Está en '+nodo.name+' ['+nodo.tipo+'].':''}`, 't-dim'); }
  else   { Out.line(`No hay nadie llamado "${q}" en este nodo.`, 't-dim'); const aqui=GS.npcEnNodo(Player.pos()); if(aqui.length) Out.line(`Aquí: ${aqui.map(n=>n.nombre).join(', ')}`, 't-dim'); }
}
function findMision(q) {
  if(!q) return null;
  const ql = q.toLowerCase().trim();
  return GS.mision(q) || GS.allMisiones().find(m=>m.id?.toLowerCase()===ql) || GS.allMisiones().find(m=>m.id?.toLowerCase().includes(ql)) || GS.activas().find(m=>m.titulo?.toLowerCase().includes(ql)) || null;
}

// ── Dispatch principal ────────────────────────────────────────
async function dispatch(cmd) {
  const { verb, args } = cmd;

  const pre = EventBus.emitCancellable?.('command:before', { verb, args, cancelled:false });
  if(pre?.cancelled) return;

  if(typeof Net !== 'undefined' && Net.isClient()) Net.sendAction(verb, args);

  // ── Batalla por turnos activa ───────────────────────────────
  const battle = typeof Net !== 'undefined' ? Net.getMyBattle?.() : null;
  if(battle && battle.estado === 'activo') {
    const actor      = Net.getBattleActor?.(battle);
    const esMiTurno  = actor?.playerId === Player.get().id;

    if(verb==='batalla'||verb==='b')    { Net.renderBattle?.(battle); return; }
    if(verb==='examinar'||verb==='ex')  {
      const q = (args[0]||'').toLowerCase();
      const t = battle.cola.find(c=>!q||c.name.toLowerCase().includes(q));
      if(t) { const el=t.elemento_estado?` [${t.elemento_estado}]`:''; const poise=t.poise!=null?` P:${t.poise}/${t.poise_max||50}`:''; Out.line(`${t.name}  HP:${t.hp}/${t.maxHp}  ATK:${t.atk}  DEF:${t.def||0}${poise}${el}${t.poise_roto?' ⚡VULNERABLE':''}`, t.color||'t-out'); }
      else Out.line('No encontrado.', 't-dim');
      return;
    }
    if(verb==='estado'||verb==='stats') { cmdEstado(); return; }
    if(verb==='ayuda'||verb==='help'||verb==='?') { cmdAyuda(args.join(' ')); return; }
    if(verb==='tactica'||verb==='táctica') { if(typeof Tactics!=='undefined') Tactics.cmdTactica(); return; }
    if(verb==='huir'||verb==='h') { Net.sendBattleAction(battle.id,Player.get().id,'huir',null); Combat.active=false; return; }

    if(!esMiTurno) {
      if(battle._aiThinking) { Out.line(`⏳ ${actor?.name||'IA'} está actuando...`, 't-dim'); return; }
      if(actor?.tipo !== 'player') { Out.line(`⏳ Turno de ${actor.name} — procesando...`, 't-dim'); setTimeout(()=>Net.tickAI?.(battle),100); return; }
      Out.line(`⧗ Turno de ${actor?.name||'IA'}. Espera — o escribe "huir".`, 't-dim');
      return;
    }

    if(['atacar','a','atk'].includes(verb))   { Net.sendBattleAction(battle.id,Player.get().id,'atacar',args.join(' ')||null); return; }
    if(verb==='defender'||verb==='d')          { Net.sendBattleAction(battle.id,Player.get().id,'defender',null); return; }
    if(['magia','lanzar_b'].includes(verb))    { Net.sendBattleAction(battle.id,Player.get().id,'magia',args.join(' ')||null); return; }
    if(['habilidad','hab_b'].includes(verb))   { Net.sendBattleAction(battle.id,Player.get().id,'habilidad',args.join(' ')||null); return; }
    if(verb==='usar') {
      const item = Player.findItem(args.join(' '));
      if(item && typeof ItemSystem!=='undefined' && ItemSystem.CATALOGO[item.blueprint]) { ItemSystem.aplicar(item,battle); refreshStatus(); Net.sendBattleAction(battle.id,Player.get().id,'defender',null); return; }
      Out.line('No puedes usar eso en batalla.','t-dim'); return;
    }
    if(verb==='copiar')    { if(typeof cmdCopiar!=='undefined')    cmdCopiar(args);    return; }
    if(verb==='canalizar') { if(typeof cmdCanalizar!=='undefined') cmdCanalizar(args); return; }
    Out.line('Tu turno: atacar · defender · magia · habilidad · usar · copiar · canalizar · huir · examinar', 't-pel');
    return;
  }

  // Intentar comando de plugin
  if(await CommandRegistry.run(verb, args)) { EventBus.emit('command:after',{verb,args}); return; }

  // Comandos del motor
  switch(verb) {
    case 'ir': case 'go':       cmdIr(args[0]); break;
    case 'n':                   cmdIr('norte'); break;
    case 's':                   cmdIr('sur'); break;
    case 'e':                   cmdIr('este'); break;
    case 'o':                   cmdIr('oeste'); break;
    case 'mirar': case 'l': case 'ver': cmdMirar(); break;

    case 'hablar':              cmdHablar(args.join(' ')); break;
    case 'preguntar':           cmdPreguntar(args[0], args.slice(1).join(' ')); break;
    case 'observar':            cmdObservar(args.join(' ')); break;
    case 'traicionar':          cmdTraicionar(args.join(' ')); break;
    case 'npcs': case 'personas': cmdNPCs(); break;

    case 'misiones': case 'mis': cmdMisiones(); break;
    case 'aceptar':             cmdAceptar(args.join(' ')); break;
    case 'rechazar':            cmdRechazar(args.join(' ')); break;
    case 'completar':           cmdCompletar(args.join(' ')); break;
    case 'arcos': case 'arcs': case 'arc': if(typeof ArcEngine!=='undefined') ArcEngine.cmdArcs(); break;

    case 'facciones': case 'faccion': if(typeof FactionSystem!=='undefined') FactionSystem.cmdFacciones(); break;
    case 'reputacion': case 'rep':    _cmdReputacion(); break;
    case 'bosses': case 'boss':       if(typeof BossSystem!=='undefined') BossSystem.cmdBosses(); break;
    case 'mapa': case 'map': case 'secciones': cmdMapa(args); break;

    case 'descansar': case 'rest': case 'dormir': if(typeof Tactics!=='undefined') await Tactics.cmdDescansar(); break;
    case 'tactica': case 'táctica': case 'tac':   if(typeof Tactics!=='undefined') Tactics.cmdTactica(); break;
    case 'items': case 'ítems':    if(typeof ItemSystem!=='undefined') ItemSystem.cmdItems(); break;
    case 'reparar': {
      const kit = args[0] ? Player.findItem(args[0]) : Player.get().inventory.find(i=>['kit_reparacion','kit_maestro','lima_afilado'].includes(i.blueprint));
      if(!kit) { Out.line('No tienes kit de reparación.','t-dim'); break; }
      if(typeof ItemSystem !== 'undefined') { ItemSystem.aplicar(kit, null); save(); }
      break;
    }

    case 'forjar':              cmdForjar(args); break;
    case 'encarnar':            cmdForjar(args, 'corporal'); break;
    case 'conjurar':            cmdForjar(args, 'mágico'); break;
    case 'fusionar':            cmdFusionar(args); break;
    case 'recetas':             cmdRecetas(); break;
    case 'materiales':          cmdMateriales(); break;

    case 'habilidades': case 'hab': if(typeof cmdHabilidades!=='undefined') cmdHabilidades(); else _cmdHabilidadesBasic(); break;
    case 'magias': case 'mag':      if(typeof cmdMagias!=='undefined') cmdMagias(); else _cmdMagiasBasic(); break;
    case 'copiar':              if(typeof cmdCopiar!=='undefined') cmdCopiar(args); break;
    case 'canalizar':           if(typeof cmdCanalizar!=='undefined') cmdCanalizar(args); break;
    case 'lanzar':              cmdLanzarMagia(args.join(' ')); break;
    case 'recargar':            cmdRecargarMagia(args); break;

    case 'criaturas': case 'comp': cmdCompañeros(); break;
    case 'capturar':            cmdCapturar(args.join(' ')); break;
    case 'liberar':             cmdLiberar(args.join(' ')); break;
    case 'modo':                cmdModo(args[0], args.slice(1).join(' ')); break;
    case 'nombrar':             cmdNombrarComp(args[0], args.slice(1).join(' ')); break;
    case 'criar':               cmdCriar(args[0], args[1]); break;
    case 'anclas':              cmdAnclas(); break;
    case 'vincular':            cmdVincular(args.join(' ')||null, null); break;

    case 'inventario': case 'inv': cmdInv(); break;
    case 'recoger': case 'tomar':  cmdRecoger(args.join(' ')); break;
    case 'soltar': case 'drop':    cmdSoltar(args.join(' ')); break;
    case 'equipar':             cmdEquipar(args.join(' ')); break;
    case 'usar':                cmdUsar(args.join(' ')); break;
    case 'atacar': case 'atk':  cmdAtacar(args.join(' ')); break;
    case 'examinar': case 'ex': cmdExaminar(args.join(' ')); break;
    case 'estado': case 'stats': cmdEstado(); break;
    case 'legados': case 'ecos': cmdLegados(); break;

    case 'atributos': case 'attrs': if(typeof XP!=='undefined') XP.cmdAtributos(); break;
    case 'experiencia': case 'xp': case 'exp': if(typeof XP!=='undefined') XP.cmdExperiencia(); break;
    case 'asignar': case 'assign': if(typeof XP!=='undefined') { XP.cmdAsignar(args.join(' ')); save(); } break;

    case 'conectar': case 'host': case 'iniciar':
      if(args.length) await Net.connect(args.join('')); else await Net.host(); break;
    case 'aceptar_conexion': await Net.acceptConexion(args[0], args[1]||null); break;
    case 'desconectar': Net.disconnect(); break;
    case 'jugadores': case 'red': case 'net': Net.cmdJugadores(); break;
    case 'batalla': { const b=Net.getMyBattle(); if(!b){Out.line('No estás en batalla.','t-dim');break;} Net.renderBattle?.(b); break; }
    case 'defender': { const b=Net.getMyBattle(); if(!b){Out.line('No estás en batalla.','t-dim');break;} Net.sendBattleAction(b.id,Player.get().id,'defender',null); break; }
    case 'unirse_batalla': { const b=Object.values(Net.battles).find(x=>x.nodeId===Player.pos()&&x.estado==='activo'); if(!b){Out.line('No hay batalla activa aquí.','t-dim');break;} Net.joinBattle(b.id); break; }

    case 'comerciar': _cmdComerciar(args); break;
    case 'aceptar_trade': _cmdAceptarTrade(); break;
    case 'rechazar_trade': _cmdRechazarTrade(); break;
    case 'ofrecer': _cmdOfrecer(args); break;
    case 'retirar': _cmdRetirar(args); break;
    case 'confirmar_trade': _cmdConfirmarTrade(); break;
    case 'cancelar_trade': _cmdCancelarTrade(); break;

    case 'plugins':     cmdPlugins(); break;
    case 'modulos':     cmdModulos(); break;
    case 'eventos':     cmdEventos(); break;
    case 'cargar_modulo':  cmdCargarModulo(args.join(' ')); break;
    case 'cargar_plugin':  cmdCargarPlugin(args.join(' ')); break;
    case 'descargar_plugin': PluginLoader.unregister(args[0]); Out.line(`Plugin "${args[0]}" descargado.`,'t-mem'); break;

    case 'guardar': case 'save': save(); Out.line('Guardado.','t-cra'); break;
    case 'exportar': case 'export': exportarPartida(); break;
    case 'importar': case 'import': importarPartida(); break;
    case 'semilla': Out.line(`Semilla: ${World.seed}`,'t-sis'); break;
    case 'nombre':
      if(args.length) { const n=args.join(' ').trim().replace(/[<>&"]/g,'').slice(0,24); if(n.length>=2){ Player.rename(n); Out.line(`Nombre: ${Player.get().name}`,'t-npc'); if(Net.isClient()) Net.sendAction('nombre',[n]); } else Out.line('El nombre debe tener al menos 2 caracteres.','t-dim'); }
      break;
    case 'nuevo': case 'new': localStorage.removeItem('eco_v12'); Out.clear(); await init(); break;
    case 'ayuda': case 'help': case '?': cmdAyuda(args.join(' ')); break;
    case 'limpiar': case 'cls': Out.clear(); break;

    default: {
      const handled = EventBus.emit('command:unknown', { verb, args });
      if(!handled?.handled) Out.line(`Desconocido: "${verb}". Escribe "ayuda".`, 't-dim');
    }
  }
  EventBus.emit('command:after', { verb, args });
}

// ── MOVIMIENTO ────────────────────────────────────────────────
function cmdIr(dir) {
  if(!dir) { Out.line('¿Hacia dónde? norte/sur/este/oeste', 't-dim'); return; }
  const exits = World.exits(Player.pos());
  let dest = exits[dir];
  if(!dest) {
    if(World.isBorder(Player.pos())) {
      Out.line(`Estás en el borde del mapa. Expandiendo...`, 't-eco');
      dest = World.expandSection(Player.pos(), dir);
      if(!dest) { Out.line(`Sin salida al ${dir}.`, 't-dim'); return; }
    } else { Out.line(`Sin salida al ${dir}.`, 't-dim'); return; }
  }
  Player.setPos(dest); Clock.tick(1);
  const tickPayload = EventBus.emit('player:tick', { player:Player.get() });
  World.visit(dest);

  const nodoActual = World.node(dest);
  if(!nodoActual?.visitado_prev) {
    nodoActual.visitado_prev = true;
    if(typeof XP!=='undefined') XP.ganar('exploración', 10 + (nodoActual?.seccion||0)*5, 'nodo nuevo');
    if(nodoActual?.dificultad >= 2.5) Out.line(`⚠ ZONA HOSTIL — Enemigos ×${(nodoActual.dificultad||1).toFixed(1)}`, 't-pel');
  } else if(typeof XP !== 'undefined') { XP.ganar('exploración', 2, 'movimiento'); }

  EventBus.emit('world:tick', { cycle:Clock.cycle });
  GS.aliveNPCs().forEach(n => {
    if(U.chance(0.12)) n.desesperacion = U.clamp(n.desesperacion + U.rand(1,5), 0, 100);
    if(U.chance(0.07)) n.corrupcion    = U.clamp(n.corrupcion    + U.rand(1,3), 0, 100);
    if(n.desesperacion >= 90 && U.chance(0.15)) setTimeout(() => NPCEngine.consecuenciaDesperación(n), 500);
  });

  cmdMirar(); save();
}

function cmdMirar() {
  const n = World.node(Player.pos());
  if(!n) return;
  Out.sp();
  Out.line(`▸ ${n.name}`, 't-acc', true);
  Out.line(`${n.tipo.toUpperCase()}  ·  ${n.estado.toUpperCase()}  ·  ${Object.keys(World.exits(Player.pos())).join(', ')||'sin salidas'}`, 't-dim');
  Out.sp();
  Out.line(n.atmos, 't-out');
  Out.sp();

  const lootNames = (n.loot||[]).filter(l => typeof l === 'string');
  if(lootNames.length)   Out.line(`Objetos: ${lootNames.join(', ')}`, 't-cra');
  if(n.enemies?.length)  Out.line(`Entidades: ${n.enemies.map(e=>`${e.nombre}(HP:${e.hp_current||e.hp})`).join(', ')}`, 't-pel');
  if(n.creatures?.length) Out.line(`Criaturas: ${n.creatures.map(c=>`${c.nombre}[${c.arquetipo}]`).join(', ')}`, 't-cri');

  const npcs = GS.npcEnNodo(Player.pos());
  if(npcs.length) {
    Out.sp();
    npcs.forEach(npc => {
      const tag = npc.estado !== 'vivo' ? ` [${npc.estado.toUpperCase()}]` : '';
      Out.line(`▷ ${npc.nombre}  [${npc.arq_vis}]${tag}${npc.misiones_ofrecidas?.length?' ◈':''}`, 't-npc');
      if(npc.desesperacion > 75) Out.line(`  Algo en ${npc.nombre} está al límite.`, 't-dim');
      if(npc.arq_ocu_expuesto)   Out.line(`  [${npc.arq_ocu.toUpperCase()}]`, 't-twi');
    });
    Out.line('  hablar · observar · preguntar · atacar [nombre]', 't-mut');
  }

  const comps = Player.get().ext?.compañeros || Player.get().compañeros || [];
  if(comps.length) Out.line(`Contigo: ${comps.map(c=>c.nombre).join(', ')}`, 't-cri');

  if(typeof Net !== 'undefined') {
    const otros = Net.playersEnNodo(Player.pos());
    if(otros.length) { Out.sp(); otros.forEach(p => Out.line(`  ◉ ${p.name}  [jugador]`, p.color||'t-eco')); }
  }

  // Boss proximity
  if(typeof BossSystem !== 'undefined') {
    BossSystem.getBosses().filter(b=>!b.eliminado).forEach(boss => {
      const dist = BossSystem.distancia(Player.pos(), boss.nodeId);
      if(dist === 1) { Out.sp(); Out.line(`☠ EL MIEDO SE SIENTE CERCA`, boss.def.color, true); Out.line(boss.def.frase_cerca, 't-pel'); }
      else if(dist === 2) { Out.line(`${boss.def.icon} Algo poderoso se siente en el mundo.`, boss.def.color); }
    });
  }

  const extraPayload = EventBus.emit('render:node_extra', { nodeId:Player.pos(), node:n, player:Player.get(), lines:[] });
  (extraPayload?.lines||[]).forEach(l => Out.line(l.text, l.color||'t-out'));

  if(typeof RunMem !== 'undefined' && RunMem.ecos().length && U.chance(.12)) Out.line('Un rastro de algo anterior es visible aquí.', 't-eco');
  Out.sp(); refreshStatus();

  // Spawn enemigo
  if(n.enemies?.length && !n.destruido && U.chance(.35)) {
    const e = n.enemies[0];
    setTimeout(() => {
      Out.line(`¡${e.nombre} emerge!`, 't-pel');
      const p = Player.get();
      Net.startBattle(n.id, [
        { tipo:'player', id:p.id, name:p.name, hp:p.hp, maxHp:p.maxHp, atk:Player.getAtk(), def:Player.getDef(), nodeId:n.id, playerId:p.id, vivo:true },
        { tipo:'enemy',  id:e.id, name:e.nombre, hp:e.hp_current||e.hp, maxHp:e.hp, atk:e.atk, def:e.def||0, nodeId:n.id, tags:e.tags||[], vivo:true },
      ]);
    }, 350);
  }
}

// ── NPC ───────────────────────────────────────────────────────
function cmdHablar(target) {
  const npc = findNPC(target); if(!npc) { npcNoAqui(target); return; }
  Out.sp(); Out.sep('─');
  Out.line(NPCEngine.dialogo(npc, typeof RunMem!=='undefined'?RunMem.runs():[]), 't-npc', true);
  const res = NPCEngine.interactuar(npc);
  if(res) { Out.sp(); Out.line(res.texto, res.tipo==='secreto'?'t-cor':'t-twi', true); }
  NPCEngine.checkTwists(npc, Player.get(), GS.allMisiones(), typeof RunMem!=='undefined'?RunMem.ecos():[], []).forEach(t => { GS.addTwist(t); if(typeof XP!=='undefined') XP.ganar('narrativa',60,'plot twist'); Out.sp(); Out.sep('═'); Out.line(`⟁ REVELACIÓN — ${t.titulo}`,'t-twi',true); Out.line(t.texto,'t-out'); Out.sep('═'); });
  const misNPC = GS.allMisiones().filter(m=>m.npc_id===npc.id&&!m.completada&&!m.fallida);
  if(!misNPC.length && U.chance(.55)) {
    const m = NPCEngine.genMision(npc, GS.aliveNPCs(), typeof RunMem!=='undefined'?RunMem.ecos():[]);
    if(m) { GS.addMision(m); Out.sp(); Out.line(`◈ MISIÓN — "${m.titulo}"`, 't-mis', true); Out.line(m.desc,'t-out'); Out.line(`Recompensa: ${m.recompensa}`,'t-dim'); Out.line('"aceptar" o "rechazar"','t-dim'); }
  } else if(misNPC.length) Out.line(`◈ Misión activa: "${misNPC[0].titulo}"`, 't-mis');
  if(typeof ArcEngine !== 'undefined') ArcEngine.intentarGenArc(npc);
  Out.sep('─'); Out.sp(); save();
}

function cmdPreguntar(tQ, tema) {
  const npc = findNPC(tQ); if(!npc) { npcNoAqui(tQ); return; }
  Out.sp(); Out.sep('─');
  const t = (tema||'').toLowerCase();
  const rng = U.rng(npc.id + tema + Clock.cycle);
  if(t.includes('secreto')||t.includes('verdad'))      { if(npc.lealtad>50){Out.line(`${npc.nombre}: "${npc.secreto}"`, 't-npc', true);npc.secreto_expuesto=true;}else Out.line(`${npc.nombre} desvía la mirada.`,'t-dim'); }
  else if(t.includes('miedo'))                          { if(npc.lealtad>40){Out.line(`${npc.nombre}: "${npc.miedo}."`, 't-npc', true);npc.fragmentos.push('miedo');}else Out.line('No responde eso.','t-dim'); }
  else if(t.includes('deseo')||t.includes('quiere'))    { Out.line(`${npc.nombre}: "${npc.deseo}."`, 't-npc', true); npc.fragmentos.push('deseo'); }
  else if(t.includes('pasado')||t.includes('trauma'))   { if(npc.lealtad>60){Out.line(`${npc.nombre}: "${npc.trauma}."`, 't-npc', true);npc.fragmentos.push('trauma');}else Out.line('Sacude la cabeza.','t-dim'); }
  else if(t.includes('anterior')||t.includes('ciclo'))  { const ecos=typeof RunMem!=='undefined'?RunMem.ecos():[]; if(ecos.length&&npc.eco_run_id){const e=ecos.find(x=>x.run_id===npc.eco_run_id)||ecos[0]; Out.line(`${npc.nombre}: "Hubo alguien. ${e.nombre}. No sobrevivió."`, 't-npc', true);}else Out.line(`${npc.nombre}: "Antes que tú, solo siluetas."`, 't-npc'); }
  else if(t.includes('vínculo')||t.includes('relación')){ if(npc.vinculos.length) Out.line(`${npc.nombre}: "${npc.vinculos[0].historia}"`, 't-npc', true); else Out.line(`${npc.nombre}: "No hay nadie más en esta historia."`, 't-npc'); }
  else { Out.line(`${npc.nombre}: "No tengo respuesta simple."`, 't-npc', true); }
  Out.sep('─'); Out.sp(); save();
}

function cmdObservar(target) { const npc=findNPC(target); if(!npc){npcNoAqui(target);return;} Out.sp(); Out.line(`— OBSERVACIÓN: ${npc.nombre} —`,'t-acc'); NPCEngine.observar(npc).forEach((o,i)=>Out.line(o,i===0?'t-npc':npc.arq_ocu_expuesto&&i>3?'t-twi':'t-dim')); Out.sp(); }
function cmdTraicionar(target) { const npc=findNPC(target); if(!npc){npcNoAqui(target);return;} Out.sp(); Out.sep('═'); Out.line(`TRAICIÓN — ${npc.nombre}`,'t-twi',true); npc.lealtad=0; npc.desesperacion=U.clamp(npc.desesperacion+30,0,100); if((D.npcs?.arquetipos_hostiles||[]).includes(npc.arq_ocu)||npc.desesperacion>80){npc.estado='hostil';Out.line(`${npc.nombre}: "Lo recordaré."`, 't-npc');GS.allMisiones().filter(m=>m.npc_id===npc.id&&!m.completada).forEach(m=>m.fallida=true);}else Out.line(`${npc.nombre} no dice nada. Eso es peor.`,'t-npc'); if(typeof FactionSystem!=='undefined') FactionSystem.onTraicion(npc); Out.sep('═'); Out.sp(); save(); }
function cmdNPCs() { Out.sp(); Out.line('— PERSONAS DEL MUNDO —','t-acc'); const todos=Object.values(GS.npcs); if(!todos.length){Out.line('Nadie encontrado.','t-dim');return;} const vivos=todos.filter(n=>['vivo','sometido','hostil'].includes(n.estado)); vivos.forEach(npc=>{const aqui=npc.nodeId===Player.pos(); Out.line(`  ${npc.nombre}  [${npc.arq_vis}]${npc.estado!=='vivo'?' ['+npc.estado.toUpperCase()+']':''}  ${aqui?'← AQUÍ':World.node(npc.nodeId)?.name||'?'}  Leal:${npc.lealtad}`,aqui?'t-npc':'t-dim');if(npc.arq_ocu_expuesto)Out.line(`       Real: ${npc.arq_ocu.toUpperCase()}`,'t-twi');}); const perdidos=todos.filter(n=>!['vivo','sometido','hostil'].includes(n.estado)); if(perdidos.length){Out.sp();Out.line('Perdidos:','t-pel');perdidos.forEach(n=>Out.line(`  ✝ ${n.nombre} [${n.arq_vis}] ${n.estado.toUpperCase()}`,'t-pel'));} Out.sp(); }

// ── MISIONES ──────────────────────────────────────────────────
function cmdMisiones() { Out.sp(); Out.line('— MISIONES —','t-acc'); const act=GS.activas(); const ok=GS.allMisiones().filter(m=>m.completada); const fail=GS.allMisiones().filter(m=>m.fallida); if(act.length){Out.line('ACTIVAS:','t-mis');act.forEach(m=>{Out.line(`  ◈ ${m.id}  "${m.titulo}"  [${m.tipo}]${m.aceptada?' ✓':''}${m.es_imposible?' [IMP]':''}${m.es_trampa?' [?]':''}`,'t-mis');Out.line(`    ${m.desc}`,'t-dim');Out.line(`    → ${m.consecuencia_fallo}`,'t-dim');});} if(ok.length) Out.line(`Completadas: ${ok.map(m=>'"'+m.titulo+'"').join(', ')}`,'t-cra'); if(fail.length) Out.line(`Fallidas: ${fail.map(m=>'"'+m.titulo+'"').join(', ')}`,'t-pel'); if(!act.length&&!ok.length) Out.line('Sin misiones. Habla con los NPCs.','t-dim'); Out.sp(); }
function cmdAceptar(q) { const m=q?findMision(q):GS.activas().filter(x=>!x.aceptada).slice(-1)[0]; if(!m){Out.line(q?`"${q}" no encontrada.`:'Sin misiones pendientes.','t-dim');return;} if(m.aceptada){Out.line('Ya aceptada.','t-dim');return;} m.aceptada=true; Out.line(`Aceptas: "${m.titulo}"`, 't-mis', true); const npc=GS.npc(m.npc_id); if(npc){npc.lealtad=U.clamp(npc.lealtad+10,0,100);Out.line(`${npc.nombre} registra tu compromiso.`,'t-npc');} if(m.es_imposible)Out.line('Nota: puede ser imposible.','t-dim'); save(); }
function cmdRechazar(q) { const m=q?findMision(q):GS.activas().filter(x=>!x.aceptada).slice(-1)[0]; if(!m){Out.line(q?`"${q}" no encontrada.`:'Sin misiones pendientes.','t-dim');return;} m.fallida=true; Out.line(`Rechazas: "${m.titulo}"`, 't-pel'); const npc=GS.npc(m.npc_id); if(npc){npc.lealtad=U.clamp(npc.lealtad-15,0,100);npc.desesperacion=U.clamp(npc.desesperacion+20,0,100);Out.line(`${npc.nombre}: "${m.consecuencia_fallo}"`, 't-npc');if(npc.desesperacion>80)setTimeout(()=>NPCEngine.consecuenciaDesperación(npc),1200);} EventBus.emit('narrative:mission_fail',{mision:m}); if(m.arc_id)setTimeout(()=>ArcEngine.onMisionResuelta(m),500); save(); }
function cmdCompletar(q) { const m=findMision(q); if(!m){Out.line(`"${q}" no encontrada.`,'t-dim');return;} if(m.completada){Out.line('Ya completada.','t-dim');return;} m.completada=true; Out.sp(); Out.sep('═'); Out.line(`MISIÓN COMPLETADA — "${m.titulo}"`, 't-cra', true); const xpMision={deuda:40,búsqueda:50,protección:45,revelación:60,traición:55,sacrificio:70,ambigua:50,imposible:80,legado:65,venganza:55}; if(typeof XP!=='undefined') XP.ganar('narrativa', xpMision[m.tipo]||45, `misión: ${m.tipo}`); const npc=GS.npc(m.npc_id); if(npc){npc.lealtad=U.clamp(npc.lealtad+20,0,100);npc.desesperacion=U.clamp(npc.desesperacion-15,0,100);Out.line(`${npc.nombre} recibe la resolución.`,'t-npc');NPCEngine.checkTwists(npc,Player.get(),GS.allMisiones(),typeof RunMem!=='undefined'?RunMem.ecos():[],[]).forEach(t=>{GS.addTwist(t);Out.sp();Out.line(`⟁ REVELACIÓN — ${t.titulo}`,'t-twi',true);Out.line(t.texto,'t-out');});} Out.line(`Recompensa: ${m.recompensa}`,'t-mis'); EventBus.emit('narrative:mission_complete',{mision:m,npc}); if(m.arc_id)setTimeout(()=>ArcEngine.onMisionResuelta(m),500); Out.sep('═'); Out.sp(); save(); }

// ── FORJA ─────────────────────────────────────────────────────
function cmdForjar(args, modo) {
  if(!args.length) { Out.line('forjar [mat1] [mat2] ...','t-dim'); Out.line('encarnar — sesga a habilidades  ·  conjurar — sesga a magias','t-dim'); return; }
  const used=[], ids=[];
  for(const q of args) {
    const item = Player.get().inventory.find(i=>!used.includes(i.id)&&(i.blueprint?.toLowerCase().includes(q.toLowerCase())||i.nombre?.toLowerCase().includes(q.toLowerCase())));
    if(!item){Out.line(`No tienes "${q}".`,'t-dim');return;}
    if(!['material','ancla'].includes(item.tipo)&&item.categoria!=='ancla'){Out.line(`"${item.nombre||item.blueprint}" no es material forjable.`,'t-dim');return;}
    used.push(item.id); ids.push(item.blueprint);
  }
  if(ids.length < 2){Out.line('Necesitas al menos 2 materiales.','t-dim');return;}
  if(modo==='corporal'){const tagsCorp=['tendón','nervio','hueso','sangre','tejido','médula'];if(!ids.some(id=>D.matTags(id).some(t=>tagsCorp.includes(t)))){Out.line('Encarnar requiere material corporal.','t-pel');return;}}
  if(modo==='mágico'){const tagsMag=['resonante','corrupto','cristal','susurro','llama','vacío'];if(!ids.some(id=>D.matTags(id).some(t=>tagsMag.includes(t)))){Out.line('Conjurar requiere material mágico.','t-pel');return;}}
  const ctx={nodeId:Player.pos(),cycle:Clock.cycle,pid:Player.get().id,modo};
  const res=Forge.forjar(ids,ctx,World.node(Player.pos())?.estado,Clock.get().name,modo);
  if(res.cancelled){Out.line('La forja fue cancelada.','t-dim');return;}
  Clock.tick(2); EventBus.emit('player:tick',{player:Player.get()});
  if(res.colapso){Out.sp();Out.line('⚠ COLAPSO DE FORJA','t-pel',true);Out.line(`Tensión: ${(res.tension*100).toFixed(0)}%`,'t-cor');const d=Player.damage(U.rand(5,15));Out.line(`−${d} HP`,'t-pel');used.forEach(id=>Player.rmItem(id));refreshStatus();save();return;}
  const item=res.item; used.forEach(id=>Player.rmItem(id));
  Out.sp();
  const col=item.tipo==='habilidad'?'t-hab':item.tipo==='magia'?'t-mag':item.tipo==='mítico'?'t-cor':item.categoria==='ancla'?'t-cri':'t-cra';
  Out.line(`FORJA — ${res.rType.toUpperCase()}`, 't-acc', true);
  Out.line(`${item.nombre}  [${item.tipo}]`, col);
  if(item.atk)   Out.line(`ATK +${item.atk}`,'t-pel');
  if(item.def)   Out.line(`DEF +${item.def}`,'t-sis');
  if(item.hp)    Out.line(`Cura ${item.hp}HP`,'t-cra');
  if(item.poder) Out.line(`Poder: ${item.poder}`,'t-mag');
  if(item.desc)  Out.line(item.desc,'t-dim');
  Out.line(`Tags: ${res.domTags.join(', ')}  #${item.imprint?.hash||'—'}`, 't-dim');
  Player.get().stats.crafted++;
  if(typeof XP!=='undefined'){const xpForja={arma:15,armadura:12,consumible:8,habilidad:30,magia:35,mítico:80,reliquia:20,ancla:12,colapso:5};XP.ganar('forja',xpForja[res.rType]||10,`forja: ${res.rType}`);}
  if(item.tipo==='habilidad'){if(!Player.addHab?.(item)){Out.line('Slots llenos. En inventario.','t-dim');Player.addItem(item);}else Out.line('Habilidad encarnada.','t-hab');}
  else if(item.tipo==='magia'){if(!Player.addMag?.(item)){Out.line('Slots llenos. En inventario.','t-dim');Player.addItem(item);}else Out.line('Magia conjurada.','t-mag');}
  else Player.addItem(item);
  Out.sp(); refreshStatus(); save();
}

function cmdFusionar(args) { if(args.length<2){Out.line('fusionar [id1] [id2] ...','t-dim');return;} const items=args.map(q=>Player.findItem(q)||Player.findHab?.(q)||Player.findMag?.(q)).filter(Boolean); if(items.length<2){Out.line(`Solo encontré ${items.length} ítem(s).`,'t-dim');return;} const allTags=items.flatMap(i=>i.tags||[]); const tension=Tags.tension(allTags); Out.sp(); Out.line('CONVERGENCIA — FUSIÓN','t-cor',true); Out.line(`Tensión: ${(tension*100).toFixed(0)}%`,tension>.6?'t-pel':'t-dim'); if(tension>.8){Out.line('Tensión demasiado alta. Colapso.','t-pel');items.forEach(i=>{Player.rmItem(i.id);Player.rmHab?.(i.id);Player.rmMag?.(i.id);});const d=Player.damage(U.rand(10,25));Out.line(`−${d} HP`,'t-pel');refreshStatus();save();return;} const rng=U.rng(Date.now()); const pena=1-tension*0.3; const totalAtk=Math.floor(items.reduce((s,i)=>s+(i.atk||0)+(i.valor||0)*0.5,0)*pena); const totalDef=Math.floor(items.reduce((s,i)=>s+(i.def||0),0)*pena); const totalPoder=Math.floor(items.reduce((s,i)=>s+(i.poder||0),0)*pena); const muts=D.narrative?.mutaciones||[]; const adj=tension>.5?['Inestable','Corrupta','Fragmentada']:['Convergente','Primordial','Eterna']; const nombre=`${U.pick(adj,rng)} ${muts.length?U.pick(muts,rng):'Reliquia'}`; const imp=Imprint.gen('reliquia_viva',allTags,{nodeId:Player.pos(),cycle:Clock.cycle,pid:Player.get().id},tension); const tieneHab=items.some(i=>i.tipo==='habilidad'); const tieneMag=items.some(i=>i.tipo==='magia'); const rel={id:U.uid(),blueprint:'reliquia_viva',nombre,tipo:'mítico',tags:allTags.slice(0,5),imprint:imp,estado:'convergente',es_mitico:true,atk:totalAtk,def:totalDef,poder:totalPoder,efecto_pasivo:tieneHab&&tieneMag?'+1_slot_magia':tieneHab?'atk_bonus':tieneMag?'mana_max':null,desc:`Convergencia. Tensión:${(tension*100).toFixed(0)}%.`}; items.forEach(i=>{Player.rmItem(i.id);Player.rmHab?.(i.id);Player.rmMag?.(i.id);}); Player.addItem(rel); if(typeof XP!=='undefined'){XP.ganar('forja',60+items.length*10,'fusión ontológica');XP.ganar('mente',30,'convergencia');} Out.line(`${rel.nombre}  [MÍTICO]`,'t-cor',true); if(rel.atk)Out.line(`ATK +${rel.atk}`,'t-pel'); if(rel.def)Out.line(`DEF +${rel.def}`,'t-sis'); if(rel.efecto_pasivo)Out.line(`Efecto pasivo: ${rel.efecto_pasivo}`,'t-cor'); Out.sp(); refreshStatus(); save(); }

function cmdRecetas() { Out.sp(); Out.line('— GUÍA DE AFINIDADES —','t-acc'); Object.entries(D.tagAff||{}).forEach(([k,v])=>Out.line(`  ${k.padEnd(28)} → ${v.resultado}  (${v.fuerza})`,'t-dim')); Out.sp(); Out.line('Tags opuestos:','t-out'); (D.tagOpp||[]).forEach(([a,b])=>Out.line(`  ${a} ↔ ${b}`,'t-dim')); Out.sp(); }
function cmdMateriales() { Out.sp(); Out.line('— MATERIALES —','t-acc'); const cats={}; Object.entries(D.mats||{}).forEach(([id,m])=>{const c=m.categoria||'físico';if(!cats[c])cats[c]=[];cats[c].push(id);}); Object.entries(cats).forEach(([cat,ids])=>{Out.line(cat,'t-acc');ids.forEach(id=>{const m=D.mat(id);Out.line(`  ${id.padEnd(24)} [${m?.tags?.join(',')||'—'}]`,'t-dim');});}); Out.sp(); }

// ── INVENTARIO Y OBJETOS ──────────────────────────────────────
function cmdInv() { Out.sp(); Out.line('— INVENTARIO —','t-acc'); const p=Player.get(); const inv=p.inventory; if(!inv.length){Out.line('Vacío.','t-dim');Out.sp();return;} const grupos={}; inv.forEach(i=>{const g=i.tipo||'misc';if(!grupos[g])grupos[g]=[];grupos[g].push(i);}); Object.entries(grupos).forEach(([g,items])=>{const col=g==='arma'?'t-pel':g==='armadura'?'t-sis':g==='magia'?'t-mag':g==='habilidad'?'t-hab':g==='mítico'?'t-cor':g==='reliquia'?'t-cor':g==='material'?'t-cra':'t-out'; Out.line(`${g.toUpperCase()} (${items.length}):`,col); items.forEach(i=>Out.line(`  ${i.nombre||i.blueprint}${i.imprint?' #'+i.imprint.hash.slice(0,4):''}${i.atk?' ATK+'+i.atk:''}${i.def?' DEF+'+i.def:''}${i.durabilidad!=null&&i.tipo==='arma'?' Dur:'+i.durabilidad+'%':''}`,col));}); if(p.equipped?.arma||p.equipped?.armadura||p.equipped?.reliquia||p.equipped?.mitico){Out.sp();Out.line('Equipado:','t-acc');if(p.equipped.arma)Out.line(`  Arma: ${p.equipped.arma.nombre||p.equipped.arma.blueprint}`,'t-pel');if(p.equipped.armadura)Out.line(`  Armadura: ${p.equipped.armadura.nombre||p.equipped.armadura.blueprint}`,'t-sis');if(p.equipped.reliquia)Out.line(`  Reliquia: ${p.equipped.reliquia.nombre||p.equipped.reliquia.blueprint}`,'t-cor');if(p.equipped.mitico)Out.line(`  Mítico: ${p.equipped.mitico.nombre||p.equipped.mitico.blueprint}`,'t-cor');} Out.sp(); }
function cmdRecoger(q) { const n=World.node(Player.pos()); if(!n){return;} const lootStr=n.loot.find(l=>typeof l==='string'&&l.toLowerCase().includes((q||'').toLowerCase())); const lootItem=n.loot._items?.find(i=>(i.nombre||i.blueprint).toLowerCase().includes((q||'').toLowerCase())); if(!lootStr&&!lootItem){Out.line(`No hay "${q||'nada'}" aquí.`,'t-dim');const lootNames=n.loot.filter(l=>typeof l==='string');if(lootNames.length)Out.line(`Objetos: ${lootNames.join(', ')}`,'t-cra');return;} if(lootItem){Player.addItem({...lootItem,id:U.uid()});n.loot._items=n.loot._items.filter(i=>i!==lootItem);World.rmLoot(Player.pos(),lootItem.blueprint);Out.line(`Recoges: ${lootItem.nombre}`,'t-cra');}else{const mat=D.mat(lootStr);Player.addItem({id:U.uid(),blueprint:lootStr,nombre:lootStr.replace(/_/g,' '),tipo:'material',tags:D.matTags(lootStr),estado:'nativo',desc:mat?.desc});World.rmLoot(Player.pos(),lootStr);Out.line(`Recoges: ${lootStr.replace(/_/g,' ')}`,'t-cra');} if(Player.get()._duplicar_loot){const dup={...Player.get().inventory.slice(-1)[0],id:U.uid()};Player.addItem(dup);Player.get()._duplicar_loot=false;Out.line('Duplicado.','t-mag');} if(typeof XP!=='undefined')XP.ganar('exploración',3,'objeto recogido'); refreshStatus();save(); }
function cmdSoltar(q) { const item=Player.findItem(q); if(!item){Out.line(`No tienes "${q}".`,'t-dim');return;} Player.rmItem(item.id); const n=World.node(Player.pos()); if(n){n.loot=n.loot||[];n.loot.push(item.blueprint);} Out.line(`Sueltas: ${item.nombre||item.blueprint}`,'t-dim'); save(); }
function cmdEquipar(q) { const item=Player.findItem(q); if(!item){Out.line(`No tienes "${q}".`,'t-dim');return;} Player.equip(item); Out.line(`Equipas: ${item.nombre||item.blueprint}  [${item.tipo}]${item.atk?' ATK+'+item.atk:''}${item.def?' DEF+'+item.def:''}`, item.tipo==='arma'?'t-pel':item.tipo==='armadura'?'t-sis':'t-cor'); refreshStatus(); save(); }
function cmdUsar(q) { const item=Player.findItem(q); if(!item){Out.line(`No tienes "${q}".`,'t-dim');return;} if(typeof ItemSystem!=='undefined'&&ItemSystem.CATALOGO[item.blueprint]){ItemSystem.aplicar(item,null);save();return;} if(item.tipo==='material'&&(item.hunger||item.hp)){if(item.hunger)Player.feed(item.hunger);if(item.hp)Player.heal(item.hp);Player.rmItem(item.id);Out.line(`Usas ${item.nombre||item.blueprint}.`,'t-cra');refreshStatus();save();return;} Out.line(`No puedes usar "${item.nombre||item.blueprint}" directamente.`,'t-dim'); }

function cmdAtacar(q) {
  const n = World.node(Player.pos()); if(!n){return;}
  const qn = (q||'').toLowerCase().replace(/_/g,' ').trim();
  const qh = qn.replace(/^#/, '');
  const npc = findNPC(qn);
  if(npc) {
    const stats = NPCEngine.combatStats(npc);
    const p = Player.get();
    Net.startBattle(n.id, [
      { tipo:'player', id:p.id, name:p.name, hp:p.hp, maxHp:p.maxHp, atk:Player.getAtk(), def:Player.getDef(), nodeId:n.id, playerId:p.id, vivo:true },
      { tipo:'npc', id:npc.id, name:npc.nombre, hp:stats.hp, maxHp:stats.hp, atk:stats.atk, def:stats.def, nodeId:n.id, vivo:true, npc_ref:npc },
    ]);
    return;
  }
  const enemy = qn ? n.enemies?.find(e => {
    const id = String(e?.id || '').toLowerCase();
    const hash = String(e?.imprint?.hash || e?.hash || '').toLowerCase();
    const name = String(e?.nombre || '').toLowerCase();
    return id === qn || hash === qh || name.includes(qn);
  }) : n.enemies?.[0];
  if(!enemy) { Out.line(q?`No hay "${q}" aquí.`:'No hay enemigos aquí.', 't-dim'); return; }
  const p = Player.get();
  Net.startBattle(n.id, [
    { tipo:'player', id:p.id, name:p.name, hp:p.hp, maxHp:p.maxHp, atk:Player.getAtk(), def:Player.getDef(), nodeId:n.id, playerId:p.id, vivo:true },
    { tipo:'enemy', id:enemy.id, name:enemy.nombre, hp:enemy.hp_current||enemy.hp, maxHp:enemy.hp, atk:enemy.atk, def:enemy.def||0, nodeId:n.id, tags:enemy.tags||[], vivo:true },
  ]);
}

function cmdExaminar(q) {
  if(!q) { cmdEstado(); return; }
  const npc = findNPC(q);
  if(npc) { cmdObservar(q); return; }
  const item = Player.findItem(q);
  if(item) { Out.line(`${item.nombre||item.blueprint}  [${item.tipo}]${item.atk?' ATK+'+item.atk:''}${item.def?' DEF+'+item.def:''}${item.poder?' POD:'+item.poder:''}`, 't-out'); Out.line(item.desc||'—','t-dim'); if(item.imprint)Out.line(`Impronta #${item.imprint.hash}  Tensión:${((item.imprint.tension||0)*100).toFixed(0)}%  Muts:${item.imprint.mutations?.join(',')||'—'}`,'t-dim'); return; }
  Out.line(`No encuentras "${q}".`,'t-dim');
}

function cmdEstado() {
  const p = Player.get(); const c = Clock.get(); const n = World.node(Player.pos());
  Out.sp(); Out.line(`— ${p.name} —`, 't-acc');
  Out.line(`HP: ${p.hp}/${p.maxHp}  ATK: ${Player.getAtk()}  DEF: ${Player.getDef()}`, 't-out');
  Out.line(`Hambre: ${p.hunger}/${p.maxHunger||100}  Stamina: ${p.stamina??100}/${p.maxStamina||100}  Maná: ${p.mana??60}/${p.maxMana||60}`, 't-dim');
  Out.line(`Nodo: ${n?.name||'?'}  [${n?.tipo||'?'}]  Ciclo: ${c.cycle} ${c.name}`, 't-dim');
  if((p.heridas||[]).length) Out.line(`Heridas: ${p.heridas.join(', ')}`, 't-pel');
  if(p.equipped?.arma) Out.line(`Arma: ${p.equipped.arma.nombre||p.equipped.arma.blueprint}  Dur:${p.equipped.arma.durabilidad??100}%`, 't-pel');
  if(p.stats) Out.line(`Kills: ${p.stats.kills}  Pasos: ${p.stats.steps}  Forjado: ${p.stats.crafted}`, 't-dim');
  Out.sp();
}

function cmdLegados() {
  if(typeof RunMem === 'undefined') { Out.line('Sin runs previas.','t-dim'); return; }
  Out.sp(); Out.line('— ECOS DE RUNS ANTERIORES —','t-eco');
  const ecos = RunMem.ecos();
  if(!ecos.length){Out.line('Primera run. El mundo no recuerda nada todavía.','t-dim');Out.sp();return;}
  ecos.forEach(e=>{Out.line(`  ${e.nombre}  ·  ${e.ciclos} ciclos  ·  ${e.muerte.causa}  [${e.muerte.phase}]`,'t-eco');if(e.legados?.length)e.legados.forEach(l=>Out.line(`    · ${l.desc}`,'t-dim'));});
  Out.sp();
}

// ── CRIATURAS ─────────────────────────────────────────────────
function cmdCompañeros() {
  const comps = Player.get().ext?.compañeros || Player.get().compañeros || [];
  const max   = Player.getSlot?.('compañeros') || Player.maxComp?.() || 1;
  Out.sp(); Out.line(`— COMPAÑEROS (${comps.length}/${max}) —`, 't-cri');
  if(!comps.length){Out.line('Sin compañeros vinculados.','t-dim');Out.sp();return;}
  comps.forEach(c=>{Out.line(`  ${c.nombre}  [${c.arquetipo}]  HP:${c.hp}/${c.maxHp}  ATK:${c.atk}  modo:${c.modo||'activo'}`, 't-cri');Out.line(`    Tags: ${c.tags?.join(', ')||'—'}  Afinidad:${c.afinidad||0}%`,'t-dim');});
  Out.sp();
}

function cmdCapturar(q) {
  const n = World.node(Player.pos()); if(!n) return;
  const creature = q ? n.creatures?.find(c=>c.nombre.toLowerCase().includes(q.toLowerCase())||c.arquetipo.toLowerCase().includes(q.toLowerCase())) : n.creatures?.[0];
  if(!creature) { Out.line(q?`No hay criatura "${q}" aquí.`:'No hay criaturas aquí.','t-dim'); return; }
  const p = Player.get();
  const comps = p.ext?.compañeros || p.compañeros || [];
  const maxComp = Player.getSlot?.('compañeros') || Player.maxComp?.() || 1;
  if(comps.length >= maxComp) { Out.line(`Slots de compañeros llenos (${comps.length}/${maxComp}).`,'t-dim'); return; }
  Out.sp();
  Out.line(`Intentas capturar a ${creature.nombre}  [${creature.arquetipo}]`, 't-cri', true);
  Out.line(`Voluntad: ${creature.voluntad||50}  HP: ${creature.hp}/${creature.maxHp}`, 't-dim');
  const anclasDef = D.creatures[creature.arquetipo]?.anclas || [];
  const ancla     = p.inventory.find(i=>anclasDef.includes(i.blueprint)&&(i.categoria==='ancla'||D.mat(i.blueprint)?.categoria==='ancla'));
  if(!ancla && anclasDef.length) { Out.line(`Necesitas un ancla compatible: ${anclasDef.join(', ')}`,'t-dim'); return; }
  const voluntad  = creature.voluntad || 50;
  const resistBase= voluntad / 100;
  const resist    = ancla ? resistBase * 0.4 : resistBase;
  if(Math.random() < resist) { Out.line(`${creature.nombre} resiste el vínculo.`,'t-dim'); Out.line('Debilítala más (< 30% HP) o usa un ancla mejor.','t-dim'); return; }
  if(ancla) { Player.rmItem(ancla.id); Out.line(`Ancla consumida: ${ancla.nombre}`, 't-dim'); }
  creature.estado = 'vinculada';
  World.rmCreature(Player.pos(), creature.id);
  if(p.ext?.compañeros) p.ext.compañeros.push(creature);
  else if(p.compañeros) p.compañeros.push(creature);
  if(typeof XP!=='undefined') XP.ganar('criaturas', 40, `captura: ${creature.nombre}`);
  Out.line(`✦ ${creature.nombre} ha sido vinculada.`, 't-cri', true);
  Out.line(`Tags: ${creature.tags?.join(', ')||'—'}  Afinidad: ${creature.afinidad||0}`, 't-dim');
  refreshStatus(); save();
}

function cmdLiberar(q) { const comps=Player.get().ext?.compañeros||Player.get().compañeros||[]; const c=comps.find(x=>x.nombre.toLowerCase().includes((q||'').toLowerCase())); if(!c){Out.line('Compañero no encontrado.','t-dim');return;} if(Player.get().ext?.compañeros)Player.get().ext.compañeros=Player.get().ext.compañeros.filter(x=>x!==c); else if(Player.get().compañeros)Player.get().compañeros=Player.get().compañeros.filter(x=>x!==c); c.estado='libre'; const n=World.node(Player.pos()); if(n){n.creatures=n.creatures||[];n.creatures.push(c);} Out.line(`${c.nombre} vuelve a ser libre.`,'t-cri'); refreshStatus();save(); }
function cmdModo(cQ, modo) { const comps=Player.get().ext?.compañeros||Player.get().compañeros||[]; const c=comps.find(x=>x.nombre.toLowerCase().includes((cQ||'').toLowerCase())); if(!c){Out.line('Compañero no encontrado.','t-dim');return;} const modos=['activo','caza','defensivo','autónomo','latente']; if(!modos.includes(modo)){Out.line(`Modos: ${modos.join(', ')}`,'t-dim');return;} c.modo=modo; Out.line(`${c.nombre} → modo ${modo}`,'t-cri'); save(); }
function cmdNombrarComp(cQ, nuevoNombre) { const comps=Player.get().ext?.compañeros||Player.get().compañeros||[]; const c=comps.find(x=>x.nombre.toLowerCase().includes((cQ||'').toLowerCase())); if(!c||!nuevoNombre){Out.line('nombrar [comp] [nombre]','t-dim');return;} c.nombre=nuevoNombre.trim().slice(0,24); Out.line(`${c.nombre} nombrado.`,'t-cri'); save(); }
function cmdCriar(aQ, bQ) { const comps=Player.get().ext?.compañeros||Player.get().compañeros||[]; const cA=comps.find(x=>x.nombre.toLowerCase().includes((aQ||'').toLowerCase())); const cB=comps.find(x=>x!==cA&&x.nombre.toLowerCase().includes((bQ||'').toLowerCase())); if(!cA||!cB){Out.line('Necesitas dos compañeros diferentes.','t-dim');return;} Out.sp(); Out.line(`Crianza: ${cA.nombre} + ${cB.nombre}`,'t-cri',true); EventBus.emit('creature:breed_result',{parentA:cA,parentB:cB,player:Player.get()}); save(); }
function cmdAnclas() { Out.sp(); Out.line('— ANCLAS —','t-cri'); const anclas=Player.get().inventory.filter(i=>i.categoria==='ancla'||D.mat(i.blueprint)?.categoria==='ancla'); anclas.forEach(a=>Out.line(`  ${a.nombre||a.blueprint}  Tags:${a.tags?.join(',')||D.matTags(a.blueprint).join(',')}`, 't-cri')); if(!anclas.length)Out.line('Sin anclas. Búscalas en el mapa o fórjalas.','t-dim'); Out.sp(); const n=World.node(Player.pos()); if(n?.creatures?.length){Out.line('Criaturas aquí:','t-cri');n.creatures.forEach(c=>{const reqs=D.creatures[c.arquetipo]?.anclas||[];Out.line(`  ${c.nombre}  [${c.arquetipo}]  requiere: ${reqs.join(', ')||'ninguna'}  HP:${c.hp}/${c.maxHp}`,'t-cri');});}Out.sp(); }
function cmdVincular(q, battle) { if(battle){const cre=battle.cola.find(c=>c.tipo==='creature'&&c.vivo&&(!q||c.name.toLowerCase().includes((q||'').toLowerCase())));if(!cre){Out.line('No hay criatura capturble aquí.','t-dim');return;}if(cre.hp/cre.maxHp>0.3){Out.line(`${cre.name} tiene mucha vitalidad (${Math.round(cre.hp/cre.maxHp*100)}%). Debilítala bajo 30%.`,'t-dim');return;}cmdCapturar(cre.name);}else{cmdCapturar(q);} }

// ── MAGIA / HABILIDADES (fallback si plugins no cargados) ─────
function _cmdHabilidadesBasic() { const h=Player.get().habilidades||[]; const max=Player.maxHab?.()|| 3; Out.sp(); Out.line(`— HABILIDADES (${h.length}/${max}) —`,'t-hab'); if(!h.length){Out.line('Ninguna.','t-dim');Out.sp();return;} h.forEach(x=>{Out.line(`  ${x.nombre||x.id}  [${x.efecto}]  val:${x.valor||'—'}`,'t-hab');if(x.desc)Out.line(`    ${x.desc}`,'t-dim');}); Out.sp(); }
function _cmdMagiasBasic() { const m=Player.get().magias||[]; const max=Player.maxMag?.()|| 2; Out.sp(); Out.line(`— MAGIAS (${m.length}/${max}) —`,'t-mag'); if(!m.length){Out.line('Ninguna.','t-dim');Out.sp();return;} m.forEach(x=>{Out.line(`  ${x.nombre||x.id}  cargas:${x.cargas}/${x.cargas_max}  frag:${x.fragilidad||0}%`,'t-mag');}); Out.sp(); }

function cmdLanzarMagia(target) {
  const mags = Player.get().ext?.magias || Player.get().magias || [];
  const mag  = target ? mags.find(m=>m.nombre?.toLowerCase().includes(target.toLowerCase())) : mags.find(m=>m.cargas>0);
  if(!mag) { Out.line('Sin magia disponible.','t-dim'); return; }
  // Delegar a plugin:magias si está cargado
  const ctx = { battle:null, actor:{ atk:Player.getAtk(), playerId:Player.get().id, name:Player.get().name }, mag, target:null, battle:null, isMyTurn:true };
  const result = EventBus.emit('combat:resolve_magia', ctx);
  if(!result?.handled) Out.line(`${mag.nombre} lanzada.`,'t-mag');
  refreshStatus(); save();
}

function cmdRecargarMagia(args) {
  const mags = Player.get().ext?.magias || Player.get().magias || [];
  const mag  = args[0] ? mags.find(m=>m.nombre?.toLowerCase().includes(args[0].toLowerCase())) : mags[0];
  if(!mag) { Out.line('Sin magia que recargar.','t-dim'); return; }
  const mat  = args[1] ? Player.findItem(args[1]) : Player.get().inventory.find(i=>D.matTags(i.blueprint).some(t=>['resonante','corrupto'].includes(t)));
  if(!mat) { Out.line('Necesitas material resonante o corrupto.','t-dim'); return; }
  if(!D.matTags(mat.blueprint).some(t=>['resonante','corrupto'].includes(t))) { Out.line(`${mat.blueprint} no es válido para recargar.`,'t-dim'); return; }
  Player.rmItem(mat.id);
  mag.cargas = Math.min(mag.cargas_max||3, (mag.cargas||0)+2);
  mag.fragilidad = Math.max(0, (mag.fragilidad||0)-20);
  Out.line(`${mag.nombre} recargada. Cargas: ${mag.cargas}/${mag.cargas_max}`, 't-mag');
  save();
}

// ── MAPA ──────────────────────────────────────────────────────
function cmdMapa(args) {
  if(args.length) { /* BFS hacia jugador — simplificado */ const q=args.join(' ').toLowerCase(); const otros=typeof Net!=='undefined'?Object.values(Net.getPlayers()):[]; const target=otros.find(p=>p.name.toLowerCase().includes(q)); if(target){Out.sp();Out.line(`${target.name} está en ${World.node(target.nodeId)?.name||target.nodeId}`, target.color||'t-eco');Out.sp();}else Out.line(`Jugador "${q}" no encontrado.`,'t-dim'); return; }
  Out.sp(); Out.line('— ESTADO DEL MUNDO —','t-acc');
  const total=Object.keys(World.all()).length; const vis=Object.values(World.all()).filter(n=>n.visitado).length;
  Out.line(`Explorados: ${vis}/${total}  Secciones: ${World.sectionCount||0}`, 't-dim');
  const n=World.node(Player.pos()); if(n)Out.line(`Aquí: ${n.name}  [${n.tipo}]${World.isBorder(Player.pos())?' ← FRONTERA':''}`, World.isBorder(Player.pos())?'t-eco':'t-dim');
  if(World.isBorder(Player.pos()))Out.line('Frontera — muévete en dirección sin salida para expandir el mapa.','t-eco');
  Out.sp();
}

// ── PLUGINS / MÓDULOS ─────────────────────────────────────────
function cmdPlugins() { Out.sp(); Out.line('— PLUGINS ACTIVOS —','t-mag'); const pl=PluginLoader.list(); if(!pl.length){Out.line('Ninguno.','t-dim');Out.sp();return;} pl.forEach(p=>{if(p){Out.line(`  ${p.id}  v${p.version}  — ${p.descripcion||'—'}`, 't-mag');const cmds=p.comandos?Object.keys(p.comandos):[];if(cmds.length)Out.line(`    Comandos: ${cmds.join(', ')}`,'t-dim');}}); Out.sp(); }
function cmdModulos() { Out.sp(); Out.line('— MÓDULOS CARGADOS —','t-acc'); ModuleLoader.list().forEach(id=>Out.line(`  ${id}`,'t-dim')); Out.sp(); }
function cmdEventos() { Out.sp(); Out.line('— EVENTOS EventBus —','t-acc'); const evs=Object.keys(EventBus._listeners||{}); evs.forEach(ev=>{Out.line(`  ${ev}  (${EventBus._listeners[ev]?.length||0} listeners)`,'t-dim');}); Out.sp(); }
function cmdCargarModulo(jsonStr) { if(!jsonStr){Out.line('cargar_modulo <JSON>','t-dim');return;} try{const def=JSON.parse(jsonStr);ModuleLoader.apply(def);Out.line(`Módulo "${def.meta?.id||'?'}" cargado.`,'t-cra');save();}catch(e){Out.line(`Error: ${e.message}`,'t-pel');} }
function cmdCargarPlugin(jsonStr) { if(!jsonStr){Out.line('cargar_plugin <JSON>','t-dim');return;} try{const def=JSON.parse(jsonStr);const ok=PluginLoader.registerFromJSON(def);Out.line(ok?`Plugin "${def.id}" cargado.`:`Plugin "${def.id}" ya existe.`,ok?'t-cra':'t-pel');if(ok)save();}catch(e){Out.line(`Error: ${e.message}`,'t-pel');} }

// ── AYUDA ─────────────────────────────────────────────────────
function cmdAyuda(tema) {
  if(!tema) {
    Out.sp(); Out.sep('─'); Out.line('AYUDA — ECOSISTEMA v2.0','t-acc', true); Out.sp();
    const cats = [
      ['MOVIMIENTO','t-sis',['ir n/s/e/o','mirar']],
      ['NARRATIVA','t-npc',['hablar [npc]','preguntar [npc] [tema]','observar [npc]','traicionar [npc]','npcs']],
      ['MISIONES','t-mis',['misiones','aceptar [id]','rechazar [id]','completar [id]']],
      ['ARCOS','t-acc',['arcos  — ver arcos narrativos']],
      ['FORJA','t-hab',['forjar [mat] [mat]','encarnar — habilidades','conjurar — magias','fusionar [id] [id]','recetas · materiales']],
      ['CUERPO & MENTE','t-mag',['habilidades · magias · lanzar · recargar · copiar · canalizar']],
      ['CRIATURAS','t-cri',['criaturas · capturar · liberar · modo · nombrar · criar · anclas']],
      ['COMBATE','t-pel',['atacar [obj] · defender · huir · examinar · tactica · descansar']],
      ['ÍTEMS TÁCTICOS','t-mem',['items · usar [ítem] · reparar [kit]']],
      ['INVENTARIO','t-cra',['inventario · recoger · soltar · equipar']],
      ['FACCIONES','t-sis',['facciones · reputacion']],
      ['BOSSES','t-cor',['bosses']],
      ['MUNDO','t-eco',['mapa [jugador] · secciones']],
      ['XP','t-mem',['experiencia · atributos · asignar [atributo]']],
      ['MULTIJUGADOR','t-eco',['host · conectar [código] · aceptar_conexion [resp]','jugadores · desconectar','comerciar · ofrecer · confirmar_trade']],
      ['SISTEMA','t-dim',['guardar · exportar · importar · nuevo · limpiar · semilla · nombre']],
      ['PLUGINS','t-mag',['plugins · modulos · eventos · cargar_plugin · descargar_plugin']],
    ];
    cats.forEach(([cat,col,cmds]) => { Out.sep('─',24); Out.line(cat, col); Out.line('  '+cmds.join('  ·  '),'t-dim'); });
    Out.sp(); return;
  }
  Out.sp(); Out.line(`Ayuda para "${tema}" — ver referencia de comandos.`,'t-dim'); Out.sp();
}

// ── REPUTACIÓN ────────────────────────────────────────────────
function _cmdReputacion() {
  Out.sp(); Out.line('— REPUTACIÓN —','t-acc');
  const rep = Player.get().reputacion || {};
  const facs = ModuleLoader.get('facciones') || {};
  Object.entries(rep).forEach(([id,v]) => { const f=facs[id]; const rango=typeof FactionSystem!=='undefined'?FactionSystem.getRango(v):{nombre:'Neutral',color:'t-out',icon:'·'}; Out.line(`  ${rango.icon} ${f?.nombre||id}  ${v}  [${rango.nombre}]`, rango.color); });
  Out.sp();
}

// ── TRADE ─────────────────────────────────────────────────────
function _cmdComerciar(args) { if(!Net.isOnline()){Out.line('Necesitas estar conectado.','t-dim');return;} if(!args.length){Out.line('comerciar [nombre_jugador]','t-dim');return;} const tq=args.join(' ').toLowerCase(); const tj=Object.values(Net.getPlayers()).find(x=>x.nodeId===Player.pos()&&x.name.toLowerCase().includes(tq)); if(!tj){Out.line(`${args.join(' ')} no está aquí.`,'t-dim');return;} Net.initTrade(Player.get().id,Player.get().name,tj.id); Net.sendTradeMsg({type:'TRADE_REQUEST',fromId:Player.get().id,fromName:Player.get().name,toId:tj.id}); Out.line(`Solicitud enviada a ${tj.name}.`,'t-mem'); }
function _cmdAceptarTrade() { const trade=Net.getTrade(Player.get().id); if(!trade||trade.estado!=='pendiente'){Out.line('Sin solicitud pendiente.','t-dim');return;} trade.estado='activo';trade.b.nombre=Player.get().name; Net.sendTradeMsg({type:'TRADE_RESPONSE',fromId:Player.get().id,tradeId:trade.id,accepted:true}); Out.line('Comercio aceptado.','t-mem'); Net.renderTrade(trade); }
function _cmdRechazarTrade() { const trade=Net.getTrade(Player.get().id); if(!trade){Out.line('Sin solicitud.','t-dim');return;} trade.estado='cerrado'; Net.sendTradeMsg({type:'TRADE_RESPONSE',fromId:Player.get().id,tradeId:trade.id,accepted:false}); Out.line('Comercio rechazado.','t-dim'); }
function _cmdOfrecer(args) { const trade=Net.getTrade(Player.get().id); if(!trade||trade.estado!=='activo'){Out.line('No hay comercio activo.','t-dim');return;} const item=Player.findItem(args.join(' ')); if(!item){Out.line(`No tienes "${args.join(' ')}".`,'t-dim');return;} const lado=trade.a.playerId===Player.get().id?trade.a:trade.b; if(lado.oferta.find(x=>x.id===item.id)){Out.line('Ya está en oferta.','t-dim');return;} lado.oferta.push(item); Net.sendTradeMsg({type:'TRADE_OFFER',fromId:Player.get().id,tradeId:trade.id,oferta:lado.oferta}); Net.renderTrade(trade); }
function _cmdRetirar(args) { const trade=Net.getTrade(Player.get().id); if(!trade||trade.estado!=='activo'){Out.line('No hay comercio activo.','t-dim');return;} const lado=trade.a.playerId===Player.get().id?trade.a:trade.b; const idx=lado.oferta.findIndex(i=>(i.nombre||i.blueprint).toLowerCase().includes(args.join(' ').toLowerCase())); if(idx<0){Out.line('No está en oferta.','t-dim');return;} lado.oferta.splice(idx,1); Net.sendTradeMsg({type:'TRADE_OFFER',fromId:Player.get().id,tradeId:trade.id,oferta:lado.oferta}); Net.renderTrade(trade); }
function _cmdConfirmarTrade() { const trade=Net.getTrade(Player.get().id); if(!trade||trade.estado!=='activo'){Out.line('No hay comercio activo.','t-dim');return;} const lado=trade.a.playerId===Player.get().id?trade.a:trade.b; lado.confirmado=true; Net.sendTradeMsg({type:'TRADE_CONFIRM',fromId:Player.get().id,tradeId:trade.id}); if(trade.a.confirmado&&trade.b.confirmado)Net.handleTradeMsg({type:'TRADE_CONFIRM',fromId:Player.get().id,tradeId:trade.id}); else Out.line('Esperando confirmación del otro jugador...','t-mem'); }
function _cmdCancelarTrade() { const trade=Net.getTrade(Player.get().id); if(!trade){Out.line('Sin comercio.','t-dim');return;} trade.estado='cerrado'; Net.sendTradeMsg({type:'TRADE_CANCEL',fromId:Player.get().id,tradeId:trade.id}); Out.line('Comercio cancelado.','t-dim'); }
