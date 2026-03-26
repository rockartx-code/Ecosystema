// ════════════════════════════════════════════════════════════════
// SFX ENGINE — Generador de efectos (WebAudio)
// Basado en samples/sample_sfx.html (efectos y técnicas integrados)
// ════════════════════════════════════════════════════════════════
const SFXEngine = (() => {
  let audioCtx = null;
  let sfxGain = null;

  const state = {
    enabled: true,
    volume: 0.8,
  };
  let hooksBound = false;

  const SFX_LIST = [
    'accept','fail','move','talk','trade','map',
    'attack','damage','hurt','poison','burn','flee',
    'cast','skill','upgrade','levelup','forge','enchant','train','catch','execute'
  ];

  function log(text, color = 't-dim', bold = false) {
    if(typeof Out !== 'undefined' && Out.line) Out.line(text, color, bold);
    else console.log('[SFXEngine]', text);
  }

  function ensureAudio() {
    if(audioCtx) return audioCtx;

    if(typeof MusicEngine !== 'undefined' && MusicEngine.getAudioContext) {
      audioCtx = MusicEngine.getAudioContext();
    } else {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = state.volume;
    sfxGain.connect(audioCtx.destination);

    return audioCtx;
  }

  function playOsc(freq, time, dur, type = 'sine', vol = 0.25, toZeroLinear = true, toZeroExp = false) {
    if(!audioCtx || freq <= 0) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(vol, time);
    if(toZeroExp) g.gain.exponentialRampToValueAtTime(0.01, time + dur);
    if(toZeroLinear) g.gain.linearRampToValueAtTime(0.0, time + dur);
    osc.connect(g);
    g.connect(sfxGain);
    osc.start(time);
    osc.stop(time + dur);
    return { osc, gain: g };
  }

  function playNoise(type, time, vol, dur, freq = 1500) {
    if(!audioCtx) return;
    const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * dur), audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for(let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const src = audioCtx.createBufferSource();
    src.buffer = buf;

    const filt = audioCtx.createBiquadFilter();
    filt.type = (type === 'H') ? 'highpass' : (type === 'L' ? 'lowpass' : 'bandpass');
    filt.frequency.value = freq;

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);

    src.connect(filt);
    filt.connect(g);
    g.connect(sfxGain);
    src.start(time);
  }

  function play(type) {
    if(!state.enabled) return;
    const ctx = ensureAudio();
    if(ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g);
    g.connect(sfxGain);

    switch(type) {
      case 'accept':
        osc.type = 'square'; osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(1320, t + 0.1);
        g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        osc.start(t); osc.stop(t + 0.2);
        break;
      case 'fail':
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(110, t);
        osc.frequency.linearRampToValueAtTime(55, t + 0.3);
        g.gain.setValueAtTime(0.3, t); g.gain.linearRampToValueAtTime(0.01, t + 0.3);
        osc.start(t); osc.stop(t + 0.3);
        break;
      case 'move':
        osc.type = 'triangle'; osc.frequency.setValueAtTime(440, t);
        osc.frequency.exponentialRampToValueAtTime(110, t + 0.05);
        g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
        osc.start(t); osc.stop(t + 0.05);
        break;
      case 'map':
        playNoise('L', t, 0.3, 0.3, 500);
        break;
      case 'talk':
        [0, 0.08, 0.16].forEach(delay => {
          const o = ctx.createOscillator();
          const gn = ctx.createGain();
          o.frequency.value = 600 + (Math.random() * 200);
          o.connect(gn);
          gn.connect(sfxGain);
          gn.gain.setValueAtTime(0.1, t + delay);
          gn.gain.exponentialRampToValueAtTime(0.01, t + delay + 0.05);
          o.start(t + delay);
          o.stop(t + delay + 0.06);
        });
        break;
      case 'trade':
        [660, 880, 990].forEach((f, i) => {
          const o = ctx.createOscillator();
          const gn = ctx.createGain();
          o.type = 'square';
          o.frequency.value = f;
          o.connect(gn);
          gn.connect(sfxGain);
          gn.gain.setValueAtTime(0.01, t + i * 0.08);
          gn.gain.exponentialRampToValueAtTime(0.18, t + i * 0.08 + 0.02);
          gn.gain.exponentialRampToValueAtTime(0.01, t + i * 0.08 + 0.1);
          o.start(t + i * 0.08);
          o.stop(t + i * 0.08 + 0.1);
        });
        break;
      case 'attack':
        playNoise('H', t, 0.4, 0.1, 8000);
        break;
      case 'damage':
        playNoise('L', t, 0.6, 0.2, 1000);
        osc.frequency.setValueAtTime(100, t); osc.frequency.linearRampToValueAtTime(40, t + 0.2);
        g.gain.setValueAtTime(0.4, t); g.gain.linearRampToValueAtTime(0, t + 0.2);
        osc.start(t); osc.stop(t + 0.2);
        break;
      case 'hurt':
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
        g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
        osc.start(t); osc.stop(t + 0.25);
        playNoise('L', t, 0.3, 0.2, 500);
        break;
      case 'poison':
        osc.type = 'triangle'; osc.frequency.setValueAtTime(260, t);
        osc.frequency.linearRampToValueAtTime(220, t + 0.25);
        g.gain.setValueAtTime(0.18, t); g.gain.linearRampToValueAtTime(0, t + 0.3);
        osc.start(t); osc.stop(t + 0.3);
        playNoise('S', t, 0.18, 0.25, 700);
        break;
      case 'burn':
        playNoise('H', t, 0.35, 0.3, 3000);
        playOsc(180, t, 0.25, 'sawtooth', 0.2, true, false);
        break;
      case 'cast':
        playNoise('H', t, 0.3, 0.5, 4000);
        osc.type = 'sine'; osc.frequency.setValueAtTime(440, t);
        osc.frequency.exponentialRampToValueAtTime(1760, t + 0.5);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.2);
        g.gain.linearRampToValueAtTime(0, t + 0.5);
        osc.start(t); osc.stop(t + 0.5);
        break;
      case 'skill':
        osc.type = 'square'; osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(800, t + 0.1);
        g.gain.setValueAtTime(0.4, t); g.gain.linearRampToValueAtTime(0, t + 0.3);
        osc.start(t); osc.stop(t + 0.3);
        playNoise('S', t, 0.5, 0.1, 2000);
        break;
      case 'levelup':
        [523, 659, 783, 1046].forEach((f, i) => {
          const o = ctx.createOscillator();
          const gn = ctx.createGain();
          o.type = 'square'; o.frequency.value = f; o.connect(gn); gn.connect(sfxGain);
          gn.gain.setValueAtTime(0, t + i * 0.12); gn.gain.linearRampToValueAtTime(0.2, t + i * 0.12 + 0.05);
          gn.gain.linearRampToValueAtTime(0, t + i * 0.12 + 0.2);
          o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.25);
        });
        break;
      case 'upgrade':
        for(let i = 0; i < 8; i++) {
          const o = ctx.createOscillator();
          const gn = ctx.createGain();
          o.type = 'sine'; o.frequency.value = 800 + (i * 200);
          o.connect(gn); gn.connect(sfxGain);
          gn.gain.setValueAtTime(0, t + i * 0.04);
          gn.gain.linearRampToValueAtTime(0.15, t + i * 0.04 + 0.02);
          gn.gain.linearRampToValueAtTime(0, t + i * 0.04 + 0.1);
          o.start(t + i * 0.04); o.stop(t + i * 0.04 + 0.1);
        }
        break;
      case 'enchant':
        osc.type = 'sine'; osc.frequency.setValueAtTime(1500, t);
        const lfo = ctx.createOscillator();
        const lfoG = ctx.createGain();
        lfo.frequency.value = 25; lfoG.gain.value = 200;
        lfo.connect(lfoG); lfoG.connect(osc.frequency);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.1);
        g.gain.linearRampToValueAtTime(0, t + 0.6);
        lfo.start(t); osc.start(t); lfo.stop(t + 0.6); osc.stop(t + 0.6);
        break;
      case 'catch':
        playNoise('L', t, 0.5, 0.1, 300);
        const o2 = ctx.createOscillator();
        const gn2 = ctx.createGain();
        o2.type = 'square'; o2.frequency.setValueAtTime(1200, t + 0.15);
        o2.connect(gn2); gn2.connect(sfxGain);
        gn2.gain.setValueAtTime(0.2, t + 0.15); gn2.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
        o2.start(t + 0.15); o2.stop(t + 0.25);
        break;
      case 'train':
        [0, 0.15].forEach(d => {
          playNoise('L', t + d, 0.4, 0.1, 1500);
          playOsc(200, t + d, 0.1, 'triangle', 0.3, false, true);
        });
        break;
      case 'forge':
        osc.type = 'square'; osc.frequency.setValueAtTime(2000, t);
        osc.frequency.exponentialRampToValueAtTime(400, t + 0.15);
        g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        osc.start(t); osc.stop(t + 0.2);
        break;
      case 'flee':
        osc.frequency.setValueAtTime(300, t); osc.frequency.exponentialRampToValueAtTime(1800, t + 0.4);
        g.gain.setValueAtTime(0.2, t); g.gain.linearRampToValueAtTime(0, t + 0.4);
        osc.start(t); osc.stop(t + 0.4);
        break;
      case 'execute':
        playNoise('H', t, 0.55, 0.12, 6000);
        playOsc(90, t, 0.18, 'sawtooth', 0.35, true, false);
        playOsc(50, t + 0.05, 0.2, 'square', 0.22, true, false);
        break;
      default:
        log(`SFX desconocido: ${type}`, 't-dim');
    }
  }

  function cmd(args = []) {
    const sub = (args[0] || 'estado').toLowerCase();

    if(sub === 'estado' || sub === 'status') {
      log(`SFX: ${state.enabled ? 'ON' : 'OFF'} · Volumen ${state.volume.toFixed(2)}`, 't-mag', true);
      log(`Disponibles: ${SFX_LIST.join(', ')}`, 't-dim');
      return;
    }
    if(sub === 'on') { state.enabled = true; log('SFX ON', 't-mag'); return; }
    if(sub === 'off') { state.enabled = false; log('SFX OFF', 't-dim'); return; }

    if(sub === 'vol' || sub === 'volumen') {
      const v = parseFloat(args[1]);
      if(Number.isNaN(v) || v < 0 || v > 1) { log('Volumen inválido. Usa 0.0 a 1.0', 't-dim'); return; }
      state.volume = v;
      ensureAudio();
      sfxGain.gain.setValueAtTime(state.volume, audioCtx.currentTime);
      log(`Volumen SFX → ${state.volume.toFixed(2)}`, 't-mag');
      return;
    }

    if(sub === 'test') {
      ['accept', 'move', 'attack', 'cast', 'levelup'].forEach((s, i) => setTimeout(() => play(s), i * 180));
      log('Test SFX disparado.', 't-mag');
      return;
    }

    const requested = sub;
    if(SFX_LIST.includes(requested)) {
      play(requested);
      return;
    }

    log('Comandos: sfx estado|on|off|vol <0-1>|test|<nombre_sfx>', 't-dim');
  }

  function bindEventHooks() {
    if(hooksBound || typeof EventBus === 'undefined' || !EventBus.on) return;
    hooksBound = true;

    const cmdSfxMap = {
      ir: 'move', go: 'move', n: 'move', s: 'move', e: 'move', o: 'move',
      hablar: 'talk', preguntar: 'talk',
      comerciar: 'trade', confirmar_trade: 'accept', rechazar_trade: 'fail',
      atacar: 'attack', atk: 'attack',
      magia: 'cast', lanzar: 'cast', lanzar_b: 'cast',
      habilidad: 'skill', hab_b: 'skill',
      huir: 'flee', h: 'flee',
      forjar: 'forge', conjurar: 'enchant', encarnar: 'enchant',
      capturar: 'catch', entrenar: 'train', criar: 'upgrade',
      asignar: 'upgrade',
    };

    EventBus.on('command:after', ({ verb }) => {
      const sfx = cmdSfxMap[String(verb || '').toLowerCase()];
      if(sfx) play(sfx);
    }, 'sfx-engine', { priority: 70 });

    EventBus.on('combat:start', () => play('attack'), 'sfx-engine', { priority: 50 });
    EventBus.on('combat:after_damage_apply', ({ target }) => {
      if(target?.tipo === 'player') play('hurt');
      else play('damage');
    }, 'sfx-engine', { priority: 50 });
    EventBus.on('combat:enemy_used_magia', () => play('cast'), 'sfx-engine', { priority: 50 });
    EventBus.on('combat:enemy_used_habilidad', () => play('skill'), 'sfx-engine', { priority: 50 });
    EventBus.on('combat:enemy_defeat', () => play('execute'), 'sfx-engine', { priority: 50 });
    EventBus.on('player:die', () => play('fail'), 'sfx-engine', { priority: 50 });
    EventBus.on('player:item_add', ({ item }) => {
      const bp = String(item?.blueprint || '').toLowerCase();
      if(bp.includes('ancla') || bp.includes('legend')) play('upgrade');
    }, 'sfx-engine', { priority: 60 });
    EventBus.on('player:stat_change', ({ stat, delta }) => {
      if(stat === 'hp' && delta < 0) play('hurt');
    }, 'sfx-engine', { priority: 80 });
  }

  return {
    cmd,
    play,
    sfx: play,
    bindEventHooks,
    list: () => [...SFX_LIST],
    state: () => ({ ...state }),
  };
})();

SFXEngine.bindEventHooks?.();
