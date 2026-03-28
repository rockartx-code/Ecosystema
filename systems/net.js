// ════════════════════════════════════════════════════════════════
// NET — bootstrap (data + lógica)
// ════════════════════════════════════════════════════════════════
const Net = (() => {
  const NET_DATA_FALLBACK = {
    max_clients: 7,
    colors: ['t-eco','t-mem','t-acc','t-mag','t-cri','t-mis','t-cor'],
  };

  function loadNetData() {
    // Fuente consolidada en data/module.json (legacy: systems/net/data.json)
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
      XP: typeof XP !== 'undefined' ? XP : undefined,
      Player,
      Combat: typeof Combat !== 'undefined' ? Combat : undefined,
      CombatResolution: typeof CombatResolution !== 'undefined' ? CombatResolution : undefined,
      Tactics: typeof Tactics !== 'undefined' ? Tactics : undefined,
      refreshStatus,
      save,
      ConcentracionSystem: typeof ConcentracionSystem !== 'undefined' ? ConcentracionSystem : undefined,
      ItemSystem: typeof ItemSystem !== 'undefined' ? ItemSystem : undefined,
      ArcEngine: typeof ArcEngine !== 'undefined' ? ArcEngine : undefined,
      ModuleLoader,
    },
  });
})();
