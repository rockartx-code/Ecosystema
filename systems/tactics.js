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
    try {
      if (typeof XMLHttpRequest === 'undefined') return TACTICS_DATA_FALLBACK;
      const req = new XMLHttpRequest();
      req.open('GET', 'systems/tactics/data.json', false);
      req.send(null);
      if (req.status >= 200 && req.status < 300 && req.responseText) {
        const parsed = JSON.parse(req.responseText);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
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
