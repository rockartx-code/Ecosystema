// ════════════════════════════════════════════════════════════════
// ARC ENGINE — bootstrap (data + lógica)
// ════════════════════════════════════════════════════════════════
const ArcEngine = (() => {
  const ARC_DATA_FALLBACK = {
    temas: {},
    plantillas_acto: {},
    consecuencias_resultado: {},
    epitafios: {},
    titulos: {},
  };

  function loadArcData() {
    try {
      if (typeof XMLHttpRequest === 'undefined') return ARC_DATA_FALLBACK;
      const req = new XMLHttpRequest();
      req.open('GET', 'systems/arc-engine/data.json', false);
      req.send(null);
      if (req.status >= 200 && req.status < 300 && req.responseText) {
        const parsed = JSON.parse(req.responseText);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    return ARC_DATA_FALLBACK;
  }

  const create = globalThis.ArcEngineLogic?.create;
  if (typeof create !== 'function') {
    console.warn('[ArcEngine] ArcEngineLogic no disponible; se desactiva runtime de arcos.');
    return {
      genArc: ()=>null,
      activarArc: ()=>null,
      intentarGenArc: ()=>null,
      onMisionResuelta: ()=>{},
      onNPCMuerto: ()=>{},
      cmdArcs: ()=>{},
      TEMAS: {},
      EPITAFIOS: {},
    };
  }

  return create({
    data: loadArcData(),
    deps: {
      U,
      GS,
      D,
      Clock,
      Out,
      EventBus,
      NPCEngine,
      RunMem,
      save,
      XP: typeof XP !== 'undefined' ? XP : undefined,
    },
  });
})();
