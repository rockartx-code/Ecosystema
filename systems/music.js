// ════════════════════════════════════════════════════════════════
// MUSIC ENGINE Logic — motor desacoplado de datos
// ════════════════════════════════════════════════════════════════
(function initMusicLogic(global) {
  function create({ data, deps }) {
    const { ModuleLoader, Out, EventBus } = deps;
  const THEMES = (data && data.themes && typeof data.themes === 'object') ? data.themes : {}
;
  const _themes = () => {
    try {
      const ext = ModuleLoader?.get?.('audio.music.themes');
      return (ext && typeof ext === 'object' && !Array.isArray(ext)) ? ext : THEMES;
    } catch { return THEMES; }
  };

  const FREQS = { "C": 261.63, "C#": 277.18, "D": 293.66, "Eb": 311.13, "E": 329.63, "F": 349.23, "F#": 369.99, "G": 392.00, "Ab": 415.30, "A": 440.00, "Bb": 466.16, "B": 493.88 };

  let audioCtx = null;
  let masterGain = null;
  let echoNode = null;
  let schedulerTimer = null;

  const state = {
    enabled: true,
    isPlaying: false,
    nextNoteTime: 0,
    currentStep: 0,
    theme: 'MAIN_THEME',
    tempo: 120,
    echo: 0.25,
    midiMode: false,
    zoneTheme: 'MAIN_THEME',
    inBattle: false,
  };
  let hooksBound = false;

  function log(text, color = 't-dim', bold = false) {
    if(typeof Out !== 'undefined' && Out.line) Out.line(text, color, bold);
    else console.log('[MusicEngine]', text);
  }

  function getFreq(noteStr) {
    if (!noteStr || noteStr === 'R') return 0;
    const note = noteStr.substring(0, noteStr.length - 1);
    const oct = parseInt(noteStr.substring(noteStr.length - 1), 10) - 4;
    return (FREQS[note] || 261.63) * Math.pow(2, oct);
  }

  function ensureAudio() {
    if(audioCtx) return audioCtx;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.connect(audioCtx.destination);

    echoNode = audioCtx.createDelay();
    const echoFeedback = audioCtx.createGain();
    echoFeedback.gain.value = 0.4;
    echoNode.connect(echoFeedback);
    echoFeedback.connect(echoNode);

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(compressor);
    echoNode.connect(masterGain);

    return audioCtx;
  }

  function playOsc(freq, time, dur, type, vol, vibrato = false) {
    if(freq === 0 || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);

    if(vibrato) {
      const lfo = audioCtx.createOscillator();
      const lfoG = audioCtx.createGain();
      lfo.frequency.value = 6;
      lfoG.gain.value = freq * 0.015;
      lfo.connect(lfoG);
      lfoG.connect(osc.frequency);
      lfo.start(time);
      lfo.stop(time + dur);
    }

    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.02);
    g.gain.linearRampToValueAtTime(0, Math.max(time + 0.021, time + dur - 0.02));

    osc.connect(g);
    g.connect(masterGain);
    if(vibrato || dur > 0.4) g.connect(echoNode);

    osc.start(time);
    osc.stop(time + dur);
  }

  function playNoise(type, time, vol) {
    if(!audioCtx) return;
    const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.1), audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for(let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const filt = audioCtx.createBiquadFilter();
    filt.type = (type === 'H') ? 'highpass' : 'lowpass';
    filt.frequency.value = (type === 'H') ? 7000 : (type === 'S' ? 2000 : 150);

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

    src.connect(filt);
    filt.connect(g);
    g.connect(masterGain);
    src.start(time);
  }

  function scheduler() {
    if(!state.enabled || !state.isPlaying || !audioCtx) return;

    const themes = _themes();
    const theme = themes[state.theme] || themes.MAIN_THEME;
    if(!theme || !theme.lead || !theme.bass || !theme.drums) {
      stop();
      log(`Tema inválido o no cargado: ${state.theme}.`, 't-pel');
      return;
    }
    const stepDur = 60 / state.tempo / 2;
    echoNode.delayTime.setTargetAtTime(state.echo, audioCtx.currentTime, 0.1);

    while(state.nextNoteTime < audioCtx.currentTime + 0.1) {
      const leadArr = theme.lead.split('|');
      const bassArr = theme.bass.split('|');
      const drumArr = theme.drums.split('|');

      const lData = leadArr[state.currentStep % leadArr.length].split(',');
      playOsc(getFreq(lData[0]), state.nextNoteTime, parseFloat(lData[1]) * stepDur, 'square', 0.12, true);

      if(state.currentStep % 2 === 0) {
        const bIdx = (state.currentStep / 2) % bassArr.length;
        const bData = bassArr[bIdx].split(',');
        playOsc(getFreq(bData[0]), state.nextNoteTime, parseFloat(bData[1]) * stepDur, 'triangle', 0.25);
      }

      const dData = drumArr[state.currentStep % drumArr.length].split(',');
      if(dData[0] !== 'R') playNoise(dData[0], state.nextNoteTime, 0.1);

      state.nextNoteTime += stepDur;
      state.currentStep++;
    }

    schedulerTimer = setTimeout(scheduler, 25);
  }

  function start() {
    if(!state.enabled) {
      log('Música desactivada. Usa "musica on" para habilitarla.', 't-dim');
      return;
    }
    const ctx = ensureAudio();
    if(ctx.state === 'suspended') ctx.resume();
    if(state.isPlaying) return;

    state.isPlaying = true;
    state.currentStep = 0;
    state.nextNoteTime = ctx.currentTime + 0.05;
    scheduler();
    log(`♪ BGM ON — ${state.theme} @${state.tempo}bpm`, 't-mag');
  }

  function stop() {
    state.isPlaying = false;
    if(schedulerTimer) clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }

  function setTheme(themeKey) {
    const themes = _themes();
    if(!themes[themeKey]) return false;
    state.theme = themeKey;
    state.tempo = themes[themeKey].bpm;
    return true;
  }

  function setThemeAuto(themeKey, reason = '') {
    if(!setTheme(themeKey)) return false;
    if(state.isPlaying) {
      state.currentStep = 0;
      if(audioCtx) state.nextNoteTime = audioCtx.currentTime + 0.04;
    }
    if(reason) log(`♪ ${themeKey} ← ${reason}`, 't-dim');
    return true;
  }

  function _zoneThemeFor(nodeType) {
    switch((nodeType || '').toLowerCase()) {
      case 'hub':     return 'HUB_SAFE_HAVEN';
      case 'templo':  return 'TEMPLO_ANTIGUO';
      case 'umbral':  return 'UMBRAL_MISTERIO';
      case 'caverna': return 'CAVERNA_ECOS';
      case 'vacío':
      case 'vacio':   return 'VACIO_ETÉREO';
      case 'abismo':  return 'ABISMO_OSCURO';
      case 'pantano': return 'PANTANO_TÓXICO';
      case 'grieta':  return 'GRIETA_TEMPORAL';
      case 'bosque':  return 'BOSQUE_VITAL';
      default:        return 'YERMO_DESOLADO';
    }
  }

  function _updateBattleThemeFromState(battle) {
    if(!battle?.cola) return;
    const vivos = battle.cola.filter(c => c?.vivo && !c?.huyó);
    const players = vivos.filter(c => c.tipo === 'player');
    const enemies = vivos.filter(c => c.tipo !== 'player');
    const playerHp = players.reduce((acc, p) => acc + Math.max(0, p.hp || 0), 0);
    const playerMax = players.reduce((acc, p) => acc + Math.max(1, p.maxHp || p.hp || 1), 0);
    const enemyHp = enemies.reduce((acc, e) => acc + Math.max(0, e.hp || 0), 0);
    const enemyMax = enemies.reduce((acc, e) => acc + Math.max(1, e.maxHp || e.hp || 1), 0);
    const playerRatio = playerMax ? (playerHp / playerMax) : 1;
    const enemyRatio = enemyMax ? (enemyHp / enemyMax) : 1;

    if(playerRatio <= 0.18) { setThemeAuto('CRITICAL_HP', 'HP crítico'); return; }
    if(playerRatio >= 0.65 && enemyRatio <= 0.35) { setThemeAuto('BOSS_WINNING', 'ventaja táctica'); return; }
    if(enemyRatio >= 0.65 && playerRatio <= 0.4) { setThemeAuto('BOSS_LOSING', 'presión enemiga'); return; }
    setThemeAuto('BATTLE_NORMAL', 'combate activo');
  }

  function bindEventHooks() {
    if(hooksBound || typeof EventBus === 'undefined' || !EventBus.on) return;
    hooksBound = true;

    EventBus.on('world:node_enter', ({ node }) => {
      if(state.inBattle) return;
      const zoneTrack = _zoneThemeFor(node?.tipo);
      state.zoneTheme = zoneTrack;
      setThemeAuto(zoneTrack, `zona ${node?.tipo || 'desconocida'}`);
      if(state.enabled && !state.isPlaying) start();
    }, 'music-engine', { priority: 30 });

    EventBus.on('combat:start', ({ battle }) => {
      state.inBattle = true;
      _updateBattleThemeFromState(battle);
      if(state.enabled && !state.isPlaying) start();
    }, 'music-engine', { priority: 30 });

    EventBus.on('combat:after_damage_apply', ({ battle }) => {
      if(!state.inBattle) return;
      _updateBattleThemeFromState(battle);
    }, 'music-engine', { priority: 45 });

    EventBus.on('combat:enemy_used_magia', () => {
      if(state.inBattle) setThemeAuto('BOSS_LOSING', 'magia enemiga');
    }, 'music-engine', { priority: 40 });

    EventBus.on('combat:enemy_defeat', () => {
      if(state.inBattle) setThemeAuto('BOSS_WINNING', 'enemigo derrotado');
    }, 'music-engine', { priority: 40 });

    EventBus.on('combat:post_resolve', ({ battle }) => {
      if(battle?.estado !== 'fin') return;
      state.inBattle = false;
      const playerAlive = battle.cola?.some(c => c.tipo === 'player' && c.vivo && !c.huyó);
      setThemeAuto(playerAlive ? 'FANFARE_VICTORY' : 'FANFARE_DEFEAT', 'fin de batalla');
      setTimeout(() => {
        if(state.inBattle) return;
        setThemeAuto(state.zoneTheme || 'MAIN_THEME', 'retorno a exploración');
      }, 2400);
    }, 'music-engine', { priority: 40 });

    EventBus.on('player:item_add', ({ item }) => {
      const bp = String(item?.blueprint || '').toLowerCase();
      if(bp.includes('legend') || bp.includes('legendario')) {
        setThemeAuto('ITEM_LEGENDARY', 'descubrimiento legendario');
        setTimeout(() => {
          if(!state.inBattle) setThemeAuto(state.zoneTheme || 'MAIN_THEME', 'exploración');
        }, 1700);
      }
    }, 'music-engine', { priority: 35 });
  }

  function cmd(args = []) {
    const sub = (args[0] || 'estado').toLowerCase();

    if(sub === 'estado' || sub === 'status') {
      const t = _themes()[state.theme];
      log(`Música: ${state.enabled ? 'ON' : 'OFF'} · ${state.isPlaying ? 'REPRODUCIENDO' : 'DETENIDA'}`, 't-mag', true);
      log(`Track: ${state.theme} · Tempo: ${state.tempo} · Echo: ${state.echo.toFixed(2)} · MIDI: ${state.midiMode ? 'ON' : 'OFF'}`, 't-dim');
      if(t?.desc) log(t.desc, 't-dim');
      return;
    }

    if(sub === 'on') { state.enabled = true; start(); return; }
    if(sub === 'off') { state.enabled = false; stop(); log('♪ BGM OFF', 't-dim'); return; }
    if(sub === 'play' || sub === 'start') { start(); return; }
    if(sub === 'stop' || sub === 'halt') { stop(); log('♪ BGM detenido', 't-dim'); return; }

    if(sub === 'midi') {
      state.midiMode = !state.midiMode;
      const t = _themes()[state.theme];
      log(`MIDI monitor: ${state.midiMode ? 'ON' : 'OFF'}`, 't-mag');
      if(state.midiMode && t) {
        log(`Lead: ${t.lead}`, 't-dim');
        log(`Bass: ${t.bass}`, 't-dim');
        log(`Drum: ${t.drums}`, 't-dim');
      }
      return;
    }

    if(sub === 'lista' || sub === 'list' || sub === 'tracks') {
      log('Tracks disponibles:', 't-mag', true);
      const themes = _themes();
      Object.keys(themes).forEach(k => log(`  - ${k} (${themes[k].bpm} bpm)`, 't-dim'));
      return;
    }

    if(sub === 'track' || sub === 'tema' || sub === 'set') {
      const key = (args[1] || '').toUpperCase();
      if(!key || !setTheme(key)) {
        log('Uso: musica track <NOMBRE_TRACK>  |  musica list', 't-dim');
        return;
      }
      const t = _themes()[state.theme];
      log(`Track cargado: ${state.theme} (${t.bpm} bpm)`, 't-mag');
      log(t.desc, 't-dim');
      return;
    }

    if(sub === 'tempo') {
      const v = parseInt(args[1], 10);
      if(Number.isNaN(v) || v < 50 || v > 230) { log('Tempo inválido. Rango: 50-230.', 't-dim'); return; }
      state.tempo = v;
      log(`Tempo → ${state.tempo} bpm`, 't-mag');
      return;
    }

    if(sub === 'echo') {
      const v = parseFloat(args[1]);
      if(Number.isNaN(v) || v < 0 || v > 0.6) { log('Echo inválido. Rango: 0.0 - 0.6.', 't-dim'); return; }
      state.echo = v;
      log(`Echo → ${state.echo.toFixed(2)}`, 't-mag');
      return;
    }

    log('Comandos: musica estado|on|off|play|stop|midi|list|track <id>|tempo <50-230>|echo <0-0.6>', 't-dim');
  }

  return {
    THEMES,
    cmd,
    start,
    stop,
    play: start,
    setTheme,
    bindEventHooks,
    state: () => ({ ...state }),
    getAudioContext: () => ensureAudio(),
  };
  }

  global.MusicLogic = { create };
})(globalThis);

// ════════════════════════════════════════════════════════════════
// MUSIC ENGINE — bootstrap (data + lógica)
// ════════════════════════════════════════════════════════════════
const MusicEngine = (() => {
  const MUSIC_DATA_FALLBACK = { themes: {} };

  function loadMusicData() {
    // Fuente consolidada en data/module.json
    try { return ModuleLoader?.getSystemData?.('music', MUSIC_DATA_FALLBACK) || MUSIC_DATA_FALLBACK; }
    catch {}
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
