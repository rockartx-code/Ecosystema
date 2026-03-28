// ════════════════════════════════════════════════════════════════
// XP — bootstrap (data + lógica)
// ════════════════════════════════════════════════════════════════
const XP = (() => {
  const _cfgObj = (path, fallback) => {
    try {
      const v = ModuleLoader?.get?.(path);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback;
    } catch {
      return fallback;
    }
  };

  const XP_DATA_FALLBACK = {
    ramas: {
      combate: { label:'COMBATE', color:'t-pel', icon:'⚔' },
      forja: { label:'FORJA', color:'t-hab', icon:'⚒' },
      exploración: { label:'EXPLORACIÓN', color:'t-sis', icon:'◉' },
      narrativa: { label:'NARRATIVA', color:'t-npc', icon:'◈' },
      criaturas: { label:'CRIATURAS', color:'t-cri', icon:'✦' },
      cuerpo: { label:'CUERPO', color:'t-cra', icon:'◆' },
      mente: { label:'MENTE', color:'t-mag', icon:'◇' },
      suerte: { label:'SUERTE', color:'t-mem', icon:'✧' },
    },
    atributos: {
      fuerza: { label:'Fuerza', desc:'ATK base +1', color:'t-pel', effect:'atk_plus_1' },
      aguante: { label:'Aguante', desc:'HP máx +5', color:'t-cra', effect:'hp_plus_5' },
      defensa: { label:'Defensa', desc:'DEF base +1', color:'t-sis', effect:'def_plus_1' },
      velocidad: { label:'Velocidad', desc:'Evasión +3% (cap 60%)', color:'t-mem', effect:'evasion_plus_3pct' },
      voluntad: { label:'Voluntad', desc:'Maná máx +8, slot mágico c/3pts', color:'t-mag', effect:'mana_plus_8' },
      vigor: { label:'Vigor', desc:'Stamina máx +10, slot corporal c/3pts', color:'t-hab', effect:'stamina_plus_10' },
      presencia: { label:'Presencia', desc:'Lealtad inicial NPC +3', color:'t-npc', effect:'presencia_plus_1' },
      suerte: { label:'Suerte', desc:'Drop chance +2%', color:'t-mem', effect:'suerte_plus_1' },
    },
  };

  function loadXPData() {
    // Fuente consolidada en data/module.json (legacy: systems/xp/data.json)
    try { return ModuleLoader?.getSystemData?.('xp', XP_DATA_FALLBACK) || XP_DATA_FALLBACK; }
    catch {}
    return XP_DATA_FALLBACK;
  }

  const create = globalThis.XPLogic?.create;
  if (typeof create !== 'function') {
    console.warn('[XP] XPLogic no disponible; usando fallback legacy en memoria.');
    return { ser:()=>({ ramas:{}, puntos:0, atributos:{}, historial:[] }), load:()=>{}, init:()=>{} };
  }

  return create({
    data: loadXPData(),
    getCfgObj: _cfgObj,
    Out,
    Player,
    refreshStatus,
    save,
  });
})();
