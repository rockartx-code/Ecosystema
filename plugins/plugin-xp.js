// ════════════════════════════════════════════════════════════════
// PLUGIN: XP v2.0
// Progresion desacoplada registrada como plugin de dominio.
// ════════════════════════════════════════════════════════════════

(function initXPPlugin(global) {
  function _svc(name) {
    return (typeof ServiceRegistry !== 'undefined' && typeof ServiceRegistry.get === 'function')
      ? ServiceRegistry.get(name)
      : null;
  }
  function _player() {
    const fn = _svc('runtime.player.current');
    return typeof fn === 'function' ? fn() : null;
  }
  function _line(text, color='t-out', bold=false) {
    const fn = _svc('runtime.output.line');
    if(typeof fn === 'function') fn(text, color, bold);
  }
  function _sp() {
    const fn = _svc('runtime.output.sp');
    if(typeof fn === 'function') fn();
  }
  function _sep(ch='─', len=46) {
    const fn = _svc('runtime.output.sep');
    if(typeof fn === 'function') fn(ch, len);
  }
  function _statusRefresh() {
    const fn = _svc('runtime.status.refresh');
    if(typeof fn === 'function') fn();
  }
  function _saveGame() {
    const fn = _svc('runtime.game.save');
    if(typeof fn === 'function') fn();
  }

  const EFFECTS = {
    atk_plus_1: (p)=>{ p.atk++; },
    hp_plus_5: (p)=>{ p.maxHp += 5; p.hp = Math.min(p.hp + 5, p.maxHp); },
    def_plus_1: (p)=>{ p.def++; },
    evasion_plus_3pct: (p)=>{ p.evasion = Math.min(0.60, (p.evasion || 0) + 0.03); },
    mana_plus_8: (p)=>{
      p.voluntad_pts = (p.voluntad_pts || 0) + 1;
      p.maxMana = (p.maxMana || 60) + 8;
      p.mana = Math.min(p.mana || 0, p.maxMana);
    },
    stamina_plus_10: (p)=>{
      p.vigor_pts = (p.vigor_pts || 0) + 1;
      p.maxStamina = (p.maxStamina || 100) + 10;
      p.stamina = Math.min(p.stamina || 0, p.maxStamina);
    },
    presencia_plus_1: (p)=>{ p.presencia = (p.presencia || 0) + 1; },
    suerte_plus_1: (p)=>{ p.suerte = (p.suerte || 0) + 1; },
  };

  function buildAtributos(base) {
    const out = {};
    Object.entries(base || {}).forEach(([id, def]) => {
      const effect = EFFECTS[def.effect];
      if(!effect) return;
      out[id] = { ...def, apply: effect };
    });
    return out;
  }

  function getCfgObj(path, fallback) {
    try {
      const v = ModuleLoader?.get?.(path);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback;
    } catch {
      return fallback;
    }
  }

  function loadXPData() {
    const fallback = {
      ramas: {
        combate: { label:'COMBATE', color:'t-pel', icon:'⚔' },
        forja: { label:'FORJA', color:'t-hab', icon:'⚒' },
        exploración: { label:'EXPLORACIÓN', color:'t-sis', icon:'◉' },
        narrativa: { label:'NARRATIVA', color:'t-npc', icon:'◈' },
        criaturas: { label:'CRIATURAS', color:'t-cri', icon:'✦' },
        cuerpo: { label:'CUERPO', color:'t-cra', icon:'◆' },
        mente: { label:'MENTE', color:'t-mag', icon:'◇' },
        suerte: { label:'SUERTE', color:'t-mem', icon:'✧' },
      },
      atributos: {
        fuerza: { label:'Fuerza', desc:'ATK base +1', color:'t-pel', effect:'atk_plus_1' },
        aguante: { label:'Aguante', desc:'HP máx +5', color:'t-cra', effect:'hp_plus_5' },
        defensa: { label:'Defensa', desc:'DEF base +1', color:'t-sis', effect:'def_plus_1' },
        velocidad: { label:'Velocidad', desc:'Evasión +3% (cap 60%)', color:'t-mem', effect:'evasion_plus_3pct' },
        voluntad: { label:'Voluntad', desc:'Maná máx +8, slot mágico c/3pts', color:'t-mag', effect:'mana_plus_8' },
        vigor: { label:'Vigor', desc:'Stamina máx +10, slot corporal c/3pts', color:'t-hab', effect:'stamina_plus_10' },
        presencia: { label:'Presencia', desc:'Lealtad inicial NPC +3', color:'t-npc', effect:'presencia_plus_1' },
        suerte: { label:'Suerte', desc:'Drop chance +2%', color:'t-mem', effect:'suerte_plus_1' },
      },
    };
    try { return ModuleLoader?.getSystemData?.('xp', fallback) || fallback; }
    catch {}
    return fallback;
  }

  function createXPApi() {
    const data = loadXPData();
    const RAMAS_BASE = data.ramas || {};
    const ATRIBUTOS_BASE = data.atributos || {};
    const RAMAS = getCfgObj('systems.xp.ramas', RAMAS_BASE);
    const ATRIBUTOS = buildAtributos(getCfgObj('systems.xp.atributos', ATRIBUTOS_BASE));

    function xpParaNivel(n) { return Math.floor(50 * n * Math.log(n + 1)); }
    function xpAcumulada(n) { let t = 0; for(let i = 1; i < n; i++) t += xpParaNivel(i); return t; }
    function nivelDesdeXP(xp) { let n = 1; while(n < 100 && xp >= xpAcumulada(n + 1)) n++; return n; }
    function xpParaSiguiente(n) { return n >= 100 ? 0 : xpParaNivel(n); }
    function xpEnNivel(xp, n) { return xp - xpAcumulada(n); }

    let state = { ramas: {}, puntos: 0, atributos: {}, historial: [] };

    function init(reset = false) {
      if(reset) state = { ramas: {}, puntos: 0, atributos: {}, historial: [] };
      Object.keys(RAMAS).forEach(r => { if(!state.ramas[r]) state.ramas[r] = { xp: 0, nivel: 1 }; });
      Object.keys(ATRIBUTOS).forEach(a => { if(!state.atributos[a]) state.atributos[a] = 0; });
    }

    function ganar(rama, cantidad, motivo) {
      if(!RAMAS[rama]) return false;
      init();
      const r = state.ramas[rama];
      const nivelAntes = r.nivel;
      r.xp += cantidad;
      r.nivel = nivelDesdeXP(r.xp);

      state.historial.push({ rama, cantidad, motivo, ts: Date.now() });
      if(state.historial.length > 30) state.historial.shift();

      if(r.nivel > nivelAntes) {
        const ganados = r.nivel - nivelAntes;
        state.puntos += ganados;
        const ramaDef = RAMAS[rama];
        setTimeout(() => {
          _sp(); _sep('═');
          _line(`⬆ NIVEL ${r.nivel} — ${ramaDef.icon} ${ramaDef.label}`, ramaDef.color, true);
          if(ganados > 1) _line(`Saltaste ${ganados} niveles.`, 't-dim');
          _line(`+${ganados} punto${ganados > 1 ? 's' : ''} de atributo disponible${ganados > 1 ? 's' : ''}.`, 't-mem');
          _line(`Puntos totales: ${state.puntos}  →  "asignar [atributo]"`, 't-dim');
          _sep('═'); _sp();
          _statusRefresh();
        }, 100);
      }
      return true;
    }

    function asignar(atributo) {
      const def = ATRIBUTOS[atributo];
      if(!def) {
        _line(`Atributo desconocido: "${atributo}". Escribe "atributos" para ver opciones.`, 't-dim');
        return false;
      }
      if(state.puntos <= 0) {
        _line('Sin puntos de atributo. Sube de nivel en cualquier rama.  ("experiencia" para ver progreso)', 't-dim');
        return false;
      }

      state.puntos--;
      state.atributos[atributo] = (state.atributos[atributo] || 0) + 1;
      const player = _player();
      if(!player) return false;
      def.apply(player);

      _sp();
      _line(`▲ ${def.label}  →  ${def.desc}`, def.color, true);
      _line(`Puntos restantes: ${state.puntos}`, 't-dim');
      _sp();

      if(atributo === 'voluntad') player._extra_mag_slots = Math.floor(state.atributos.voluntad / 3);
      if(atributo === 'vigor') player._extra_hab_slots = Math.floor(state.atributos.vigor / 3);

      _statusRefresh();
      return true;
    }

    function cmdExperiencia() {
      init();
      _sp(); _line('— EXPERIENCIA —', 't-acc');
      if(state.puntos > 0) {
        _line(`⬆ ${state.puntos} punto${state.puntos > 1 ? 's' : ''} disponible${state.puntos > 1 ? 's' : ''}  →  "asignar [atributo]"`, 't-mem', true);
        _sp();
      }
      Object.entries(RAMAS).forEach(([id, def]) => {
        const r = state.ramas[id] || { xp: 0, nivel: 1 };
        const lv = r.nivel;
        const enNivel = xpEnNivel(r.xp, lv);
        const paraNext = xpParaSiguiente(lv);
        const pct = lv >= 100 ? 100 : Math.floor(enNivel / paraNext * 100);
        const filled = Math.floor(pct / 100 * 24);
        const bar = '█'.repeat(filled) + '░'.repeat(24 - filled);
        _line(`  ${def.icon} ${def.label.padEnd(12)} Lv${String(lv >= 100 ? 'MAX' : lv).padStart(3)}  ${bar}  ${lv < 100 ? enNivel + '/' + paraNext + 'xp' : ''}`, def.color);
      });
      _sp();
      const invertidos = Object.entries(state.atributos).filter(([, v]) => v > 0);
      if(invertidos.length) {
        _line('Atributos invertidos:', 't-acc');
        invertidos.forEach(([a, v]) => {
          const def = ATRIBUTOS[a];
          _line(`  ${def.label.padEnd(12)} ${v} pts  — ${def.desc}`, def.color);
        });
      }
      _sp();
    }

    function cmdAtributos() {
      init();
      _sp(); _line('— ATRIBUTOS —', 't-acc');
      _line(`Puntos disponibles: ${state.puntos}`, 't-mem'); _sp();
      Object.entries(ATRIBUTOS).forEach(([id, def]) => {
        const pts = state.atributos[id] || 0;
        _line(`  asignar ${id.padEnd(12)} ${def.desc.padEnd(30)} [${pts} pts]`, def.color);
      });
      _sp(); _line('Uso: asignar [atributo]', 't-dim'); _sp();
    }

    function cmdAsignar(target) {
      if(!target) { cmdAtributos(); return false; }
      const key = Object.keys(ATRIBUTOS).find(k => k.startsWith(String(target).toLowerCase()));
      if(!key) {
        _line(`"${target}" no es un atributo válido. Escribe "atributos" para ver opciones.`, 't-dim');
        return false;
      }
      const ok = asignar(key);
      if(ok) _saveGame();
      return ok;
    }

    function ser() { return state; }
    function load(d) { if(d) { state = d; init(); } }

    init();

    return {
      ganar, asignar, nivelDesdeXP, xpParaSiguiente, xpEnNivel, xpAcumulada,
      cmdExperiencia, cmdAtributos, cmdAsignar,
      getRama: r => (state.ramas[r] || { xp: 0, nivel: 1 }),
      getPuntos: () => state.puntos,
      getAtributos: () => state.atributos,
      extraMagSlots: () => _player()?._extra_mag_slots || 0,
      extraHabSlots: () => _player()?._extra_hab_slots || 0,
      ser, load, init, RAMAS, ATRIBUTOS,
    };
  }

  function api() {
    if(!global.__xpPluginApi) global.__xpPluginApi = createXPApi();
    return global.__xpPluginApi;
  }

  global.pluginXP = {
    id: 'plugin:xp',
    nombre: 'Sistema de XP',
    version: '2.0.0',
    descripcion: 'Progresión de ramas y atributos cargada como plugin de dominio.',
    onLoad() { api(); },
    services: {
      'runtime.xp.api': () => api(),
      'runtime.xp.read': () => ({ ser: api().ser(), atributos: api().ATRIBUTOS || {} }),
      'runtime.xp.assign': (raw='') => api().cmdAsignar(String(raw || '')),
      'runtime.xp.show_attrs': () => { api().cmdAtributos(); return true; },
      'runtime.xp.show_exp': () => { api().cmdExperiencia(); return true; },
      'runtime.xp.gain': (rama, amount=0, reason='') => api().ganar(rama, amount, reason),
      'runtime.xp.init': (reset=false) => { api().init(reset); return true; },
      'runtime.xp.load': (data) => { api().load(data); return true; },
      'runtime.xp.state': () => api().ser(),
    },
    comandos: {
      'experiencia': { fn: ()    => api().cmdExperiencia(),          meta:{ titulo:'experiencia', color:'t-mem', desc:'Ver progresión de ramas de experiencia y niveles.' } },
      'xp':          { fn: ()    => api().cmdExperiencia(),          meta:{ titulo:'xp (alias)',  color:'t-mem', desc:'Ver experiencia.' } },
      'exp':         { fn: ()    => api().cmdExperiencia(),          meta:{ titulo:'exp (alias)', color:'t-mem', desc:'Ver experiencia.' } },
      'atributos':   { fn: ()    => api().cmdAtributos(),            meta:{ titulo:'atributos',   color:'t-acc', desc:'Ver atributos y puntos disponibles para asignar.' } },
      'attrs':       { fn: ()    => api().cmdAtributos(),            meta:{ titulo:'attrs (alias atributos)', color:'t-acc', desc:'Ver atributos.' } },
      'asignar':     { fn: (args)=> api().cmdAsignar(args.join(' ')),meta:{ titulo:'asignar [atributo]', color:'t-acc', desc:'Invertir un punto en un atributo.' } },
      'assign':      { fn: (args)=> api().cmdAsignar(args.join(' ')),meta:{ titulo:'assign (alias asignar)', color:'t-acc', desc:'Invertir punto en atributo.' } },
      'descansar':   { fn: async ()=>{ const rest=typeof ServiceRegistry!=='undefined'?ServiceRegistry.get('runtime.player.rest'):null; if(typeof rest==='function') await rest(); }, meta:{ titulo:'descansar', color:'t-mem', desc:'Descansar para recuperar HP y stamina.' } },
      'rest':        { fn: async ()=>{ const rest=typeof ServiceRegistry!=='undefined'?ServiceRegistry.get('runtime.player.rest'):null; if(typeof rest==='function') await rest(); }, meta:{ titulo:'rest (alias descansar)', color:'t-mem', desc:'Descansar.' } },
      'dormir':      { fn: async ()=>{ const rest=typeof ServiceRegistry!=='undefined'?ServiceRegistry.get('runtime.player.rest'):null; if(typeof rest==='function') await rest(); }, meta:{ titulo:'dormir (alias descansar)', color:'t-mem', desc:'Descansar.' } },
      'tactica':     { fn: ()=>{ const t=typeof ServiceRegistry!=='undefined'?ServiceRegistry.get('runtime.player.tactic'):null; if(typeof t==='function') t(); }, meta:{ titulo:'tactica',   color:'t-sis', desc:'Ver tácticas y configuración de combate.' } },
      'táctica':     { fn: ()=>{ const t=typeof ServiceRegistry!=='undefined'?ServiceRegistry.get('runtime.player.tactic'):null; if(typeof t==='function') t(); }, meta:{ titulo:'táctica (alias)', color:'t-sis', desc:'Ver tácticas.' } },
      'tac':         { fn: ()=>{ const t=typeof ServiceRegistry!=='undefined'?ServiceRegistry.get('runtime.player.tactic'):null; if(typeof t==='function') t(); }, meta:{ titulo:'tac (alias tactica)', color:'t-sis', desc:'Ver tácticas.' } },
    },
  };
})(globalThis);
