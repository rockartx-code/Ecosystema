// ════════════════════════════════════════════════════════════════
// COMBAT RESOLUTION — Pipeline de resolución de acciones en batalla
//
// El core define la estructura de las fases y las emite.
// Los plugins implementan el contenido de cada fase.
//
// Contratos (eventos emitidos):
//
//   combat:resolve_damage
//     payload: { actor, target, arma, elemento, battle,
//                base, multipliers[], finalDmg }
//     → Plugins añaden multiplicadores o setean finalDmg directamente
//     → Tactics añade climaMult, supMult, reacMult, poiseMult
//     → Plugin habilidades pasivas añade su bonus
//
//   combat:apply_states
//     payload: { ...resolve_damage result, statesApplied[] }
//     → Plugin elementales aplica estados (ARDIENDO, MOJADO, etc.)
//     → Plugin heridas aplica heridas al target si el daño es alto
//
//   combat:side_effects
//     payload: { ...apply_states result, sideEffects[] }
//     → Plugin poise aplica daño de postura
//     → Plugin elementales aplica reacciones en área
//     → Plugin de armas aplica desgaste
//
//   combat:post_resolve
//     payload: { ...side_effects result }
//     → Plugin XP otorga experiencia
//     → Plugin habilidades incrementa contadores de evolución
//
//   combat:resolve_magia
//     payload: { actor, mag, target, battle, isMyTurn,
//                handled:false, logEntry:'' }
//     → Plugin magias implementa TODA la lógica de la magia
//     → Si handled sigue false, el motor muestra aviso
//
//   combat:resolve_habilidad
//     payload: { actor, hab, target, battle, isMyTurn,
//                handled:false, logEntry:'' }
//     → Plugin habilidades implementa TODA la lógica de la habilidad
//
//   combat:resolve_ia
//     payload: { actor, battle, action:null, targetId:null }
//     → Plugin IA de batalla elige la acción del actor no-jugador
// ════════════════════════════════════════════════════════════════

const CombatResolution = {

  // ── Pipeline de ataque físico ─────────────────────────────────
  resolveAttack(actor, target, context = {}) {
    const { battle, arma, elemento } = context;

    // FASE 1 — Cálculo de daño
    // Los plugins añaden a `multipliers` o setean `finalDmg` directamente.
    let state = EventBus.emit('combat:resolve_damage', {
      actor, target, arma, elemento, battle,
      base:        actor.atk + (arma?.atk || 0),
      multipliers: [],   // [{label, value}] para logging detallado
      finalDmg:    null, // si un plugin lo setea, se usa sin más cálculo
    });

    // Core calcula el final solo si ningún plugin lo hizo
    if(state.finalDmg == null) {
      const mult = state.multipliers.reduce((acc, m) => acc * (m.value ?? m), 1.0);
      const def  = target.poise_roto ? 0 : (target.def || 0);
      state.finalDmg = Math.max(1, Math.floor(state.base * mult - def));
    }

    // FASE 2 — Aplicar estados al target
    state = EventBus.emit('combat:apply_states', {
      ...state,
      statesApplied: [],
    });

    // FASE 3 — Efectos secundarios (reacciones, poise, superficie, desgaste)
    state = EventBus.emit('combat:side_effects', {
      ...state,
      sideEffects: [],
    });

    // FASE 4 — Post resolución (XP, evolución, actualizaciones de UI)
    EventBus.emit('combat:post_resolve', state);

    return state;
  },

  // ── Pipeline de magia ─────────────────────────────────────────
  resolveMagia(actor, mag, context = {}) {
    const { battle, isMyTurn } = context;

    if(!mag) {
      battleLog(battle, 'Sin magia disponible.', 't-dim');
      return null;
    }

    // El plugin de magias escucha este evento y maneja TODA la lógica.
    // Si no hay plugin, handled=false y el motor avisa.
    const state = EventBus.emit('combat:resolve_magia', {
      actor, mag,
      target:   battle?.cola?.find(c=>c.vivo && _sonEnemigos(actor,c)) || null,
      battle,
      isMyTurn: isMyTurn ?? false,
      handled:  false,
      logEntry: '',
      dmg:      0,
    });

    if(!state?.handled) {
      battleLog(battle, 'Sistema de magias no disponible.', 't-dim');
    }

    return state;
  },

  // ── Pipeline de habilidad ─────────────────────────────────────
  resolveHabilidad(actor, hab, context = {}) {
    const { battle, isMyTurn } = context;

    if(!hab) {
      battleLog(battle, 'Sin habilidad disponible.', 't-dim');
      return null;
    }

    const state = EventBus.emit('combat:resolve_habilidad', {
      actor, hab,
      target:   battle?.cola?.find(c=>c.vivo && _sonEnemigos(actor,c)) || null,
      battle,
      isMyTurn: isMyTurn ?? false,
      handled:  false,
      logEntry: '',
      dmg:      0,
    });

    if(!state?.handled) {
      battleLog(battle, 'Sistema de habilidades no disponible.', 't-dim');
    }

    return state;
  },

  // ── Pipeline de IA ────────────────────────────────────────────
  // El core no implementa lógica de IA. El plugin de IA escucha
  // este evento y setea state.action + state.targetId.
  resolveIA(actor, battle) {
    const state = EventBus.emit('combat:resolve_ia', {
      actor, battle,
      action:   null,   // 'atacar' | 'defender' | 'magia' | 'habilidad' | 'huir'
      targetId: null,   // id del target si action === 'atacar'
      handled:  false,
    });

    // Fallback: si ningún plugin maneja la IA, el enemigo ataca
    if(!state?.handled) {
      return { action:'atacar', targetId:null };
    }

    return state;
  },
};

// ── Helpers internos de batalla ───────────────────────────────────
// Funciones pequeñas que usan tanto CombatResolution como el loop
// de batalla. Se exportan en CTX para que plugins las usen.

function battleLog(battle, txt, color='t-out') {
  if(!battle) return;
  battle.log = battle.log || [];
  battle.log.push({ txt, color, ts:Date.now() });
  if(battle.log.length > 60) battle.log.shift();
}

function _sonEnemigos(a, b) {
  if(a.tipo==='player' && b.tipo==='player')                          return true;  // PvP
  if(a.tipo==='player' && ['enemy','npc','creature'].includes(b.tipo)) return true;
  if(['enemy','npc','creature'].includes(a.tipo) && b.tipo==='player') return true;
  return false;
}
