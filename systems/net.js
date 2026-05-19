// ════════════════════════════════════════════════════════════════
// NET Logic — motor desacoplado de datos
// ════════════════════════════════════════════════════════════════
(function initNetLogic(global) {
  function create({ data, deps }) {
    const { U, Out, EventBus, World, GS, Clock, Player, Combat, CombatResolution, refreshStatus, save, ConcentracionSystem, ModuleLoader } = deps;

  function _svc(name) {
    return (typeof global.ServiceRegistry !== 'undefined' && typeof global.ServiceRegistry.get === 'function')
      ? global.ServiceRegistry.get(name)
      : null;
  }
  function _xpState() {
    const fn = _svc('runtime.xp.state');
    if(typeof fn === 'function') return fn() || null;
    const api = _svc('runtime.xp.api');
    const xp = typeof api === 'function' ? api() : null;
    return typeof xp?.ser === 'function' ? xp.ser() : null;
  }
  function _xpLoad(payload) {
    const fn = _svc('runtime.xp.load');
    if(typeof fn === 'function') return !!fn(payload);
    const api = _svc('runtime.xp.api');
    const xp = typeof api === 'function' ? api() : null;
    return typeof xp?.load === 'function' ? !!xp.load(payload) : false;
  }
  // _xpGain/_tactics/_items eran helpers que solo usaba la maquina de
  // batalla. Tras la extraccion a plugin-battle-engine (C1) ya no son
  // necesarios en este adaptador de red.

  let role      = null;    // 'host' | 'client' | null
  const peers   = {};      // peerId → RTCDataChannel wrapper
  const players = {};      // playerId → { name, nodeId, hp, atk, color, peerId }
  let hostPeer  = null;    // peer del host (si somos cliente)
  let roomId    = null;

  const MAX_CLIENTS = Number(data?.max_clients ?? 7);
  const COLORS      = Array.isArray(data?.colors) && data.colors.length ? data.colors : ['t-eco','t-mem','t-acc','t-mag','t-cri','t-mis','t-cor'];
  let colorIdx      = 0;

  // El estado de batallas vive en plugin-battle-engine (C1 del audit).
  // net.js solo recurre a el via runtime.battle.* services.

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
      xp: _xpState(),
      players: { ...players, [Player.get().id]:{ id:Player.get().id, name:Player.get().name, nodeId:Player.pos(), hp:Player.get().hp, maxHp:Player.get().maxHp, atk:Player.getAtk(), def:Player.getDef(), color:'t-cra', peerId:'host', isHost:true } },
      ts: Date.now(),
    };
  }

  function applySnapshot(d) {
    World.load(d.world); GS.load(d.gs); Clock.load(d.clock);
    if(d.xp) _xpLoad(d.xp);
    Object.assign(players, d.players||{});
    refreshStatus();
    netMsg('Mundo sincronizado con el host.');
  }

  function buildPatch() {
    return { type:'WORLD_PATCH', world:World.ser(), gs:GS.ser(), clock:Clock.ser(), xp:_xpState(), players:{...players} };
  }

  function applyPatch(d) {
    if(d.world) World.load(d.world);
    if(d.gs)    GS.load(d.gs);
    if(d.clock) Clock.load(d.clock);
    if(d.xp) _xpLoad(d.xp);
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


  // ── Batallas por turnos (delegado a plugin-battle-engine) ─────
  // Tras el C1 del audit SOLID, la maquina tactica vive en
  // plugins/plugin-battle-engine.js. net.js solo expone wrappers para
  // mantener su API publica estable; cada wrapper resuelve el servicio
  // runtime.battle.* registrado por el plugin.
  function startBattle(nodeId, combatants) {
    const fn = _svc('runtime.battle.start');
    return typeof fn === 'function' ? fn(nodeId, combatants) : null;
  }
  function joinBattle(battleId) {
    const fn = _svc('runtime.battle.join');
    if(typeof fn === 'function') fn(battleId);
  }
  function sendBattleAction(battleId, playerId, verb, arg, opts = {}) {
    const fn = _svc('runtime.battle.action');
    if(typeof fn === 'function') fn(battleId, playerId, verb, arg, opts);
  }
  function getMyBattle() {
    const fn = _svc('runtime.battle.current');
    return typeof fn === 'function' ? fn() : null;
  }
  function getBattle(id) {
    const cur = getMyBattle();
    return cur && cur.id === id ? cur : null;
  }
  function actorActual(battle) {
    const fn = _svc('runtime.battle.actor');
    return typeof fn === 'function' ? fn(battle) : null;
  }
  function renderBattle(battle) {
    const fn = _svc('runtime.battle.render');
    if(typeof fn === 'function') fn(battle);
  }
  function _advanceTurnIfAI(battle) {
    const fn = _svc('runtime.battle.tick_ai');
    if(typeof fn === 'function') fn(battle);
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
    // Batalla — wrappers que delegan a plugin-battle-engine via runtime.battle.*
    startBattle, joinBattle, sendBattleAction, renderBattle,
    getMyBattle,
    getBattle,
    getBattleActor: (battle) => actorActual(battle),
    tickAI:         (battle) => _advanceTurnIfAI(battle),
    get battles() {
      // El estado vive en el plugin; este getter mantiene la firma legacy
      // exponiendo un objeto con solo la batalla activa indexada por id.
      const cur = getMyBattle();
      return cur ? { [cur.id]: cur } : {};
    },
    // Trade
    initTrade, getTrade, sendTradeMsg, renderTrade, handleTradeMsg,
  };
  }

  global.NetLogic = { create };
})(globalThis);

// ════════════════════════════════════════════════════════════════
// NET — bootstrap (data + lógica)
// ════════════════════════════════════════════════════════════════
const Net = (() => {
  const NET_DATA_FALLBACK = {
    max_clients: 7,
    colors: ['t-eco','t-mem','t-acc','t-mag','t-cri','t-mis','t-cor'],
  };

  function loadNetData() {
    // Fuente consolidada en data/module.json
    try { return ModuleLoader?.getSystemData?.('net', NET_DATA_FALLBACK) || NET_DATA_FALLBACK; }
    catch {}
    return NET_DATA_FALLBACK;
  }

  const create = globalThis.NetLogic?.create;
  if (typeof create !== 'function') {
    console.warn('[Net] NetLogic no disponible; red deshabilitada.');
    return {
      host: ()=>{}, connect: ()=>{}, acceptConexion: ()=>{}, disconnect: ()=>{}, sendAction: ()=>{},
      cmdJugadores: ()=>{}, playersEnNodo: ()=>[], updateBar: ()=>{},
      getRole: ()=>null, getId: ()=>null, getPlayers: ()=>({}), isHost: ()=>false, isClient: ()=>false, isOnline: ()=>false,
      startBattle: ()=>null, joinBattle: ()=>{}, sendBattleAction: ()=>{}, renderBattle: ()=>{},
      getMyBattle: ()=>null, getBattle: ()=>null, getBattleActor: ()=>null, tickAI: ()=>{}, battles:{},
      initTrade: ()=>null, getTrade: ()=>null, sendTradeMsg: ()=>{}, renderTrade: ()=>{}, handleTradeMsg: ()=>{},
    };
  }

  return create({
    data: loadNetData(),
    deps: {
      U,
      Out,
      EventBus,
      World,
      GS,
      Clock,
      Player,
      Combat: typeof globalThis.Combat !== 'undefined' ? globalThis.Combat : undefined,
      CombatResolution: typeof globalThis.CombatResolution !== 'undefined' ? globalThis.CombatResolution : undefined,
      refreshStatus,
      save: typeof globalThis.save === 'function' ? globalThis.save : () => {},
      ConcentracionSystem: typeof globalThis.ConcentracionSystem !== 'undefined' ? globalThis.ConcentracionSystem : undefined,
      ModuleLoader,
    },
  });
})();

globalThis.Net = Net;
