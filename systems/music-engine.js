// ════════════════════════════════════════════════════════════════
// MUSIC ENGINE — sintetizador 8-bit (WebAudio + salida MIDI opcional)
// ════════════════════════════════════════════════════════════════

const MusicEngine = (() => {
  const st = {
    enabled: true,
    nodeTipo: null,
    melody: [],
    step: 0,
    timer: null,
    ctx: null,
    gain: null,
    midiAccess: null,
    midiOut: null,
    midiEnabled: false,
    noteOffTimer: null,
  };

  const SEMI = { C:0, 'C#':1, DB:1, D:2, 'D#':3, EB:3, E:4, F:5, 'F#':6, GB:6, G:7, 'G#':8, AB:8, A:9, 'A#':10, BB:10, B:11 };

  function _cfg() {
    const world = D.world || {};
    return {
      bpm: world.musica_8bit?.bpm || 156,
      volume: world.musica_8bit?.volume ?? 0.05,
      pulse: world.musica_8bit?.pulse || 'square',
      melodies: world.melodias_8bit_por_tipo || {},
    };
  }

  function _noteToMidi(note) {
    if(!note || note === 'R') return null;
    const m = String(note).trim().toUpperCase().match(/^([A-G](?:#|B)?)(-?\d)$/);
    if(!m) return null;
    const semi = SEMI[m[1]];
    if(semi == null) return null;
    const oct = Number(m[2]);
    return (oct + 1) * 12 + semi;
  }

  function _midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function _ensureAudio() {
    if(st.ctx) return st.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return null;
    st.ctx = new Ctx();
    st.gain = st.ctx.createGain();
    st.gain.gain.value = _cfg().volume;
    st.gain.connect(st.ctx.destination);
    return st.ctx;
  }

  async function _ensureMidi() {
    if(st.midiAccess) return st.midiAccess;
    if(!navigator.requestMIDIAccess) return null;
    try {
      st.midiAccess = await navigator.requestMIDIAccess();
      if(!st.midiOut) st.midiOut = st.midiAccess.outputs.values().next().value || null;
      return st.midiAccess;
    } catch(_) {
      return null;
    }
  }

  function _stopMidiNow() {
    if(st.noteOffTimer) clearTimeout(st.noteOffTimer);
    st.noteOffTimer = null;
    if(st.midiOut) {
      for(let n=0; n<128; n++) st.midiOut.send([0x80, n, 0]);
    }
  }

  function _playStep(ev, beatMs) {
    const midi = _noteToMidi(ev?.n);
    if(midi == null) {
      _stopMidiNow();
      return;
    }

    const ctx = _ensureAudio();
    if(ctx) {
      if(ctx.state === 'suspended') ctx.resume().catch(()=>{});
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const now = ctx.currentTime;
      const dur = Math.max(0.05, (beatMs * (ev?.d || 1) * 0.9) / 1000);

      osc.type = _cfg().pulse;
      osc.frequency.value = _midiToFreq(midi);
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(1, now + 0.008);
      env.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(env);
      env.connect(st.gain);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    }

    if(st.midiEnabled && st.midiOut) {
      const vel = Math.max(30, Math.min(110, ev?.v || 82));
      st.midiOut.send([0x90, midi, vel]);
      if(st.noteOffTimer) clearTimeout(st.noteOffTimer);
      st.noteOffTimer = setTimeout(() => {
        if(st.midiOut) st.midiOut.send([0x80, midi, 0]);
      }, Math.max(40, beatMs * (ev?.d || 1) * 0.9));
    }
  }

  function _getMelody(tipo) {
    const cfg = _cfg();
    return cfg.melodies[tipo] || cfg.melodies.hub || [];
  }

  function _startLoop() {
    _stopLoop();
    const cfg = _cfg();
    const beatMs = Math.max(80, Math.round(60000 / cfg.bpm));
    st.timer = setInterval(() => {
      if(!st.enabled || !st.melody.length) return;
      const ev = st.melody[st.step % st.melody.length];
      _playStep(ev, beatMs);
      st.step += 1;
    }, beatMs);
  }

  function _stopLoop() {
    if(st.timer) clearInterval(st.timer);
    st.timer = null;
    _stopMidiNow();
  }

  function onNodeEnter(payload) {
    const tipo = payload?.node?.tipo || 'hub';
    st.nodeTipo = tipo;
    st.melody = _getMelody(tipo);
    st.step = 0;
    if(st.enabled) _startLoop();
    return payload;
  }

  function init() {
    EventBus.on('world:node_enter', onNodeEnter);
  }

  async function cmd(args = []) {
    const sub = (args[0] || 'estado').toLowerCase();

    if(sub === 'off' || sub === 'silencio') {
      st.enabled = false;
      _stopLoop();
      Out.line('Música 8-bit: OFF', 't-dim');
      return;
    }

    if(sub === 'on') {
      st.enabled = true;
      _ensureAudio();
      if(!st.melody.length) st.melody = _getMelody(World.node(Player.pos())?.tipo || 'hub');
      _startLoop();
      Out.line(`Música 8-bit: ON · zona ${String(st.nodeTipo || World.node(Player.pos())?.tipo || 'hub').toUpperCase()}`, 't-eco');
      return;
    }

    if(sub === 'midi') {
      const access = await _ensureMidi();
      if(!access) {
        Out.line('WebMIDI no disponible en este navegador.', 't-dim');
        return;
      }
      st.midiOut = st.midiOut || access.outputs.values().next().value || null;
      if(!st.midiOut) {
        Out.line('No hay salida MIDI detectada.', 't-dim');
        return;
      }
      st.midiEnabled = !st.midiEnabled;
      Out.line(`MIDI OUT: ${st.midiEnabled ? 'ON' : 'OFF'} · ${st.midiOut.name || 'salida-1'}`, st.midiEnabled ? 't-mag' : 't-dim');
      return;
    }

    if(sub === 'next') {
      st.step = (st.step + 1) % Math.max(1, st.melody.length);
      Out.line('Patrón 8-bit adelantado un paso.', 't-sis');
      return;
    }

    const current = World.node(Player.pos())?.tipo || 'hub';
    const midiName = st.midiOut?.name || 'sin salida';
    Out.line(`Música: ${st.enabled ? 'ON' : 'OFF'} · zona ${current.toUpperCase()} · pasos ${st.melody.length}`, 't-eco');
    Out.line(`MIDI: ${st.midiEnabled ? 'ON' : 'OFF'} · ${midiName}`, 't-dim');
    Out.line('Usa: musica on | musica off | musica midi | musica estado', 't-dim');
  }

  return { init, cmd };
})();

MusicEngine.init();
