// ════════════════════════════════════════════════════════════════
// SFX ENGINE — síntesis procedural por evento (vanilla JS + WebAudio)
// Integrado con técnicas de samples/sample_sfx.html
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

  function _cfg() {
    const world = D.world || {};
    return {
      volume: world.sfx_8bit?.volume ?? st.volume,
      cooldownMs: world.sfx_8bit?.cooldown_ms ?? st.cooldownMs,
      presets: world.sfx_8bit?.presets || {},
    };
  }

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
    'combat:enemy_defeat': 'levelup',
    'player:die': 'defeat',
    'combat:resolve_magia': 'cast',
    'combat:resolve_habilidad': 'skill',
    'player:item_add': 'upgrade',
    'player:equip': 'enchant',
    'forge:after': 'forge',
    'creature:capture_try': 'catch',
    'arc:complete': 'victory',
    'memory:run_end': 'defeat',
    'narrative:mission_complete': 'levelup',
    'narrative:mission_fail': 'fail',
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

  const PRESET_LIBRARY = {
    accept: [{ kind:'tone', type:'square', from:880, to:1320, dur:0.2, vol:0.22 }],
    fail: [{ kind:'tone', type:'sawtooth', from:110, to:55, dur:0.3, vol:0.26 }],
    move: [{ kind:'tone', type:'triangle', from:440, to:110, dur:0.06, vol:0.18 }],
    map: [{ kind:'noise', noiseType:'L', dur:0.3, vol:0.25, freq:500 }],
    talk: [
      { kind:'tone', type:'square', from:620, to:510, at:0.00, dur:0.06, vol:0.12 },
      { kind:'tone', type:'square', from:690, to:545, at:0.08, dur:0.06, vol:0.12 },
      { kind:'tone', type:'square', from:760, to:580, at:0.16, dur:0.06, vol:0.12 },
    ],
    trade: [660, 830, 1040].map((from, i) => ({ kind:'tone', type:'triangle', from, at:i * 0.06, dur:0.09, vol:0.12 })),
    attack: [{ kind:'noise', noiseType:'H', dur:0.1, vol:0.3, freq:8000 }],
    damage: [
      { kind:'noise', noiseType:'L', dur:0.2, vol:0.32, freq:1000 },
      { kind:'tone', type:'sawtooth', from:100, to:40, dur:0.2, vol:0.24 },
    ],
    hurt: [
      { kind:'tone', type:'sawtooth', from:150, to:40, dur:0.25, vol:0.25 },
      { kind:'noise', noiseType:'L', dur:0.2, vol:0.2, freq:500 },
    ],
    poison: [{ kind:'tone', type:'triangle', from:430, to:210, dur:0.36, vol:0.18, vibrato:true }],
    burn: [
      { kind:'noise', noiseType:'H', dur:0.22, vol:0.25, freq:4200 },
      { kind:'tone', type:'square', from:240, to:90, dur:0.18, vol:0.18 },
    ],
    cast: [
      { kind:'noise', noiseType:'H', dur:0.5, vol:0.2, freq:4000 },
      { kind:'tone', type:'sine', from:440, to:1760, dur:0.5, vol:0.2 },
    ],
    skill: [
      { kind:'tone', type:'square', from:200, to:800, dur:0.3, vol:0.28 },
      { kind:'noise', noiseType:'S', dur:0.12, vol:0.22, freq:2000 },
    ],
    upgrade: Array.from({ length: 8 }, (_, i) => ({ kind:'tone', type:'sine', from:800 + i * 200, at:i * 0.04, dur:0.1, vol:0.12 })),
    levelup: [523, 659, 783, 1046].map((from, i) => ({ kind:'tone', type:'square', from, at:i * 0.12, dur:0.2, vol:0.18 })),
    victory: [523, 659, 783, 1046].map((from, i) => ({ kind:'tone', type:'square', from, at:i * 0.12, dur:0.2, vol:0.18 })),
    defeat: [{ kind:'tone', type:'triangle', from:220, to:73, dur:0.45, vol:0.24 }],
    enchant: [{ kind:'tone', type:'sine', from:1500, dur:0.6, vol:0.22, vibrato:true }],
    forge: [{ kind:'tone', type:'square', from:2000, to:400, dur:0.2, vol:0.22 }],
    catch: [
      { kind:'noise', noiseType:'L', dur:0.1, vol:0.3, freq:300 },
      { kind:'tone', type:'square', from:1200, to:900, at:0.14, dur:0.12, vol:0.2 },
    ],
    train: [
      { kind:'noise', noiseType:'L', dur:0.1, vol:0.25, freq:1500, at:0.00 },
      { kind:'noise', noiseType:'L', dur:0.1, vol:0.25, freq:1500, at:0.15 },
      { kind:'tone', type:'triangle', from:200, dur:0.1, vol:0.18, at:0.00 },
      { kind:'tone', type:'triangle', from:200, dur:0.1, vol:0.18, at:0.15 },
    ],
    flee: [{ kind:'tone', type:'sawtooth', from:300, to:1800, dur:0.4, vol:0.2 }],
    battle_start: [
      { kind:'tone', type:'square', from:220, at:0.00, dur:0.14, vol:0.21 },
      { kind:'tone', type:'square', from:277, at:0.11, dur:0.14, vol:0.21 },
      { kind:'tone', type:'square', from:330, at:0.22, dur:0.14, vol:0.21 },
    ],
    execute: [
      { kind:'noise', noiseType:'H', dur:0.08, vol:0.35, freq:8500 },
      { kind:'tone', type:'square', from:880, to:110, dur:0.16, vol:0.2 },
    ],
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
    const baseMidi = 40 + (h % 18);
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

  function _noise(ctx, type = 'L', at = 0, dur = 0.16, vol = 0.4, freq = 800) {
    const frames = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const arr = buf.getChannelData(0);
    for(let i=0; i<frames; i += 1) arr[i] = (Math.random() * 2 - 1) * 0.9;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const biq = ctx.createBiquadFilter();
    biq.type = type === 'H' ? 'highpass' : type === 'S' ? 'bandpass' : 'lowpass';
    biq.frequency.value = freq;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(vol, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    src.connect(biq);
    biq.connect(env);
    env.connect(st.gain);
    src.start(at);
    src.stop(at + dur + 0.01);
  }

  function _tone(ctx, { type = 'square', from = 440, to = null, at = 0, dur = 0.16, vol = 0.25, vibrato = false }) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    if(to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);

    if(vibrato) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 24;
      lfoGain.gain.value = Math.max(20, from * 0.15);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(at);
      lfo.stop(at + dur);
    }

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

    const presetCfg = _cfg().presets[name];
    const actions = Array.isArray(presetCfg) ? presetCfg : (PRESET_LIBRARY[name] || null);
    if(!actions?.length) return false;

    actions.forEach(action => {
      const at = t + Math.max(0, Number(action.at || 0));
      if(action.kind === 'noise') {
        _noise(
          ctx,
          action.noiseType || action.type || 'L',
          at,
          Number(action.dur || 0.1),
          Number(action.vol || 0.2),
          Number(action.freq || 800)
        );
        return;
      }

      _tone(ctx, {
        type: action.type || 'square',
        from: Number(action.from || 440),
        to: action.to == null ? null : Number(action.to),
        at,
        dur: Number(action.dur || 0.16),
        vol: Number(action.vol || 0.2),
        vibrato: !!action.vibrato,
      });
    });
    return true;
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
    st.cooldownMs = Math.max(0, Number(_cfg().cooldownMs ?? st.cooldownMs));
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
    st.volume = Math.max(0, Math.min(0.2, Number(_cfg().volume ?? st.volume)));
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
      const arg = String(args[1] || 'combat:start');
      if(_playPreset(arg)) {
        Out.line(`SFX test preset: ${arg}`, 't-mag');
        return;
      }
      _playPattern(_eventToPattern(arg));
      Out.line(`SFX test evento: ${arg}`, 't-mag');
      return;
    }

    Out.line(`SFX: ${st.enabled ? 'ON' : 'OFF'} · eventos ${EVENT_CATALOG.length} · vol ${(st.volume * 100).toFixed(1)}%`, 't-eco');
    Out.line('Usa: sfx on | sfx off | sfx vol 5 | sfx test combat:start | sfx test levelup', 't-dim');
  }

  return { init, cmd, events: () => [...EVENT_CATALOG] };
})();

SFXEngine.init();
