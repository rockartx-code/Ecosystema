// ════════════════════════════════════════════════════════════════
// MUSIC ENGINE — Sintetizador BGM (WebAudio)
// Basado en samples/music_samples.html (melodías y técnicas integradas)
// ════════════════════════════════════════════════════════════════
const MusicEngine = (() => {
  const THEMES = {
    "MAIN_THEME": {
      bpm: 135, desc: "Leitmotiv Heroico: La esencia de la aventura. Marcha triunfal en Do Menor.",
      lead: "C4,1|Eb4,1|G4,1|C5,1|Bb4,1|G4,1|F4,1|Eb4,1|C4,1|R,1|G4,1|R,1|C5,2",
      bass: "C2,2|G1,2|Ab1,2|F1,2|C2,2|G1,2|Ab1,2|Bb1,2", drums: "K,1|H,1|S,1|H,1|K,1|K,1|S,1|H,1"
    },
    "BATTLE_NORMAL": {
      bpm: 155, desc: "Combate Normal: Versión rítmica y agresiva del Leitmotiv para encuentros aleatorios.",
      lead: "C4,1|Eb4,1|G4,1|C5,1|Bb4,1|G4,1|F4,1|Eb4,1|D4,1|C4,1|G3,1|C4,1|Eb4,1|F4,1|G4,1|R,1",
      bass: "C2,1|C2,1|G1,1|G1,1|Ab1,1|Ab1,1|F1,1|F1,1", drums: "K,1|H,1|S,1|H,1|K,1|H,1|S,1|H,1"
    },
    "BOSS_WINNING": {
      bpm: 165, desc: "Ventaja de Jefe: El Leitmotiv transmuta a Do Mayor. Sensación de triunfo inminente.",
      lead: "C4,1|E4,1|G4,1|C5,1|B4,1|G4,1|A4,1|G4,1|C5,1|D5,1|E5,1|G5,1|C6,4",
      bass: "C2,1|G2,1|C2,1|G2,1|F2,1|A2,1|G2,1|B2,1", drums: "K,0.5|K,0.5|S,1|K,1|S,1"
    },
    "BOSS_LOSING": {
      bpm: 140, desc: "Peligro de Jefe: El Leitmotiv se rompe con tritonos y escalas disminuidas.",
      lead: "C4,1|Eb4,1|Gb4,1|C5,1|Bb4,1|Gb4,1|F4,1|Eb4,1|Gb3,4|F3,4|C3,4|R,4",
      bass: "C1,4|Gb0,4|F1,4|Db1,4", drums: "K,2|S,2|K,2|S,2"
    },
    "CRITICAL_HP": {
      bpm: 210, desc: "Estado Crítico: Alarma rítmica síncrona con el Leitmotiv acelerado. <10% HP.",
      lead: "C6,0.5|R,0.5|C6,0.5|R,0.5|C4,0.5|Eb4,0.5|G4,0.5|C5,0.5|C6,0.5|R,0.5|C6,0.5|R,0.5|G4,0.5|F4,0.5|Eb4,0.5|D4,0.5",
      bass: "C2,0.5|C2,0.5|Gb1,0.5|Gb1,0.5", drums: "K,0.5|S,0.5|H,0.5|H,0.5"
    },
    "HUB_SAFE_HAVEN": {
      bpm: 110, desc: "Pueblo / Hub: Tranquilidad y seguridad. Melodía armónica en Do Mayor.",
      lead: "C4,1|E4,1|G4,1|C5,1|B4,1|G4,1|A4,1|G4,1|F4,1|E4,1|D4,1|C4,1|G3,1|A3,1|B3,1|C4,1",
      bass: "C2,4|G1,4|A1,4|F1,4", drums: "K,1|H,1|S,1|H,1"
    },
    "TEMPLO_ANTIGUO": {
      bpm: 90, desc: "Templo: Escala frigia/menor armónica. Atmósfera de antigüedad mística.",
      lead: "A3,2|C4,2|E4,2|G#4,2|A4,4|E4,4|F4,4|D4,4",
      bass: "A1,8|E1,8|F1,8|D1,8", drums: "H,2|H,2|S,2|H,2"
    },
    "UMBRAL_MISTERIO": {
      bpm: 100, desc: "Umbral: Zona de misterio. Melodía suspendida que no resuelve.",
      lead: "E4,3|G4,1|A4,3|B4,1|C5,2|B4,2|G4,4",
      bass: "E1,4|A1,4|C2,4|G1,4", drums: "K,2|R,2|S,2|R,2"
    },
    "CAVERNA_ECOS": {
      bpm: 80, desc: "Caverna: Minimalismo y goteo rítmico. Aprovecha el delay del motor.",
      lead: "C5,0.5|R,1.5|Eb5,0.5|R,1.5|G5,0.5|R,1.5|C6,0.5|R,1.5",
      bass: "C2,1|R,3|Eb1,1|R,3", drums: "H,0.5|R,3.5"
    },
    "VACIO_ETÉREO": {
      bpm: 60, desc: "El Vacío: Disonancia larga y etérea. Sin percusión definida.",
      lead: "C4,4|Gb3,4|F3,4|Db3,4",
      bass: "C1,8|Gb0,8", drums: "R,1"
    },
    "ABISMO_OSCURO": {
      bpm: 75, desc: "Abismo: Bajos pesados y opresión. Escala cromática descendente.",
      lead: "C3,1|B2,1|Bb2,1|A2,1|Ab2,1|G2,1|Gb2,1|F2,1",
      bass: "C1,2|C1,2|Db1,2|Db1,2", drums: "K,1|R,1"
    },
    "PANTANO_TÓXICO": {
      bpm: 105, desc: "Pantano: Sonidos 'fangosos' usando intervalos de segunda menor.",
      lead: "F#3,1|G3,1|F#3,1|D3,1|F#3,1|G3,1|Bb3,1|A3,1",
      bass: "F#1,2|G1,2|Bb1,2|A1,2", drums: "K,1|S,1|R,1|S,1"
    },
    "GRIETA_TEMPORAL": {
      bpm: 160, desc: "Grieta: Inestabilidad temporal. Arpegios de gran velocidad.",
      lead: "C4,0.5|E4,0.5|G4,0.5|C5,0.5|Eb4,0.5|G4,0.5|Bb4,0.5|Eb5,0.5",
      bass: "C2,1|Eb2,1|G2,1|Bb2,1", drums: "H,0.5|H,0.5|S,0.5|H,0.5"
    },
    "YERMO_DESOLADO": {
      bpm: 95, desc: "Yermo: Melodía solitaria que evoca el viento y el vacío.",
      lead: "G3,4|R,2|D4,2|C4,6|R,2",
      bass: "G1,8|C1,8", drums: "H,4|R,4"
    },
    "BOSQUE_VITAL": {
      bpm: 135, desc: "Bosque: Naturaleza vibrante. Ritmo sincopado y bajo saltarín.",
      lead: "F4,1|A4,1|C5,1|A4,1|G4,1|Bb4,1|D5,1|Bb4,1",
      bass: "F2,2|G2,2|A2,2|Bb2,2", drums: "K,1|H,1|S,1|H,1"
    },
    "FANFARE_VICTORY": {
      bpm: 150, desc: "Victoria: Fanfarria clásica de triunfo. Brillo en metales (Square wave).",
      lead: "C4,0.5|E4,0.5|G4,0.5|C5,1.5|F4,0.5|A4,0.5|C5,0.5|F5,1.5|C6,4|R,8",
      bass: "C2,3|F2,3|G2,3|C3,4|R,8", drums: "K,1|S,1|K,0.5|K,0.5|S,1|R,8"
    },
    "FANFARE_DEFEAT": {
      bpm: 90, desc: "Derrota: Cierre lúgubre. Armonía descendente.",
      lead: "C4,1|Eb4,1|Gb4,1|F4,2|Eb4,1|Db4,1|C4,4|R,8",
      bass: "C2,4|Ab1,4|Gb1,4|F1,4|C1,4|R,8", drums: "K,4|R,12"
    },
    "ITEM_LEGENDARY": {
      bpm: 160, desc: "Ítem Legendario: Arpegio ascendente cristalino (0.25 ticks).",
      lead: "C5,0.25|E5,0.25|G5,0.25|B5,0.25|C6,0.25|E6,0.25|G6,0.25|B6,0.25|C7,4|R,8",
      bass: "C3,4|G3,4|C4,4|R,8", drums: "H,0.5|H,0.5|H,0.5|H,0.5|R,8"
    },
    "ESCAPE_FRANTIC": {
      bpm: 195, desc: "Escapada: Huida rápida del combate. Escala cromática ascendente.",
      lead: "C4,0.5|Db4,0.5|D4,0.5|Eb4,0.5|E4,0.5|F4,0.5|Gb4,0.5|G4,0.5|R,8",
      bass: "C2,0.5|Db2,0.5|D2,0.5|Eb2,0.5|R,8", drums: "H,0.25|H,0.25|H,0.25|H,0.25|R,8"
    }
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
  };

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

    const theme = THEMES[state.theme] || THEMES.MAIN_THEME;
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
    if(!THEMES[themeKey]) return false;
    state.theme = themeKey;
    state.tempo = THEMES[themeKey].bpm;
    return true;
  }

  function cmd(args = []) {
    const sub = (args[0] || 'estado').toLowerCase();

    if(sub === 'estado' || sub === 'status') {
      const t = THEMES[state.theme];
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
      const t = THEMES[state.theme];
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
      Object.keys(THEMES).forEach(k => log(`  - ${k} (${THEMES[k].bpm} bpm)`, 't-dim'));
      return;
    }

    if(sub === 'track' || sub === 'tema' || sub === 'set') {
      const key = (args[1] || '').toUpperCase();
      if(!key || !setTheme(key)) {
        log('Uso: musica track <NOMBRE_TRACK>  |  musica list', 't-dim');
        return;
      }
      const t = THEMES[state.theme];
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
    state: () => ({ ...state }),
    getAudioContext: () => ensureAudio(),
  };
})();
