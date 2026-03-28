// ════════════════════════════════════════════════════════════════
// XP Logic — motor desacoplado de datos
// ════════════════════════════════════════════════════════════════
(function initXPLogic(global) {
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
      if (!effect) return;
      out[id] = { ...def, apply: effect };
    });
    return out;
  }

  function create({ data, getCfgObj, Out, Player, refreshStatus, save }) {
    const RAMAS_BASE = (data && data.ramas) || {};
    const ATRIBUTOS_BASE = (data && data.atributos) || {};
    const RAMAS = getCfgObj('systems.xp.ramas', RAMAS_BASE);
    const ATRIBUTOS = buildAtributos(getCfgObj('systems.xp.atributos', ATRIBUTOS_BASE));

    function xpParaNivel(n) { return Math.floor(50 * n * Math.log(n + 1)); }
    function xpAcumulada(n) { let t = 0; for (let i = 1; i < n; i++) t += xpParaNivel(i); return t; }
    function nivelDesdeXP(xp) { let n = 1; while (n < 100 && xp >= xpAcumulada(n + 1)) n++; return n; }
    function xpParaSiguiente(n) { return n >= 100 ? 0 : xpParaNivel(n); }
    function xpEnNivel(xp, n) { return xp - xpAcumulada(n); }

    let state = { ramas: {}, puntos: 0, atributos: {}, historial: [] };

    function init() {
      Object.keys(RAMAS).forEach(r => { if (!state.ramas[r]) state.ramas[r] = { xp: 0, nivel: 1 }; });
      Object.keys(ATRIBUTOS).forEach(a => { if (!state.atributos[a]) state.atributos[a] = 0; });
    }

    function ganar(rama, cantidad, motivo) {
      if (!RAMAS[rama]) return;
      init();
      const r = state.ramas[rama];
      const nivelAntes = r.nivel;
      r.xp += cantidad;
      r.nivel = nivelDesdeXP(r.xp);

      state.historial.push({ rama, cantidad, motivo, ts: Date.now() });
      if (state.historial.length > 30) state.historial.shift();

      if (r.nivel > nivelAntes) {
        const ganados = r.nivel - nivelAntes;
        state.puntos += ganados;
        const ramaDef = RAMAS[rama];
        setTimeout(() => {
          Out.sp(); Out.sep('═');
          Out.line(`⬆ NIVEL ${r.nivel} — ${ramaDef.icon} ${ramaDef.label}`, ramaDef.color, true);
          if (ganados > 1) Out.line(`Saltaste ${ganados} niveles.`, 't-dim');
          Out.line(`+${ganados} punto${ganados > 1 ? 's' : ''} de atributo disponible${ganados > 1 ? 's' : ''}.`, 't-mem');
          Out.line(`Puntos totales: ${state.puntos}  →  "asignar [atributo]"`, 't-dim');
          Out.sep('═'); Out.sp();
          refreshStatus();
        }, 100);
      }
    }

    function asignar(atributo) {
      const def = ATRIBUTOS[atributo];
      if (!def) {
        Out.line(`Atributo desconocido: "${atributo}". Escribe "atributos" para ver opciones.`, 't-dim');
        return false;
      }
      if (state.puntos <= 0) {
        Out.line('Sin puntos de atributo. Sube de nivel en cualquier rama.  ("experiencia" para ver progreso)', 't-dim');
        return false;
      }

      state.puntos--;
      state.atributos[atributo] = (state.atributos[atributo] || 0) + 1;
      def.apply(Player.get());

      Out.sp();
      Out.line(`▲ ${def.label}  →  ${def.desc}`, def.color, true);
      Out.line(`Puntos restantes: ${state.puntos}`, 't-dim');
      Out.sp();

      if (atributo === 'voluntad') Player.get()._extra_mag_slots = Math.floor(state.atributos.voluntad / 3);
      if (atributo === 'vigor') Player.get()._extra_hab_slots = Math.floor(state.atributos.vigor / 3);

      refreshStatus();
      return true;
    }

    function cmdExperiencia() {
      init();
      Out.sp(); Out.line('— EXPERIENCIA —', 't-acc');
      if (state.puntos > 0) {
        Out.line(`⬆ ${state.puntos} punto${state.puntos > 1 ? 's' : ''} disponible${state.puntos > 1 ? 's' : ''}  →  "asignar [atributo]"`, 't-mem', true);
        Out.sp();
      }
      Object.entries(RAMAS).forEach(([id, def]) => {
        const r = state.ramas[id] || { xp: 0, nivel: 1 };
        const lv = r.nivel;
        const enNivel = xpEnNivel(r.xp, lv);
        const paraNext = xpParaSiguiente(lv);
        const pct = lv >= 100 ? 100 : Math.floor(enNivel / paraNext * 100);
        const filled = Math.floor(pct / 100 * 24);
        const bar = '█'.repeat(filled) + '░'.repeat(24 - filled);
        Out.line(`  ${def.icon} ${def.label.padEnd(12)} Lv${String(lv >= 100 ? 'MAX' : lv).padStart(3)}  ${bar}  ${lv < 100 ? enNivel + '/' + paraNext + 'xp' : ''}`, def.color);
      });
      Out.sp();
      const invertidos = Object.entries(state.atributos).filter(([, v]) => v > 0);
      if (invertidos.length) {
        Out.line('Atributos invertidos:', 't-acc');
        invertidos.forEach(([a, v]) => {
          const def = ATRIBUTOS[a];
          Out.line(`  ${def.label.padEnd(12)} ${v} pts  — ${def.desc}`, def.color);
        });
      }
      Out.sp();
    }

    function cmdAtributos() {
      Out.sp(); Out.line('— ATRIBUTOS —', 't-acc');
      Out.line(`Puntos disponibles: ${state.puntos}`, 't-mem'); Out.sp();
      Object.entries(ATRIBUTOS).forEach(([id, def]) => {
        const pts = state.atributos[id] || 0;
        Out.line(`  asignar ${id.padEnd(12)} ${def.desc.padEnd(30)} [${pts} pts]`, def.color);
      });
      Out.sp(); Out.line('Uso: asignar [atributo]', 't-dim'); Out.sp();
    }

    function cmdAsignar(target) {
      if (!target) { cmdAtributos(); return; }
      const key = Object.keys(ATRIBUTOS).find(k => k.startsWith(target.toLowerCase()));
      if (!key) {
        Out.line(`"${target}" no es un atributo válido. Escribe "atributos" para ver opciones.`, 't-dim');
        return;
      }
      asignar(key);
      save();
    }

    function ser() { return state; }
    function load(d) { if (d) { state = d; init(); } }

    return {
      ganar, asignar, nivelDesdeXP, xpParaSiguiente, xpEnNivel, xpAcumulada,
      cmdExperiencia, cmdAtributos, cmdAsignar,
      getRama: r => (state.ramas[r] || { xp: 0, nivel: 1 }),
      getPuntos: () => state.puntos,
      getAtributos: () => state.atributos,
      extraMagSlots: () => Player.get()._extra_mag_slots || 0,
      extraHabSlots: () => Player.get()._extra_hab_slots || 0,
      ser, load, init, RAMAS, ATRIBUTOS,
    };
  }

  global.XPLogic = { create };
})(globalThis);
