// ════════════════════════════════════════════════════════════════
// SFX ENGINE — bootstrap (data + lógica)
// ════════════════════════════════════════════════════════════════
const SFXEngine = (() => {
  const SFX_DATA_FALLBACK = {
    sfx_list: [
      'accept','fail','move','talk','trade','map',
      'attack','damage','hurt','poison','burn','flee',
      'cast','skill','upgrade','levelup','forge','enchant','train','catch','execute'
    ],
  };

  function loadSFXData() {
    try {
      if (typeof XMLHttpRequest === 'undefined') return SFX_DATA_FALLBACK;
      const req = new XMLHttpRequest();
      req.open('GET', 'systems/sfx/data.json', false);
      req.send(null);
      if (req.status >= 200 && req.status < 300 && req.responseText) {
        const parsed = JSON.parse(req.responseText);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    return SFX_DATA_FALLBACK;
  }

  const create = globalThis.SFXLogic?.create;
  if (typeof create !== 'function') {
    console.warn('[SFXEngine] SFXLogic no disponible; SFX deshabilitado.');
    return {
      cmd: ()=>{},
      play: ()=>{},
      sfx: ()=>{},
      bindEventHooks: ()=>{},
      list: ()=>[],
      state: ()=>({ enabled:false, volume:0 }),
    };
  }

  return create({
    data: loadSFXData(),
    deps: {
      ModuleLoader,
      Out,
      MusicEngine,
      EventBus,
    },
  });
})();

SFXEngine.bindEventHooks?.();

if(typeof EventBus !== 'undefined' && EventBus?.on) {
  EventBus.on('audio:sfx.play', (p={}) => {
    const cue = String(p.cue || p.type || '').toLowerCase();
    if(cue) SFXEngine.play(cue);
    EventBus.emit('audio:sfx.played', { cue });
    return p;
  }, 'sfx-engine', { phase:'observe', priority:60 });
}

if(typeof ServiceRegistry !== 'undefined') {
  ServiceRegistry.register('audio.sfx.play', (cue)=>{ SFXEngine.play(String(cue || '').toLowerCase()); return true; }, { pluginId:'sfx-engine', version:'2.2.0' });
  ServiceRegistry.register('audio.sfx.list', ()=>SFXEngine.list(), { pluginId:'sfx-engine', version:'2.2.0' });
  ServiceRegistry.register('audio.sfx.state', ()=>SFXEngine.state(), { pluginId:'sfx-engine', version:'2.2.0' });
}
