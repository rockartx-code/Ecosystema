// ════════════════════════════════════════════════════════════════
// WORLD AI — bootstrap (data + lógica)
// ════════════════════════════════════════════════════════════════
const WorldAI = (() => {
  const _cfgObj = (path, fallback) => {
    try {
      const v = ModuleLoader?.get?.(path);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback;
    } catch {
      return fallback;
    }
  };

  const WORLD_AI_DATA_FALLBACK = {
    migration_interval: 5,
    preferencias: {
      enemy: { abismo:3, ruina:2, umbral:2, yermo:2, hub:0 },
      creature: { bosque:3, pantano:2, caverna:2, ruina:1, hub:0 },
      npc: { hub:3, templo:2, ruina:1, bosque:1, abismo:0 },
    },
    heuristicas: {
      patrullero_keywords: ['guardián', 'custodio'],
      errante_keywords: ['errante', 'eco'],
      cazador_keywords: ['cazador', 'grieta'],
      creature_migrante_chance: 0.5,
      enemy_cazador_chance: 0.4,
      npc_roaming_roles: ['comerciante', 'errante', 'heraldo'],
      npc_move_chance: 0.3,
    },
  };

  function loadWorldAIData() {
    try {
      if (typeof XMLHttpRequest === 'undefined') return WORLD_AI_DATA_FALLBACK;
      const req = new XMLHttpRequest();
      req.open('GET', 'systems/world-ai/data.json', false);
      req.send(null);
      if (req.status >= 200 && req.status < 300 && req.responseText) {
        const parsed = JSON.parse(req.responseText);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    return WORLD_AI_DATA_FALLBACK;
  }

  const create = globalThis.WorldAILogic?.create;
  if (typeof create !== 'function') {
    console.warn('[WorldAI] WorldAILogic no disponible; se desactiva tick de migración.');
    return { tick: () => {} };
  }

  return create({
    data: loadWorldAIData(),
    getCfgObj: _cfgObj,
    deps: {
      Player,
      World,
      Clock,
      GS,
      EventBus,
      Out,
      refreshStatus,
    },
  });
})();
