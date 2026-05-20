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

function _svc(name) {
  return (typeof ServiceRegistry !== 'undefined' && typeof ServiceRegistry.get === 'function')
    ? ServiceRegistry.get(name)
    : null;
}
function _serviceApi(name) {
  const fn = _svc(name);
  return typeof fn === 'function' ? fn() : null;
}
// Helpers de batalla. Acceden a la maquina via ServiceRegistry. Los
// servicios gameplay.battle.* y runtime.battle.* los registra este mismo
// archivo al cargar (linea ~1132); por eso no necesitamos fallbacks a Net.
// La extraccion completa de la maquina a un plugin propio es deuda
// documentada en docs/ontogical.md.
function _battleCurrent() {
  const getBattle = _svc('gameplay.battle.current');
  return typeof getBattle === 'function' ? getBattle() : null;
}
function _battleActor(battle) {
  const getActor = _svc('gameplay.battle.actor');
  return typeof getActor === 'function' ? getActor(battle) : null;
}
function _battleRender(battle=null) {
  const render = _svc('runtime.battle.render');
  return typeof render === 'function' ? !!render(battle) : false;
}
function _battleAction(battleId, playerId, action, payload=null) {
  const send = _svc('runtime.battle.action') || _svc('gameplay.combat.action');
  return typeof send === 'function' ? !!send(battleId, playerId, action, payload) : false;
}
function _battleTickAI(battle) {
  const tickAI = _svc('runtime.battle.tick_ai');
  return typeof tickAI === 'function' ? !!tickAI(battle) : false;
}
async function _playerRest() {
  const rest = _svc('runtime.player.rest');
  if(typeof rest === 'function') return !!(await rest());
  if(typeof TacticsRef().cmdDescansar !== 'function') return false;
  await TacticsRef().cmdDescansar();
  return true;
}
function _playerTactic() {
  const tactica = _svc('runtime.player.tactic');
  if(typeof tactica === 'function') return !!tactica();
  if(typeof TacticsRef().cmdTactica !== 'function') return false;
  TacticsRef().cmdTactica();
  return true;
}
function _xpShowAttrs() {
  const attrs = _svc('runtime.xp.show_attrs');
  if(typeof attrs === 'function') return !!attrs();
  if(typeof XPRef().cmdAtributos !== 'function') return false;
  XPRef().cmdAtributos();
  return true;
}
function _xpShowExp() {
  const exp = _svc('runtime.xp.show_exp');
  if(typeof exp === 'function') return !!exp();
  if(typeof XPRef().cmdExperiencia !== 'function') return false;
  XPRef().cmdExperiencia();
  return true;
}
function _xpAssign(raw='') {
  const assign = _svc('runtime.xp.assign');
  if(typeof assign === 'function') return !!assign(raw);
  if(typeof XPRef().cmdAsignar !== 'function') return false;
  XPRef().cmdAsignar(String(raw || ''));
  if(typeof save === 'function') save();
  return true;
}
function _dispatchDomainMovement(verb, args) {
  const movement = {
    'ir': ()=>cmdIr(args[0]),
    'go': ()=>cmdIr(args[0]),
    'n': ()=>cmdIr('norte'),
    's': ()=>cmdIr('sur'),
    'e': ()=>cmdIr('este'),
    'o': ()=>cmdIr('oeste'),
    'mirar': ()=>cmdMirar(),
    'l': ()=>cmdMirar(),
    'ver': ()=>cmdMirar(),
    'mapa': ()=>cmdMapa(args),
    'map': ()=>cmdMapa(args),
    'secciones': ()=>cmdMapa(['secciones']),
  };
  const fn = movement[verb];
  if(!fn) return false;
  fn();
  return true;
}

function _globalApi(name) {
  if(typeof globalThis !== 'undefined' && globalThis[name]) return globalThis[name];
  if(typeof window !== 'undefined' && window[name]) return window[name];
  return null;
}
const NetRef = () => _globalApi('Net') || {};
const XPRef = () => _serviceApi('runtime.xp.api') || {};
const TacticsRef = () => _serviceApi('runtime.tactics.api') || {};
const ArcEngineRef = () => _serviceApi('runtime.arc.api') || {};
const FactionSystemRef = () => _globalApi('FactionSystem') || {};
const ItemSystemRef = () => _serviceApi('runtime.items.api') || {};
const NPCEngineRef = () => _serviceApi('runtime.npc.api') || {};
const ForgeRef = () => _serviceApi('runtime.forge.api') || {};

function _memoryRuns() {
  const fn = _svc('runtime.memory.runs');
  return typeof fn === 'function' ? (fn() || []) : (typeof RunMem !== 'undefined' ? RunMem.runs() : []);
}
function _memoryEcos() {
  const fn = _svc('runtime.memory.ecos');
  return typeof fn === 'function' ? (fn() || []) : (typeof RunMem !== 'undefined' ? RunMem.ecos() : []);
}
function _itemsCatalog() {
  const fn = _svc('runtime.items.catalog');
  return typeof fn === 'function' ? (fn() || {}) : (ItemSystemRef().CATALOGO || {});
}
function _itemsApply(item, battle=null) {
  const fn = _svc('runtime.items.apply');
  if(typeof fn === 'function') return !!fn(item, battle);
  return typeof ItemSystemRef().aplicar === 'function' ? !!ItemSystemRef().aplicar(item, battle) : false;
}
function _itemsShow() {
  const fn = _svc('runtime.items.show');
  if(typeof fn === 'function') return !!fn();
  return typeof ItemSystemRef().cmdItems === 'function' ? !!ItemSystemRef().cmdItems() : false;
}
function _npcDialogue(npc) {
  const fn = _svc('runtime.npc.dialogue');
  return typeof fn === 'function' ? fn(npc, _memoryRuns()) : NPCEngineRef().dialogo?.(npc, _memoryRuns()) || '';
}
function _npcInteract(npc) {
  const fn = _svc('runtime.npc.interact');
  return typeof fn === 'function' ? fn(npc) : NPCEngineRef().interactuar?.(npc);
}
function _npcCheckTwists(npc) {
  const fn = _svc('runtime.npc.check_twists');
  return typeof fn === 'function'
    ? (fn(npc, Player.get(), GS.allMisiones(), _memoryEcos()) || [])
    : (NPCEngineRef().checkTwists?.(npc, Player.get(), GS.allMisiones(), _memoryEcos(), []) || []);
}
function _npcGenMission(npc) {
  const fn = _svc('runtime.npc.gen_mission');
  return typeof fn === 'function' ? fn(npc, GS.aliveNPCs(), _memoryEcos()) : NPCEngineRef().genMision?.(npc, GS.aliveNPCs(), _memoryEcos()) || null;
}
function _npcObserve(npc) {
  const fn = _svc('runtime.npc.observe');
  return typeof fn === 'function' ? (fn(npc) || []) : (NPCEngineRef().observar?.(npc) || []);
}
function _npcDespair(npc) {
  const fn = _svc('runtime.npc.despair');
  if(typeof fn === 'function') return !!fn(npc);
  return typeof NPCEngineRef().consecuenciaDesperación === 'function' ? !!NPCEngineRef().consecuenciaDesperación(npc) : false;
}
function _npcCombatStats(npc) {
  const fn = _svc('runtime.npc.combat_stats');
  return typeof fn === 'function' ? (fn(npc) || { hp:20, atk:5, def:1 }) : (NPCEngineRef().combatStats?.(npc) || { hp:20, atk:5, def:1 });
}
function _arcShow() {
  const fn = _svc('runtime.arc.show');
  if(typeof fn === 'function') return !!fn();
  return typeof ArcEngineRef().cmdArcs === 'function' ? !!ArcEngineRef().cmdArcs() : false;
}
function _arcTryGenerate(npc) {
  const fn = _svc('runtime.arc.try_generate');
  if(typeof fn === 'function') return fn(npc);
  return typeof ArcEngineRef().intentarGenArc === 'function' ? ArcEngineRef().intentarGenArc(npc) : null;
}
function _arcOnMissionResolved(mision) {
  const fn = _svc('runtime.arc.on_mission_resolved');
  if(typeof fn === 'function') return !!fn(mision);
  return typeof ArcEngineRef().onMisionResuelta === 'function' ? !!ArcEngineRef().onMisionResuelta(mision) : false;
}
function _forgeRun(ids, ctx, nodeEstado, phaseName, modo) {
  const fn = _svc('runtime.forge.run');
  if(typeof fn === 'function') return fn(ids, ctx, nodeEstado, phaseName, modo);
  return typeof ForgeRef().Forge?.forjar === 'function' ? ForgeRef().Forge.forjar(ids, ctx, nodeEstado, phaseName, modo) : { cancelled:true };
}

// ── Dispatch principal ────────────────────────────────────────
async function dispatch(cmd) {
  const { verb, args } = cmd;

  const pre = EventBus.emitCancellable?.('command:before', { verb, args, cancelled:false });
  if(pre?.cancelled) return;

  if(typeof Net !== 'undefined' && NetRef().isClient()) NetRef().sendAction(verb, args);

  // ── Batalla por turnos activa ───────────────────────────────
  const battle = _battleCurrent();
  if(battle && battle.estado === 'activo') {
    const actor      = _battleActor(battle);
    const esMiTurno  = actor?.playerId === Player.get().id;

    if(verb==='batalla'||verb==='b')    { _battleRender(battle); return; }
    if(verb==='examinar'||verb==='ex')  {
      const q = (args[0]||'').toLowerCase();
      const t = battle.cola.find(c=>!q||c.name.toLowerCase().includes(q));
      if(t) { const el=t.elemento_estado?` [${t.elemento_estado}]`:''; const poise=t.poise!=null?` P:${t.poise}/${t.poise_max||50}`:''; Out.line(`${t.name}  HP:${t.hp}/${t.maxHp}  ATK:${t.atk}  DEF:${t.def||0}${poise}${el}${t.poise_roto?' ⚡VULNERABLE':''}`, t.color||'t-out'); }
      else Out.line('No encontrado.', 't-dim');
      return;
    }
    if(verb==='estado'||verb==='stats') { cmdEstado(); return; }
    if(verb==='ayuda'||verb==='help'||verb==='?') { cmdAyuda(args.join(' ')); return; }
    if(verb==='tactica'||verb==='táctica') { _playerTactic(); return; }
    if(verb==='huir'||verb==='h') { _battleAction(battle.id,Player.get().id,'huir',null); Combat.active=false; return; }

    if(!esMiTurno) {
      if(battle._aiThinking) { Out.line(`⏳ ${actor?.name||'IA'} está actuando...`, 't-dim'); return; }
      if(actor?.tipo !== 'player') { Out.line(`⏳ Turno de ${actor.name} — procesando...`, 't-dim'); setTimeout(()=>_battleTickAI(battle),100); return; }
      Out.line(`⧗ Turno de ${actor?.name||'IA'}. Espera — o escribe "huir".`, 't-dim');
      return;
    }

    if(actor?._concentracion_pendiente?.acciones?.length) {
      Out.line('Tu cadena de concentración estaba en espera y se ejecutará ahora.', 't-acc');
      _battleAction(battle.id, Player.get().id, 'concentracion_resolver', null);
      return;
    }

    if(['atacar','a','atk'].includes(verb))    { _battleAction(battle.id,Player.get().id,'atacar',args.join(' ')||null); return; }
    if(verb==='defender'||verb==='d')           { _battleAction(battle.id,Player.get().id,'defender',null); return; }
    if(['magia','lanzar_b'].includes(verb))     { _battleAction(battle.id,Player.get().id,'magia',args.join(' ')||null); return; }
    if(['habilidad','hab_b'].includes(verb))    { _battleAction(battle.id,Player.get().id,'habilidad',args.join(' ')||null); return; }
    if(verb==='concentracion'||verb==='concentración') { _battleAction(battle.id,Player.get().id,'concentracion',args.join(' ')||null); return; }
    if(verb==='interiorizar')                   { _battleAction(battle.id,Player.get().id,'interiorizar',args.join(' ')||null); return; }
    if(verb==='transformar')                    { _battleAction(battle.id,Player.get().id,'transformar',args.join(' ')||null); return; }
    if(verb==='vincular') {
      if(typeof cmdVincular!=='undefined') cmdVincular(args.join(' ') || null, battle);
      else Out.line('No puedes vincular ahora.', 't-dim');
      return;
    }
    if(verb==='usar') {
      const item = Player.findItem(args.join(' '));
      if(item && _itemsCatalog()[item.blueprint]) { _itemsApply(item, battle); refreshStatus(); _battleAction(battle.id,Player.get().id,'defender',null); return; }
      Out.line('No puedes usar eso en batalla.','t-dim'); return;
    }
    if(verb==='copiar')    { if(typeof cmdCopiar!=='undefined')    cmdCopiar(args);    return; }
    if(verb==='canalizar') { if(typeof cmdCanalizar!=='undefined') cmdCanalizar(args); return; }
    Out.line('Tu turno: atacar [variante] · defender [variante] · magia [variante] · habilidad [variante] · concentración ... | ... · interiorizar · transformar · vincular · usar · copiar · canalizar · huir · examinar', 't-pel');
    return;
  }

  // ── Router principal — plugins y core registrados ──────────────
  if(await CommandRegistry.run(verb, args)) { EventBus.emit('command:after',{verb,args}); return; }

  // ── Fallback: movimiento (antes de que los plugins registren) ──
  if(_dispatchDomainMovement(verb, args)) { EventBus.emit('command:after',{verb,args}); return; }

  // ── Fallback: comandos core sin plugin activo ───────────────────
  switch(verb) {
    // MAPA (fallback — también registrado como core command)
    case 'mapa': case 'map': cmdMapa(args); break;
    case 'secciones':        cmdMapa(['secciones']); break;

    // COMBATE (cross-cutting — también registrado como core command)
    case 'atacar': case 'atk':  cmdAtacar(args.join(' ')); break;
    case 'examinar': case 'ex': cmdExaminar(args.join(' ')); break;
    case 'estado': case 'stats': cmdEstado(); break;
    case 'batalla': { const b=_battleCurrent(); if(!b){Out.line('No estás en batalla.','t-dim');break;} _battleRender(b); break; }
    case 'defender': { const b=_battleCurrent(); if(!b){Out.line('No estás en batalla.','t-dim');break;} _battleAction(b.id,Player.get().id,'defender',null); break; }

    // LEGADOS / ECOS (cross-cutting)
    case 'legados': case 'ecos': cmdLegados(); break;

    // RED / MULTIJUGADOR (también registrado como core command)
    case 'conectar': case 'host': case 'iniciar':
      if(args.length) await NetRef().connect(args.join('')); else await NetRef().host(); break;
    case 'aceptar_conexion': await NetRef().acceptConexion(args[0], args[1]||null); break;
    case 'desconectar': NetRef().disconnect(); break;
    case 'jugadores': case 'red': case 'net': NetRef().cmdJugadores(); break;
    case 'unirse_batalla': { const b=Object.values(NetRef().battles||{}).find(x=>x.nodeId===Player.pos()&&x.estado==='activo'); if(!b){Out.line('No hay batalla activa aquí.','t-dim');break;} NetRef().joinBattle(b.id); break; }

    case 'comerciar': _cmdComerciar(args); break;
    case 'aceptar_trade': _cmdAceptarTrade(); break;
    case 'rechazar_trade': _cmdRechazarTrade(); break;
    case 'ofrecer': _cmdOfrecer(args); break;
    case 'retirar': _cmdRetirar(args); break;
    case 'confirmar_trade': _cmdConfirmarTrade(); break;
    case 'cancelar_trade': _cmdCancelarTrade(); break;

    // AUDIO (también registrado como core command)
    case 'musica': case 'music': cmdMusica(args); break;
    case 'sfx':                  cmdSfx(args); break;

    // SISTEMA / PLUGINS (también registrado como core command)
    case 'plugins':             cmdPlugins(); break;
    case 'plugins_orden':       cmdPluginsOrden(); break;
    case 'plugins_pendientes':  cmdPluginsPendientes(); break;
    case 'servicios':           cmdServicios(); break;
    case 'modulos':             cmdModulos(); break;
    case 'eventos':             cmdEventos(); break;
    case 'eventos_trace':       cmdEventosTrace(args[0]); break;
    case 'cargar_modulo':       cmdCargarModulo(args.join(' ')); break;
    case 'cargar_plugin':       cmdCargarPlugin(args.join(' ')); break;
    case 'descargar_plugin':    PluginLoader.unregister(args[0]); Out.line(`Plugin "${args[0]}" descargado.`,'t-mem'); break;

    // GUARDADO / SESIÓN
    case 'guardar': case 'save':   save(); Out.line('Guardado.','t-cra'); break;
    case 'exportar': case 'export': exportarPartida(); break;
    case 'importar': case 'import': importarPartida(); break;
    case 'semilla': Out.line(`Semilla: ${World.seed}`,'t-sis'); break;
    case 'nombre':
      if(args.length) { const n=args.join(' ').trim().replace(/[<>&"]/g,'').slice(0,24); if(n.length>=2){ Player.rename(n); Out.line(`Nombre: ${Player.get().name}`,'t-npc'); if(NetRef().isClient()) NetRef().sendAction('nombre',[n]); } else Out.line('El nombre debe tener al menos 2 caracteres.','t-dim'); }
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
      if(typeof XPRef().ganar === 'function') XPRef().ganar('exploración', 10 + (nodoActual?.seccion||0)*5, 'nodo nuevo');
      if(nodoActual?.dificultad >= 2.5) Out.line(`⚠ ZONA HOSTIL — Enemigos ×${(nodoActual.dificultad||1).toFixed(1)}`, 't-pel');
    } else if(typeof XPRef().ganar === 'function') { XPRef().ganar('exploración', 2, 'movimiento'); }
  }

  EventBus.emit('world:tick', { cycle:Clock.cycle });
  GS.aliveNPCs().forEach(n => {
    if(U.chance(0.12)) n.desesperacion = U.clamp(n.desesperacion + U.rand(1,5), 0, 100);
    if(U.chance(0.07)) n.corrupcion    = U.clamp(n.corrupcion    + U.rand(1,3), 0, 100);
    if(n.desesperacion >= 90 && U.chance(0.15)) setTimeout(() => _npcDespair(n), 500);
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
    const otros = NetRef().playersEnNodo(Player.pos());
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
      NetRef().startBattle(n.id, [
        { tipo:'player', id:p.id, name:p.name, hp:p.hp, maxHp:p.maxHp, atk:Player.getAtk(), def:Player.getDef(), nodeId:n.id, playerId:p.id, vivo:true },
        { tipo:'enemy',  id:e.id, name:e.nombre, hp:e.hp_current||e.hp, maxHp:e.hp, atk:e.atk, def:e.def||0, nodeId:n.id, tags:e.tags||[], vivo:true },
      ]);
    }, 350);
  }
}

// cmdHablar/cmdPreguntar/cmdObservar/cmdTraicionar/cmdNPCs/cmdMisiones/
// cmdLegados/cmdAceptar/cmdRechazar/cmdCompletar migrados a
// plugins/plugin-npcs.js (C2 del audit SOLID). El wiring vive en
// plugin-npcs.comandos y CommandRegistry los resuelve por nombre.

// ── FORJA (migrada a plugins/plugin-forja.js en C2) ──────────
// Las globales cmdForjar/cmdFusionar/cmdRecetas/cmdMateriales viven
// ahora en plugin-forja con la misma API publica via CommandRegistry.

// ── INVENTARIO Y OBJETOS ──────────────────────────────────────
function cmdInv() { Out.sp(); Out.line('— INVENTARIO —','t-acc'); const p=Player.get(); const inv=p.inventory; if(!inv.length){Out.line('Vacío.','t-dim');Out.sp();return;} const grupos={}; inv.forEach(i=>{const g=i.tipo||'misc';if(!grupos[g])grupos[g]=[];grupos[g].push(i);}); Object.entries(grupos).forEach(([g,items])=>{const col=g==='arma'?'t-pel':g==='armadura'||['casco','guantes','peto','botas'].includes(g)?'t-sis':g==='magia'?'t-mag':g==='habilidad'?'t-hab':g==='mítico'?'t-cor':g==='reliquia'||g==='accesorio'?'t-cor':g==='material'?'t-cra':'t-out'; Out.line(`${g.toUpperCase()} (${items.length}):`,col); items.forEach(i=>Out.line(`  ${i.nombre||i.blueprint}${i.imprint?' #'+i.imprint.hash.slice(0,4):''}${i.atk?' ATK+'+i.atk:''}${i.def?' DEF+'+i.def:''}${i.durabilidad!=null&&i.tipo==='arma'?' Dur:'+i.durabilidad+'%':''}${i.efecto_accesorio?`  +${i.efecto_accesorio.valor} ${i.efecto_accesorio.stat}`:''}`,col));}); if(p.equipped){Out.sp();Out.line('Equipado:','t-acc'); const eq=p.equipped; const slots=[['Casco','casco'],['Guantes','guantes'],['Peto','peto'],['Botas','botas'],['Mano I','mano_izquierda'],['Mano D','mano_derecha'],['Accesorio 1','accesorio_1'],['Accesorio 2','accesorio_2']]; slots.forEach(([label,key])=>{if(eq[key])Out.line(`  ${label}: ${eq[key].nombre||eq[key].blueprint}`,'t-dim');}); if(eq.mitico)Out.line(`  Mítico: ${eq.mitico.nombre||eq.mitico.blueprint}`,'t-cor'); if((p._resonance?.habilidades||[]).length){Out.line('Resonancias ocultas:','t-mag'); p._resonance.habilidades.forEach(h=>Out.line(`  ✦ ${h}`,'t-mag'));}} Out.sp(); }
function cmdRecoger(q) { const n=World.node(Player.pos()); if(!n){return;} const lootStr=n.loot.find(l=>typeof l==='string'&&l.toLowerCase().includes((q||'').toLowerCase())); const lootItem=n.loot._items?.find(i=>(i.nombre||i.blueprint).toLowerCase().includes((q||'').toLowerCase())); if(!lootStr&&!lootItem){Out.line(`No hay "${q||'nada'}" aquí.`,'t-dim');const lootNames=n.loot.filter(l=>typeof l==='string');if(lootNames.length)Out.line(`Objetos: ${lootNames.join(', ')}`,'t-cra');return;} if(lootItem){Player.addItem({...lootItem,id:U.uid()});n.loot._items=n.loot._items.filter(i=>i!==lootItem);World.rmLoot(Player.pos(),lootItem.blueprint);Out.line(`Recoges: ${lootItem.nombre}`,'t-cra');}else{const mat=D.mat(lootStr);Player.addItem({id:U.uid(),blueprint:lootStr,nombre:lootStr.replace(/_/g,' '),tipo:'material',tags:D.matTags(lootStr),estado:'nativo',desc:mat?.desc});World.rmLoot(Player.pos(),lootStr);Out.line(`Recoges: ${lootStr.replace(/_/g,' ')}`,'t-cra');} if(Player.get()._duplicar_loot){const dup={...Player.get().inventory.slice(-1)[0],id:U.uid()};Player.addItem(dup);Player.get()._duplicar_loot=false;Out.line('Duplicado.','t-mag');} if(typeof XPRef().ganar === 'function') XPRef().ganar('exploración',3,'objeto recogido'); refreshStatus();save(); }
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
function cmdUsar(q) { const item=Player.findItem(q); if(!item){Out.line(`No tienes "${q}".`,'t-dim');return;} if(_itemsCatalog()[item.blueprint]){_itemsApply(item,null);save();return;} if(item.tipo==='material'&&(item.hunger||item.hp)){if(item.hunger)Player.feed(item.hunger);if(item.hp)Player.heal(item.hp);Player.rmItem(item.id);Out.line(`Usas ${item.nombre||item.blueprint}.`,'t-cra');refreshStatus();save();return;} Out.line(`No puedes usar "${item.nombre||item.blueprint}" directamente.`,'t-dim'); }
function cmdReparar(args) { const q=(args||[])[0]; const kit=q?Player.findItem(q):Player.get().inventory.find(i=>['kit_reparacion','kit_maestro','lima_afilado'].includes(i.blueprint)); if(!kit){Out.line('No tienes kit de reparación.','t-dim');return;} if(_itemsApply(kit,null))save(); }

// cmdAtacar/cmdExaminar migrados a plugins/plugin-battle-engine.js (C2)

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

// ── CRIATURAS migradas a plugins/plugin-criaturas.js (C2) ────
// Las globales cmdCompañeros/Capturar/Liberar/Modo/NombrarComp/Criar/
// Anclas/Vincular viven ahora en plugin-criaturas con la misma API
// publica via CommandRegistry.


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

  if(args.length) { /* BFS hacia jugador — simplificado */ const q=args.join(' ').toLowerCase(); const otros=typeof Net!=='undefined'?Object.values(NetRef().getPlayers()):[]; const target=otros.find(p=>p.name.toLowerCase().includes(q)); if(target){Out.sp();Out.line(`${target.name} está en ${World.node(target.nodeId)?.name||target.nodeId}`, target.color||'t-eco');Out.sp();}else Out.line(`Jugador "${q}" no encontrado.`,'t-dim'); return; }
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
  Object.entries(rep).forEach(([id,v]) => { const f=facs[id]; const rango=typeof FactionSystem!=='undefined'?FactionSystemRef().getRango(v):{nombre:'Neutral',color:'t-out',icon:'·'}; Out.line(`  ${rango.icon} ${f?.nombre||id}  ${v}  [${rango.nombre}]`, rango.color); });
  Out.sp();
}

// ── TRADE ─────────────────────────────────────────────────────
function _cmdComerciar(args) { if(!NetRef().isOnline()){Out.line('Necesitas estar conectado.','t-dim');return;} if(!args.length){Out.line('comerciar [nombre_jugador]','t-dim');return;} const tq=args.join(' ').toLowerCase(); const tj=Object.values(NetRef().getPlayers()).find(x=>x.nodeId===Player.pos()&&x.name.toLowerCase().includes(tq)); if(!tj){Out.line(`${args.join(' ')} no está aquí.`,'t-dim');return;} NetRef().initTrade(Player.get().id,Player.get().name,tj.id); NetRef().sendTradeMsg({type:'TRADE_REQUEST',fromId:Player.get().id,fromName:Player.get().name,toId:tj.id}); Out.line(`Solicitud enviada a ${tj.name}.`,'t-mem'); }
function _cmdAceptarTrade() { const trade=NetRef().getTrade(Player.get().id); if(!trade||trade.estado!=='pendiente'){Out.line('Sin solicitud pendiente.','t-dim');return;} trade.estado='activo';trade.b.nombre=Player.get().name; NetRef().sendTradeMsg({type:'TRADE_RESPONSE',fromId:Player.get().id,tradeId:trade.id,accepted:true}); Out.line('Comercio aceptado.','t-mem'); NetRef().renderTrade(trade); }
function _cmdRechazarTrade() { const trade=NetRef().getTrade(Player.get().id); if(!trade){Out.line('Sin solicitud.','t-dim');return;} trade.estado='cerrado'; NetRef().sendTradeMsg({type:'TRADE_RESPONSE',fromId:Player.get().id,tradeId:trade.id,accepted:false}); Out.line('Comercio rechazado.','t-dim'); }
function _cmdOfrecer(args) { const trade=NetRef().getTrade(Player.get().id); if(!trade||trade.estado!=='activo'){Out.line('No hay comercio activo.','t-dim');return;} const item=Player.findItem(args.join(' ')); if(!item){Out.line(`No tienes "${args.join(' ')}".`,'t-dim');return;} const lado=trade.a.playerId===Player.get().id?trade.a:trade.b; if(lado.oferta.find(x=>x.id===item.id)){Out.line('Ya está en oferta.','t-dim');return;} lado.oferta.push(item); NetRef().sendTradeMsg({type:'TRADE_OFFER',fromId:Player.get().id,tradeId:trade.id,oferta:lado.oferta}); NetRef().renderTrade(trade); }
function _cmdRetirar(args) { const trade=NetRef().getTrade(Player.get().id); if(!trade||trade.estado!=='activo'){Out.line('No hay comercio activo.','t-dim');return;} const lado=trade.a.playerId===Player.get().id?trade.a:trade.b; const idx=lado.oferta.findIndex(i=>(i.nombre||i.blueprint).toLowerCase().includes(args.join(' ').toLowerCase())); if(idx<0){Out.line('No está en oferta.','t-dim');return;} lado.oferta.splice(idx,1); NetRef().sendTradeMsg({type:'TRADE_OFFER',fromId:Player.get().id,tradeId:trade.id,oferta:lado.oferta}); NetRef().renderTrade(trade); }
function _cmdConfirmarTrade() { const trade=NetRef().getTrade(Player.get().id); if(!trade||trade.estado!=='activo'){Out.line('No hay comercio activo.','t-dim');return;} const lado=trade.a.playerId===Player.get().id?trade.a:trade.b; lado.confirmado=true; NetRef().sendTradeMsg({type:'TRADE_CONFIRM',fromId:Player.get().id,tradeId:trade.id}); if(trade.a.confirmado&&trade.b.confirmado)NetRef().handleTradeMsg({type:'TRADE_CONFIRM',fromId:Player.get().id,tradeId:trade.id}); else Out.line('Esperando confirmación del otro jugador...','t-mem'); }
function _cmdCancelarTrade() { const trade=NetRef().getTrade(Player.get().id); if(!trade){Out.line('Sin comercio.','t-dim');return;} trade.estado='cerrado'; NetRef().sendTradeMsg({type:'TRADE_CANCEL',fromId:Player.get().id,tradeId:trade.id}); Out.line('Comercio cancelado.','t-dim'); }

if(typeof ServiceRegistry !== 'undefined') {
  ServiceRegistry.register('gameplay.command.dispatch', (verb, args=[]) => dispatch({ verb:String(verb||'').toLowerCase(), args, raw:[verb, ...args].join(' ') }), { pluginId:'core', version:'2.1.0' });
  ServiceRegistry.register('gameplay.move', (dir) => cmdIr(dir), { pluginId:'core', version:'2.1.0' });
  ServiceRegistry.register('gameplay.look', () => cmdMirar(), { pluginId:'core', version:'2.1.0' });
  ServiceRegistry.register('gameplay.enter_node', (dest, opts={}) => _enterNode(dest, opts), { pluginId:'core', version:'2.1.0' });
  ServiceRegistry.register('gameplay.move_and_tick', (dir) => cmdIr(dir), { pluginId:'core', version:'2.1.0' });
  ServiceRegistry.register('gameplay.combat.attack', (target='') => cmdAtacar(target), { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.battle.start', (nodeId, actors=[]) => {
    if(typeof Net==='undefined' || !nodeId || !Array.isArray(actors) || !actors.length) return false;
    NetRef().startBattle(nodeId, actors);
    return true;
  }, { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.battle.current', () => {
    if(typeof Net==='undefined') return null;
    return NetRef().getMyBattle?.() || null;
  }, { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.battle.actor', (battle) => {
    if(typeof Net==='undefined') return null;
    return NetRef().getBattleActor?.(battle) || null;
  }, { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.combat.action', (battleId, playerId, action, payload=null) => {
    if(!battleId || !playerId || !action || typeof Net==='undefined') return false;
    NetRef().sendBattleAction(battleId, playerId, action, payload);
    return true;
  }, { pluginId:'core', version:'2.2.0' });
  ServiceRegistry.register('gameplay.combat.escape', (battle, playerId) => {
    if(!battle?.id || !playerId || typeof Net==='undefined') return false;
    NetRef().sendBattleAction(battle.id, playerId, 'huir', null);
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

  // Sprint 1 facades (runtime.*) — aliases estables para desacoplar callers de gameplay.*
  ServiceRegistry.register('runtime.battle.start', (nodeId, actors=[]) => ServiceRegistry.call('gameplay.battle.start', nodeId, actors), { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.battle.action', (battleId, playerId, action, payload=null) => ServiceRegistry.call('gameplay.combat.action', battleId, playerId, action, payload), { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.battle.current', () => ServiceRegistry.call('gameplay.battle.current'), { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.battle.actor', (battle=null) => ServiceRegistry.call('gameplay.battle.actor', battle), { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.battle.render', (battle=null) => {
    if(typeof Net==='undefined') return false;
    const current = battle || NetRef().getMyBattle?.();
    if(!current) return false;
    NetRef().renderBattle?.(current);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.battle.tick_ai', (battle=null) => {
    if(typeof Net==='undefined') return false;
    const current = battle || NetRef().getMyBattle?.();
    if(!current) return false;
    NetRef().tickAI?.(current);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.battle.escape', (battle, playerId) => ServiceRegistry.call('gameplay.combat.escape', battle, playerId), { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.capture.start', (target='') => ServiceRegistry.call('gameplay.capture.start', target), { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.world.enter_node', (dest, opts={}) => ServiceRegistry.call('gameplay.enter_node', dest, opts), { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.world.look', () => ServiceRegistry.call('gameplay.look'), { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.current', () => {
    if(typeof Player === 'undefined' || typeof Player.get !== 'function') return null;
    return Player.get();
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.position', () => {
    if(typeof Player === 'undefined' || typeof Player.pos !== 'function') return null;
    return Player.pos();
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.set_position', (nodeId) => {
    if(typeof Player === 'undefined' || typeof Player.setPos !== 'function') return false;
    Player.setPos(nodeId);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.combat_stats', () => {
    if(typeof Player === 'undefined') return { atk:0, def:0 };
    return {
      atk: typeof Player.getAtk === 'function' ? Player.getAtk() : 0,
      def: typeof Player.getDef === 'function' ? Player.getDef() : 0,
    };
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.add_item', (item) => {
    if(typeof Player === 'undefined' || typeof Player.addItem !== 'function' || !item) return false;
    Player.addItem(item);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.get_slot', (tipo) => {
    if(typeof Player === 'undefined' || typeof Player.getSlot !== 'function') return 0;
    return Player.getSlot(tipo);
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.find_item', (query='') => {
    if(typeof Player === 'undefined' || typeof Player.findItem !== 'function') return null;
    return Player.findItem(query);
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.remove_item', (itemId) => {
    if(typeof Player === 'undefined' || typeof Player.rmItem !== 'function' || !itemId) return false;
    Player.rmItem(itemId);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.add_to_slot', (tipo, item) => {
    if(typeof Player === 'undefined' || typeof Player.addToSlot !== 'function') return false;
    return !!Player.addToSlot(tipo, item);
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.remove_from_slot', (tipo, itemId) => {
    if(typeof Player === 'undefined' || typeof Player.removeFromSlot !== 'function') return false;
    return !!Player.removeFromSlot(tipo, itemId);
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.find_in_slot', (tipo, query='') => {
    if(typeof Player === 'undefined' || typeof Player.findInSlot !== 'function') return null;
    return Player.findInSlot(tipo, query);
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.recalc_resonances', () => {
    if(typeof Player === 'undefined' || typeof Player._recalcResonancias !== 'function') return false;
    Player._recalcResonancias();
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.damage', (amount=0, source=null) => {
    if(typeof Player === 'undefined' || typeof Player.damage !== 'function') return 0;
    return Number(Player.damage(amount, source)) || 0;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.add_hab', (hab) => {
    if(typeof Player === 'undefined') return false;
    return typeof Player.addHab === 'function' ? !!Player.addHab(hab) : false;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.add_mag', (mag) => {
    if(typeof Player === 'undefined') return false;
    return typeof Player.addMag === 'function' ? !!Player.addMag(mag) : false;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.remove_hab', (id) => {
    if(typeof Player === 'undefined') return false;
    return typeof Player.rmHab === 'function' ? !!Player.rmHab(id) : false;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.remove_mag', (id) => {
    if(typeof Player === 'undefined') return false;
    return typeof Player.rmMag === 'function' ? !!Player.rmMag(id) : false;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.find_hab', (q='') => {
    if(typeof Player === 'undefined') return null;
    return typeof Player.findHab === 'function' ? Player.findHab(q) : null;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.find_mag', (q='') => {
    if(typeof Player === 'undefined') return null;
    return typeof Player.findMag === 'function' ? Player.findMag(q) : null;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.world.all', () => {
    if(typeof World === 'undefined' || typeof World.all !== 'function') return {};
    return World.all();
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.world.node', (nodeId) => {
    if(typeof World === 'undefined' || typeof World.node !== 'function') return null;
    return World.node(nodeId);
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.world.exits', (nodeId) => {
    if(typeof World === 'undefined' || typeof World.exits !== 'function') return {};
    return World.exits(nodeId) || {};
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.world.visit', (nodeId) => {
    if(typeof World === 'undefined' || typeof World.visit !== 'function') return false;
    World.visit(nodeId);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.world.expand_section', (fromNodeId, dir) => {
    if(typeof World === 'undefined' || typeof World.expandSection !== 'function') return null;
    return World.expandSection(fromNodeId, dir);
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.world.is_border', (nodeId) => {
    if(typeof World === 'undefined' || typeof World.isBorder !== 'function') return false;
    return !!World.isBorder(nodeId);
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.world.remove_enemy', (nodeId, enemyId) => {
    if(typeof World === 'undefined' || typeof World.rmEnemy !== 'function') return false;
    World.rmEnemy(nodeId, enemyId);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.world.remove_creature', (nodeId, creatureId) => {
    if(typeof World === 'undefined' || typeof World.rmCreature !== 'function') return false;
    World.rmCreature(nodeId, creatureId);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.world.read', () => ({
    seed: typeof World !== 'undefined' ? World.seed : null,
    sectionCount: typeof World !== 'undefined' ? World.sectionCount : 0,
  }), { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.world.calc_difficulty', () => {
    if(typeof World === 'undefined' || typeof World.calcDificultad !== 'function') return 1.0;
    return Number(World.calcDificultad()) || 1.0;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.clock.current', () => ({
    cycle: typeof Clock !== 'undefined' ? Clock.cycle : 0,
    slot: typeof Clock !== 'undefined' && typeof Clock.get === 'function' ? Clock.get() : null,
  }), { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.clock.tick', (delta=1) => {
    if(typeof Clock === 'undefined' || typeof Clock.tick !== 'function') return false;
    Clock.tick(delta);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.output.line', (text, color='t-out', bold=false) => {
    if(typeof Out === 'undefined' || typeof Out.line !== 'function') return false;
    Out.line(text, color, bold);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.output.sp', () => {
    if(typeof Out === 'undefined' || typeof Out.sp !== 'function') return false;
    Out.sp();
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.output.sep', (ch='─', len=46) => {
    if(typeof Out === 'undefined' || typeof Out.sep !== 'function') return false;
    Out.sep(ch, len);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.status.refresh', () => {
    if(typeof refreshStatus !== 'function') return false;
    refreshStatus();
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.game.save', () => {
    if(typeof save !== 'function') return false;
    save();
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.gs.all_npcs', () => {
    if(typeof GS === 'undefined' || typeof GS.allNPCs !== 'function') return [];
    return GS.allNPCs();
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.gs.alive_npcs', () => {
    if(typeof GS === 'undefined' || typeof GS.aliveNPCs !== 'function') return [];
    return GS.aliveNPCs();
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.gs.add_npc', (npc) => {
    if(typeof GS === 'undefined' || typeof GS.addNPC !== 'function' || !npc) return false;
    GS.addNPC(npc);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.gs.npc', (npcId) => {
    if(typeof GS === 'undefined' || typeof GS.npc !== 'function') return null;
    return GS.npc(npcId);
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.gs.npcs_in_node', (nodeId) => {
    if(typeof GS === 'undefined' || typeof GS.npcEnNodo !== 'function') return [];
    return GS.npcEnNodo(nodeId) || [];
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.gs.all_misiones', () => {
    if(typeof GS === 'undefined' || typeof GS.allMisiones !== 'function') return [];
    return GS.allMisiones();
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.gs.add_mision', (mision) => {
    if(typeof GS === 'undefined' || typeof GS.addMision !== 'function' || !mision) return false;
    GS.addMision(mision);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.gs.mision', (misionId) => {
    if(typeof GS === 'undefined' || typeof GS.mision !== 'function') return null;
    return GS.mision(misionId);
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.gs.add_arc', (arc) => {
    if(typeof GS === 'undefined' || typeof GS.addArc !== 'function' || !arc) return false;
    GS.addArc(arc);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.gs.arc', (arcId) => {
    if(typeof GS === 'undefined' || typeof GS.arc !== 'function') return null;
    return GS.arc(arcId);
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.gs.all_arcs', () => {
    if(typeof GS === 'undefined' || typeof GS.allArcs !== 'function') return [];
    return GS.allArcs();
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.gs.active_arcs', () => {
    if(typeof GS === 'undefined' || typeof GS.arcsActivos !== 'function') return [];
    return GS.arcsActivos();
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.gs.add_twist', (twist) => {
    if(typeof GS === 'undefined' || typeof GS.addTwist !== 'function' || !twist) return false;
    GS.addTwist(twist);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.rest', async () => {
    if(typeof TacticsRef().cmdDescansar!=='function') return false;
    await TacticsRef().cmdDescansar();
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.player.tactic', () => {
    if(typeof TacticsRef().cmdTactica!=='function') return false;
    TacticsRef().cmdTactica();
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.xp.read', () => {
    if(typeof XPRef().ser !== 'function') return null;
    return {
      ser: typeof XPRef().ser === 'function' ? XPRef().ser() : null,
      atributos: XPRef().ATRIBUTOS || {},
    };
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.xp.assign', (raw='') => {
    if(typeof XPRef().cmdAsignar!=='function') return false;
    XPRef().cmdAsignar(String(raw || ''));
    if(typeof save === 'function') save();
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.xp.show_attrs', () => {
    if(typeof XPRef().cmdAtributos!=='function') return false;
    XPRef().cmdAtributos();
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.xp.show_exp', () => {
    if(typeof XPRef().cmdExperiencia!=='function') return false;
    XPRef().cmdExperiencia();
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.xp.gain', (atributo, amount=0, reason='') => {
    if(typeof XPRef().ganar!=='function') return false;
    XPRef().ganar(atributo, amount, reason);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.tactics.consume_stamina', (delta=0) => {
    if(typeof TacticsRef().consumirStamina!=='function') return false;
    TacticsRef().consumirStamina(delta);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.tactics.calc_wound', (dmg=0, maxHp=1) => {
    if(typeof TacticsRef().calcularHerida!=='function') return null;
    return TacticsRef().calcularHerida(dmg, maxHp);
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.tactics.wound_meta', (key='') => {
    return TacticsRef().HERIDAS?.[key] || null;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.tactics.apply_element', (target, element, battle=null) => {
    if(typeof TacticsRef().aplicarElemento!=='function') return false;
    TacticsRef().aplicarElemento(target, element, battle);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.tactics.get_sup', (nodeId=null) => {
    if(typeof TacticsRef().getSup!=='function') return { tipo:'normal' };
    return TacticsRef().getSup(nodeId);
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.tactics.reaction_meta', (key='') => {
    return TacticsRef().REACCIONES?.[key] || null;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.tactics.climate_reac_mult', (nodeId=null) => {
    const nodeType = typeof World!=='undefined' ? (World.node(nodeId)?.tipo || 'hub') : 'hub';
    return TacticsRef().CLIMAS_NODO?.[nodeType]?.mult_reac || 1;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.tactics.apply_reaction', (reac, actor, target, battle=null) => {
    if(typeof TacticsRef().aplicarReaccion!=='function') return false;
    TacticsRef().aplicarReaccion(reac, actor, target, battle);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.tactics.update_surface', (nodeId, element, battle=null) => {
    if(typeof TacticsRef().actualizarSuperficie!=='function') return false;
    TacticsRef().actualizarSuperficie(nodeId, element, battle);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.tactics.element_color', (element='') => {
    return TacticsRef().ELEMENTOS?.[element]?.color || null;
  }, { pluginId:'core', version:'0.1.0' });
  ServiceRegistry.register('runtime.tactics.apply_poise_dmg', (target, amount=0, battle=null) => {
    if(typeof TacticsRef().aplicarPoiseDmg!=='function') return false;
    TacticsRef().aplicarPoiseDmg(target, amount, battle);
    return true;
  }, { pluginId:'core', version:'0.1.0' });
}

// ── Registro de comandos core (movimiento, combate, sistema, audio) ──────────
(function _registerCoreCommands() {
  if(typeof CommandRegistry === 'undefined') return;

  // MOVIMIENTO
  CommandRegistry.register('ir',       (args)=>cmdIr(args[0]),            'core', { titulo:'ir [direccion]',   desc:'Moverse a una salida del nodo.',      cat:'MOVIMIENTO', color:'t-sis' });
  CommandRegistry.register('go',       (args)=>cmdIr(args[0]),            'core', { titulo:'go [direction]',   desc:'Alias: ir.',                          cat:'MOVIMIENTO', color:'t-sis' });
  CommandRegistry.register('n',        ()=>cmdIr('norte'),                'core', { titulo:'n',                desc:'Ir al norte.',                        cat:'MOVIMIENTO', color:'t-sis' });
  CommandRegistry.register('s',        ()=>cmdIr('sur'),                  'core', { titulo:'s',                desc:'Ir al sur.',                          cat:'MOVIMIENTO', color:'t-sis' });
  CommandRegistry.register('e',        ()=>cmdIr('este'),                 'core', { titulo:'e',                desc:'Ir al este.',                         cat:'MOVIMIENTO', color:'t-sis' });
  CommandRegistry.register('o',        ()=>cmdIr('oeste'),                'core', { titulo:'o',                desc:'Ir al oeste.',                        cat:'MOVIMIENTO', color:'t-sis' });
  CommandRegistry.register('mirar',    ()=>cmdMirar(),                    'core', { titulo:'mirar',            desc:'Describir el nodo actual.',            cat:'MOVIMIENTO', color:'t-sis' });
  CommandRegistry.register('l',        ()=>cmdMirar(),                    'core', { titulo:'l',                desc:'Alias: mirar.',                       cat:'MOVIMIENTO', color:'t-sis' });
  CommandRegistry.register('ver',      ()=>cmdMirar(),                    'core', { titulo:'ver',              desc:'Alias: mirar.',                       cat:'MOVIMIENTO', color:'t-sis' });
  CommandRegistry.register('mapa',     (args)=>cmdMapa(args),             'core', { titulo:'mapa [jugador]',   desc:'Ver mapa del mundo o posición de un jugador.', cat:'MOVIMIENTO', color:'t-eco' });
  CommandRegistry.register('map',      (args)=>cmdMapa(args),             'core', { titulo:'map',              desc:'Alias: mapa.',                        cat:'MOVIMIENTO', color:'t-eco' });
  CommandRegistry.register('secciones',(args)=>cmdMapa(['secciones']),    'core', { titulo:'secciones',        desc:'Ver mapa de secciones exploradas.',    cat:'MOVIMIENTO', color:'t-eco' });

  // COMBATE (cross-cutting)
  CommandRegistry.register('atacar',   (args)=>cmdAtacar(args.join(' ')), 'core', { titulo:'atacar [obj]',     desc:'Atacar un NPC, enemigo o criatura.',   cat:'COMBATE',    color:'t-pel' });
  CommandRegistry.register('atk',      (args)=>cmdAtacar(args.join(' ')), 'core', { titulo:'atk (alias)',      desc:'Alias: atacar.',                      cat:'COMBATE',    color:'t-pel' });
  CommandRegistry.register('examinar', (args)=>cmdExaminar(args.join(' ')),'core',{ titulo:'examinar [obj]',   desc:'Examinar NPC, objeto o nodo actual.',  cat:'COMBATE',    color:'t-out' });
  CommandRegistry.register('ex',       (args)=>cmdExaminar(args.join(' ')),'core',{ titulo:'ex (alias)',       desc:'Alias: examinar.',                    cat:'COMBATE',    color:'t-out' });
  CommandRegistry.register('estado',   ()=>cmdEstado(),                   'core', { titulo:'estado',           desc:'Ver ficha completa del jugador.',      cat:'COMBATE',    color:'t-out' });
  CommandRegistry.register('stats',    ()=>cmdEstado(),                   'core', { titulo:'stats (alias)',    desc:'Alias: estado.',                      cat:'COMBATE',    color:'t-out' });
  CommandRegistry.register('batalla',  ()=>{
    const b=_battleCurrent(); if(!b){Out.line('No estás en batalla.','t-dim');return true;} _battleRender(b); return true;
  }, 'core', { titulo:'batalla',            desc:'Ver estado de la batalla activa.',     cat:'COMBATE',    color:'t-pel' });
  CommandRegistry.register('defender', ()=>{
    const b=_battleCurrent(); if(!b){Out.line('No estás en batalla.','t-dim');return true;} _battleAction(b.id,Player.get().id,'defender',null); return true;
  }, 'core', { titulo:'defender',           desc:'Adoptar postura defensiva en batalla.', cat:'COMBATE',   color:'t-sis' });
  CommandRegistry.register('legados',  ()=>cmdLegados(),                  'core', { titulo:'legados',          desc:'Ver ecos y legados de runs anteriores.', cat:'COMBATE',  color:'t-eco' });
  CommandRegistry.register('ecos',     ()=>cmdLegados(),                  'core', { titulo:'ecos (alias)',     desc:'Alias: legados.',                     cat:'COMBATE',    color:'t-eco' });

  // MULTIJUGADOR / RED
  CommandRegistry.register('host',     async ()=>{ await NetRef().host?.(); return true; },                                   'core', { titulo:'host',              desc:'Crear sala multijugador.',             cat:'MULTIJUGADOR', color:'t-eco' });
  CommandRegistry.register('conectar', async (args)=>{ await NetRef().connect?.(args.join('')); return true; },              'core', { titulo:'conectar [código]', desc:'Conectarse a una sala.',               cat:'MULTIJUGADOR', color:'t-eco' });
  CommandRegistry.register('iniciar',  async (args)=>{ if(args.length) await NetRef().connect?.(args.join('')); else await NetRef().host?.(); return true; }, 'core', { titulo:'iniciar', desc:'Alias: host o conectar.', cat:'MULTIJUGADOR', color:'t-eco' });
  CommandRegistry.register('desconectar', ()=>{ NetRef().disconnect?.(); return true; },                                     'core', { titulo:'desconectar',       desc:'Desconectarse de la sala.',            cat:'MULTIJUGADOR', color:'t-eco' });
  CommandRegistry.register('jugadores', ()=>{ NetRef().cmdJugadores?.(); return true; },                                     'core', { titulo:'jugadores',         desc:'Ver jugadores conectados.',            cat:'MULTIJUGADOR', color:'t-eco' });
  CommandRegistry.register('red',       ()=>{ NetRef().cmdJugadores?.(); return true; },                                     'core', { titulo:'red (alias)',       desc:'Alias: jugadores.',                   cat:'MULTIJUGADOR', color:'t-eco' });
  CommandRegistry.register('net',       ()=>{ NetRef().cmdJugadores?.(); return true; },                                     'core', { titulo:'net (alias)',       desc:'Alias: jugadores.',                   cat:'MULTIJUGADOR', color:'t-eco' });
  CommandRegistry.register('aceptar_conexion', async (args)=>{ await NetRef().acceptConexion?.(args[0], args[1]||null); return true; }, 'core', { titulo:'aceptar_conexion', desc:'Aceptar solicitud de conexión.', cat:'MULTIJUGADOR', color:'t-eco' });
  CommandRegistry.register('unirse_batalla', ()=>{ const b=Object.values(NetRef().battles||{}).find(x=>x.nodeId===Player.pos()&&x.estado==='activo'); if(!b){Out.line('No hay batalla activa aquí.','t-dim');return true;} NetRef().joinBattle?.(b.id); return true; }, 'core', { titulo:'unirse_batalla', desc:'Unirse a una batalla activa en el nodo.', cat:'MULTIJUGADOR', color:'t-eco' });
  CommandRegistry.register('comerciar',      (args)=>{ _cmdComerciar(args);   return true; }, 'core', { titulo:'comerciar [jugador]', desc:'Iniciar comercio con otro jugador.', cat:'MULTIJUGADOR', color:'t-mem' });
  CommandRegistry.register('aceptar_trade',  ()=>{ _cmdAceptarTrade();  return true; }, 'core', { titulo:'aceptar_trade',   desc:'Aceptar solicitud de comercio.',    cat:'MULTIJUGADOR', color:'t-mem' });
  CommandRegistry.register('rechazar_trade', ()=>{ _cmdRechazarTrade(); return true; }, 'core', { titulo:'rechazar_trade',  desc:'Rechazar solicitud de comercio.',   cat:'MULTIJUGADOR', color:'t-mem' });
  CommandRegistry.register('ofrecer',        (args)=>{ _cmdOfrecer(args);     return true; }, 'core', { titulo:'ofrecer [item]',     desc:'Añadir ítem a la oferta.',          cat:'MULTIJUGADOR', color:'t-mem' });
  CommandRegistry.register('retirar',        (args)=>{ _cmdRetirar(args);     return true; }, 'core', { titulo:'retirar [item]',     desc:'Retirar ítem de la oferta.',        cat:'MULTIJUGADOR', color:'t-mem' });
  CommandRegistry.register('confirmar_trade',()=>{ _cmdConfirmarTrade(); return true; }, 'core', { titulo:'confirmar_trade', desc:'Confirmar el intercambio.',         cat:'MULTIJUGADOR', color:'t-mem' });
  CommandRegistry.register('cancelar_trade', ()=>{ _cmdCancelarTrade();  return true; }, 'core', { titulo:'cancelar_trade',  desc:'Cancelar el intercambio.',          cat:'MULTIJUGADOR', color:'t-mem' });

  // AUDIO
  CommandRegistry.register('musica',   (args)=>{ cmdMusica(args); return true; },  'core', { titulo:'musica [sub]',     desc:'Control de música: on · off · estado · midi.',  cat:'AUDIO', color:'t-mag' });
  CommandRegistry.register('music',    (args)=>{ cmdMusica(args); return true; },  'core', { titulo:'music (alias)',    desc:'Alias: musica.',                               cat:'AUDIO', color:'t-mag' });
  CommandRegistry.register('sfx',      (args)=>{ cmdSfx(args); return true; },     'core', { titulo:'sfx [sub]',       desc:'Control de efectos de sonido: on · off · test.', cat:'AUDIO', color:'t-mag' });

  // SISTEMA / PLUGINS
  CommandRegistry.register('plugins',            ()=>{ cmdPlugins(); return true; },                        'core', { titulo:'plugins',             desc:'Ver plugins activos y sus comandos.',  cat:'SISTEMA', color:'t-mag' });
  CommandRegistry.register('plugins_orden',      ()=>{ cmdPluginsOrden(); return true; },                   'core', { titulo:'plugins_orden',        desc:'Ver orden de resolución de plugins.',  cat:'SISTEMA', color:'t-mag' });
  CommandRegistry.register('plugins_pendientes', ()=>{ cmdPluginsPendientes(); return true; },              'core', { titulo:'plugins_pendientes',   desc:'Ver plugins pendientes por dependencias.', cat:'SISTEMA', color:'t-pel' });
  CommandRegistry.register('servicios',          ()=>{ cmdServicios(); return true; },                      'core', { titulo:'servicios',            desc:'Ver servicios registrados en runtime.', cat:'SISTEMA', color:'t-acc' });
  CommandRegistry.register('modulos',            ()=>{ cmdModulos(); return true; },                        'core', { titulo:'modulos',              desc:'Ver módulos cargados.',                cat:'SISTEMA', color:'t-acc' });
  CommandRegistry.register('eventos',            ()=>{ cmdEventos(); return true; },                        'core', { titulo:'eventos',              desc:'Ver eventos del EventBus.',            cat:'SISTEMA', color:'t-acc' });
  CommandRegistry.register('eventos_trace',      (args)=>{ cmdEventosTrace(args[0]); return true; },        'core', { titulo:'eventos_trace [n]',   desc:'Ver trazas recientes del EventBus.',   cat:'SISTEMA', color:'t-acc' });
  CommandRegistry.register('cargar_modulo',      (args)=>{ cmdCargarModulo(args.join(' ')); return true; }, 'core', { titulo:'cargar_modulo <JSON>', desc:'Cargar módulo desde JSON.',            cat:'SISTEMA', color:'t-cra' });
  CommandRegistry.register('cargar_plugin',      (args)=>{ cmdCargarPlugin(args.join(' ')); return true; }, 'core', { titulo:'cargar_plugin <JSON>', desc:'Cargar plugin desde JSON.',            cat:'SISTEMA', color:'t-cra' });
  CommandRegistry.register('descargar_plugin',   (args)=>{ PluginLoader.unregister(args[0]); Out.line(`Plugin "${args[0]}" descargado.`,'t-mem'); return true; }, 'core', { titulo:'descargar_plugin [id]', desc:'Descargar y desregistrar un plugin.', cat:'SISTEMA', color:'t-pel' });

  // GUARDADO / SESIÓN
  CommandRegistry.register('guardar',  ()=>{ save(); Out.line('Guardado.','t-cra'); return true; },         'core', { titulo:'guardar',             desc:'Guardar la partida.',                  cat:'SISTEMA', color:'t-dim' });
  CommandRegistry.register('save',     ()=>{ save(); Out.line('Guardado.','t-cra'); return true; },         'core', { titulo:'save (alias)',         desc:'Alias: guardar.',                     cat:'SISTEMA', color:'t-dim' });
  CommandRegistry.register('exportar', ()=>{ exportarPartida(); return true; },                             'core', { titulo:'exportar',            desc:'Exportar partida a archivo.',          cat:'SISTEMA', color:'t-dim' });
  CommandRegistry.register('export',   ()=>{ exportarPartida(); return true; },                             'core', { titulo:'export (alias)',       desc:'Alias: exportar.',                    cat:'SISTEMA', color:'t-dim' });
  CommandRegistry.register('importar', ()=>{ importarPartida(); return true; },                             'core', { titulo:'importar',            desc:'Importar partida desde archivo.',      cat:'SISTEMA', color:'t-dim' });
  CommandRegistry.register('import',   ()=>{ importarPartida(); return true; },                             'core', { titulo:'import (alias)',       desc:'Alias: importar.',                    cat:'SISTEMA', color:'t-dim' });
  CommandRegistry.register('semilla',  ()=>{ Out.line(`Semilla: ${World.seed}`,'t-sis'); return true; },   'core', { titulo:'semilla',              desc:'Ver semilla del mundo actual.',        cat:'SISTEMA', color:'t-sis' });
  CommandRegistry.register('nombre',   (args)=>{ if(args.length){const n=args.join(' ').trim().replace(/[<>&"]/g,'').slice(0,24);if(n.length>=2){Player.rename(n);Out.line(`Nombre: ${Player.get().name}`,'t-npc');if(NetRef().isClient())NetRef().sendAction('nombre',[n]);}else Out.line('El nombre debe tener al menos 2 caracteres.','t-dim');}return true; }, 'core', { titulo:'nombre [nombre]', desc:'Cambiar el nombre del jugador.', cat:'SISTEMA', color:'t-npc' });
  CommandRegistry.register('nuevo',    async ()=>{ localStorage.removeItem('eco_v12'); Out.clear(); await init(); return true; }, 'core', { titulo:'nuevo',  desc:'Iniciar una nueva partida.',           cat:'SISTEMA', color:'t-pel' });
  CommandRegistry.register('new',      async ()=>{ localStorage.removeItem('eco_v12'); Out.clear(); await init(); return true; }, 'core', { titulo:'new (alias)', desc:'Alias: nuevo.', cat:'SISTEMA', color:'t-pel' });

  // PROGRESIÓN / XP (fallback cuando plugin-xp no está cargado)
  CommandRegistry.register('experiencia', ()=>_xpShowExp(),              'core', { titulo:'experiencia', color:'t-mem', desc:'Ver progresión de ramas de experiencia.', cat:'PROGRESIÓN' });
  CommandRegistry.register('xp',          ()=>_xpShowExp(),              'core', { titulo:'xp (alias)',   color:'t-mem', desc:'Alias: experiencia.',                    cat:'PROGRESIÓN' });
  CommandRegistry.register('exp',         ()=>_xpShowExp(),              'core', { titulo:'exp (alias)',  color:'t-mem', desc:'Alias: experiencia.',                    cat:'PROGRESIÓN' });
  CommandRegistry.register('atributos',   ()=>_xpShowAttrs(),            'core', { titulo:'atributos',    color:'t-acc', desc:'Ver atributos y puntos disponibles.',    cat:'PROGRESIÓN' });
  CommandRegistry.register('attrs',       ()=>_xpShowAttrs(),            'core', { titulo:'attrs (alias)',color:'t-acc', desc:'Alias: atributos.',                      cat:'PROGRESIÓN' });
  CommandRegistry.register('asignar',     (args)=>_xpAssign(args.join(' ')), 'core', { titulo:'asignar [atributo]', color:'t-acc', desc:'Invertir un punto en un atributo.', cat:'PROGRESIÓN' });
  CommandRegistry.register('assign',      (args)=>_xpAssign(args.join(' ')), 'core', { titulo:'assign (alias)', color:'t-acc', desc:'Alias: asignar.',                  cat:'PROGRESIÓN' });
  CommandRegistry.register('descansar',   async ()=>{ await _playerRest(); return true; }, 'core', { titulo:'descansar', color:'t-mem', desc:'Descansar para recuperar HP y stamina.', cat:'PROGRESIÓN' });
  CommandRegistry.register('rest',        async ()=>{ await _playerRest(); return true; }, 'core', { titulo:'rest (alias)', color:'t-mem', desc:'Alias: descansar.', cat:'PROGRESIÓN' });
  CommandRegistry.register('dormir',      async ()=>{ await _playerRest(); return true; }, 'core', { titulo:'dormir (alias)', color:'t-mem', desc:'Alias: descansar.', cat:'PROGRESIÓN' });
  CommandRegistry.register('tactica',     ()=>{ _playerTactic(); return true; }, 'core', { titulo:'tactica', color:'t-sis', desc:'Ver tácticas y configuración de combate.', cat:'PROGRESIÓN' });
  CommandRegistry.register('táctica',     ()=>{ _playerTactic(); return true; }, 'core', { titulo:'táctica (alias)', color:'t-sis', desc:'Alias: tactica.', cat:'PROGRESIÓN' });
  CommandRegistry.register('tac',         ()=>{ _playerTactic(); return true; }, 'core', { titulo:'tac (alias)', color:'t-sis', desc:'Alias: tactica.', cat:'PROGRESIÓN' });

  // AYUDA / UI
  CommandRegistry.register('ayuda',    (args)=>{ cmdAyuda(args.join(' ')); return true; }, 'core', { titulo:'ayuda [tema]',       desc:'Mostrar ayuda general o de un tema.',  cat:'AYUDA', color:'t-acc' });
  CommandRegistry.register('help',     (args)=>{ cmdAyuda(args.join(' ')); return true; }, 'core', { titulo:'help (alias)',        desc:'Alias: ayuda.',                       cat:'AYUDA', color:'t-acc', canonical:'ayuda' });
  CommandRegistry.register('?',        (args)=>{ cmdAyuda(args.join(' ')); return true; }, 'core', { titulo:'? (alias)',           desc:'Alias: ayuda.',                       cat:'AYUDA', color:'t-acc' });
  CommandRegistry.register('limpiar',  ()=>{ Out.clear(); return true; },                  'core', { titulo:'limpiar',            desc:'Limpiar la pantalla de salida.',       cat:'AYUDA', color:'t-dim' });
  CommandRegistry.register('cls',      ()=>{ Out.clear(); return true; },                  'core', { titulo:'cls (alias)',         desc:'Alias: limpiar.',                     cat:'AYUDA', color:'t-dim' });
})()
