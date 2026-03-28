// ════════════════════════════════════════════════════════════════
// PLUGIN: IA de Batalla v1.0
//
// Decide las acciones de los enemigos y NPCs en combate por turnos.
// Escucha combat:resolve_ia y elige la acción óptima según:
//   · Perfil de personalidad del actor (berserker, chamán, etc.)
//   · Estado de la batalla (HP propios, HP del jugador, estados)
//   · Habilidades y magias disponibles (añadidas por plugins)
//   · Prioridades situacionales (curarse, romper postura, AOE, etc.)
//
// La IA tiene 4 capas de decisión (en orden de prioridad):
//   1. Emergencia       — HP propio < 20%, intentar sobrevivir
//   2. Oportunidad      — el jugador está vulnerable (poise roto, debuffs)
//   3. Táctica          — usar habilidades/magias según perfil
//   4. Estándar         — ataque elemental o físico normal
// ════════════════════════════════════════════════════════════════

// ── Perfiles de IA ───────────────────────────────────────────────
// Cada perfil define pesos de decisión [0-1].
// Los valores no son probabilidades absolutas — se combinan con
// el estado del combate para producir una puntuación por acción.

function _aiProfiles() {
  return D.aiProfiles || {};
}

function _defaultProfile() {
  return {
    desc:'Perfil por defecto',
    usa_habs:0.5, usa_mags:0.3, defiende:0.1, huye:0.05,
    prio_habs:['atk_mult'], prio_mags:['dmg_dist'], prio_target:'debil',
  };
}


function _svc(name) {
  return (typeof ServiceRegistry !== 'undefined' && typeof ServiceRegistry.get === 'function')
    ? ServiceRegistry.get(name)
    : null;
}

function _tacticsGetSup(nodeId) {
  const fn = _svc('runtime.tactics.get_sup');
  return typeof fn === 'function' ? (fn(nodeId) || { tipo:'normal' }) : { tipo:'normal' };
}
function _tacticsReaction(reacKey) {
  const fn = _svc('runtime.tactics.reaction_meta');
  return typeof fn === 'function' ? fn(reacKey) : null;
}
function _tacticsReacClimateMult(nodeId) {
  const fn = _svc('runtime.tactics.climate_reac_mult');
  return typeof fn === 'function' ? fn(nodeId) : 1;
}
function _tacticsApplyReaction(reac, actor, target, battle) {
  const fn = _svc('runtime.tactics.apply_reaction');
  if(typeof fn === 'function') fn(reac, actor, target, battle);
}
function _tacticsApplyElement(target, element, battle) {
  const fn = _svc('runtime.tactics.apply_element');
  if(typeof fn === 'function') fn(target, element, battle);
}
function _tacticsUpdateSurface(nodeId, element, battle) {
  const fn = _svc('runtime.tactics.update_surface');
  if(typeof fn === 'function') fn(nodeId, element, battle);
}
function _tacticsElementColor(element) {
  const fn = _svc('runtime.tactics.element_color');
  return typeof fn === 'function' ? fn(element) : null;
}
function _tacticsApplyPoiseDmg(target, amount, battle) {
  const fn = _svc('runtime.tactics.apply_poise_dmg');
  if(typeof fn === 'function') fn(target, amount, battle);
}
function _tacticsCalcWound(dmg, maxHp) {
  const fn = _svc('runtime.tactics.calc_wound');
  return typeof fn === 'function' ? fn(dmg, maxHp) : null;
}
function _tacticsWoundMeta(key) {
  const fn = _svc('runtime.tactics.wound_meta');
  return typeof fn === 'function' ? fn(key) : null;
}
function _enemyAbilityExecutor() {
  return _svc('runtime.combat.enemy.use_habilidad');
}
function _enemyMagicExecutor() {
  return _svc('runtime.combat.enemy.cast_magia');
}
function _enemyAbilityBuffTicker() {
  return _svc('runtime.combat.enemy.tick_habilidad_buffs');
}
function _player() {
  const fn = _svc('runtime.player.current');
  return typeof fn === 'function' ? fn() : null;
}
function _gsAliveNPCs() {
  const fn = _svc('runtime.gs.alive_npcs');
  return typeof fn === 'function' ? (fn() || []) : [];
}

// ── Asignar perfil según actor ────────────────────────────────────
function _asignarPerfil(actor) {
  const n    = (actor.name||'').toLowerCase();
  const tipo = actor.tipo;

  const profiles = _aiProfiles();
  if(tipo==='creature')                                   return profiles.bestia || _defaultProfile();
  if(n.includes('guardián')||n.includes('custodio'))     return profiles.guardián || _defaultProfile();
  if(n.includes('eco')||n.includes('resonante'))         return profiles.chamán || _defaultProfile();
  if(n.includes('berserker')||n.includes('errante'))     return profiles.berserker || _defaultProfile();
  if(n.includes('antiguo')||n.includes('grieta'))        return profiles.táctico || _defaultProfile();
  if(n.includes('corrupto')||n.includes('vacío'))        return profiles.oportunista || _defaultProfile();
  if(n.includes('fragmento')||n.includes('eco_corrupto'))return profiles.cazador || _defaultProfile();

  if(tipo==='npc') {
    const npcRef = _gsAliveNPCs().find(x=>x.id===actor.id) || null;
    const arq    = npcRef?.arq_ocu||npcRef?.arq_vis||'';
    if(['traidor','corrupto','vengativo'].includes(arq))  return profiles.oportunista || _defaultProfile();
    if(['mártir','sacrificio'].includes(arq))             return profiles.guardián || _defaultProfile();
    if(['fanático'].includes(arq))                        return profiles.berserker || _defaultProfile();
  }

  // Fallback determinista por id
  const perfiles = Object.values(profiles);
  if(!perfiles.length) return _defaultProfile();
  const idx      = Math.abs(typeof U!=='undefined' ? U.hash(actor.id||actor.name||'') : 0) % perfiles.length;
  return perfiles[idx] || _defaultProfile();
}

// ── Elegir target según perfil ────────────────────────────────────
function _elegirTarget(actor, targets, perfil) {
  if(!targets.length) return null;
  if(perfil.prio_target === 'fuerte')
    return targets.reduce((a,b)=>((b.atk||0)>(a.atk||0)?b:a));
  // 'debil': menor % de HP
  return targets.reduce((a,b)=>
    (a.hp/Math.max(1,a.maxHp)) <= (b.hp/Math.max(1,b.maxHp)) ? a : b
  );
}

// ── Elegir mejor habilidad según prioridades del perfil ──────────
function _elegirHabilidad(actor, perfil) {
  const habs = actor.habilidades||[];
  if(!habs.length) return null;

  // Prioridad explícita del perfil
  for(const efecto of (perfil.prio_habs||[])) {
    const h = habs.find(h=>h.efecto===efecto);
    if(h) return h;
  }
  // Si no hay prioridad, la primera disponible
  return habs[0] || null;
}

// ── Elegir mejor magia según prioridades del perfil ──────────────
function _elegirMagia(actor, perfil) {
  const mags = (actor.magias||[]).filter(m=>!m.corrompida && m.cargas>0);
  if(!mags.length) return null;

  for(const efecto of (perfil.prio_mags||[])) {
    const m = mags.find(m=>m.efecto===efecto);
    if(m) return m;
  }
  return mags[0] || null;
}

// ── Lógica de decisión principal ──────────────────────────────────
function _decidirAccion(actor, battle, perfil) {
  const targets  = battle.cola.filter(c=>c.vivo && !c.huyó && (
    actor.tipo==='player' ? (c.tipo==='enemy'||c.tipo==='npc'||c.tipo==='creature') :
    c.tipo==='player'
  ));
  if(!targets.length) return { accion:'esperar' };

  const target  = _elegirTarget(actor, targets, perfil);
  const hpRatio = actor.hp / Math.max(1, actor.maxHp||actor.hp);
  const roll    = Math.random();

  // ── CAPA 1: Emergencia (HP < 20%) ────────────────────────────
  if(hpRatio < 0.20) {
    // Berserker no huye nunca; chamán intenta evasión o magia
    if(perfil.huye > 0 && roll < perfil.huye) {
      return { accion:'huir' };
    }
    if(perfil.defiende > 0.2 && roll < perfil.defiende) {
      return { accion:'defender' };
    }
    // Chamán con magia de evasión disponible
    const magEvasion = _elegirMagia(actor, { prio_mags:['invisibilidad'] });
    if(magEvasion && roll < perfil.usa_mags * 1.5) {
      return { accion:'magia', mag:magEvasion, target };
    }
  }

  // ── CAPA 2: Oportunidad ───────────────────────────────────────
  if(target) {
    // Si el jugador tiene postura rota — usar golpe multiplicador
    if(target.poise_roto) {
      const habMult = actor.habilidades?.find(h=>h.efecto==='atk_mult');
      if(habMult && roll < perfil.usa_habs * 1.3)
        return { accion:'habilidad', hab:habMult, target };
    }
    // Si el jugador tiene HP muy bajo (<30%) — rematarlo
    const targetRatio = target.hp / Math.max(1, target.maxHp||target.hp);
    if(targetRatio < 0.30) {
      const habKill = actor.habilidades?.find(h=>['atk_mult','lifesteal','poise_break'].includes(h.efecto));
      if(habKill && roll < perfil.usa_habs * 1.2)
        return { accion:'habilidad', hab:habKill, target };
    }
    // Si el jugador no tiene estados — aplicar maldición o debuff
    if(!target.elemento_estado && !target._maldicion_turnos) {
      const magDebuff = _elegirMagia(actor, { prio_mags:['maldicion','debuff','herida_fija'] });
      if(magDebuff && roll < perfil.usa_mags * 1.1)
        return { accion:'magia', mag:magDebuff, target };
    }
  }

  // ── CAPA 3: Táctica según perfil ─────────────────────────────

  // Defender si perfil es defensivo y HP entre 20-50%
  if(hpRatio < 0.50 && roll < perfil.defiende)
    return { accion:'defender' };

  // Usar habilidad
  const usaHab = roll < perfil.usa_habs;
  if(usaHab) {
    const hab = _elegirHabilidad(actor, perfil);
    if(hab) return { accion:'habilidad', hab, target };
  }

  // Usar magia
  const usaMag = roll < perfil.usa_mags;
  if(usaMag) {
    const mag = _elegirMagia(actor, perfil);
    if(mag) return { accion:'magia', mag, target };
  }

  // ── CAPA 4: Ataque estándar ───────────────────────────────────
  return { accion:'atacar', target };
}

// ── Ejecutar la decisión en la batalla ───────────────────────────
function _ejecutarDecision(decision, actor, battle) {
  switch(decision.accion) {

    case 'huir': {
      actor.vivo = false; actor.huyó = true;
      battleLog(battle, `${actor.name} huye de la batalla.`, 't-mem');
      break;
    }

    case 'defender': {
      actor.defendiendo = true;
      battleLog(battle, `${actor.name} adopta postura defensiva.`, 't-sis');
      break;
    }

    case 'habilidad': {
      const { hab, target } = decision;
      if(!hab) { _ataqueFisico(actor, decision.target||battle.cola.find(c=>c.vivo&&c.tipo==='player'), battle); break; }
      const execHab = _enemyAbilityExecutor();
      const log = typeof execHab === 'function'
        ? execHab(actor, hab, target, battle)
        : _ataqueFisico(actor, target, battle);
      if(!log) _ataqueFisico(actor, target, battle);
      break;
    }

    case 'magia': {
      const { mag, target } = decision;
      if(!mag || mag.cargas<=0) { _ataqueFisico(actor, decision.target||battle.cola.find(c=>c.vivo&&c.tipo==='player'), battle); break; }
      const execMag = _enemyMagicExecutor();
      const log = typeof execMag === 'function'
        ? execMag(actor, mag, target, battle)
        : _ataqueFisico(actor, target, battle);
      if(!log) _ataqueFisico(actor, target, battle);
      break;
    }

    case 'esperar': {
      battleLog(battle, `${actor.name} espera.`, 't-dim');
      break;
    }

    case 'atacar':
    default: {
      _ataqueFisico(actor, decision.target, battle);
      break;
    }
  }
}

// ── Ataque físico estándar del enemigo ────────────────────────────
function _ataqueFisico(actor, target, battle) {
  if(!target) { battleLog(battle, `${actor.name} espera.`, 't-dim'); return; }

  // Niebla
  const sup = _tacticsGetSup(battle.nodeId);
  if(sup.tipo==='niebla' && Math.random()<0.30) {
    battleLog(battle, `  🌫 Niebla: ataque de ${actor.name} falla!`, 't-dim');
    return;
  }

  // Niebla personal del jugador (_niebla_turnos)
  const p = _player();
  if(target.tipo==='player' && target.playerId===p.id && (p._niebla_turnos||0)>0 && Math.random()<0.40) {
    battleLog(battle, `  🌫 ${target.name} desaparece en la niebla. Fallo.`, 't-dim');
    return;
  }

  // Ataque elemental si el actor tiene elemento inferible
  const elemento = _inferirElementoAI(actor);
  let dmg, reac = null;

  if(elemento) {
    const reacKey = target.elemento_estado ? `${target.elemento_estado}+${elemento}` : null;
    reac = reacKey ? _tacticsReaction(reacKey) : null;
    const base    = Math.max(1, (actor.atk||4) + U.rand(0,3) - (target.poise_roto?0:(target.defendiendo?Math.ceil((target.def||0)/2):target.def||0)));
    const multReac= reac ? reac.mult * _tacticsReacClimateMult(battle.nodeId) : 1;
    dmg = Math.max(1, Math.floor(base*multReac*(target.poise_roto?1.5:1)));
    const beforeApply = EventBus.emit('combat:before_damage_apply', {
      battle, actor, target, dmg,
      source: 'enemy_attack',
      cancelled: false,
    });
    if(beforeApply?.cancelled) return;
    dmg = beforeApply?.dmg ?? dmg;

    target.hp = Math.max(0, target.hp - dmg);
    let log = `${actor.name} → ${target.name} [${elemento}] −${dmg}HP`;
    if(reac) {
      log += `  ⚗${reac.nombre}!`;
      _tacticsApplyReaction(reac, actor, target, battle);
      battleLog(battle, log, 't-cor');
    } else {
      _tacticsApplyElement(target, elemento, battle);
      _tacticsUpdateSurface(battle.nodeId, elemento, battle);
      battleLog(battle, log, _tacticsElementColor(elemento)||'t-pel');
    }
    _tacticsApplyPoiseDmg(target, Math.floor(dmg*0.35), battle);
  } else {
    // Físico puro
    const critMult = target.poise_roto ? 1.5 : 1.0;
    const defBase  = target.poise_roto ? 0 : (target.defendiendo?Math.ceil((target.def||0)/2):target.def||0);
    dmg = Math.max(1, Math.floor(((actor.atk||4)+U.rand(-1,3))*critMult - defBase));
    const beforeApply = EventBus.emit('combat:before_damage_apply', {
      battle, actor, target, dmg,
      source: 'enemy_attack',
      cancelled: false,
    });
    if(beforeApply?.cancelled) return;
    dmg = beforeApply?.dmg ?? dmg;

    target.hp = Math.max(0, target.hp - dmg);
    const critTag = critMult>1 ? ' ⚡CRÍTICO' : '';
    battleLog(battle, `${actor.name} → ${target.name}  −${dmg}HP${critTag}  (${target.hp}/${target.maxHp})`, 't-pel');
    _tacticsApplyPoiseDmg(target, Math.floor(dmg*0.4), battle);
  }

  // Herida si es el jugador local
  if(target.tipo==='player' && target.playerId===p.id) {
    p.hp = target.hp;
    {
      const herida = _tacticsCalcWound(dmg, target.maxHp);
      if(herida) {
        p.heridas = p.heridas||[];
        if(!p.heridas.includes(herida)) {
          p.heridas.push(herida);
          const meta = _tacticsWoundMeta(herida);
          battleLog(battle, `  ${meta?.icon||'⚠'} ¡${herida}! ${meta?.desc||''}`, meta?.color||'t-pel');
        }
      }
    }
  }

  // Duplicar ataque si el enemigo tiene buff activo
  if(actor._duplicar_proximo) {
    actor._duplicar_proximo = false;
    const dmg2 = Math.max(1, Math.floor(dmg*0.7));
    target.hp  = Math.max(0, target.hp - dmg2);
    battleLog(battle, `  ✦ Ataque duplicado → ${target.name}  −${dmg2}HP`, 't-pel');
    if(target.tipo==='player'&&target.playerId===p.id) p.hp=target.hp;
  }

  if(target.hp<=0) { target.vivo=false; battleLog(battle,`${target.name} cae.`,'t-cor'); }

  EventBus.emit('combat:after_damage_apply', {
    battle, actor, target, dmg,
    source: 'enemy_attack',
    targetDied: target.hp <= 0,
  });
}

// ── Inferir elemento del actor por tags/nombre ────────────────────
function _inferirElementoAI(actor) {
  const tags = (actor.tags||[]).map(t=>t.toLowerCase());
  if(tags.some(t=>['fuego','ardiente'].includes(t)))      return 'ARDIENDO';
  if(tags.some(t=>['agua','mojado'].includes(t)))         return 'MOJADO';
  if(tags.some(t=>['rayo','eléctrico'].includes(t)))      return 'ELECTRIZADO';
  if(tags.some(t=>['hielo','frío'].includes(t)))          return 'CONGELADO';
  if(tags.some(t=>['resonante','eco','sonido'].includes(t))) return 'RESONANTE';
  if(tags.some(t=>['vacío','corrupto'].includes(t)))      return 'VACÍO';
  const n = (actor.name||'').toLowerCase();
  if(n.includes('eco')||n.includes('resonante'))          return 'RESONANTE';
  if(n.includes('grieta')||n.includes('vacío'))           return 'VACÍO';
  if(n.includes('corrupto'))                              return 'VACÍO';
  return null;
}

// ── Registro del plugin ───────────────────────────────────────────
const pluginIABatalla = {
  id:      'plugin:ia_batalla',
  nombre:  'IA de Batalla',
  version: '1.0.0',
  descripcion: 'IA táctica procedural. Usa habilidades y magias de forma efectiva según perfil.',

  hooks: {

    // Resolver turno de IA
    'combat:resolve_ia': {
      fn(payload) {
        const { actor, battle } = payload;
        const perfil = _asignarPerfil(actor);

        // Tick de buffs del actor antes de decidir
        const tickEnemyBuffs = _enemyAbilityBuffTicker();
        if(typeof tickEnemyBuffs === 'function') tickEnemyBuffs(actor);

        const decision = _decidirAccion(actor, battle, perfil);
        _ejecutarDecision(decision, actor, battle);

        payload.handled = true;
        payload.accion  = decision.accion;
        return payload;
      }
    },

    // Anuncio al inicio del turno del enemigo — muestra si tiene habilidades/magias
    'combat:enemy_turn_announce': {
      fn(payload) {
        const { actor } = payload;
        const habs = (actor.habilidades||[]).length;
        const mags = (actor.magias||[]).filter(m=>m.cargas>0).length;
        if(habs||mags) {
          const partes=[];
          if(habs) partes.push(`${habs} hab.`);
          if(mags) partes.push(`${mags} carga${mags!==1?'s':''} de magia`);
          battleLog(payload.battle, `  ⟁ ${actor.name} — ${partes.join('  ·  ')}`, 't-dim');
        }
        return payload;
      }
    },
  },

  // Sin comandos propios — la IA opera de forma invisible
};
