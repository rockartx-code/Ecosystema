// ════════════════════════════════════════════════════════════════
// PLUGIN: Habilidades v2.1
//
// Novedades:
//   · Enemigos de mayor nivel reciben habilidades procedurales
//   · Tabla de nivel por ATK escalado (4 niveles)
//   · "copiar [enemigo]" aprende la última habilidad usada en estado base
//   · Habilidades exclusivas de elite (poise_break, lifesteal, counter, etc.)
//   · Plugin de IA las usa via combat:resolve_ia
//   · "scan" ahora revela las habilidades del enemigo
// ════════════════════════════════════════════════════════════════

// ── Pools de habilidades por nivel ───────────────────────────────
// Estado base: los valores NO están escalados.
// Los enemigos los escalan al recibirlas; "copiar" devuelve el base.

function _getHabPools() {
  const pools = D.enemyHabPools || {};
  const basico = Array.isArray(pools.basico) ? pools.basico : [];
  const medioExtras = Array.isArray(pools.medio_extra) ? pools.medio_extra : [];
  const eliteExtras = Array.isArray(pools.elite_extra) ? pools.elite_extra : [];
  const medio = [...basico, ...medioExtras];
  const elite = [...medio, ...eliteExtras];
  return { basico, medio, elite };
}

// Función para buscar la definición base por pool_id
function _habBase(pool_id) {
  const { elite } = _getHabPools();
  return elite.find(h=>h.id===pool_id) || null;
}


function _svc(name) {
  return (typeof ServiceRegistry !== 'undefined' && typeof ServiceRegistry.get === 'function')
    ? ServiceRegistry.get(name)
    : null;
}
function _xpGanar(attr, amount, reason) {
  const gain = _svc('runtime.xp.gain');
  if(typeof gain === 'function') return !!gain(attr, amount, reason);
  return false;
}
function _tactCalcWound(dmg, maxHp) {
  const calc = _svc('runtime.tactics.calc_wound');
  if(typeof calc === 'function') return calc(dmg, maxHp);
  return null;
}
function _tactWoundMeta(key) {
  const meta = _svc('runtime.tactics.wound_meta');
  if(typeof meta === 'function') return meta(key);
  return null;
}
function _tactConsumeStamina(delta=0) {
  const fn = _svc('runtime.tactics.consume_stamina');
  if(typeof fn === 'function') return !!fn(delta);
  return false;
}

// ── Asignar habilidades a un enemigo al generarlo ─────────────────
// Nivel 1: atk <  8 → ninguna
// Nivel 2: atk  8-14→ 1 del pool básico
// Nivel 3: atk 15-22→ 1-2 del pool medio
// Nivel 4: atk > 22 → 2-3 del pool elite (incluye exclusivas)

function _asignarHabilidadesEnemigo(enemy, dif) {
  const atk = enemy.atk || 0;
  let pool, cantidad;
  const { basico, medio, elite } = _getHabPools();

  if(atk < 8)        { return []; }
  else if(atk < 15)  { pool = basico; cantidad = 1; }
  else if(atk < 22)  { pool = medio;  cantidad = U.rand(1,2); }
  else               { pool = elite;  cantidad = U.rand(2,3); }

  const rng     = U.rng((enemy.id || enemy.nombre || '') + 'habs');
  const elegidas = U.pickN(pool, Math.min(cantidad, pool.length), rng);

  return elegidas.map(h => ({
    ...h,
    id:          U.uid(),     // instancia única
    pool_id:     h.id,        // referencia al pool para "copiar"
    // escala suave: +30% del delta por punto de dificultad
    valor:       +(h.valor * (1 + (dif - 1) * 0.3)).toFixed(2),
    _valor_base: h.valor,     // siempre guardamos el base
    evolucion:   { contador:0, umbral: h.evolucion_umbral },
    usos:        0,
  }));
}

// ── Ejecutar habilidad de ENEMIGO ────────────────────────────────
function _ejecutarHabilidadEnemigo(actor, hab, target, battle) {
  hab.usos = (hab.usos||0) + 1;
  // Marcar para que "copiar" lo detecte este turno
  actor._ultima_habilidad = hab;
  EventBus.emit('combat:enemy_used_habilidad', { actor, hab, battle });

  let log = '';

  switch(hab.efecto) {

    case 'atk_mult': {
      if(!target) break;
      const mult = hab.valor || 2.0;
      const def  = target.poise_roto ? 0 : (target.def||0);
      const dmg  = Math.max(1, Math.floor(actor.atk * mult - def));
      target.hp  = Math.max(0, target.hp - dmg);
      log = `${actor.name} ⟨${hab.nombre}⟩ → ${target.name}  −${dmg}HP  [×${mult.toFixed(1)}]`;
      battleLog(battle, log, 't-pel');
      if(target.hp<=0){ target.vivo=false; battleLog(battle,`${target.name} cae.`,'t-cor'); }
      _aplicarDanoJugador(target, dmg, battle);
      break;
    }

    case 'atk_drain': {
      if(!target) break;
      const dmg  = Math.max(1, Math.floor(actor.atk*(hab.valor||1.8) - (target.def||0)));
      const robo = Math.floor(dmg*0.2);
      target.hp  = Math.max(0, target.hp - dmg);
      actor.hp   = Math.min(actor.maxHp||999, (actor.hp||0)+robo);
      log = `${actor.name} ⟨${hab.nombre}⟩ → ${target.name}  −${dmg}HP  (+${robo}HP al atacante)`;
      battleLog(battle, log, 't-pel');
      if(target.hp<=0){ target.vivo=false; battleLog(battle,`${target.name} cae.`,'t-cor'); }
      _aplicarDanoJugador(target, dmg, battle);
      break;
    }

    case 'aoe': {
      const jugadores = battle.cola.filter(c=>c.vivo&&c.tipo==='player');
      if(!jugadores.length) break;
      const base = Math.max(1, Math.floor(actor.atk * 0.75));
      jugadores.forEach(j=>{
        const dmg = Math.max(1, base - (j.defendiendo?Math.ceil((j.def||0)/2):j.def||0));
        j.hp      = Math.max(0, j.hp - dmg);
        battleLog(battle, `  ↳ ⟨${hab.nombre}⟩ → ${j.name}  −${dmg}HP`, 't-pel');
        if(j.hp<=0){ j.vivo=false; battleLog(battle,`${j.name} cae.`,'t-cor'); }
        _aplicarDanoJugador(j, dmg, battle);
      });
      log = `${actor.name} ⟨${hab.nombre}⟩ — daño en área (${jugadores.length} objetivo${jugadores.length!==1?'s':''})`;
      battleLog(battle, log, 't-pel');
      break;
    }

    case 'def_pasiva': {
      const bonus = hab.valor||3;
      actor._def_bonus   = (actor._def_bonus||0)+bonus;
      actor._def_bonus_t = 2;
      actor.def          = (actor.def||0)+bonus;
      log = `${actor.name} ⟨${hab.nombre}⟩ — DEF +${bonus} por 2 turnos`;
      battleLog(battle, log, 't-sis');
      break;
    }

    case 'atk_bonus': {
      const bonus = hab.valor||4;
      if(!actor._atk_buff_orig) actor._atk_buff_orig = actor.atk;
      actor.atk        = (actor.atk||4)+bonus;
      actor._atk_buff_t= 3;
      log = `${actor.name} ⟨${hab.nombre}⟩ — ATK +${bonus} por 3 turnos`;
      battleLog(battle, log, 't-pel');
      break;
    }

    case 'evasion': {
      actor._evasion       = hab.valor||0.3;
      actor._evasion_turnos= 2;
      log = `${actor.name} ⟨${hab.nombre}⟩ — evasión ${Math.round((hab.valor||0.3)*100)}% activa (2 turnos)`;
      battleLog(battle, log, 't-mem');
      break;
    }

    case 'poise_break': {
      if(!target) break;
      const dmg = Math.max(1, actor.atk - (target.def||0));
      target.hp = Math.max(0, target.hp - dmg);
      target.poise=0; target.poise_roto=true; target.poise_turnos=2;
      log = `${actor.name} ⟨${hab.nombre}⟩ → ${target.name}  −${dmg}HP  ⚡POSTURA ROTA`;
      battleLog(battle, log, 't-cor');
      if(target.hp<=0){ target.vivo=false; battleLog(battle,`${target.name} cae.`,'t-cor'); }
      _aplicarDanoJugador(target, dmg, battle);
      break;
    }

    case 'lifesteal': {
      if(!target) break;
      const dmg  = Math.max(1, actor.atk+U.rand(1,4)-(target.def||0));
      const robo = Math.floor(dmg*(hab.valor||0.4));
      target.hp  = Math.max(0, target.hp - dmg);
      actor.hp   = Math.min(actor.maxHp||999, (actor.hp||0)+robo);
      log = `${actor.name} ⟨${hab.nombre}⟩ → ${target.name}  −${dmg}HP  (roba ${robo}HP)`;
      battleLog(battle, log, 't-cor');
      if(target.hp<=0){ target.vivo=false; battleLog(battle,`${target.name} cae.`,'t-cor'); }
      _aplicarDanoJugador(target, dmg, battle);
      break;
    }

    case 'counter': {
      actor._counter_mult  = hab.valor||0.6;
      actor._counter_activo = true;
      log = `${actor.name} ⟨${hab.nombre}⟩ — preparado para contragolpear`;
      battleLog(battle, log, 't-acc');
      break;
    }

    case 'atk_debuff_area': {
      const jugadores = battle.cola.filter(c=>c.vivo&&c.tipo==='player');
      const pct       = hab.valor||0.25;
      jugadores.forEach(j=>{
        j.atk              = Math.max(1, Math.floor((j.atk||5)*(1-pct)));
        j._atk_debuff_t    = (j._atk_debuff_t||0)+2;
        // Sincronizar con el estado del jugador local
        if(j.playerId===Player.get().id) Player.get().atk=j.atk;
      });
      log = `${actor.name} ⟨${hab.nombre}⟩ — ATK jugadores −${Math.round(pct*100)}% (2 turnos)`;
      battleLog(battle, log, 't-cor');
      break;
    }

    default: {
      if(target){
        const dmg = Math.max(1, actor.atk+U.rand(2,6)-(target.def||0));
        target.hp = Math.max(0, target.hp-dmg);
        log = `${actor.name} ⟨${hab.nombre}⟩ → ${target.name}  −${dmg}HP`;
        battleLog(battle, log, 't-pel');
        if(target.hp<=0){ target.vivo=false; battleLog(battle,`${target.name} cae.`,'t-cor'); }
        _aplicarDanoJugador(target, dmg, battle);
      }
    }
  }

  return log;
}

// Aplica herida al jugador local si es el target
function _aplicarDanoJugador(target, dmg, battle) {
  if(target.tipo !== 'player') return;
  const p = Player.get();
  if(target.playerId !== p.id) return;
  p.hp = target.hp;
  if(typeof Tactics !== 'undefined') {
    const herida = _tactCalcWound(dmg, target.maxHp);
    if(herida) {
      p.heridas = p.heridas||[];
      if(!p.heridas.includes(herida)) {
        p.heridas.push(herida);
        const hm = _tactWoundMeta(herida);
        battleLog(battle, `  ${hm?.icon} ¡${herida}! ${hm?.desc}`, hm?.color||'t-pel');
      }
    }
  }
}

function _initProgHab(hab) {
  hab.evolucion = hab.evolucion || { contador:0, umbral:hab.evolucion_umbral||10, nivel:1, max_nivel:5 };
  hab.maestria  = hab.maestria  || { xp:0, umbral:8, nivel:0, max_nivel:10 };
}

function _progresarHabJugador(hab, actor, battle) {
  _initProgHab(hab);
  hab.evolucion.contador = (hab.evolucion.contador||0) + 1;
  hab.maestria.xp        = (hab.maestria.xp||0) + 1;

  if(hab.evolucion.contador >= hab.evolucion.umbral && (hab.evolucion.nivel||1) < (hab.evolucion.max_nivel||5)) {
    hab.evolucion.contador = 0;
    hab.evolucion.nivel    = (hab.evolucion.nivel||1) + 1;
    hab.evolucion.umbral   = Math.floor((hab.evolucion.umbral||10) * 1.35);
    hab.valor              = +((hab.valor||1) * 1.18).toFixed(2);
    battleLog(battle, `✦ ⟨${hab.nombre}⟩ evoluciona a nivel ${hab.evolucion.nivel}. Valor → ${hab.valor}`,'t-cor');
    _xpGanar('cuerpo', 25 + hab.evolucion.nivel*5, 'habilidad evolucionada');
  }

  if(hab.maestria.xp >= hab.maestria.umbral && (hab.maestria.nivel||0) < (hab.maestria.max_nivel||10)) {
    hab.maestria.xp      = 0;
    hab.maestria.nivel   = (hab.maestria.nivel||0) + 1;
    hab.maestria.umbral  = Math.floor((hab.maestria.umbral||8) * 1.2);
    actor.atk            = (actor.atk||0) + 1;
    if(actor.playerId===Player.get().id) Player.get().atk = actor.atk;
    battleLog(battle, `◎ Maestría de ⟨${hab.nombre}⟩ sube a ${hab.maestria.nivel}. ATK +1 este combate.`,'t-acc');
    _xpGanar('cuerpo', 10 + hab.maestria.nivel*2, 'maestría de habilidad');
  }
}

// ── Tick de buffs temporales del enemigo ──────────────────────────
function _tickBuffsEnemigo(actor) {
  if(actor._def_bonus_t > 0) {
    actor._def_bonus_t--;
    if(actor._def_bonus_t<=0 && actor._def_bonus) {
      actor.def = Math.max(0,(actor.def||0)-actor._def_bonus);
      actor._def_bonus=0;
    }
  }
  if(actor._atk_buff_t > 0) {
    actor._atk_buff_t--;
    if(actor._atk_buff_t<=0 && actor._atk_buff_orig!=null) {
      actor.atk = actor._atk_buff_orig;
      actor._atk_buff_orig=null;
    }
  }
  if((actor._evasion_turnos||0)>0) {
    actor._evasion_turnos--;
    if(actor._evasion_turnos<=0) actor._evasion=0;
  }
  // Limpiar contragolpe después de su turno
  if(actor._counter_activo_prev) { actor._counter_activo=false; actor._counter_activo_prev=false; }
  if(actor._counter_activo) actor._counter_activo_prev=true;
}

// ── Ejecutar habilidad del JUGADOR ───────────────────────────────
function _ejecutarHabilidadJugador(payload) {
  const { actor, hab, battle, isMyTurn } = payload;
  const p      = Player.get();
  const target = payload.target || battle?.cola?.find(c=>c.vivo&&(c.tipo==='enemy'||c.tipo==='npc'));

  if(isMyTurn) _tactConsumeStamina(10);

  let log = '';

  switch(hab.efecto) {
    case 'atk_mult': {
      if(!target) break;
      const dmg = Math.max(1, Math.floor(actor.atk*(hab.valor||2.2)-(target.poise_roto?0:target.def||0)));
      target.hp = Math.max(0,target.hp-dmg);
      log = `${actor.name} ⟨${hab.nombre}⟩ → ${target.name}  −${dmg}HP  (×${(hab.valor||2.2).toFixed(1)})`;
      battleLog(battle,log,'t-hab');
      if(target.hp<=0){target.vivo=false;battleLog(battle,`${target.name} cae.`,'t-cor');}
      break;
    }
    case 'atk_drain': {
      if(!target) break;
      const dmg  = Math.max(1,Math.floor(actor.atk*(hab.valor||1.8)-(target.poise_roto?0:target.def||0)));
      const drain= Math.floor(dmg*0.2);
      target.hp  = Math.max(0,target.hp-dmg);
      p.hp       = Math.max(1,p.hp-drain);
      log = `${actor.name} ⟨${hab.nombre}⟩ → ${target.name}  −${dmg}HP  (autoinflige −${drain}HP)`;
      battleLog(battle,log,'t-pel');
      if(target.hp<=0){target.vivo=false;battleLog(battle,`${target.name} cae.`,'t-cor');}
      break;
    }
    case 'aoe': {
      const enem = battle.cola.filter(c=>c.vivo&&(c.tipo==='enemy'||c.tipo==='npc'));
      const base = Math.max(1,Math.floor(actor.atk*0.7));
      enem.forEach(e=>{
        const d=Math.max(1,base-(e.poise_roto?0:e.def||0));
        e.hp=Math.max(0,e.hp-d);
        battleLog(battle,`  ↳ ⟨${hab.nombre}⟩ → ${e.name}  −${d}HP`,'t-hab');
        if(e.hp<=0){e.vivo=false;battleLog(battle,`  ${e.name} cae.`,'t-cor');}
      });
      log=`${actor.name} ⟨${hab.nombre}⟩ — área`;
      break;
    }
    case 'evasion':  { p._niebla_turnos=(p._niebla_turnos||0)+2; log=`⟨${hab.nombre}⟩ — evasión 2 turnos`; battleLog(battle,log,'t-hab'); break; }
    case 'scan': {
      battle.cola.filter(c=>c.vivo&&(c.tipo==='enemy'||c.tipo==='npc')).forEach(e=>{
        const habs = (e.habilidades||[]).map(h=>h.nombre).join(', ');
        const el   = e.elemento_estado?` [${e.elemento_estado}]`:'';
        battleLog(battle,`  📊 ${e.name}: HP ${e.hp}/${e.maxHp}  ATK:${e.atk}  DEF:${e.def||0}${el}${habs?' | '+habs:''}`,'t-dim');
      });
      log=`⟨${hab.nombre}⟩ — escaneado`;
      _tactConsumeStamina(-6);
      break;
    }
    case 'poise_break': {
      if(!target) break;
      const dmg=Math.max(1,actor.atk-(target.def||0));
      target.hp=Math.max(0,target.hp-dmg);
      target.poise=0; target.poise_roto=true; target.poise_turnos=2;
      log=`⟨${hab.nombre}⟩ → ${target.name}  −${dmg}HP  ⚡POSTURA ROTA`;
      battleLog(battle,log,'t-cor');
      if(target.hp<=0){target.vivo=false;battleLog(battle,`${target.name} cae.`,'t-cor');}
      break;
    }
    case 'lifesteal': {
      if(!target) break;
      const dmg=Math.max(1,actor.atk+U.rand(1,4)-(target.def||0));
      const robo=Math.floor(dmg*(hab.valor||0.4));
      target.hp=Math.max(0,target.hp-dmg);
      p.hp=Math.min(p.maxHp,p.hp+robo);
      log=`⟨${hab.nombre}⟩ → ${target.name}  −${dmg}HP  (+${robo}HP)`;
      battleLog(battle,log,'t-cor');
      if(target.hp<=0){target.vivo=false;battleLog(battle,`${target.name} cae.`,'t-cor');}
      break;
    }
    case 'counter': {
      p._counter_mult=hab.valor||0.6; p._counter_activo=true;
      log=`⟨${hab.nombre}⟩ — contragolpe activo`;
      battleLog(battle,log,'t-acc');
      break;
    }
    case 'evol': {
      hab.evolucion=hab.evolucion||{contador:0,umbral:hab.evolucion_umbral||5};
      hab.evolucion.contador++;
      if(hab.evolucion.contador>=hab.evolucion.umbral){
        p.atk++;
        hab.evolucion.contador=0;
        hab.evolucion.umbral=Math.floor(hab.evolucion.umbral*1.5);
        battleLog(battle,`✦ ⟨${hab.nombre}⟩ evoluciona. ATK base +1.`,'t-cor');
        _xpGanar('cuerpo',30,'evolución');
      }
      if(target){const d=Math.max(1,actor.atk-(target.def||0));target.hp=Math.max(0,target.hp-d);if(target.hp<=0)target.vivo=false;}
      log=`⟨${hab.nombre}⟩ — evol.${hab.evolucion.contador}/${hab.evolucion.umbral}`;
      break;
    }
    default: {
      if(target){
        const dmg=Math.max(1,actor.atk+U.rand(2,8)-(target.def||0));
        target.hp=Math.max(0,target.hp-dmg);
        log=`⟨${hab.nombre}⟩ → ${target.name}  −${dmg}HP`;
        battleLog(battle,log,'t-hab');
        if(target.hp<=0){target.vivo=false;battleLog(battle,`${target.name} cae.`,'t-cor');}
      }
    }
  }

  _progresarHabJugador(hab, actor, battle);

  if(isMyTurn) _xpGanar('cuerpo',8,'habilidad en batalla');

  payload.handled=true;
  payload.logEntry=log;
  return payload;
}

// ── Comando COPIAR ────────────────────────────────────────────────
function cmdCopiar(args) {
  const q      = args.join(' ').trim().toLowerCase();
  const battleSvc = (typeof ServiceRegistry!=='undefined' && ServiceRegistry.get) ? ServiceRegistry.get('gameplay.battle.current') : null;
  const battle = battleSvc ? battleSvc() : null;

  if(!battle || battle.estado!=='activo') {
    Out.line('Solo puedes copiar durante una batalla activa.','t-dim'); return;
  }

  const candidatos = battle.cola.filter(c=>
    c.vivo && (c.tipo==='enemy'||c.tipo==='npc') && c._ultima_habilidad
  );

  let fuente = null;
  if(q) {
    fuente = candidatos.find(c=>c.name.toLowerCase().includes(q));
    if(!fuente) {
      Out.line(`No hay habilidad reciente de "${args.join(' ')}".`,'t-dim');
      if(candidatos.length) Out.line(`Disponibles: ${candidatos.map(c=>`${c.name.split(' ')[0].toLowerCase()} ⟨${c._ultima_habilidad.nombre}⟩`).join('  ·  ')}`,'t-hab');
      return;
    }
  } else if(candidatos.length===1) {
    fuente = candidatos[0];
  } else if(candidatos.length>1) {
    Out.line('Varias habilidades disponibles. Especifica el enemigo:','t-dim');
    candidatos.forEach(c=>Out.line(`  copiar ${c.name.split(' ')[0].toLowerCase().replace(/\s/g,'_')}  — ⟨${c._ultima_habilidad.nombre}⟩  [${c._ultima_habilidad.efecto}]`,'t-hab'));
    return;
  } else {
    Out.line('Ningún enemigo ha usado una habilidad recientemente.','t-dim');
    Out.line('Usa "copiar" justo después de que el enemigo ejecute su habilidad.','t-dim');
    return;
  }

  const habUsada = fuente._ultima_habilidad;
  const max      = Player.getSlot('habilidades');
  const col      = Player.get().ext?.habilidades || [];

  if(col.length >= max) {
    Out.line(`Sin slots libres (${col.length}/${max}). Necesitas un slot antes de copiar.`,'t-dim'); return;
  }
  if(col.some(h=>h.pool_id===habUsada.pool_id)) {
    Out.line(`Ya conoces ⟨${habUsada.nombre}⟩.`,'t-dim'); return;
  }

  // Recuperar definición base y construir la habilidad sin escalar
  const def = _habBase(habUsada.pool_id);
  const habAprendida = {
    id:               U.uid(),
    pool_id:          habUsada.pool_id,
    nombre:           habUsada.nombre,
    efecto:           habUsada.efecto,
    valor:            habUsada._valor_base ?? def?.valor ?? habUsada.valor,
    desc:             (def?.desc || habUsada.desc) + `  [copiada de ${fuente.name}]`,
    evolucion_umbral: def?.evolucion_umbral || 10,
    evolucion:        { contador:0, umbral: def?.evolucion_umbral || 10, nivel:1, max_nivel:5 },
    maestria:         { xp:0, umbral:8, nivel:0, max_nivel:10 },
    origen:           'copiada',
    copiada_de:       fuente.name,
  };

  Player.addToSlot('habilidades', habAprendida);
  _xpGanar('cuerpo', 30, `habilidad copiada: ${habAprendida.nombre}`);

  Out.sp();
  Out.line(`⟨${habAprendida.nombre}⟩ aprendida.`,'t-hab',true);
  Out.line(`Efecto: ${habAprendida.efecto}  ·  Valor base: ${habAprendida.valor}  ·  Copiada de ${fuente.name}`,'t-dim');
  Out.line(`Nota: valor base sin escalado del enemigo. Evolucionará con el uso.`,'t-dim');
  Out.sp();

  fuente._ultima_habilidad = null;  // consumir — no se puede copiar dos veces
  save();
}

// ── Comando HABILIDADES ───────────────────────────────────────────
function cmdHabilidades() {
  const habs = Player.get().ext?.habilidades || [];
  const max  = Player.getSlot('habilidades');
  Out.sp();
  Out.line(`— HABILIDADES CORPORALES (${habs.length}/${max}) —`, 't-hab');
  if(!habs.length) {
    Out.line('Sin habilidades. Usa "encarnar [materiales]" o "copiar" en batalla.', 't-dim');
    Out.sp(); return;
  }
  const COLS = { atk_mult:'t-pel', def_pasiva:'t-sis', atk_bonus:'t-cra', evasion:'t-mem', scan:'t-eco', aoe:'t-cor', evol:'t-acc', poise_break:'t-twi', lifesteal:'t-cor', counter:'t-acc', atk_debuff_area:'t-twi', atk_drain:'t-pel' };
  habs.forEach(h => {
    _initProgHab(h);
    const evo    = h.evolucion;
    const ms     = h.maestria;
    const evoBar = evo ? `  evol:N${evo.nivel} ${evo.contador}/${evo.umbral}` : '';
    const msBar  = ms  ? `  maest:N${ms.nivel} ${ms.xp}/${ms.umbral}` : '';
    const ori    = h.origen==='copiada' ? ` [copiada·${h.copiada_de}]` : '';
    Out.line(`  ${h.nombre}${ori}  [${h.efecto}]  val:${h.valor??'—'}${evoBar}${msBar}`, COLS[h.efecto]||'t-hab');
    Out.line(`    ${h.desc||'—'}`, 't-dim');
  });
  Out.sp();
}

// ── Registro del plugin ───────────────────────────────────────────
const pluginHabilidades = {
  id:      'plugin:habilidades',
  nombre:  'Sistema de Habilidades',
  version: '2.1.0',
  descripcion: 'Habilidades para jugadores y enemigos. "copiar" aprende habilidades enemigas en estado base.',

  hooks: {

    'player:create': {
      fn(payload) {
        payload.player.slots.habilidades = D.playerDef?.slots_habilidades||3;
        payload.player.ext.habilidades   = [];
        return payload;
      }
    },

    'player:calc_stat': {
      fn(payload) {
        const habs = payload.player.ext?.habilidades||[];
        if(payload.stat==='atk') payload.final += habs.filter(h=>h.efecto==='atk_bonus').reduce((s,h)=>s+(h.valor||0),0);
        if(payload.stat==='def') payload.final += habs.filter(h=>h.efecto==='def_pasiva').reduce((s,h)=>s+(h.valor||0),0);
        return payload;
      }
    },

    'player:calc_slot': {
      fn(payload) {
        if(payload.tipo!=='habilidades') return payload;
        payload.final = (D.playerDef?.slots_habilidades||3)+(Player.get()._extra_hab_slots||0);
        return payload;
      }
    },

    // ── Declarar slot HAB en la status bar ────────────────────────
    // El motor NO hardcodea 's-hab'. Este plugin lo declara aquí.
    'output:collect_status': {
      fn(payload) {
        const p    = payload.player;
        const habs = p.ext?.habilidades || [];
        const max  = Player.getSlot('habilidades');
        payload.slots['hab'] = { text: `${habs.length}/${max}`, color: 't-hab' };
        return payload;
      }
    },

    // Asignar habilidades a enemigos tras su creación
    'world:request_enemies': {
      priority: 60,  // después de plugin:enemigos (prioridad 50)
      fn(payload) {
        const dif = payload.difficulty||1.0;
        payload.enemies.forEach(e=>{
          e.habilidades     = _asignarHabilidadesEnemigo(e, dif);
          e._nivel_habs     = e.habilidades.length;
        });
        return payload;
      }
    },

    // Habilidad del jugador
    'combat:resolve_habilidad': {
      fn(payload) { return _ejecutarHabilidadJugador(payload); }
    },

    // Evasión y contragolpe del enemigo en pipeline de daño
    'combat:resolve_damage': {
      priority: 40,
      fn(payload) {
        const target = payload.target;
        if(!target) return payload;
        // Evasión del enemigo
        if((target._evasion||0)>0 && U.chance(target._evasion)) {
          payload.finalDmg = 0;
          battleLog(payload.battle, `  ${target.name} esquiva el ataque.`,'t-mem');
          return payload;
        }
        // Contragolpe del enemigo
        if(target._counter_activo && target._counter_mult) {
          const dmgC = Math.max(1, Math.floor((payload.base||0)*target._counter_mult));
          const att  = payload.actor;
          if(att && att.tipo==='player') {
            att.hp = Math.max(0,(att.hp||0)-dmgC);
            const p = Player.get();
            if(att.playerId===p.id) p.hp=att.hp;
            battleLog(payload.battle, `  ↺ ${target.name} contragolpea → ${att.name}  −${dmgC}HP`,'t-pel');
          }
        }
        return payload;
      }
    },

    // Contragolpe del JUGADOR cuando le pegan
    'combat:post_resolve': {
      fn(payload) {
        const p = Player.get();
        if(p._counter_activo && p._counter_mult && (payload.finalDmg||0)>0) {
          const dmgC = Math.max(1, Math.floor(payload.finalDmg*p._counter_mult));
          const src  = payload.actor;
          if(src && src.vivo) {
            src.hp = Math.max(0,src.hp-dmgC);
            battleLog(payload.battle, `  ↺ CONTRAGOLPE → ${src.name}  −${dmgC}HP`,'t-acc');
            if(src.hp<=0){ src.vivo=false; battleLog(payload.battle,`${src.name} cae.`,'t-cor'); }
          }
          p._counter_activo=false;
        }
        return payload;
      }
    },

    'player:tick': {
      fn(payload) {
        const p = payload.player;
        if((p._niebla_turnos||0)>0) p._niebla_turnos--;
        return payload;
      }
    },
  },

  comandos: {
    'habilidades': {
      fn: ()=>cmdHabilidades(),
      meta: {
        titulo:'habilidades', color:'t-hab',
        desc:'Muestra habilidades encarnadas y copiadas, sus efectos y evolución.',
        uso:['habilidades','hab  (atajo)'],
        notas:[
          'Efectos base: atk_mult · def_pasiva · atk_bonus · evasion · scan · aoe · evol',
          'Efectos elite (solo en enemigos o copiados): poise_break · lifesteal · counter · atk_debuff_area',
          'Los enemigos Nivel 4 (ATK > 22) tienen habilidades exclusivas.',
          '"scan" ahora revela también las habilidades del enemigo.',
        ],
      },
    },
    'hab':    { fn:()=>cmdHabilidades(), meta:{ titulo:'hab (alias)',  color:'t-hab', desc:'Lista habilidades.' } },
    'copiar': {
      fn:(args)=>cmdCopiar(args),
      meta:{
        titulo:'copiar [enemigo]', color:'t-hab',
        desc:'Aprende la última habilidad usada por un enemigo, en su estado base sin escalado.',
        uso:['copiar','copiar guardián','copiar antiguo'],
        notas:[
          'Úsalo justo después del turno del enemigo.',
          'La habilidad se aprende con su valor BASE, no el escalado del enemigo.',
          'Requiere un slot libre. "habilidades" para ver cuántos tienes.',
          'No se puede copiar la misma habilidad dos veces.',
          'Habilidades elite copiadas tienen efectos únicos no obtenibles por forja.',
        ],
      },
    },
  },
};
