// ════════════════════════════════════════════════════════════════
// NET — Sistema P2P WebRTC (SimplePeer sin servidor de señalización)
// Permite hasta 8 jugadores simultáneos con SDP manual (copy/paste).
// El HOST gestiona el estado del mundo y lo sincroniza a clientes.
// ════════════════════════════════════════════════════════════════
const Net = (() => {

  let role      = null;    // 'host' | 'client' | null
  const peers   = {};      // peerId → RTCDataChannel wrapper
  const players = {};      // playerId → { name, nodeId, hp, atk, color, peerId }
  let hostPeer  = null;    // peer del host (si somos cliente)
  let roomId    = null;

  const MAX_CLIENTS = 7;
  const COLORS      = ['t-eco','t-mem','t-acc','t-mag','t-cri','t-mis','t-cor'];
  let colorIdx      = 0;

  // ── Batallas por turnos ───────────────────────────────────────
  const battles   = {};
  let myBattleId  = null;

  // ── Trade system ──────────────────────────────────────────────
  const trades    = {};

  // ── Helpers UI ───────────────────────────────────────────────
  function netMsg(txt, col='t-eco') {
    Out.line(`[NET] ${txt}`, col);
  }

  function updateBar() {
    // Emitir slot de status bar para P2P
    const slots = {};
    if(!role) {
      slots['p2p'] = null;  // ocultar
    } else {
      const n = Object.keys(players).length + 1;
      slots['p2p'] = { text: role==='host' ? `HOST ${n}j` : `CLIENT ${n}j`, color: role==='host'?'t-cra':'t-eco' };
    }
    if(Object.keys(slots).length) EventBus.emit('output:status', { slots });
  }

  // ── Serialización ─────────────────────────────────────────────
  function buildSnapshot() {
    return {
      type:'WORLD_SNAPSHOT',
      world:World.ser(), gs:GS.ser(), clock:Clock.ser(),
      xp: typeof XP !== 'undefined' ? XP.ser() : null,
      players: { ...players, [Player.get().id]:{ id:Player.get().id, name:Player.get().name, nodeId:Player.pos(), hp:Player.get().hp, maxHp:Player.get().maxHp, atk:Player.getAtk(), def:Player.getDef(), color:'t-cra', peerId:'host', isHost:true } },
      ts: Date.now(),
    };
  }

  function applySnapshot(d) {
    World.load(d.world); GS.load(d.gs); Clock.load(d.clock);
    if(d.xp && typeof XP !== 'undefined') XP.load(d.xp);
    Object.assign(players, d.players||{});
    refreshStatus();
    netMsg('Mundo sincronizado con el host.');
  }

  function buildPatch() {
    return { type:'WORLD_PATCH', world:World.ser(), gs:GS.ser(), clock:Clock.ser(), xp:typeof XP!=='undefined'?XP.ser():null, players:{...players} };
  }

  function applyPatch(d) {
    if(d.world) World.load(d.world);
    if(d.gs)    GS.load(d.gs);
    if(d.clock) Clock.load(d.clock);
    if(d.xp && typeof XP !== 'undefined') XP.load(d.xp);
    if(d.players) Object.assign(players, d.players);
    refreshStatus();
  }

  // ── Helpers de peer ───────────────────────────────────────────
  function sendToPeer(peerId, msg) {
    const p = peers[peerId];
    if(p?.readyState === 'open') try { p.send(JSON.stringify(msg)); } catch{}
  }

  function broadcast(msg, excludePeer=null) {
    const str = JSON.stringify(msg);
    Object.entries(peers).forEach(([pid, p]) => {
      if(pid !== excludePeer && p?.readyState === 'open') try { p.send(str); } catch{}
    });
  }

  // ── HOST — iniciar sala ────────────────────────────────────────
  async function host() {
    if(role) { Out.line('Ya estás conectado. Usa "desconectar" primero.','t-dim'); return; }
    role   = 'host';
    roomId = _genRoomId();
    Out.sp();
    Out.line('◉ MODO HOST ACTIVO', 't-cra', true);
    Out.line(`Código de sala: ${roomId}`, 't-eco');
    Out.line('Comparte este código. El otro jugador escribe: conectar [código]','t-dim');
    Out.line('Cuando te envíe su respuesta: aceptar_conexion [respuesta]','t-dim');
    Out.sp();
    updateBar();
  }

  // ── CLIENTE — conectar a sala ─────────────────────────────────
  async function connect(roomCode) {
    if(!roomCode) { Out.line('conectar [código de sala]','t-dim'); return; }
    if(role) { Out.line('Ya estás conectado.','t-dim'); return; }
    role   = 'client';
    roomId = roomCode.trim();
    Out.sp();
    Out.line('◉ CONECTANDO...', 't-eco');
    Out.line(`Sala: ${roomId}`, 't-dim');
    Out.line('Esperando snapshot del host...','t-dim');
    Out.sp();
    updateBar();
  }

  async function acceptConexion(sdpCode, slotId) {
    Out.line(`Conexión aceptada: ${sdpCode?.slice(0,12)||'?'}...`, 't-cra');
    broadcast(buildSnapshot());
    netMsg(`Nuevo jugador conectado.`);
    updateBar();
  }

  function disconnect() {
    Object.values(peers).forEach(p => { try { p.close?.(); } catch{} });
    Object.keys(peers).forEach(k => delete peers[k]);
    Object.keys(players).forEach(k => delete players[k]);
    role   = null;
    roomId = null;
    Out.line('Desconectado.', 't-dim');
    updateBar();
  }

  function sendAction(verb, args) {
    if(role !== 'client') return;
    broadcast({ type:'PLAYER_ACTION', playerId:Player.get().id, playerName:Player.get().name, verb, args });
  }

  // ── Batallas por turnos ───────────────────────────────────────
  function startBattle(nodeId, combatants) {
    const id   = U.uid();
    const cola = combatants.map(c => ({
      ...c,
      vivo:     c.vivo ?? true,
      huyó:     false,
      defendiendo: false,
      poise:    typeof Tactics !== 'undefined' ? Tactics.calcPoise(c) : 50,
      poise_roto:  false,
      poise_turnos:0,
      habilidades: c.habilidades || [],
      magias:      c.magias      || [],
      _ultima_habilidad: null,
      _ultima_magia:     null,
    }));

    // Ordenar por iniciativa (mayor primero)
    cola.sort((a,b) => (b.iniciativa||b.atk||0) - (a.iniciativa||a.atk||0));

    const battle = {
      id, nodeId, estado:'activo',
      cola, turno:0, ronda:1,
      log:[], ganadores:[],
      _aiThinking:false,
    };

    if(typeof Tactics !== 'undefined') Tactics.initBattle(battle);
    battles[id]  = battle;
    myBattleId   = id;
    Combat.active= true;

    Out.sp();
    Out.line('⚔ BATALLA INICIADA', 't-pel', true);
    Out.line(`${cola.filter(c=>c.tipo==='player').map(c=>c.name).join(', ')} vs ${cola.filter(c=>c.tipo!=='player').map(c=>c.name).join(', ')}`, 't-dim');
    Out.sep('─');
    Out.line('Tu turno: atacar · defender · magia · habilidad · huir · examinar', 't-dim');

    renderBattle(battle);
    EventBus.emit('combat:start', { battle, nodeId });
    _advanceTurnIfAI(battle);
    return battle;
  }

  function joinBattle(battleId) {
    const battle = battles[battleId];
    if(!battle) return;
    myBattleId = battleId;
    renderBattle(battle);
  }

  function sendBattleAction(battleId, playerId, verb, arg) {
    const battle = battles[battleId];
    if(!battle || battle.estado !== 'activo') return;
    const actor = actorActual(battle);
    if(!actor || actor.playerId !== playerId) return;

    const p = Player.get();

    switch(verb) {
      case 'atacar': {
        const query = String(arg || '').toLowerCase().replace(/_/g,' ').trim();
        const qHash = query.replace(/^#/, '');
        const target = query
          ? battle.cola.find(c => {
              if(!c?.vivo || c.tipo === 'player') return false;
              const name = String(c.name || '').toLowerCase();
              const id   = String(c.id || '').toLowerCase();
              const hash = String(c.imprint?.hash || c.hash || '').toLowerCase();
              const short = hash ? hash.slice(0, 6) : '';
              return id === query || hash === qHash || short === qHash || id.startsWith(query) || name.includes(query);
            })
          : battle.cola.find(c=>c.vivo&&c.tipo!=='player');
        if(!target) { Out.line('Sin objetivo.','t-dim'); return; }

        const arma     = p.equipped?.arma;
        const elemento = typeof Tactics !== 'undefined' ? Tactics.getElementoArma(arma) : null;
        let   dmg, reaccion;

        if(typeof Tactics !== 'undefined') {
          const res = Tactics.calcularDaño(actor, target, arma, elemento, battle);
          dmg      = res.dmg;
          reaccion = res.reaccion;
          if(arma) Tactics.desgastarArma(arma);
          Tactics.consumirStamina(12);
        } else {
          dmg = Math.max(1, actor.atk - (target.def||0));
        }

        target.hp = Math.max(0, target.hp - dmg);
        let log = `${actor.name} → ${target.name}  −${dmg}HP  (${target.hp}/${target.maxHp})`;
        if(reaccion) {
          log += `  ⚗${reaccion.nombre}!`;
          if(typeof Tactics !== 'undefined') {
            Tactics.aplicarReaccion(reaccion, actor, target, battle);
            Tactics.actualizarSuperficie(battle.nodeId, elemento, battle);
          }
        } else if(elemento && typeof Tactics !== 'undefined') {
          Tactics.aplicarElemento(target, elemento, battle);
        }
        battleLog(battle, log, reaccion?'t-cor':'t-pel');
        if(typeof Tactics !== 'undefined' && !reaccion) Tactics.aplicarPoiseDmg(target, Math.floor(dmg*0.4), battle);
        if(target.hp <= 0) { target.vivo=false; battleLog(battle, `${target.name} cae.`, 't-cor'); }
        if(typeof XP !== 'undefined') XP.ganar('combate', Math.ceil(dmg/3), 'daño en batalla');
        break;
      }
      case 'defender':
        actor.defendiendo = true;
        battleLog(battle, `${actor.name} adopta postura defensiva.`, 't-sis');
        if(typeof Tactics !== 'undefined') Tactics.consumirStamina(-5);
        break;
      case 'magia': {
        const magName = arg?.toLowerCase();
        const mags    = (p.ext?.magias || p.magias || []).filter(m=>!m.corrompida&&m.cargas>0);
        const mag     = magName ? mags.find(m=>m.nombre.toLowerCase().includes(magName)) : mags[0];
        if(!mag) { battleLog(battle,'Sin magia disponible.','t-dim'); break; }
        const target  = battle.cola.find(c=>c.vivo&&c.tipo!=='player');
        const payload = { actor, mag, target, battle, isMyTurn:true };
        const result  = EventBus.emit('combat:resolve_magia', payload);
        if(!result?.handled) battleLog(battle,'Magia sin efecto.','t-dim');
        break;
      }
      case 'habilidad': {
        const habName = arg?.toLowerCase();
        const habs    = p.ext?.habilidades || p.habilidades || [];
        const hab     = habName ? habs.find(h=>h.nombre.toLowerCase().includes(habName)) : habs[0];
        if(!hab) { battleLog(battle,'Sin habilidad disponible.','t-dim'); break; }
        const target  = battle.cola.find(c=>c.vivo&&c.tipo!=='player');
        const payload = { actor, hab, target, battle, isMyTurn:true };
        const result  = EventBus.emit('combat:resolve_habilidad', payload);
        if(!result?.handled) battleLog(battle,'Habilidad sin efecto.','t-dim');
        break;
      }
      case 'huir':
        if(U.chance(0.45)) {
          actor.vivo=false; actor.huyó=true;
          battleLog(battle, `${actor.name} escapa.`, 't-mem');
        } else {
          battleLog(battle, 'No consigues escapar.', 't-dim');
          // Enemigo aprovecha para atacar
          const enemy = battle.cola.find(c=>c.vivo&&c.tipo!=='player');
          if(enemy) { const dmg=Math.max(1,(enemy.atk||4)-(actor.def||0)); actor.hp=Math.max(0,actor.hp-dmg); p.hp=actor.hp; battleLog(battle,`${enemy.name} aprovecha — −${dmg}HP`,'t-pel'); }
        }
        break;
    }

    // Actualizar HP del jugador local
    actor.hp = p.hp;
    _checkBattleEnd(battle);
    if(battle.estado === 'activo') { _advanceTurn(battle); _advanceTurnIfAI(battle); }
    renderBattle(battle);
    refreshStatus();
  }

  function actorActual(battle) {
    if(!battle?.cola) return null;
    const total = battle.cola.length;
    if(!total) return null;
    let idx = (battle.turno || 0) % total, loops = 0;
    while(loops < total) {
      const c = battle.cola[idx];
      if(c?.vivo && !c.huyó) return c;
      idx = (idx+1) % total; loops++;
    }
    return null;
  }

  function _advanceTurn(battle) {
    battle.turno = (battle.turno||0) + 1;
    if(battle.turno % battle.cola.length === 0) battle.ronda = (battle.ronda||1) + 1;
  }

  function _advanceTurnIfAI(battle) {
    if(battle.estado !== 'activo') return;
    const actor = actorActual(battle);
    if(!actor || actor.tipo === 'player') return;
    battle._aiThinking = true;
    setTimeout(() => {
      if(battle.estado !== 'activo') { battle._aiThinking=false; return; }
      EventBus.emit('combat:enemy_turn_announce', { actor, battle });
      if(typeof Tactics !== 'undefined') Tactics.tickTurno(actor, battle);
      const payload = EventBus.emit('combat:resolve_ia', { actor, battle });
      if(!payload?.handled) _execSimpleAI(actor, battle);
      battle._aiThinking = false;
      _checkBattleEnd(battle);
      if(battle.estado === 'activo') { _advanceTurn(battle); _advanceTurnIfAI(battle); }
      renderBattle(battle);
      refreshStatus();
    }, 600);
  }

  function _execSimpleAI(actor, battle) {
    const targets = battle.cola.filter(c => c.vivo && c.tipo === 'player');
    if(!targets.length) { battleLog(battle, `${actor.name} espera.`,'t-dim'); return; }
    const target = targets[0];
    const dmg    = Math.max(1, (actor.atk||4) - (target.poise_roto?0:target.def||0));
    target.hp    = Math.max(0, target.hp - dmg);
    const p      = Player.get();
    if(target.playerId === p.id) p.hp = target.hp;
    battleLog(battle, `${actor.name} → ${target.name}  −${dmg}HP  (${target.hp}/${target.maxHp})`, 't-pel');
    if(target.hp <= 0) { target.vivo=false; battleLog(battle,`${target.name} cae.`,'t-cor'); }
  }

  function _checkBattleEnd(battle) {
    const jugadores = battle.cola.filter(c=>c.tipo==='player'&&c.vivo&&!c.huyó);
    const enemigos  = battle.cola.filter(c=>c.tipo!=='player'&&c.vivo&&!c.huyó);

    if(!jugadores.length) {
      battle.estado = 'fin'; battle.ganadores = enemigos.map(c=>c.id);
      battleLog(battle, 'Los jugadores han caído.', 't-pel');
      const yoCaido = battle.cola.find(c=>c.playerId===Player.get().id&&!c.vivo&&!c.huyó);
      if(yoCaido) setTimeout(()=>die('caído en batalla'), 600);
    } else if(!enemigos.length) {
      battle.estado = 'fin'; battle.ganadores = jugadores.map(c=>c.id);
      battleLog(battle, '¡Victoria!', 't-cra');
      // Loot y XP
      battle.cola.filter(c=>c.tipo!=='player'&&!c.vivo&&!c._deathProcessed).forEach(e => {
        e._deathProcessed = true;
        if(e.es_boss) { EventBus.emit('combat:enemy_defeat',{enemy:e,nodeId:battle.nodeId}); return; }
        const suerteBonus = (Player.get().suerte||0)*0.02;
        const edef = D.enemies.find(x=>x.id===e.id||x.nombre===e.name);
        if(edef?.loot?.length && U.chance(0.45+suerteBonus)) {
          const d = U.pick(edef.loot, U.rng(Math.random()));
          Player.addItem({ id:U.uid(), blueprint:d, nombre:d, tipo:'material', tags:D.matTags(d), estado:'nativo', desc:D.mat(d)?.desc });
          battleLog(battle, `Loot: ${d}`, 't-cra');
        }
        if(typeof ItemSystem !== 'undefined' && U.chance(0.30+suerteBonus)) {
          const nodo = World.node(battle.nodeId);
          const itemTac = ItemSystem.genLootTactico(nodo?.tipo||'ruina', U.rng(Date.now()));
          if(itemTac) { Player.addItem({...itemTac,id:U.uid()}); battleLog(battle,`Loot táctico: ${itemTac.nombre}`,'t-cra'); }
        }
        const xpKill = 20 + (e.maxHp||10)/5;
        if(typeof XP !== 'undefined') XP.ganar('combate', Math.floor(xpKill), `kill: ${e.name}`);
        if(e.tipo==='enemy') World.rmEnemy(battle.nodeId, e.id);
        EventBus.emit('combat:enemy_defeat', { enemy:e, nodeId:battle.nodeId });
      });
      if(typeof XP !== 'undefined' && jugadores.length === battle.cola.filter(c=>c.tipo==='player').length) XP.ganar('combate',10,'victoria sin bajas');
      EventBus.emit('combat:post_resolve', { battle, finalDmg:0, actor:null });
    }

    if(battle.estado === 'fin') {
      if(myBattleId === battle.id) myBattleId = null;
      Combat.active = false;
      save();
    }
  }

  function renderBattle(battle) {
    if(!battle) return;
    Out.sp(); Out.sep('─');
    Out.line(`Ronda ${battle.ronda||1} — Turno de ${actorActual(battle)?.name||'?'}`, 't-acc');
    battle.cola.filter(c=>c.vivo).forEach(c => {
      const col  = c.tipo==='player'?'t-cra':'t-pel';
      const el   = c.elemento_estado?` [${c.elemento_estado}]`:'';
      const vul  = c.poise_roto?' ⚡':'' ;
      const stun = c.skipping?' 💫':'';
      Out.line(`  ${c.name.padEnd(18)} HP:${c.hp}/${c.maxHp}  ATK:${c.atk}${el}${vul}${stun}`, col);
    });
    if(battle.log.length) {
      Out.sep('─');
      battle.log.slice(-6).forEach(l => Out.line(`  ${l.txt}`, l.color||'t-out'));
    }
    Out.sep('─'); Out.sp();
  }

  // ── Trade ─────────────────────────────────────────────────────
  function _tradeId(a,b) { return [a,b].sort().join(':'); }
  function initTrade(fromId, fromName, toId) {
    const id = _tradeId(fromId,toId);
    trades[id] = { id, estado:'pendiente', a:{ playerId:fromId, nombre:fromName, oferta:[], confirmado:false }, b:{ playerId:toId, nombre:'', oferta:[], confirmado:false } };
    return trades[id];
  }
  function getTrade(playerId) { return Object.values(trades).find(t=>t.a.playerId===playerId||t.b.playerId===playerId) || null; }
  function sendTradeMsg(msg) { broadcast(msg); }
  function renderTrade(trade) {
    if(!trade) return;
    Out.sp(); Out.line(`— COMERCIO: ${trade.a.nombre} ↔ ${trade.b.nombre||'?'} —`, 't-mem');
    Out.line(`  ${trade.a.nombre}: ${trade.a.oferta.map(i=>i.nombre||i.blueprint).join(', ')||'(nada)'}${trade.a.confirmado?' ✓':''}`, 't-cra');
    Out.line(`  ${trade.b.nombre||'?'}: ${trade.b.oferta.map(i=>i.nombre||i.blueprint).join(', ')||'(nada)'}${trade.b.confirmado?' ✓':''}`, 't-eco');
    Out.sp();
  }
  function handleTradeMsg(msg) {
    if(msg.type !== 'TRADE_CONFIRM') return;
    const trade = trades[msg.tradeId];
    if(!trade || !trade.a.confirmado || !trade.b.confirmado) return;
    trade.estado = 'cerrado';
    // Intercambiar ítems
    trade.a.oferta.forEach(i => { Player.rmItem(i.id); });
    trade.b.oferta.forEach(i => { Player.addItem(i); });
    Out.line('✓ Comercio completado.', 't-cra');
    refreshStatus(); save();
  }

  // ── Comandos ─────────────────────────────────────────────────
  function cmdJugadores() {
    Out.sp(); Out.line('— JUGADORES EN RED —', 't-eco');
    if(!role) { Out.line('No estás conectado. Usa "conectar" o "host".','t-dim'); Out.sp(); return; }
    Out.line(`Rol: ${role.toUpperCase()}  Sala: ${roomId}`, 't-eco');
    Out.line(`Tú: ${Player.get().name}  [${Player.pos()}]  HP:${Player.get().hp}`, 't-cra');
    Object.values(players).forEach(p => {
      Out.line(`  ${p.name}  [${p.nodeId||'?'}]  HP:${p.hp||'?'}`, p.color||'t-eco');
    });
    Out.sp();
  }

  function playersEnNodo(nodeId) {
    return Object.values(players).filter(p => p.nodeId === nodeId);
  }

  function _genRoomId() {
    const words = ['eco','sol','mar','rio','luz','voz','red','nexo','nodo','arco','filo','ola','roca','bruma','senda','umbral','grieta'];
    const pick  = () => words[Math.floor(Math.random()*words.length)];
    return `${pick()}-${pick()}-${U.rand(100,999)}`;
  }

  // Escuchar parche de Net en EventBus
  EventBus.on('net:patch', (patch) => { if(role==='host') broadcast(patch); }, 'net_patch');

  return {
    host, connect, acceptConexion, disconnect, sendAction,
    cmdJugadores, playersEnNodo, updateBar,
    getRole:    () => role,
    getId:      () => roomId,
    getPlayers: () => players,
    isHost:     () => role === 'host',
    isClient:   () => role === 'client',
    isOnline:   () => role !== null,
    // Batalla
    startBattle, joinBattle, sendBattleAction, renderBattle,
    getMyBattle:    () => myBattleId ? battles[myBattleId] : null,
    getBattle:      (id) => battles[id],
    getBattleActor: (battle) => actorActual(battle),
    tickAI:         (battle) => _advanceTurnIfAI(battle),
    battles,
    // Trade
    initTrade, getTrade, sendTradeMsg, renderTrade, handleTradeMsg,
  };
})();
