// ════════════════════════════════════════════════════════════════
// MUSIC ENGINE — sintetizador 8-bit (WebAudio + salida MIDI opcional)
// Integrado con técnicas/melodías curadas desde samples/music_samples.html
// ════════════════════════════════════════════════════════════════

const MusicEngine = (() => {
  const st = {
    enabled: true,
    nodeTipo: null,
    themeKey: 'hub',
    track: null,
    step: 0,
    schedulerTimer: null,
    ctx: null,
    gain: null,
    compressor: null,
    delay: null,
    delayFb: null,
    battle: { active:false, tipo:'normal', nodeId:null },
    outcomeTimer: null,
    midiAccess: null,
    midiOut: null,
    midiEnabled: false,
    midiNoteOffTimer: null,
  };

  const SEMI = { C:0, 'C#':1, DB:1, D:2, 'D#':3, EB:3, E:4, F:5, 'F#':6, GB:6, G:7, 'G#':8, AB:8, A:9, 'A#':10, BB:10, B:11 };

  const FALLBACK_THEMES = {
    hub: {
      bpm: 110,
      lead: 'C4,1|E4,1|G4,1|C5,1|B4,1|G4,1|A4,1|G4,1|F4,1|E4,1|D4,1|C4,1|G3,1|A3,1|B3,1|C4,1',
      bass: 'C2,4|G1,4|A1,4|F1,4',
      drums: 'K,1|H,1|S,1|H,1',
    },
    bosque: {
      bpm: 135,
      lead: 'F4,1|A4,1|C5,1|A4,1|G4,1|Bb4,1|D5,1|Bb4,1',
      bass: 'F2,2|G2,2|A2,2|Bb2,2',
      drums: 'K,1|H,1|S,1|H,1',
    },
    caverna: {
      bpm: 80,
      lead: 'C5,0.5|R,1.5|Eb5,0.5|R,1.5|G5,0.5|R,1.5|C6,0.5|R,1.5',
      bass: 'C2,1|R,3|Eb1,1|R,3',
      drums: 'H,0.5|R,3.5',
    },
    vacío: {
      bpm: 60,
      lead: 'C4,4|Gb3,4|F3,4|Db3,4',
      bass: 'C1,8|Gb0,8',
      drums: 'R,1',
    },
    abismo: {
      bpm: 75,
      lead: 'C3,1|B2,1|Bb2,1|A2,1|Ab2,1|G2,1|Gb2,1|F2,1',
      bass: 'C1,2|C1,2|Db1,2|Db1,2',
      drums: 'K,1|R,1',
    },
    grieta: {
      bpm: 160,
      lead: 'C4,0.5|E4,0.5|G4,0.5|C5,0.5|Eb4,0.5|G4,0.5|Bb4,0.5|Eb5,0.5',
      bass: 'C2,1|Eb2,1|G2,1|Bb2,1',
      drums: 'H,0.5|H,0.5|S,0.5|H,0.5',
    },
    templo: {
      bpm: 90,
      lead: 'A3,2|C4,2|E4,2|G#4,2|A4,4|E4,4|F4,4|D4,4',
      bass: 'A1,8|E1,8|F1,8|D1,8',
      drums: 'H,2|H,2|S,2|H,2',
    },
    yermo: {
      bpm: 95,
      lead: 'G3,4|R,2|D4,2|C4,6|R,2',
      bass: 'G1,8|C1,8',
      drums: 'H,4|R,4',
    },
    battle: {
      bpm: 155,
      lead: 'C4,1|Eb4,1|G4,1|C5,1|Bb4,1|G4,1|F4,1|Eb4,1|D4,1|C4,1|G3,1|C4,1|Eb4,1|F4,1|G4,1|R,1',
      bass: 'C2,1|C2,1|G1,1|G1,1|Ab1,1|Ab1,1|F1,1|F1,1',
      drums: 'K,1|H,1|S,1|H,1|K,1|H,1|S,1|H,1',
    },
    battle_lowhp: {
      bpm: 210,
      lead: 'C6,0.5|R,0.5|C6,0.5|R,0.5|C4,0.5|Eb4,0.5|G4,0.5|C5,0.5|C6,0.5|R,0.5|C6,0.5|R,0.5|G4,0.5|F4,0.5|Eb4,0.5|D4,0.5',
      bass: 'C2,0.5|C2,0.5|Gb1,0.5|Gb1,0.5',
      drums: 'K,0.5|S,0.5|H,0.5|H,0.5',
    },
    battle_boss: {
      bpm: 165,
      lead: 'C4,1|E4,1|G4,1|C5,1|B4,1|G4,1|A4,1|G4,1|C5,1|D5,1|E5,1|G5,1|C6,4',
      bass: 'C2,1|G2,1|C2,1|G2,1|F2,1|A2,1|G2,1|B2,1',
      drums: 'K,0.5|K,0.5|S,1|K,1|S,1',
    },
    battle_boss_lowhp: {
      bpm: 140,
      lead: 'C4,1|Eb4,1|Gb4,1|C5,1|Bb4,1|Gb4,1|F4,1|Eb4,1|Gb3,4|F3,4|C3,4|R,4',
      bass: 'C1,4|Gb0,4|F1,4|Db1,4',
      drums: 'K,2|S,2|K,2|S,2',
    },
    battle_trickster: {
      bpm: 195,
      lead: 'C4,0.5|Db4,0.5|D4,0.5|Eb4,0.5|E4,0.5|F4,0.5|Gb4,0.5|G4,0.5|R,8',
      bass: 'C2,0.5|Db2,0.5|D2,0.5|Eb2,0.5|R,8',
      drums: 'H,0.25|H,0.25|H,0.25|H,0.25|R,8',
    },
    battle_win: {
      bpm: 150,
      lead: 'C4,0.5|E4,0.5|G4,0.5|C5,1.5|F4,0.5|A4,0.5|C5,0.5|F5,1.5|C6,4|R,8',
      bass: 'C2,3|F2,3|G2,3|C3,4|R,8',
      drums: 'K,1|S,1|K,0.5|K,0.5|S,1|R,8',
    },
    battle_lose: {
      bpm: 90,
      lead: 'C4,1|Eb4,1|Gb4,1|F4,2|Eb4,1|Db4,1|C4,4|R,8',
      bass: 'C2,4|Ab1,4|Gb1,4|F1,4|C1,4|R,8',
      drums: 'K,4|R,12',
    },
  };

  function _cfg() {
    const world = D.world || {};
    return {
      bpm: world.musica_8bit?.bpm || 156,
      volume: world.musica_8bit?.volume ?? 0.05,
      pulse: world.musica_8bit?.pulse || 'square',
      echoMix: world.musica_8bit?.echo_mix ?? 0.25,
      echoTime: world.musica_8bit?.echo_time ?? 0.14,
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

  function _isLowHp() {
    const p = Player.get?.();
    const hp = p?.hp ?? 0;
    const maxHp = Math.max(1, p?.maxHp || p?.hp || 1);
    return (hp / maxHp) <= 0.35;
  }

  function _ensureAudio() {
    if(st.ctx) return st.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return null;

    st.ctx = new Ctx();
    st.compressor = st.ctx.createDynamicsCompressor();
    st.compressor.threshold.value = -12;

    st.gain = st.ctx.createGain();
    st.gain.gain.value = _cfg().volume;

    st.delay = st.ctx.createDelay();
    st.delay.delayTime.value = _cfg().echoTime;
    st.delayFb = st.ctx.createGain();
    st.delayFb.gain.value = _cfg().echoMix;

    st.gain.connect(st.compressor);
    st.compressor.connect(st.ctx.destination);

    st.delay.connect(st.delayFb);
    st.delayFb.connect(st.delay);
    st.delay.connect(st.gain);

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
    if(st.midiNoteOffTimer) clearTimeout(st.midiNoteOffTimer);
    st.midiNoteOffTimer = null;
    if(st.midiOut) {
      for(let n=0; n<128; n += 1) st.midiOut.send([0x80, n, 0]);
    }
  }

  function _toEvents(str = '') {
    return String(str)
      .split('|')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => {
        const [n, d] = s.split(',');
        return { n: String(n || 'R').trim(), d: Number(d || 1) || 1 };
      });
  }

  function _normalizeCustomTrack(raw) {
    if(Array.isArray(raw)) {
      const lead = raw.map(ev => `${ev?.n || 'R'},${ev?.d || 1}`).join('|');
      return { bpm: _cfg().bpm, lead, bass: 'R,1', drums: 'R,1' };
    }
    if(raw && typeof raw === 'object' && raw.lead) {
      return {
        bpm: Number(raw.bpm) || _cfg().bpm,
        lead: String(raw.lead),
        bass: String(raw.bass || 'R,1'),
        drums: String(raw.drums || 'R,1'),
      };
    }
    return null;
  }

  function _playOsc({ freq, at, dur, type, vol, useEcho = false }) {
    if(!freq) return;
    const ctx = _ensureAudio();
    if(!ctx) return;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);

    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(Math.max(0.01, vol), at + Math.min(0.02, dur * 0.35));
    env.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.04, dur));

    osc.connect(env);
    env.connect(st.gain);
    if(useEcho) env.connect(st.delay);

    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  function _playNoise({ token = 'H', at, dur = 0.1, vol = 0.12 }) {
    const ctx = _ensureAudio();
    if(!ctx) return;

    const frames = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const arr = buf.getChannelData(0);
    for(let i = 0; i < frames; i += 1) arr[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const biq = ctx.createBiquadFilter();
    if(token === 'H') {
      biq.type = 'highpass';
      biq.frequency.value = 7000;
    } else if(token === 'S') {
      biq.type = 'bandpass';
      biq.frequency.value = 2200;
    } else {
      biq.type = 'lowpass';
      biq.frequency.value = 180;
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(Math.max(0.01, vol), at);
    env.gain.exponentialRampToValueAtTime(0.001, at + dur);

    src.connect(biq);
    biq.connect(env);
    env.connect(st.gain);
    src.start(at);
    src.stop(at + dur + 0.01);
  }

  function _getTrack(key) {
    const cfg = _cfg();
    const k = String(key || 'hub').toLowerCase();
    const custom = _normalizeCustomTrack(cfg.melodies[k] || cfg.melodies[key]);
    if(custom) return custom;
    return FALLBACK_THEMES[k] || FALLBACK_THEMES[key] || FALLBACK_THEMES.hub;
  }

  function _pickBattleThemeKey() {
    const low = _isLowHp();
    if(st.battle.tipo === 'boss') return low ? 'battle_boss_lowhp' : 'battle_boss';
    if(st.battle.tipo === 'trickster') return 'battle_trickster';
    return low ? 'battle_lowhp' : 'battle';
  }

  function _getEffectiveBpm(track) {
    const cfgBpm = _cfg().bpm;
    const trackBpm = Number(track?.bpm) || cfgBpm;
    if(!st.battle.active) return trackBpm;
    const factor = st.battle.tipo === 'boss' ? 1.08 : st.battle.tipo === 'trickster' ? 1.04 : 1;
    return Math.round(trackBpm * factor);
  }

  function _scheduleTick() {
    if(!st.enabled) return;
    const ctx = _ensureAudio();
    if(!ctx || !st.track) return;
    if(ctx.state === 'suspended') ctx.resume().catch(()=>{});

    const lead = _toEvents(st.track.lead);
    const bass = _toEvents(st.track.bass);
    const drums = _toEvents(st.track.drums);
    if(!lead.length) return;

    const bpm = Math.max(50, _getEffectiveBpm(st.track));
    const stepDur = 60 / bpm / 2;
    const now = ctx.currentTime;

    let cursor = now + 0.05;
    const windows = 4;
    for(let i = 0; i < windows; i += 1) {
      const idx = st.step + i;

      const l = lead[idx % lead.length];
      const lDur = Math.max(0.05, (l.d || 1) * stepDur);
      const lMidi = _noteToMidi(l.n);
      _playOsc({
        freq: lMidi == null ? 0 : _midiToFreq(lMidi),
        at: cursor,
        dur: lDur,
        type: _cfg().pulse,
        vol: 0.12,
        useEcho: lDur > 0.35,
      });

      if(idx % 2 === 0 && bass.length) {
        const b = bass[(idx / 2) % bass.length];
        const bDur = Math.max(0.05, (b.d || 1) * stepDur);
        const bMidi = _noteToMidi(b.n);
        _playOsc({
          freq: bMidi == null ? 0 : _midiToFreq(bMidi),
          at: cursor,
          dur: bDur,
          type: 'triangle',
          vol: 0.22,
          useEcho: false,
        });
      }

      if(drums.length) {
        const d = drums[idx % drums.length];
        if(d.n !== 'R') _playNoise({ token: d.n, at: cursor, dur: 0.08 + stepDur * 0.25, vol: 0.09 });
      }

      if(st.midiEnabled && st.midiOut && lMidi != null) {
        st.midiOut.send([0x90, lMidi, 84]);
        if(st.midiNoteOffTimer) clearTimeout(st.midiNoteOffTimer);
        st.midiNoteOffTimer = setTimeout(() => st.midiOut?.send([0x80, lMidi, 0]), Math.max(50, lDur * 900));
      }

      cursor += stepDur;
    }

    st.step += windows;
    if(st.battle.active && st.step % Math.max(16, lead.length) === 0) {
      _setThemeByKey(_pickBattleThemeKey(), true);
    }
  }

  function _startLoop() {
    _stopLoop();
    _scheduleTick();
    st.schedulerTimer = setInterval(_scheduleTick, 100);
  }

  function _stopLoop() {
    if(st.schedulerTimer) clearInterval(st.schedulerTimer);
    st.schedulerTimer = null;
    _stopMidiNow();
  }

  function _setThemeByKey(key, restart = false) {
    const nextTrack = _getTrack(key);
    if(!nextTrack) return;
    const changed = st.themeKey !== key || st.track !== nextTrack;
    st.themeKey = key;
    st.track = nextTrack;
    if(changed) st.step = 0;
    if(st.enabled && (restart || changed)) _startLoop();
  }

  function onNodeEnter(payload) {
    if(st.battle.active) return payload;
    const tipo = payload?.node?.tipo || 'hub';
    st.nodeTipo = tipo;
    _setThemeByKey(tipo, true);
    return payload;
  }

  function _battleFlavor(battle) {
    const enemies = battle?.cola?.filter(c => c.tipo !== 'player') || [];
    if(enemies.some(e => e.es_boss)) return 'boss';
    if(enemies.some(e => e.es_trickster || e.trickster || e.tags?.includes?.('trickster'))) return 'trickster';
    return 'normal';
  }

  function onCombatStart({ battle }) {
    if(st.outcomeTimer) clearTimeout(st.outcomeTimer);
    st.outcomeTimer = null;
    st.battle.active = true;
    st.battle.nodeId = battle?.nodeId ?? null;
    st.battle.tipo = _battleFlavor(battle);
    _setThemeByKey(_pickBattleThemeKey(), true);
  }

  function onCombatWin() {
    st.battle.active = false;
    st.battle.tipo = 'normal';
    _setThemeByKey('battle_win', true);
    st.outcomeTimer = setTimeout(() => {
      st.outcomeTimer = null;
      if(st.battle.active) return;
      _setThemeByKey(st.nodeTipo || World.node(Player.pos())?.tipo || 'hub', true);
    }, 2600);
  }

  function onPlayerDie() {
    st.battle.active = false;
    st.battle.tipo = 'normal';
    _setThemeByKey('battle_lose', true);
  }

  function init() {
    EventBus.on('world:node_enter', onNodeEnter);
    EventBus.on('combat:start', onCombatStart);
    EventBus.on('combat:post_resolve', onCombatWin);
    EventBus.on('player:die', onPlayerDie);
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
      if(!st.track) _setThemeByKey(World.node(Player.pos())?.tipo || 'hub', false);
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
      st.step += 1;
      Out.line('Patrón 8-bit adelantado un paso.', 't-sis');
      return;
    }

    if(sub === 'test') {
      const key = String(args[1] || 'hub');
      _setThemeByKey(key, true);
      Out.line(`Música test: ${key.toUpperCase()}`, 't-mag');
      return;
    }

    const current = World.node(Player.pos())?.tipo || 'hub';
    const midiName = st.midiOut?.name || 'sin salida';
    Out.line(`Música: ${st.enabled ? 'ON' : 'OFF'} · tema ${String(st.themeKey).toUpperCase()}`, 't-eco');
    Out.line(`MIDI: ${st.midiEnabled ? 'ON' : 'OFF'} · ${midiName}`, 't-dim');
    Out.line(`Zona actual: ${String(current).toUpperCase()}`, 't-dim');
    Out.line('Usa: musica on | musica off | musica midi | musica test <tipo> | musica estado', 't-dim');
  }

  return { init, cmd };
})();

MusicEngine.init();
