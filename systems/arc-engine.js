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
    // Fuente consolidada en data/module.json (legacy: systems/arc-engine/data.json)
    try { return ModuleLoader?.getSystemData?.('arc-engine', ARC_DATA_FALLBACK) || ARC_DATA_FALLBACK; }
    catch {}
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
