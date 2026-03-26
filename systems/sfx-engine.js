// ════════════════════════════════════════════════════════════════
// SFX ENGINE — síntesis procedural por evento (vanilla JS + WebAudio)
// ════════════════════════════════════════════════════════════════

const SFXEngine = (() => {
  const st = {
    enabled: true,
    volume: 0.055,
    ctx: null,
    gain: null,
    bound: false,
    lastTs: {},
    cooldownMs: 65,
  };
  const EVENT_PRESETS = {
    'command:after': 'accept',
    'command:unknown': 'fail',
    'world:node_enter': 'move',
    'world:node_exit': 'move',
    'narrative:npc_speak': 'talk',
    'narrative:npc_interact': 'talk',
    'combat:before_attack': 'attack',
    'combat:after_attack': 'skill',
    'combat:player_hit': 'damage',
    'combat:start': 'battle_start',
    'combat:enemy_defeat': 'victory',
    'player:die': 'defeat',
    'combat:resolve_magia': 'cast',
    'combat:resolve_habilidad': 'skill',
    'player:item_add': 'upgrade',
    'player:equip': 'upgrade',
    'forge:after': 'forge',
    'creature:capture_try': 'catch',
    'arc:complete': 'victory',
    'memory:run_end': 'defeat',
  };

  const EVENT_CATALOG = [
    'world:before_gen','world:after_gen','world:node_enter','world:node_exit','world:tick','world:section_expand',
    'world:calc_difficulty','world:request_enemies',
    'forge:before','forge:resolve_type','forge:after','forge:collapse','forge:imprint_gen',
    'combat:start','combat:before_attack','combat:after_attack','combat:player_hit','combat:enemy_defeat','combat:loot','combat:resolve_ia','combat:resolve_habilidad','combat:resolve_magia','combat:post_resolve',
    'narrative:npc_gen','narrative:npc_speak','narrative:npc_interact','narrative:npc_twist','narrative:npc_death','narrative:mission_gen','narrative:mission_complete','narrative:mission_fail',
    'creature:gen','creature:capture_try','creature:breed_result',
    'player:create','player:stat_change','player:item_add','player:item_remove','player:equip','player:die','player:tick',
    'memory:run_end','memory:run_start',
    'command:before','command:unknown','command:after',
    'output:collect_status','render:node_extra',
    'arc:start','arc:advance','arc:complete',
    'boss:spawn','boss:defeated',
    'faction:init',
    'plugin:loaded','plugin:unloaded','module:loaded',
    'game:new_world'
  ];

  const GROUP_COLORS = {
    world: 'triangle',
    forge: 'sawtooth',
    combat: 'square',
    narrative: 'sine',
    creature: 'triangle',
    player: 'sine',
    memory: 'sawtooth',
    command: 'square',
    output: 'sine',
    render: 'sine',
    arc: 'triangle',
    boss: 'square',
    faction: 'triangle',
    plugin: 'sawtooth',
    module: 'sawtooth',
    game: 'triangle',
    misc: 'sine',
  };

  function _hash(text) {
    let h = 2166136261;
    for(let i=0; i<text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function _groupOf(eventName) {
    const [prefix] = String(eventName || 'misc').split(':');
    return prefix || 'misc';
  }

  function _ensureAudio() {
    if(st.ctx) return st.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return null;

    st.ctx = new Ctx();
    st.gain = st.ctx.createGain();
    st.gain.gain.value = st.volume;
    st.gain.connect(st.ctx.destination);
    return st.ctx;
  }

  function _eventToPattern(eventName) {
    const h = _hash(eventName);
    const group = _groupOf(eventName);

    const semis = [0, 3, 5, 7, 10, 12, 14, 17];
    const baseMidi = 40 + (h % 18); // E2..F#3
    const oscType = GROUP_COLORS[group] || GROUP_COLORS.misc;

    const len = 2 + ((h >> 5) % 3);
    const notes = [];
    for(let i=0; i<len; i += 1) {
      const idx = (h >> (i * 4)) % semis.length;
      const midi = baseMidi + semis[idx] + (group === 'combat' ? 12 : 0);
      const dur = 0.045 + (((h >> (10 + i * 3)) % 28) / 1000);
      const gap = 0.01 + (((h >> (15 + i * 2)) % 12) / 1000);
      notes.push({ midi, dur, gap });
    }

    return {
      eventName,
      group,
      oscType,
      attack: 0.002,
      release: 0.02,
      notes,
    };
  }

  function _midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function _noise(ctx, type = 'L', freq = 800, at = 0, dur = 0.16, vol = 0.4) {
    const frames = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const arr = buf.getChannelData(0);
    for(let i=0; i<frames; i += 1) arr[i] = (Math.random() * 2 - 1) * 0.9;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const biq = ctx.createBiquadFilter();
    const env = ctx.createGain();
    biq.type = type === 'H' ? 'highpass' : type === 'B' ? 'bandpass' : 'lowpass';
    biq.frequency.value = freq;
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(vol, at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(biq);
    biq.connect(env);
    env.connect(st.gain);
    src.start(at);
    src.stop(at + dur + 0.01);
  }

  function _tone(ctx, { type = 'square', from = 440, to = null, at = 0, dur = 0.16, vol = 0.25 }) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    if(to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(vol, at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env);
    env.connect(st.gain);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  function _playPreset(name) {
    const ctx = _ensureAudio();
    if(!ctx) return false;
    if(ctx.state === 'suspended') ctx.resume().catch(()=>{});
    const t = ctx.currentTime;

    switch(name) {
      case 'accept':
        _tone(ctx, { type:'square', from:880, to:1320, at:t, dur:0.18, vol:0.22 });
        return true;
      case 'fail':
        _tone(ctx, { type:'sawtooth', from:120, to:55, at:t, dur:0.28, vol:0.26 });
        return true;
      case 'move':
        _tone(ctx, { type:'triangle', from:460, to:120, at:t, dur:0.06, vol:0.18 });
        return true;
      case 'talk':
        [0, 0.08, 0.16].forEach((d, i) => _tone(ctx, { type:'square', from:620 + i * 70, to:510 + i * 30, at:t + d, dur:0.06, vol:0.12 }));
        return true;
      case 'attack':
        _noise(ctx, 'H', 6000, t, 0.09, 0.28);
        return true;
      case 'damage':
        _noise(ctx, 'L', 900, t, 0.16, 0.32);
        _tone(ctx, { type:'sawtooth', from:130, to:45, at:t, dur:0.2, vol:0.24 });
        return true;
      case 'cast':
        _noise(ctx, 'H', 3800, t, 0.3, 0.2);
        _tone(ctx, { type:'sine', from:420, to:1680, at:t, dur:0.42, vol:0.2 });
        return true;
      case 'skill':
        _tone(ctx, { type:'square', from:220, to:860, at:t, dur:0.14, vol:0.28 });
        _noise(ctx, 'B', 2300, t, 0.12, 0.22);
        return true;
      case 'upgrade':
        for(let i=0; i<7; i += 1) _tone(ctx, { type:'sine', from:700 + i * 170, at:t + i * 0.04, dur:0.09, vol:0.12 });
        return true;
      case 'victory':
        [523, 659, 783, 1046].forEach((f, i) => _tone(ctx, { type:'square', from:f, at:t + i * 0.12, dur:0.2, vol:0.18 }));
        return true;
      case 'defeat':
        _tone(ctx, { type:'triangle', from:220, to:73, at:t, dur:0.45, vol:0.24 });
        return true;
      case 'forge':
        [440, 554, 659, 880].forEach((f, i) => _tone(ctx, { type:'sine', from:f, at:t + i * 0.07, dur:0.15, vol:0.14 }));
        return true;
      case 'catch':
        _noise(ctx, 'L', 300, t, 0.1, 0.3);
        _tone(ctx, { type:'square', from:1200, to:900, at:t + 0.14, dur:0.12, vol:0.2 });
        return true;
      case 'battle_start':
        _tone(ctx, { type:'square', from:220, at:t, dur:0.14, vol:0.21 });
        _tone(ctx, { type:'square', from:277, at:t + 0.11, dur:0.14, vol:0.21 });
        _tone(ctx, { type:'square', from:330, at:t + 0.22, dur:0.14, vol:0.21 });
        return true;
      default:
        return false;
    }
  }

  function _playPattern(pattern) {
    if(!st.enabled) return;
    const ctx = _ensureAudio();
    if(!ctx) return;
    if(ctx.state === 'suspended') ctx.resume().catch(()=>{});

    let cursor = ctx.currentTime;

    for(const n of pattern.notes) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();

      osc.type = pattern.oscType;
      osc.frequency.setValueAtTime(_midiToHz(n.midi), cursor);

      env.gain.setValueAtTime(0.0001, cursor);
      env.gain.linearRampToValueAtTime(1.0, cursor + pattern.attack);
      env.gain.exponentialRampToValueAtTime(0.001, cursor + n.dur + pattern.release);

      osc.connect(env);
      env.connect(st.gain);

      osc.start(cursor);
      osc.stop(cursor + n.dur + pattern.release + 0.005);

      cursor += n.dur + n.gap;
    }
  }

  function _shouldPlay(eventName) {
    const now = performance.now();
    const prev = st.lastTs[eventName] || 0;
    if(now - prev < st.cooldownMs) return false;
    st.lastTs[eventName] = now;
    return true;
  }

  function _handleEvent(eventName) {
    if(!st.enabled || !_shouldPlay(eventName)) return;
    const preset = EVENT_PRESETS[eventName];
    if(preset && _playPreset(preset)) return;
    _playPattern(_eventToPattern(eventName));
  }

  function _bindAll() {
    if(st.bound) return;
    st.bound = true;

    EVENT_CATALOG.forEach(ev => {
      EventBus.on(ev, payload => {
        _handleEvent(ev);
        return payload;
      }, 'core:sfx', { priority: 95 });
    });
  }

  function init() {
    _bindAll();
  }

  function cmd(args = []) {
    const sub = String(args[0] || 'estado').toLowerCase();

    if(sub === 'on') {
      st.enabled = true;
      _ensureAudio();
      Out.line('SFX: ON', 't-eco');
      return;
    }

    if(sub === 'off' || sub === 'silencio') {
      st.enabled = false;
      Out.line('SFX: OFF', 't-dim');
      return;
    }

    if(sub === 'vol' || sub === 'volumen') {
      const v = Number(args[1]);
      if(Number.isNaN(v)) {
        Out.line(`Volumen actual SFX: ${(st.volume * 100).toFixed(1)}%`, 't-dim');
        return;
      }
      st.volume = Math.max(0, Math.min(0.2, v / 100));
      if(st.gain) st.gain.gain.value = st.volume;
      Out.line(`SFX volumen: ${(st.volume * 100).toFixed(1)}%`, 't-eco');
      return;
    }

    if(sub === 'test') {
      const ev = String(args[1] || 'combat:start');
      _playPattern(_eventToPattern(ev));
      Out.line(`SFX test: ${ev}`, 't-mag');
      return;
    }

    Out.line(`SFX: ${st.enabled ? 'ON' : 'OFF'} · eventos ${EVENT_CATALOG.length} · vol ${(st.volume * 100).toFixed(1)}%`, 't-eco');
    Out.line('Usa: sfx on | sfx off | sfx vol 5 | sfx test combat:start', 't-dim');
  }

  return { init, cmd, events: () => [...EVENT_CATALOG] };
})();

SFXEngine.init();
