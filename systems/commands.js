// ════════════════════════════════════════════════════════════════
// COMMANDS — Dispatch y todos los comandos del juego
// ════════════════════════════════════════════════════════════════

// ── Helpers de búsqueda ───────────────────────────────────────
function findNPC(q) {
  if(!q) return null;
  return pickTarget(q, GS.npcEnNodo(Player.pos()), {
    name: n => n?.nombre,
    id:   n => n?.id,
    hash: n => n?.imprint?.hash || n?.hash,
  }) || null;
}
function findNPCMundo(q) {
  if(!q) return null;
  return pickTarget(q, GS.aliveNPCs(), {
    name: n => n?.nombre,
    id:   n => n?.id,
    hash: n => n?.imprint?.hash || n?.hash,
  }) || null;
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

function targetHash(o) {
  const raw = String(o?.imprint?.hash || o?.hash || o?.id || '').trim();
  return raw ? raw.slice(0, 6).toUpperCase() : '';
}
function normTarget(q) {
  return String(q||'').toLowerCase().replace(/_/g,' ').trim();
}
function pickTarget(q, list, opts = {}) {
  const query = normTarget(q);
  if(!list?.length) return null;
  if(!query) return list[0] || null;

  const scored = list.map(t => {
    const name = String(opts.name?.(t) ?? t.nombre ?? t.name ?? '').toLowerCase();
    const id   = String(opts.id?.(t) ?? t.id ?? '').toLowerCase();
    const hash = String(opts.hash?.(t) ?? t.hash ?? t.imprint?.hash ?? '').toLowerCase();
    const qh   = query.replace(/^#/, '');
    const short = hash ? hash.slice(0, 6) : '';
    let score = 0;
    if(id && id === query) score = 1000;
    else if(hash && hash === qh) score = 900;
    else if(short && short === qh) score = 875;
    else if(name === query) score = 850;
    else if(id && id.startsWith(query)) score = 760;
    else if(name.startsWith(query)) score = 700;
    else if(name.includes(query)) score = 600 - Math.max(0, name.indexOf(query));
    return { t, score };
  }).filter(x => x.score > 0);

  if(!scored.length) return null;
  scored.sort((a,b) => b.score - a.score);
  return scored[0].t;
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

    if(actor?._concentracion_pendiente?.acciones?.length) {
      Out.line('Tu cadena de concentración estaba en espera y se ejecutará ahora.', 't-acc');
      Net.sendBattleAction(battle.id, Player.get().id, 'concentracion_resolver', null);
      return;
    }

    if(['atacar','a','atk'].includes(verb))    { Net.sendBattleAction(battle.id,Player.get().id,'atacar',args.join(' ')||null); return; }
    if(verb==='defender'||verb==='d')           { Net.sendBattleAction(battle.id,Player.get().id,'defender',null); return; }
    if(['magia','lanzar_b'].includes(verb))     { Net.sendBattleAction(battle.id,Player.get().id,'magia',args.join(' ')||null); return; }
    if(['habilidad','hab_b'].includes(verb))    { Net.sendBattleAction(battle.id,Player.get().id,'habilidad',args.join(' ')||null); return; }
    if(verb==='concentracion'||verb==='concentración') { Net.sendBattleAction(battle.id,Player.get().id,'concentracion',args.join(' ')||null); return; }
    if(verb==='interiorizar')                   { Net.sendBattleAction(battle.id,Player.get().id,'interiorizar',args.join(' ')||null); return; }
    if(verb==='transformar')                    { Net.sendBattleAction(battle.id,Player.get().id,'transformar',args.join(' ')||null); return; }
    if(verb==='vincular') {
      if(typeof cmdVincular!=='undefined') cmdVincular(args.join(' ') || null, battle);
      else Out.line('No puedes vincular ahora.', 't-dim');
      return;
    }
    if(verb==='usar') {
      const item = Player.findItem(args.join(' '));
      if(item && typeof ItemSystem!=='undefined' && ItemSystem.CATALOGO[item.blueprint]) { ItemSystem.aplicar(item,battle); refreshStatus(); Net.sendBattleAction(battle.id,Player.get().id,'defender',null); return; }
      Out.line('No puedes usar eso en batalla.','t-dim'); return;
    }
    if(verb==='copiar')    { if(typeof cmdCopiar!=='undefined')    cmdCopiar(args);    return; }
    if(verb==='canalizar') { if(typeof cmdCanalizar!=='undefined') cmdCanalizar(args); return; }
    Out.line('Tu turno: atacar [variante] · defender [variante] · magia [variante] · habilidad [variante] · concentración ... | ... · interiorizar · transformar · vincular · usar · copiar · canalizar · huir · examinar', 't-pel');
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
    case 'mapa': case 'map': cmdMapa(args); break;
    case 'secciones':         cmdMapa(['secciones']); break;

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

    case 'musica': case 'music': cmdMusica(args); break;
    case 'sfx':                 cmdSfx(args); break;
    case 'plugins':     cmdPlugins(); break;
    case 'plugins_orden': cmdPluginsOrden(); break;
    case 'plugins_pendientes': cmdPluginsPendientes(); break;
    case 'servicios':   cmdServicios(); break;
    case 'modulos':     cmdModulos(); break;
    case 'eventos':     cmdEventos(); break;
    case 'eventos_trace': cmdEventosTrace(args[0]); break;
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
function _enterNode(dest, opts = {}) {
  const {
    tick = 1,
    showLook = true,
    saveAfter = true,
    grantXP = true,
  } = opts;

  Player.setPos(dest);
  Clock.tick(tick);
  EventBus.emit('player:tick', { player:Player.get() });
  World.visit(dest);

  const nodoActual = World.node(dest);
  if(grantXP) {
    if(!nodoActual?.visitado_prev) {
      nodoActual.visitado_prev = true;
      if(typeof XP!=='undefined') XP.ganar('exploración', 10 + (nodoActual?.seccion||0)*5, 'nodo nuevo');
      if(nodoActual?.dificultad >= 2.5) Out.line(`⚠ ZONA HOSTIL — Enemigos ×${(nodoActual.dificultad||1).toFixed(1)}`, 't-pel');
    } else if(typeof XP !== 'undefined') { XP.ganar('exploración', 2, 'movimiento'); }
  }

  EventBus.emit('world:tick', { cycle:Clock.cycle });
  GS.aliveNPCs().forEach(n => {
    if(U.chance(0.12)) n.desesperacion = U.clamp(n.desesperacion + U.rand(1,5), 0, 100);
    if(U.chance(0.07)) n.corrupcion    = U.clamp(n.corrupcion    + U.rand(1,3), 0, 100);
    if(n.desesperacion >= 90 && U.chance(0.15)) setTimeout(() => NPCEngine.consecuenciaDesperación(n), 500);
  });

  if(showLook) cmdMirar();
  if(saveAfter) save();
  return dest;
}

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
  _enterNode(dest, { tick:1, showLook:true, saveAfter:true, grantXP:true });
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
  if(n.enemies?.length)  Out.line(`Entidades: ${n.enemies.map(e=>`${e.nombre}#${targetHash(e)||'—'}(HP:${e.hp_current||e.hp})`).join(', ')}`, 't-pel');
  if(n.creatures?.length) Out.line(`Criaturas: ${n.creatures.map(c=>`${c.nombre}#${targetHash(c)||'—'}[${c.arquetipo}]`).join(', ')}`, 't-cri');

  const npcs = GS.npcEnNodo(Player.pos());
  if(npcs.length) {
    Out.sp();
    npcs.forEach(npc => {
      const tag = npc.estado !== 'vivo' ? ` [${npc.estado.toUpperCase()}]` : '';
      Out.line(`▷ ${npc.nombre}  #${targetHash(npc)||'—'}  [${npc.arq_vis}]${tag}${npc.misiones_ofrecidas?.length?' ◈':''}`, 't-npc');
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
function cmdNPCs() { Out.sp(); Out.line('— PERSONAS DEL MUNDO —','t-acc'); const todos=Object.values(GS.npcs); if(!todos.length){Out.line('Nadie encontrado.','t-dim');return;} const vivos=todos.filter(n=>['vivo','sometido','hostil'].includes(n.estado)); vivos.forEach(npc=>{const aqui=npc.nodeId===Player.pos(); Out.line(`  ${npc.nombre}  #${targetHash(npc)||'—'}  [${npc.arq_vis}]${npc.estado!=='vivo'?' ['+npc.estado.toUpperCase()+']':''}  ${aqui?'← AQUÍ':World.node(npc.nodeId)?.name||'?'}  Leal:${npc.lealtad}`,aqui?'t-npc':'t-dim');if(npc.arq_ocu_expuesto)Out.line(`       Real: ${npc.arq_ocu.toUpperCase()}`,'t-twi');}); const perdidos=todos.filter(n=>!['vivo','sometido','hostil'].includes(n.estado)); if(perdidos.length){Out.sp();Out.line('Perdidos:','t-pel');perdidos.forEach(n=>Out.line(`  ✝ ${n.nombre} #${targetHash(n)||'—'} [${n.arq_vis}] ${n.estado.toUpperCase()}`,'t-pel'));} Out.sp(); }

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

function cmdFusionar(args) {
  if(args.length<2){Out.line('fusionar [id1] [id2] ...','t-dim');return;}
  const items=args.map(q=>Player.findItem(q)||Player.findHab?.(q)||Player.findMag?.(q)).filter(Boolean);
  if(items.length<2){Out.line(`Solo encontré ${items.length} ítem(s).`,'t-dim');return;}
  const allTags=items.flatMap(i=>i.tags||[]);
  const tension=Tags.tension(allTags);
  Out.sp(); Out.line('CONVERGENCIA — FUSIÓN','t-cor',true);
  Out.line(`Tensión: ${(tension*100).toFixed(0)}%`,tension>.6?'t-pel':'t-dim');
  if(tension>.8){
    Out.line('Tensión demasiado alta. Colapso.','t-pel');
    items.forEach(i=>{Player.rmItem(i.id);Player.rmHab?.(i.id);Player.rmMag?.(i.id);});
    const d=Player.damage(U.rand(10,25));Out.line(`−${d} HP`,'t-pel');refreshStatus();save();return;
  }
  const rng=U.rng(Date.now());
  const pena=1-tension*0.3;
  const totalAtk=Math.floor(items.reduce((s,i)=>s+(i.atk||0)+(i.valor||0)*0.5,0)*pena);
  const totalDef=Math.floor(items.reduce((s,i)=>s+(i.def||0),0)*pena);
  const totalPoder=Math.floor(items.reduce((s,i)=>s+(i.poder||0),0)*pena);
  const muts=D.narrative?.mutaciones||[];
  const tier=tension>.55?'inestable':items.length>=4?'sublime':'estable';
  const adj=tier==='inestable'?['Inestable','Corrupta','Fragmentada']:tier==='sublime'?['Ascendida','Soberana','Arcana']:['Convergente','Primordial','Eterna'];
  const nombre=`${U.pick(adj,rng)} ${muts.length?U.pick(muts,rng):'Reliquia'}`;
  const imp=Imprint.gen('reliquia_viva',allTags,{nodeId:Player.pos(),cycle:Clock.cycle,pid:Player.get().id},tension);
  const tieneHab=items.some(i=>i.tipo==='habilidad');
  const tieneMag=items.some(i=>i.tipo==='magia');
  const tipoResultado = (items.some(i=>['casco','guantes','peto','botas','accesorio'].includes(i.tipo)) && U.chance(0.45)) ? 'accesorio' : 'mítico';
  const rel={
    id:U.uid(),blueprint:'reliquia_viva',nombre,tipo:tipoResultado,tags:allTags.slice(0,6),imprint:imp,estado:'convergente',es_mitico:tipoResultado==='mítico',
    atk:totalAtk,def:totalDef,poder:totalPoder,efecto_pasivo:tieneHab&&tieneMag?'+1_slot_magia':tieneHab?'atk_bonus':tieneMag?'mana_max':null,
    encantamientos: U.pickN(['filo espectral','piel de eco','núcleo vacío','chispa ancestral','trama umbral'], 1 + (items.length>=4?1:0), rng),
    encarnaciones: U.pickN(['eco del guardián','voz fractal','instinto antiguo','sombra binaria'], tension>.45?2:1, rng),
    desc:`Convergencia ${tier}. Tensión:${(tension*100).toFixed(0)}%.`,
  };
  if(rel.tipo==='accesorio'){
    rel.raridad = tension>.5 ? 'legendario' : (items.length>=4 ? 'épico' : 'raro');
    const pool = [
      { stat:'atk', valor:2 }, { stat:'def', valor:2 }, { stat:'crit', valor:5 }, { stat:'evasion', valor:5 },
      { stat:'mana_max', valor:8 }, { stat:'stamina_max', valor:10 },
    ];
    rel.efecto_accesorio = U.pick(pool, rng);
  }
  items.forEach(i=>{Player.rmItem(i.id);Player.rmHab?.(i.id);Player.rmMag?.(i.id);});
  Player.addItem(rel);
  if(typeof XP!=='undefined'){XP.ganar('forja',60+items.length*10,'fusión ontológica');XP.ganar('mente',30,'convergencia');}
  Out.line(`${rel.nombre}  [${rel.tipo.toUpperCase()}]`,'t-cor',true);
  if(rel.atk)Out.line(`ATK +${rel.atk}`,'t-pel');
  if(rel.def)Out.line(`DEF +${rel.def}`,'t-sis');
  if(rel.efecto_pasivo)Out.line(`Efecto pasivo: ${rel.efecto_pasivo}`,'t-cor');
  if(rel.efecto_accesorio)Out.line(`Accesorio: +${rel.efecto_accesorio.valor} ${rel.efecto_accesorio.stat}`,'t-mag');
  Out.line(`Encantamientos: ${rel.encantamientos.join(', ')}`,'t-mag');
  Out.line(`Encarnaciones: ${rel.encarnaciones.join(', ')}`,'t-hab');
  Out.sp(); refreshStatus(); save();
}

function cmdRecetas() { Out.sp(); Out.line('— GUÍA DE AFINIDADES —','t-acc'); Object.entries(D.tagAff||{}).forEach(([k,v])=>Out.line(`  ${k.padEnd(28)} → ${v.resultado}  (${v.fuerza})`,'t-dim')); Out.sp(); Out.line('Tags opuestos:','t-out'); (D.tagOpp||[]).forEach(([a,b])=>Out.line(`  ${a} ↔ ${b}`,'t-dim')); Out.sp(); }
function cmdMateriales() { Out.sp(); Out.line('— MATERIALES —','t-acc'); const cats={}; Object.entries(D.mats||{}).forEach(([id,m])=>{const c=m.categoria||'físico';if(!cats[c])cats[c]=[];cats[c].push(id);}); Object.entries(cats).forEach(([cat,ids])=>{Out.line(cat,'t-acc');ids.forEach(id=>{const m=D.mat(id);Out.line(`  ${id.padEnd(24)} [${m?.tags?.join(',')||'—'}]`,'t-dim');});}); Out.sp(); }

// ── INVENTARIO Y OBJETOS ──────────────────────────────────────
function cmdInv() { Out.sp(); Out.line('— INVENTARIO —','t-acc'); const p=Player.get(); const inv=p.inventory; if(!inv.length){Out.line('Vacío.','t-dim');Out.sp();return;} const grupos={}; inv.forEach(i=>{const g=i.tipo||'misc';if(!grupos[g])grupos[g]=[];grupos[g].push(i);}); Object.entries(grupos).forEach(([g,items])=>{const col=g==='arma'?'t-pel':g==='armadura'||['casco','guantes','peto','botas'].includes(g)?'t-sis':g==='magia'?'t-mag':g==='habilidad'?'t-hab':g==='mítico'?'t-cor':g==='reliquia'||g==='accesorio'?'t-cor':g==='material'?'t-cra':'t-out'; Out.line(`${g.toUpperCase()} (${items.length}):`,col); items.forEach(i=>Out.line(`  ${i.nombre||i.blueprint}${i.imprint?' #'+i.imprint.hash.slice(0,4):''}${i.atk?' ATK+'+i.atk:''}${i.def?' DEF+'+i.def:''}${i.durabilidad!=null&&i.tipo==='arma'?' Dur:'+i.durabilidad+'%':''}${i.efecto_accesorio?`  +${i.efecto_accesorio.valor} ${i.efecto_accesorio.stat}`:''}`,col));}); if(p.equipped){Out.sp();Out.line('Equipado:','t-acc'); const eq=p.equipped; const slots=[['Casco','casco'],['Guantes','guantes'],['Peto','peto'],['Botas','botas'],['Mano I','mano_izquierda'],['Mano D','mano_derecha'],['Accesorio 1','accesorio_1'],['Accesorio 2','accesorio_2']]; slots.forEach(([label,key])=>{if(eq[key])Out.line(`  ${label}: ${eq[key].nombre||eq[key].blueprint}`,'t-dim');}); if(eq.mitico)Out.line(`  Mítico: ${eq.mitico.nombre||eq.mitico.blueprint}`,'t-cor'); if((p._resonance?.habilidades||[]).length){Out.line('Resonancias ocultas:','t-mag'); p._resonance.habilidades.forEach(h=>Out.line(`  ✦ ${h}`,'t-mag'));}} Out.sp(); }
function cmdRecoger(q) { const n=World.node(Player.pos()); if(!n){return;} const lootStr=n.loot.find(l=>typeof l==='string'&&l.toLowerCase().includes((q||'').toLowerCase())); const lootItem=n.loot._items?.find(i=>(i.nombre||i.blueprint).toLowerCase().includes((q||'').toLowerCase())); if(!lootStr&&!lootItem){Out.line(`No hay "${q||'nada'}" aquí.`,'t-dim');const lootNames=n.loot.filter(l=>typeof l==='string');if(lootNames.length)Out.line(`Objetos: ${lootNames.join(', ')}`,'t-cra');return;} if(lootItem){Player.addItem({...lootItem,id:U.uid()});n.loot._items=n.loot._items.filter(i=>i!==lootItem);World.rmLoot(Player.pos(),lootItem.blueprint);Out.line(`Recoges: ${lootItem.nombre}`,'t-cra');}else{const mat=D.mat(lootStr);Player.addItem({id:U.uid(),blueprint:lootStr,nombre:lootStr.replace(/_/g,' '),tipo:'material',tags:D.matTags(lootStr),estado:'nativo',desc:mat?.desc});World.rmLoot(Player.pos(),lootStr);Out.line(`Recoges: ${lootStr.replace(/_/g,' ')}`,'t-cra');} if(Player.get()._duplicar_loot){const dup={...Player.get().inventory.slice(-1)[0],id:U.uid()};Player.addItem(dup);Player.get()._duplicar_loot=false;Out.line('Duplicado.','t-mag');} if(typeof XP!=='undefined')XP.ganar('exploración',3,'objeto recogido'); refreshStatus();save(); }
function cmdSoltar(q) { const item=Player.findItem(q); if(!item){Out.line(`No tienes "${q}".`,'t-dim');return;} Player.rmItem(item.id); const n=World.node(Player.pos()); if(n){n.loot=n.loot||[];n.loot.push(item.blueprint);} Out.line(`Sueltas: ${item.nombre||item.blueprint}`,'t-dim'); save(); }
function cmdEquipar(q) {
  const raw=(q||'').trim();
  if(!raw){Out.line('equipar [item] o equipar [slot] [item]','t-dim');return;}
  const tokens=raw.split(/\s+/);
  const posiblesSlots=['casco','guantes','peto','botas','mano_izquierda','mano_derecha','mh','md','accesorio_1','accesorio_2','acc1','acc2'];
  const isSlot=posiblesSlots.includes(tokens[0].toLowerCase());
  const slot = isSlot ? tokens[0] : null;
  const query = isSlot ? tokens.slice(1).join(' ') : raw;
  const item=Player.findItem(query);
  if(!item){Out.line(`No tienes "${query}".`,'t-dim');return;}
  Player.equip(item, slot);
  Out.line(`Equipas: ${item.nombre||item.blueprint}  [${item.tipo}]${item.atk?' ATK+'+item.atk:''}${item.def?' DEF+'+item.def:''}`, item.tipo==='arma'?'t-pel':['armadura','casco','guantes','peto','botas'].includes(item.tipo)?'t-sis':'t-cor');
  const res = Player.get()._resonance?.habilidades || [];
  if(res.length) Out.line(`Resonancia activa: ${res[res.length-1]}`, 't-mag');
  refreshStatus(); save();
}
function cmdUsar(q) { const item=Player.findItem(q); if(!item){Out.line(`No tienes "${q}".`,'t-dim');return;} if(typeof ItemSystem!=='undefined'&&ItemSystem.CATALOGO[item.blueprint]){ItemSystem.aplicar(item,null);save();return;} if(item.tipo==='material'&&(item.hunger||item.hp)){if(item.hunger)Player.feed(item.hunger);if(item.hp)Player.heal(item.hp);Player.rmItem(item.id);Out.line(`Usas ${item.nombre||item.blueprint}.`,'t-cra');refreshStatus();save();return;} Out.line(`No puedes usar "${item.nombre||item.blueprint}" directamente.`,'t-dim'); }

function cmdAtacar(q) {
  const n = World.node(Player.pos()); if(!n){return;}
  const qn = (q||'').toLowerCase().replace(/_/g,' ').trim();
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
  const enemy = pickTarget(qn, n.enemies || [], {
    name: e => e?.nombre,
    id:   e => e?.id,
    hash: e => e?.imprint?.hash || e?.hash,
  }) || n.enemies?.[0];
  if(enemy) {
    const p = Player.get();
    Net.startBattle(n.id, [
      { tipo:'player', id:p.id, name:p.name, hp:p.hp, maxHp:p.maxHp, atk:Player.getAtk(), def:Player.getDef(), nodeId:n.id, playerId:p.id, vivo:true },
      { tipo:'enemy', id:enemy.id, name:enemy.nombre, hp:enemy.hp_current||enemy.hp, maxHp:enemy.hp, atk:enemy.atk, def:enemy.def||0, nodeId:n.id, tags:enemy.tags||[], vivo:true, imprint:enemy.imprint||null, hash:enemy.hash||null },
    ]);
    return;
  }

  const creature = pickTarget(qn, n.creatures || [], {
    name: c => c?.nombre,
    id:   c => c?.id,
    hash: c => c?.imprint?.hash || c?.hash,
  }) || n.creatures?.[0];
  if(!creature) { Out.line(q?`No hay "${q}" aquí.`:'No hay enemigos o criaturas aquí.', 't-dim'); return; }
  const p = Player.get();
  Net.startBattle(n.id, [
    { tipo:'player', id:p.id, name:p.name, hp:p.hp, maxHp:p.maxHp, atk:Player.getAtk(), def:Player.getDef(), nodeId:n.id, playerId:p.id, vivo:true },
    { tipo:'creature', id:creature.id, name:creature.nombre, hp:creature.hp_current||creature.hp, maxHp:creature.maxHp||creature.hp, atk:creature.atk||4, def:creature.def||0, nodeId:n.id, tags:creature.tags||[], vivo:true, _cre_ref:creature, imprint:creature.imprint||null, hash:creature.hash||null },
  ]);
}


function cmdExaminar(q) {
  if(!q) { cmdEstado(); return; }
  const npc = findNPC(q);
  if(npc) { cmdObservar(q); return; }
  const item = Player.findItem(q);
  if(item) {
    const nombre = item.nombre || item.blueprint || 'objeto';
    const tipo = item.tipo || item.categoria || 'desconocido';
    const pares = [
      ['Blueprint', item.blueprint],
      ['ID', item.id],
      ['Tipo', tipo],
      ['Categoría', item.categoria],
      ['Estado', item.estado],
      ['Raridad', item.raridad],
      ['Slot', item.slot || item.slot_preferido],
      ['ATK', item.atk],
      ['DEF', item.def],
      ['Poder', item.poder],
      ['Crit', item.crit],
      ['Evasión', item.evasion],
      ['Valor', item.valor],
      ['Efecto', item.efecto],
      ['Elemento', item.elemento],
      ['Duración', item.dur],
      ['Durabilidad', item.durabilidad != null ? `${item.durabilidad}%` : null],
      ['Cargas', (item.cargas != null || item.cargas_max != null) ? `${item.cargas ?? '?'} / ${item.cargas_max ?? '?'}` : null],
      ['Fragilidad', item.fragilidad != null ? `${item.fragilidad}%` : null],
      ['NPC origen', item.npc_origen],
      ['Forjado', item.forjado ? 'sí' : null],
    ].filter(([, v]) => v != null && String(v).trim() !== '');

    Out.sp();
    Out.line(`— EXAMINAR OBJETO: ${nombre} —`, 't-out', true);
    if(item.desc) Out.line(item.desc, 't-dim');
    else Out.line('Sin descripción.', 't-dim');

    pares.forEach(([k, v]) => Out.line(`  ${k}: ${v}`, 't-out'));

    if(Array.isArray(item.tags) && item.tags.length) {
      Out.line(`  Tags: ${item.tags.join(', ')}`, 't-cra');
    }

    if(item.efecto_accesorio?.stat || item.efecto_accesorio?.valor != null) {
      const ea = item.efecto_accesorio;
      Out.line(`  Efecto accesorio: ${ea.stat || '—'}${ea.valor != null ? ` +${ea.valor}` : ''}`, 't-mag');
    }

    if(item._elemento_temporal) {
      const durEl = item._elemento_dur != null ? ` (${item._elemento_dur} uso${item._elemento_dur===1?'':'s'})` : '';
      Out.line(`  Infusión temporal: ${item._elemento_temporal}${durEl}`, 't-mag');
    }

    if(item.imprint) {
      Out.line(`  Impronta: #${item.imprint.hash || '—'}`, 't-dim');
      if(item.imprint.tension != null) Out.line(`  Tensión de impronta: ${((item.imprint.tension||0)*100).toFixed(0)}%`, 't-dim');
      if(item.imprint.seed != null) Out.line(`  Seed: ${item.imprint.seed}`, 't-dim');
      if(item.imprint.mutations?.length) Out.line(`  Mutaciones: ${item.imprint.mutations.join(', ')}`, 't-dim');
      else Out.line('  Mutaciones: —', 't-dim');
    }

    const extras = Object.keys(item)
      .filter(k => ![
        'id','blueprint','nombre','tipo','categoria','estado','raridad','slot','slot_preferido',
        'atk','def','poder','crit','evasion','valor','efecto','elemento','dur','durabilidad',
        'cargas','cargas_max','fragilidad','npc_origen','forjado','desc','tags','efecto_accesorio',
        '_elemento_temporal','_elemento_dur','imprint'
      ].includes(k))
      .sort();
    if(extras.length) Out.line(`  Extras: ${extras.join(', ')}`, 't-dim');
    Out.sp();
    return;
  }
  Out.line(`No encuentras "${q}".`,'t-dim');
}

function cmdEstado() {
  const p = Player.get(); const c = Clock.get(); const n = World.node(Player.pos());
  Out.sp(); Out.line(`— ${p.name} —`, 't-acc');
  Out.line(`ID: ${p.id||'—'}  Clase: ${p.clase||'—'}  Nivel: ${p.level??1}`, 't-dim');
  Out.line(`HP: ${p.hp}/${p.maxHp}  ATK: ${Player.getAtk()}  DEF: ${Player.getDef()}`, 't-out');
  Out.line(`Hambre: ${p.hunger}/${p.maxHunger||100}  Stamina: ${p.stamina??100}/${p.maxStamina||100}  Maná: ${p.mana??60}/${p.maxMana||60}`, 't-dim');
  Out.line(`Nodo: ${n?.name||'?'}  [${n?.tipo||'?'}]  ID:${Player.pos()||'?'}  Ciclo: ${c.cycle} ${c.name}`, 't-dim');

  const attrs = p.attrs || p.atributos;
  if(attrs && typeof attrs === 'object') {
    const attrsTxt = Object.entries(attrs).map(([k,v]) => `${k}:${v}`).join(' · ');
    if(attrsTxt) Out.line(`Atributos: ${attrsTxt}`, 't-acc');
  }

  if((p.heridas||[]).length) Out.line(`Heridas: ${p.heridas.join(', ')}`, 't-pel');
  else Out.line('Heridas: ninguna', 't-dim');

  const eq = p.equipped || {};
  const slotsEq = ['arma','mano_izquierda','mano_derecha','casco','peto','guantes','botas','accesorio'];
  Out.line('Equipo:', 't-sis');
  slotsEq.forEach(slot => {
    const it = eq[slot];
    if(!it) return Out.line(`  ${slot}: —`, 't-dim');
    const nom = it.nombre || it.blueprint || 'objeto';
    const dur = it.durabilidad != null ? ` · Dur:${it.durabilidad}%` : '';
    const stats = `${it.atk?` · ATK+${it.atk}`:''}${it.def?` · DEF+${it.def}`:''}`;
    Out.line(`  ${slot}: ${nom}${stats}${dur}`, 't-sis');
  });

  const inv = p.inventory || [];
  Out.line(`Inventario: ${inv.length} objeto(s)`, 't-cra');
  if(inv.length) {
    const resumen = {};
    inv.forEach(i => {
      const t = i.tipo || i.categoria || 'varios';
      resumen[t] = (resumen[t] || 0) + 1;
    });
    const invTxt = Object.entries(resumen).map(([k,v]) => `${k}:${v}`).join(' · ');
    Out.line(`  Por tipo: ${invTxt}`, 't-dim');
  }

  const habs = p.ext?.habilidades || p.habilidades || [];
  const mags = p.ext?.magias || p.magias || [];
  Out.line(`Habilidades: ${habs.length}  ·  Magias: ${mags.length}`, 't-hab');
  if(mags.length) {
    const magsTxt = mags.slice(0, 5).map(m => `${m.nombre||m.id||'magia'}(${m.cargas??'?'}${m.cargas_max!=null?`/${m.cargas_max}`:''})`).join(' · ');
    Out.line(`  Magias: ${magsTxt}${mags.length>5?' · ...':''}`, 't-mag');
  }

  const comps = p.ext?.compañeros || p.compañeros || [];
  Out.line(`Compañeros: ${comps.length}`, 't-cri');
  if(comps.length) {
    Out.line(`  ${comps.map(x => `${x.nombre||x.id||'comp'} [${x.modo||'activo'}]`).join(' · ')}`, 't-dim');
  }

  if((p._resonance?.habilidades||[]).length) Out.line(`Resonancias: ${p._resonance.habilidades.join(' · ')}`, 't-mag');
  if(p.stats) Out.line(`Stats: Kills:${p.stats.kills||0}  Pasos:${p.stats.steps||0}  Forjado:${p.stats.crafted||0}`, 't-dim');

  if(p.ext && typeof p.ext === 'object') {
    const extKeys = Object.keys(p.ext).sort();
    if(extKeys.length) Out.line(`Extensiones activas: ${extKeys.join(', ')}`, 't-mem');
  }
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
  const creature = pickTarget(q, n.creatures || [], {
    name: c => `${c?.nombre||''} ${c?.arquetipo||''}`.trim(),
    id:   c => c?.id,
    hash: c => c?.imprint?.hash || c?.hash,
  }) || n.creatures?.[0];
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
  if(!ancla && anclasDef.length) Out.line(`Necesitas un ancla compatible: ${anclasDef.join(', ')}`,'t-dim');
  Out.line('Debilítala a < 30% HP y usa "vincular [ancla]".', 't-dim');
  const battleCreature = { ...creature, hp_current: creature.hp_current || creature.hp || creature.maxHp };
  Net.startBattle(n.id, [
    { tipo:'player', id:p.id, name:p.name, hp:p.hp, maxHp:p.maxHp, atk:Player.getAtk(), def:Player.getDef(), nodeId:n.id, playerId:p.id, vivo:true },
    { tipo:'creature', id:battleCreature.id, name:battleCreature.nombre, hp:battleCreature.hp_current, maxHp:battleCreature.maxHp||battleCreature.hp, atk:battleCreature.atk||4, def:battleCreature.def||0, nodeId:n.id, tags:battleCreature.tags||[], vivo:true, _cre_ref:creature, imprint:battleCreature.imprint||null, hash:battleCreature.hash||null },
  ]);
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
function _sectionId(node) {
  return Number.isFinite(node?.seccion) ? node.seccion : 0;
}

function _dirDelta(dir) {
  if(dir === 'norte') return [0, -1];
  if(dir === 'sur') return [0, 1];
  if(dir === 'este') return [1, 0];
  if(dir === 'oeste') return [-1, 0];
  return [0, 0];
}

function _renderMiniMapa(sectionId) {
  const nodes = Object.values(World.all()).filter(n => _sectionId(n) === sectionId);
  const explorados = nodes.filter(n => n.visitado);
  if(!explorados.length) {
    Out.line('Mini-mapa: sin nodos explorados en esta sección todavía.', 't-dim');
    return;
  }

  const pos = {};
  const ocupados = new Set();
  const key = (x, y) => `${x},${y}`;
  const startId = explorados.find(n => n.id === Player.pos())?.id || explorados[0].id;

  pos[startId] = { x:0, y:0 };
  ocupados.add(key(0, 0));
  const q = [startId];

  while(q.length) {
    const id = q.shift();
    const p = pos[id];
    const exits = World.exits(id) || {};
    for(const [dir, to] of Object.entries(exits)) {
      const dst = World.node(to);
      if(!dst || _sectionId(dst) !== sectionId || !dst.visitado || pos[to]) continue;
      const [dx, dy] = _dirDelta(dir);
      let nx = p.x + dx;
      let ny = p.y + dy;
      let tries = 0;
      while(ocupados.has(key(nx, ny)) && tries < 8) {
        nx += dx || 1;
        ny += dy || 1;
        tries++;
      }
      pos[to] = { x:nx, y:ny };
      ocupados.add(key(nx, ny));
      q.push(to);
    }
  }

  const ubicados = explorados.filter(n => pos[n.id]);
  const xs = ubicados.map(n => pos[n.id].x);
  const ys = ubicados.map(n => pos[n.id].y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = maxX - minX + 1;
  const H = maxY - minY + 1;
  const grid = Array.from({ length:H }, () => Array.from({ length:W }, () => '·'));

  for(const node of ubicados) {
    const p = pos[node.id];
    const gx = p.x - minX;
    const gy = p.y - minY;
    let c = '■';
    if(node.id === Player.pos()) c = '✦';
    else if(World.isBorder(node.id)) c = '▣';
    grid[gy][gx] = c;
  }

  Out.line('Mini-mapa (✦ tú · ■ explorado · ▣ frontera):', 't-eco');
  grid.forEach(row => Out.line(`  ${row.join(' ')}`, 't-dim'));
}

function _renderMapaSecciones() {
  const bySection = {};
  Object.values(World.all()).forEach(n => {
    const id = _sectionId(n);
    if(!bySection[id]) bySection[id] = { total:0, vis:0, current:false };
    bySection[id].total++;
    if(n.visitado) bySection[id].vis++;
    if(n.id === Player.pos()) bySection[id].current = true;
  });

  const sections = Object.keys(bySection).map(Number).sort((a,b)=>a-b);
  if(!sections.length) {
    Out.line('Sin secciones disponibles.', 't-dim');
    return;
  }

  Out.line('— MAPA DE SECCIONES —', 't-acc');
  sections.forEach(id => {
    const s = bySection[id];
    const marca = s.current ? ' ✦' : '';
    Out.line(`Sección ${id}${marca}: ${s.vis}/${s.total} explorados`, s.current ? 't-eco' : 't-dim');
  });
  Out.sp();

  sections.forEach(id => {
    Out.line(`Sección ${id}:`, 't-acc');
    _renderMiniMapa(id);
    Out.sp();
  });
}

function cmdMapa(args) {
  const sub = (args[0] || '').toLowerCase();
  if(sub === 'secciones') {
    Out.sp();
    _renderMapaSecciones();
    return;
  }

  if(args.length) { /* BFS hacia jugador — simplificado */ const q=args.join(' ').toLowerCase(); const otros=typeof Net!=='undefined'?Object.values(Net.getPlayers()):[]; const target=otros.find(p=>p.name.toLowerCase().includes(q)); if(target){Out.sp();Out.line(`${target.name} está en ${World.node(target.nodeId)?.name||target.nodeId}`, target.color||'t-eco');Out.sp();}else Out.line(`Jugador "${q}" no encontrado.`,'t-dim'); return; }
  Out.sp(); Out.line('— ESTADO DEL MUNDO —','t-acc');
  const total=Object.keys(World.all()).length; const vis=Object.values(World.all()).filter(n=>n.visitado).length;
  Out.line(`Explorados: ${vis}/${total}  Secciones: ${World.sectionCount||0}`, 't-dim');
  const n=World.node(Player.pos()); if(n)Out.line(`Aquí: ${n.name}  [${n.tipo}]${World.isBorder(Player.pos())?' ← FRONTERA':''}`, World.isBorder(Player.pos())?'t-eco':'t-dim');
  _renderMiniMapa(_sectionId(n));
  if(World.isBorder(Player.pos()))Out.line('Frontera — muévete en dirección sin salida para expandir el mapa.','t-eco');
  Out.sp();
}

// ── PLUGINS / MÓDULOS ─────────────────────────────────────────
function cmdPlugins() { Out.sp(); Out.line('— PLUGINS ACTIVOS —','t-mag'); const pl=PluginLoader.list(); if(!pl.length){Out.line('Ninguno.','t-dim');Out.sp();return;} pl.forEach(p=>{if(p){Out.line(`  ${p.id}  v${p.version}  — ${p.descripcion||'—'}`, 't-mag');const cmds=p.comandos?Object.keys(p.comandos):[];if(cmds.length)Out.line(`    Comandos: ${cmds.join(', ')}`,'t-dim');}}); Out.sp(); }
function cmdPluginsOrden() { Out.sp(); Out.line('— ORDEN DE RESOLUCIÓN (último batch) —','t-acc'); const ids=PluginLoader.lastBatchOrder?.()||[]; if(!ids.length){Out.line('Sin datos de batch aún.','t-dim');Out.sp();return;} ids.forEach((id,i)=>Out.line(`  ${String(i+1).padStart(2,'0')}. ${id}`,'t-dim')); Out.sp(); }
function cmdPluginsPendientes() { Out.sp(); Out.line('— PLUGINS PENDIENTES —','t-pel'); const pp=PluginLoader.pending?.()||[]; if(!pp.length){Out.line('Sin plugins pendientes por dependencias.','t-dim');Out.sp();return;} pp.forEach(p=>{Out.line(`  ${p.id}`,'t-pel'); (p.errors||[]).forEach(e=>Out.line(`    - ${e}`,'t-dim'));}); Out.sp(); }
function cmdServicios() { Out.sp(); Out.line('— SERVICIOS RUNTIME —','t-acc'); const sv=typeof ServiceRegistry!=='undefined'?ServiceRegistry.list():[]; if(!sv.length){Out.line('Sin servicios registrados.','t-dim');Out.sp();return;} sv.forEach(s=>Out.line(`  ${s.name}  [${s.pluginId}]  v${s.version||'0.0.0'}`,'t-dim')); Out.sp(); }
function cmdModulos() { Out.sp(); Out.line('— MÓDULOS CARGADOS —','t-acc'); ModuleLoader.list().forEach(id=>Out.line(`  ${id}`,'t-dim')); Out.sp(); }
function cmdEventos() { Out.sp(); Out.line('— EVENTOS EventBus —','t-acc'); const evs=EventBus.events?.()||[]; evs.forEach(ev=>{const n=EventBus.listeners?.(ev)?.length||0; Out.line(`  ${ev}  (${n} listeners)`,'t-dim');}); Out.sp(); }
function cmdEventosTrace(nRaw) { const n=Number(nRaw)||20; Out.sp(); Out.line(`— TRACE EventBus (últimos ${n}) —`,'t-acc'); const rows=EventBus.trace?.(n)||[]; if(!rows.length){Out.line('Sin trazas.','t-dim');Out.sp();return;} rows.forEach(t=>Out.line(`  #${t.id} ${t.event} :: ${t.pluginId} [${t.phase}] ${t.ms}ms ${t.ok?'OK':'ERR'}`,(t.ok?'t-dim':'t-pel'))); Out.sp(); }
function cmdCargarModulo(jsonStr) { if(!jsonStr){Out.line('cargar_modulo <JSON>','t-dim');return;} try{const def=JSON.parse(jsonStr);ModuleLoader.apply(def);Out.line(`Módulo "${def.meta?.id||'?'}" cargado.`,'t-cra');save();}catch(e){Out.line(`Error: ${e.message}`,'t-pel');} }
function cmdCargarPlugin(jsonStr) { if(!jsonStr){Out.line('cargar_plugin <JSON>','t-dim');return;} try{const def=JSON.parse(jsonStr);const ok=PluginLoader.registerFromJSON(def);Out.line(ok?`Plugin "${def.id}" cargado.`:`Plugin "${def.id}" ya existe.`,ok?'t-cra':'t-pel');if(ok)save();}catch(e){Out.line(`Error: ${e.message}`,'t-pel');} }

function cmdMusica(args) {
  if(typeof MusicEngine === 'undefined') { Out.line('Sistema de música no disponible.','t-dim'); return; }
  MusicEngine.cmd(args||[]);
}

function cmdSfx(args) {
  if(typeof SFXEngine === 'undefined') { Out.line('Sistema de SFX no disponible.','t-dim'); return; }
  SFXEngine.cmd(args||[]);
}

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
      ['MUNDO','t-eco',['mapa · mapa [jugador] · mapa secciones · secciones']],
      ['XP','t-mem',['experiencia · atributos · asignar [atributo]']],
      ['MULTIJUGADOR','t-eco',['host · conectar [código] · aceptar_conexion [resp]','jugadores · desconectar','comerciar · ofrecer · confirmar_trade']],
      ['AUDIO','t-mag',['musica estado · musica on · musica off · musica midi · sfx estado · sfx on · sfx off · sfx test']],
      ['SISTEMA','t-dim',['guardar · exportar · importar · nuevo · limpiar · semilla · nombre']],
      ['PLUGINS','t-mag',['plugins · plugins_orden · plugins_pendientes · servicios · modulos · eventos · eventos_trace [n] · cargar_plugin · descargar_plugin']],
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

if(typeof ServiceRegistry !== 'undefined') {
  ServiceRegistry.register('gameplay.command.dispatch', (verb, args=[]) => dispatch({ verb:String(verb||'').toLowerCase(), args, raw:[verb, ...args].join(' ') }), { pluginId:'core', version:'2.1.0' });
  ServiceRegistry.register('gameplay.move', (dir) => cmdIr(dir), { pluginId:'core', version:'2.1.0' });
  ServiceRegistry.register('gameplay.look', () => cmdMirar(), { pluginId:'core', version:'2.1.0' });
  ServiceRegistry.register('gameplay.enter_node', (dest, opts={}) => _enterNode(dest, opts), { pluginId:'core', version:'2.1.0' });
  ServiceRegistry.register('gameplay.move_and_tick', (dir) => cmdIr(dir), { pluginId:'core', version:'2.1.0' });
  ServiceRegistry.register('gameplay.combat.attack', (target='') => cmdAtacar(target), { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.battle.start', (nodeId, actors=[]) => {
    if(typeof Net==='undefined' || !nodeId || !Array.isArray(actors) || !actors.length) return false;
    Net.startBattle(nodeId, actors);
    return true;
  }, { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.battle.current', () => {
    if(typeof Net==='undefined') return null;
    return Net.getMyBattle?.() || null;
  }, { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.battle.actor', (battle) => {
    if(typeof Net==='undefined') return null;
    return Net.getBattleActor?.(battle) || null;
  }, { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.combat.action', (battleId, playerId, action, payload=null) => {
    if(!battleId || !playerId || !action || typeof Net==='undefined') return false;
    Net.sendBattleAction(battleId, playerId, action, payload);
    return true;
  }, { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.combat.escape', (battle, playerId) => {
    if(!battle?.id || !playerId || typeof Net==='undefined') return false;
    Net.sendBattleAction(battle.id, playerId, 'huir', null);
    return true;
  }, { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.capture.start', (target='') => cmdCapturar(target), { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.craft.forge', (args=[]) => cmdForjar(args, null), { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.craft.embody', (args=[]) => cmdForjar(args, 'corporal'), { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.craft.conjure', (args=[]) => cmdForjar(args, 'mágico'), { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.trade.start', (args=[]) => _cmdComerciar(args), { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.trade.accept', () => _cmdAceptarTrade(), { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.trade.reject', () => _cmdRechazarTrade(), { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.trade.offer', (args=[]) => _cmdOfrecer(args), { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.trade.withdraw', (args=[]) => _cmdRetirar(args), { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.trade.confirm', () => _cmdConfirmarTrade(), { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.trade.cancel', () => _cmdCancelarTrade(), { pluginId:'core', version:'2.2.0' });
}
