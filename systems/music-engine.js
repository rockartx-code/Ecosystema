// ════════════════════════════════════════════════════════════════
// MUSIC ENGINE — bootstrap (data + lógica)
// ════════════════════════════════════════════════════════════════
const MusicEngine = (() => {
  const MUSIC_DATA_FALLBACK = { themes: {} };

  function loadMusicData() {
    try {
      if (typeof XMLHttpRequest === 'undefined') return MUSIC_DATA_FALLBACK;
      const req = new XMLHttpRequest();
      req.open('GET', 'systems/music/data.json', false);
      req.send(null);
      if (req.status >= 200 && req.status < 300 && req.responseText) {
        const parsed = JSON.parse(req.responseText);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    return MUSIC_DATA_FALLBACK;
  }

  const create = globalThis.MusicLogic?.create;
  if (typeof create !== 'function') {
    console.warn('[MusicEngine] MusicLogic no disponible; música deshabilitada.');
    return {
      THEMES: {},
      cmd: ()=>{},
      start: ()=>{},
      stop: ()=>{},
      play: ()=>{},
      setTheme: ()=>false,
      bindEventHooks: ()=>{},
      state: ()=>({ enabled:false, isPlaying:false }),
      getAudioContext: ()=>null,
    };
  }

  return create({
    data: loadMusicData(),
    deps: {
      ModuleLoader,
      Out,
      EventBus,
    },
  });
})();

MusicEngine.bindEventHooks?.();

if(typeof EventBus !== 'undefined' && EventBus?.on) {
  EventBus.on('audio:music.play', (p={}) => {
    const track = String(p.track || p.theme || '').toUpperCase();
    if(track) MusicEngine.setTheme(track);
    MusicEngine.play();
    EventBus.emit('audio:music.changed', { track: MusicEngine.state().theme });
    return p;
  }, 'music-engine', { phase:'observe', priority:60 });
}

if(typeof ServiceRegistry !== 'undefined') {
  ServiceRegistry.register('audio.music.play', (track)=>{ if(track) MusicEngine.setTheme(String(track).toUpperCase()); MusicEngine.play(); return true; }, { pluginId:'music-engine', version:'2.2.0' });
  ServiceRegistry.register('audio.music.stop', ()=>{ MusicEngine.stop(); return true; }, { pluginId:'music-engine', version:'2.2.0' });
  ServiceRegistry.register('audio.music.state', ()=>MusicEngine.state(), { pluginId:'music-engine', version:'2.2.0' });
}
