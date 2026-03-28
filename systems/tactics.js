// ════════════════════════════════════════════════════════════════
// TACTICS ENGINE — bootstrap (data + lógica)
// ════════════════════════════════════════════════════════════════
const Tactics = (() => {
  const TACTICS_DATA_FALLBACK = {
    elementos: {},
    reacciones: {},
    climas_nodo: {},
    reacciones_superficie: {},
    efectos_superficie: {},
    heridas: {},
  };

  function loadTacticsData() {
    // Fuente consolidada en data/module.json (legacy: systems/tactics/data.json)
    try { return ModuleLoader?.getSystemData?.('tactics', TACTICS_DATA_FALLBACK) || TACTICS_DATA_FALLBACK; }
    catch {}
    return TACTICS_DATA_FALLBACK;
  }

  const create = globalThis.TacticsLogic?.create;
  if (typeof create !== 'function') {
    console.warn('[Tactics] TacticsLogic no disponible; tácticas deshabilitadas.');
    return {
      initBattle: ()=>{},
      applyTurnEffects: ()=>{},
      onActionResolved: ()=>{},
      cmdTactica: ()=>{},
      getClima: ()=>null,
    };
  }

  return create({
    data: loadTacticsData(),
    deps: {
      U,
      Player,
      World,
      Out,
      EventBus,
      Combat,
      ModuleLoader,
    },
  });
})();
