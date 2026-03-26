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
