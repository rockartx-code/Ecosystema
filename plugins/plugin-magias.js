// ════════════════════════════════════════════════════════════════
// PLUGIN: Magias v2.1
//
// Novedades:
//   · Enemigos de mayor nivel reciben magias procedurales
//   · Tabla de nivel por ATK (mismo umbral que habilidades)
//   · "canalizar [enemigo]" aprende la última magia lanzada
//     en su estado base (cargas y poder reducidos)
//   · Magias exclusivas de enemigos (maldición, corrupción_total, etc.)
//   · La IA las usa via combat:resolve_ia
// ════════════════════════════════════════════════════════════════

// ── Pools de magias por nivel ─────────────────────────────────────
// _poder_base y _cargas_base para que "canalizar" devuelva valores base.

const MAG_POOL_BASICO = [
  { id:'proyeccion_eco',    nombre:'Proyección Eco',    efecto:'dmg_dist',     poder:8,  cargas:3, fragilidad_base:0,  desc:'Daño a distancia resonante.' },
  { id:'corrupcion_dirigida',nombre:'Corrupción Dirigida',efecto:'debuff',      poder:6,  cargas:2, fragilidad_base:20, desc:'Degrada ATK del objetivo.' },
];

const MAG_POOL_MEDIO = [
  ...MAG_POOL_BASICO,
  { id:'velo_memoria',      nombre:'Velo de Memoria',    efecto:'invisibilidad',poder:0,  cargas:2, fragilidad_base:10, desc:'Invisible por 3 turnos.' },
  { id:'bifurcacion_menor', nombre:'Bifurcación Menor',  efecto:'duplicar',     poder:10, cargas:1, fragilidad_base:30, desc:'Duplica el próximo ataque.' },
  { id:'herida_resonante',  nombre:'Herida Resonante',   efecto:'herida_fija',  poder:12, cargas:2, fragilidad_base:15, desc:'Inflige herida persistente.' },
];

const MAG_POOL_ELITE = [
  ...MAG_POOL_MEDIO,
  { id:'maldicion_lenta',   nombre:'Maldición Lenta',    efecto:'maldicion',    poder:8,  cargas:2, fragilidad_base:20, desc:'El objetivo pierde HP cada turno.' },
  { id:'drenaje_mana',      nombre:'Drenaje de Maná',    efecto:'mana_drain',   poder:15, cargas:2, fragilidad_base:25, desc:'Roba maná y lo convierte en daño.' },
  { id:'corrupcion_total',  nombre:'Corrupción Total',   efecto:'corrupcion_total',poder:20,cargas:1,fragilidad_base:40,desc:'Daño masivo + herida + debuff en un solo golpe.' },
  { id:'invocacion_grieta', nombre:'Invocación de Grieta',efecto:'invocar_eco',  poder:0, cargas:1, fragilidad_base:50, desc:'Invoca un Fragmento Errante como aliado.' },
];

function _magBase(pool_id) {
  return MAG_POOL_ELITE.find(m=>m.id===pool_id)||null;
}

// ── Asignar magias a un enemigo ───────────────────────────────────
// Nivel 1: atk <  8 → ninguna
// Nivel 2: atk  8-14→ 50% de tener 1 magia básica
// Nivel 3: atk 15-22→ 1 del pool medio
// Nivel 4: atk > 22 → 1-2 del pool elite

function _asignarMagiasEnemigo(enemy, dif) {
  const atk = enemy.atk||0;
  let pool, cantidad, chance;

  if(atk < 8)       { return []; }
  else if(atk < 15) { pool=MAG_POOL_BASICO;  cantidad=1; chance=0.5; }
  else if(atk < 22) { pool=MAG_POOL_MEDIO;   cantidad=1; chance=0.8; }
  else              { pool=MAG_POOL_ELITE;    cantidad=U.rand(1,2); chance=1.0; }

  if(!U.chance(chance)) return [];

  const rng     = U.rng((enemy.id||enemy.nombre||'')+'mags');
  const elegidas = U.pickN(pool, Math.min(cantidad,pool.length), rng);

  return elegidas.map(m=>({
    ...m,
    id:           U.uid(),
    pool_id:      m.id,
    poder:        Math.round(m.poder*(1+(dif-1)*0.4)),  // escala más fuerte que habs
    _poder_base:  m.poder,
    cargas:       m.cargas,
    cargas_max:   m.cargas,
    fragilidad:   m.fragilidad_base,
    usos:         0,
    corrompida:   false,
  }));
}

// ── Ejecutar magia de ENEMIGO ─────────────────────────────────────
function _ejecutarMagiaEnemigo(actor, mag, target, battle) {
  mag.usos = (mag.usos||0)+1;
  mag.cargas--;
  mag.fragilidad = U.clamp((mag.fragilidad||0)+12, 0, 100);

  // Marcar para "canalizar"
  actor._ultima_magia = mag;
  EventBus.emit('combat:enemy_used_magia', { actor, mag, battle });

  let log = '';

  switch(mag.efecto) {

    case 'dmg_dist': {
      if(!target) break;
      const dmg = Math.max(1, (mag.poder||8)-(target.poise_roto?0:target.def||0));
      target.hp = Math.max(0,target.hp-dmg);
      // Aplicar elemento RESONANTE (base del pool)
      if(typeof Tactics!=='undefined') Tactics.aplicarElemento(target,'RESONANTE',battle);
      log = `${actor.name} ⟨${mag.nombre}⟩ → ${target.name}  −${dmg}HP  [RESONANTE]`;
      battleLog(battle,log,'t-mag');
      if(target.hp<=0){target.vivo=false;battleLog(battle,`${target.name} cae.`,'t-cor');}
      _aplicarDanoJugadorMag(target,dmg,battle);
      break;
    }

    case 'debuff': {
      if(!target) break;
      const red  = Math.max(1,Math.floor((target.atk||5)*0.3));
      const dmg  = Math.max(1,Math.floor((mag.poder||6)*0.5));
      target.atk = Math.max(1,(target.atk||5)-red);
      target.hp  = Math.max(0,target.hp-dmg);
      log = `${actor.name} ⟨${mag.nombre}⟩ → ${target.name}  ATK−${red}  −${dmg}HP`;
      battleLog(battle,log,'t-mag');
      if(target.hp<=0){target.vivo=false;battleLog(battle,`${target.name} cae.`,'t-cor');}
      _aplicarDanoJugadorMag(target,dmg,battle);
      break;
    }

    case 'invisibilidad': {
      // El enemigo se vuelve más difícil de atacar — reduce daño recibido
      actor._invisible_turnos = 2;
      actor._invisible        = true;
      log = `${actor.name} ⟨${mag.nombre}⟩ — evasión completa por 2 turnos`;
      battleLog(battle,log,'t-mag');
      break;
    }

    case 'duplicar': {
      // El próximo ataque del enemigo se ejecuta dos veces
      actor._duplicar_proximo = true;
      log = `${actor.name} ⟨${mag.nombre}⟩ — próximo ataque se duplicará`;
      battleLog(battle,log,'t-mag');
      break;
    }

    case 'herida_fija': {
      if(!target) break;
      const dmg = Math.max(1,(mag.poder||12)-(target.def||0));
      target.hp = Math.max(0,target.hp-dmg);
      // Infligir herida aleatoria
      const HERIDAS_POSIBLES = ['HEMORRAGIA','ENVENENAMIENTO','CONMOCION','FRACTURA'];
      const herida = U.pick(HERIDAS_POSIBLES,U.rng(Date.now()));
      const p = Player.get();
      if(target.tipo==='player' && target.playerId===p.id) {
        p.heridas=p.heridas||[];
        if(!p.heridas.includes(herida)){
          p.heridas.push(herida);
          const hi = typeof Tactics!=='undefined' ? Tactics.HERIDAS[herida] : null;
          battleLog(battle,`  ${hi?.icon||'⚠'} ¡${herida}! ${hi?.desc||''}`,'t-pel');
        }
      }
      log = `${actor.name} ⟨${mag.nombre}⟩ → ${target.name}  −${dmg}HP  +${herida}`;
      battleLog(battle,log,'t-mag');
      if(target.hp<=0){target.vivo=false;battleLog(battle,`${target.name} cae.`,'t-cor');}
      _aplicarDanoJugadorMag(target,dmg,battle);
      break;
    }

    case 'maldicion': {
      if(!target) break;
      target._maldicion_dmg   = Math.max(1,Math.floor((mag.poder||8)*0.4));
      target._maldicion_turnos= 3;
      const dmg_ini = Math.max(1,Math.floor((mag.poder||8)*0.5)-(target.def||0));
      target.hp = Math.max(0,target.hp-dmg_ini);
      log = `${actor.name} ⟨${mag.nombre}⟩ → ${target.name}  −${dmg_ini}HP  +MALDICIÓN (−${target._maldicion_dmg}HP/turno×3)`;
      battleLog(battle,log,'t-cor');
      if(target.hp<=0){target.vivo=false;battleLog(battle,`${target.name} cae.`,'t-cor');}
      _aplicarDanoJugadorMag(target,dmg_ini,battle);
      break;
    }

    case 'mana_drain': {
      if(!target) break;
      const p = Player.get();
      if(target.tipo==='player' && target.playerId===p.id) {
        const manaDrenado = Math.min(p.mana||0, mag.poder||15);
        p.mana = Math.max(0,(p.mana||0)-manaDrenado);
        const dmg = manaDrenado;  // el maná drenado se convierte en daño
        target.hp = Math.max(0,target.hp-dmg);
        log = `${actor.name} ⟨${mag.nombre}⟩ → ${target.name}  Maná −${manaDrenado}  HP −${dmg}`;
        battleLog(battle,log,'t-mag');
        if(target.hp<=0){target.vivo=false;battleLog(battle,`${target.name} cae.`,'t-cor');}
        _aplicarDanoJugadorMag(target,dmg,battle);
      } else {
        const dmg = Math.max(1,(mag.poder||15)-(target.def||0));
        target.hp = Math.max(0,target.hp-dmg);
        log = `${actor.name} ⟨${mag.nombre}⟩ → ${target.name}  −${dmg}HP`;
        battleLog(battle,log,'t-mag');
        if(target.hp<=0){target.vivo=false;battleLog(battle,`${target.name} cae.`,'t-cor');}
      }
      break;
    }

    case 'corrupcion_total': {
      if(!target) break;
      const dmg  = Math.max(1,(mag.poder||20)-(target.poise_roto?0:target.def||0));
      const red  = Math.max(1,Math.floor((target.atk||5)*0.4));
      target.hp  = Math.max(0,target.hp-dmg);
      target.atk = Math.max(1,(target.atk||5)-red);
      // Aplicar VACÍO
      if(typeof Tactics!=='undefined') Tactics.aplicarElemento(target,'VACÍO',battle);
      // Herida ENVENENAMIENTO fija
      const p = Player.get();
      if(target.tipo==='player'&&target.playerId===p.id) {
        p.heridas=p.heridas||[];
        if(!p.heridas.includes('ENVENENAMIENTO')) p.heridas.push('ENVENENAMIENTO');
      }
      log = `${actor.name} ⟨${mag.nombre}⟩ → ${target.name}  −${dmg}HP  ATK−${red}  [VACÍO] [ENVENENAMIENTO]`;
      battleLog(battle,log,'t-cor');
      if(target.hp<=0){target.vivo=false;battleLog(battle,`${target.name} cae.`,'t-cor');}
      _aplicarDanoJugadorMag(target,dmg,battle);
      break;
    }

    case 'invocar_eco': {
      // Añade un Fragmento Errante a la batalla
      const nuevo = {
        tipo:'enemy', id:U.uid(), name:'Fragmento Errante',
        hp:10, maxHp:10, atk:4, def:0, vivo:true, defendiendo:false,
        tags:['inestable'], habilidades:[], magias:[],
        iniciativa: 5, color:'t-pel',
        _invocado_por: actor.id,
      };
      battle.cola.push(nuevo);
      log = `${actor.name} ⟨${mag.nombre}⟩ — invoca un Fragmento Errante`;
      battleLog(battle,log,'t-cor');
      break;
    }

    default: {
      if(target){
        const dmg=Math.max(1,(mag.poder||8)-(target.def||0));
        target.hp=Math.max(0,target.hp-dmg);
        log=`${actor.name} ⟨${mag.nombre}⟩ → ${target.name}  −${dmg}HP`;
        battleLog(battle,log,'t-mag');
        if(target.hp<=0){target.vivo=false;battleLog(battle,`${target.name} cae.`,'t-cor');}
        _aplicarDanoJugadorMag(target,dmg,battle);
      }
    }
  }

  if(mag.fragilidad>=100) {
    mag.corrompida=true;
    battleLog(battle,`☠ ⟨${mag.nombre}⟩ de ${actor.name} se corrompe.`,'t-dim');
    actor.magias=actor.magias.filter(m=>m.id!==mag.id);
  }

  return log;
}

// Tick de la maldición activa sobre el jugador
function _tickMaldicion(target, battle) {
  if(!(target._maldicion_turnos>0)) return;
  target._maldicion_turnos--;
  const dmg = target._maldicion_dmg||0;
  if(dmg>0) {
    target.hp = Math.max(0,target.hp-dmg);
    battleLog(battle,`  ☠ MALDICIÓN → ${target.name}  −${dmg}HP  (${target._maldicion_turnos} turnos rest.)`, 't-cor');
    const p = Player.get();
    if(target.tipo==='player'&&target.playerId===p.id) p.hp=target.hp;
    if(target.hp<=0){ target.vivo=false; battleLog(battle,`${target.name} cae.`,'t-cor'); }
  }
  if(target._maldicion_turnos<=0) delete target._maldicion_dmg;
}

// Tick de invisibilidad del enemigo
function _tickInvisibilidadEnemigo(actor) {
  if(!(actor._invisible_turnos>0)) return;
  actor._invisible_turnos--;
  if(actor._invisible_turnos<=0) actor._invisible=false;
}

function _initProgMag(mag) {
  mag.evolucion = mag.evolucion || { contador:0, umbral:6, nivel:1, max_nivel:5 };
  mag.maestria  = mag.maestria  || { xp:0, umbral:10, nivel:0, max_nivel:10 };
}

function _progresarMagJugador(mag, actor, battle) {
  _initProgMag(mag);
  mag.evolucion.contador = (mag.evolucion.contador||0) + 1;
  mag.maestria.xp        = (mag.maestria.xp||0) + 1;

  if(mag.evolucion.contador >= mag.evolucion.umbral && (mag.evolucion.nivel||1) < (mag.evolucion.max_nivel||5)) {
    mag.evolucion.contador = 0;
    mag.evolucion.nivel    = (mag.evolucion.nivel||1) + 1;
    mag.evolucion.umbral   = Math.floor((mag.evolucion.umbral||6) * 1.35);
    mag.poder              = Math.max(1, Math.floor((mag.poder||8) * 1.15));
    mag.cargas_max         = Math.min(9, (mag.cargas_max||2) + 1);
    mag.cargas             = Math.min(mag.cargas_max, (mag.cargas||0) + 1);
    battleLog(battle, `✦ ⟨${mag.nombre}⟩ evoluciona a nivel ${mag.evolucion.nivel}. Poder:${mag.poder} Cargas:${mag.cargas_max}`,'t-mag');
    if(typeof XP!=='undefined') XP.ganar('mente', 30 + mag.evolucion.nivel*5, 'magia evolucionada');
  }

  if(mag.maestria.xp >= mag.maestria.umbral && (mag.maestria.nivel||0) < (mag.maestria.max_nivel||10)) {
    mag.maestria.xp      = 0;
    mag.maestria.nivel   = (mag.maestria.nivel||0) + 1;
    mag.maestria.umbral  = Math.floor((mag.maestria.umbral||10) * 1.2);
    mag.fragilidad       = Math.max(0, (mag.fragilidad||0) - 8);
    actor._resonancia_arcana = (actor._resonancia_arcana||0) + 1;
    battleLog(battle, `◎ Maestría de ⟨${mag.nombre}⟩ sube a ${mag.maestria.nivel}. Fragilidad −8%.`,'t-acc');
    if(typeof XP!=='undefined') XP.ganar('mente', 12 + mag.maestria.nivel*2, 'maestría de magia');
  }
}

function _aplicarDanoJugadorMag(target, dmg, battle) {
  if(target.tipo!=='player') return;
  const p = Player.get();
  if(target.playerId!==p.id) return;
  p.hp = target.hp;
}

// ── Comando CANALIZAR ─────────────────────────────────────────────
function cmdCanalizar(args) {
  const q      = args.join(' ').trim().toLowerCase();
  const battleSvc = (typeof ServiceRegistry!=='undefined' && ServiceRegistry.get) ? ServiceRegistry.get('gameplay.battle.current') : null;
  const battle = battleSvc ? battleSvc() : (typeof Net!=='undefined' ? Net.getMyBattle?.() : null);

  if(!battle||battle.estado!=='activo') {
    Out.line('Solo puedes canalizar durante una batalla activa.','t-dim'); return;
  }

  const candidatos = battle.cola.filter(c=>
    c.vivo && (c.tipo==='enemy'||c.tipo==='npc') && c._ultima_magia
  );

  let fuente = null;
  if(q) {
    fuente = candidatos.find(c=>c.name.toLowerCase().includes(q));
    if(!fuente) {
      Out.line(`No hay magia reciente de "${args.join(' ')}".`,'t-dim');
      if(candidatos.length) Out.line(`Disponibles: ${candidatos.map(c=>`${c.name.split(' ')[0].toLowerCase()} ⟨${c._ultima_magia.nombre}⟩`).join('  ·  ')}`,'t-mag');
      return;
    }
  } else if(candidatos.length===1) {
    fuente = candidatos[0];
  } else if(candidatos.length>1) {
    Out.line('Varias magias disponibles. Especifica el enemigo:','t-dim');
    candidatos.forEach(c=>Out.line(`  canalizar ${c.name.split(' ')[0].toLowerCase()}  — ⟨${c._ultima_magia.nombre}⟩  [${c._ultima_magia.efecto}]`,'t-mag'));
    return;
  } else {
    Out.line('Ningún enemigo ha usado una magia recientemente.','t-dim');
    Out.line('Usa "canalizar" justo después de que el enemigo lance una magia.','t-dim');
    return;
  }

  const magUsada = fuente._ultima_magia;
  const max      = Player.getSlot('magias');
  const col      = Player.get().ext?.magias||[];

  if(col.length>=max) {
    Out.line(`Sin slots de magia (${col.length}/${max}).`,'t-dim'); return;
  }
  if(col.some(m=>m.pool_id===magUsada.pool_id)) {
    Out.line(`Ya conoces ⟨${magUsada.nombre}⟩.`,'t-dim'); return;
  }

  // Bloquear magias que no tienen sentido para el jugador
  const BLOQUEADAS_JUGADOR = ['invocar_eco','duplicar']; // duplicar ya existe en forja
  if(BLOQUEADAS_JUGADOR.includes(magUsada.efecto)) {
    Out.line(`⟨${magUsada.nombre}⟩ no puede ser canalizada. Su naturaleza es incompatible con un cuerpo vivo.`,'t-mag');
    return;
  }

  const def = _magBase(magUsada.pool_id);

  // La magia se aprende en base pero con poder y cargas reducidos
  // (canalizar es imperfecto — el jugador captura solo una parte)
  const magAprendida = {
    id:          U.uid(),
    pool_id:     magUsada.pool_id,
    nombre:      magUsada.nombre,
    efecto:      magUsada.efecto,
    poder:       Math.max(1, Math.floor((magUsada._poder_base??def?.poder??magUsada.poder)*0.7)),
    cargas:      Math.max(1, def?.cargas??2),
    cargas_max:  Math.max(1, def?.cargas??2),
    fragilidad:  (def?.fragilidad_base??0)+10,  // arranca con algo de fragilidad (canalizar es tenso)
    desc:        (def?.desc||magUsada.desc) + `  [canalizada de ${fuente.name}]`,
    tags:        magUsada.tags||[],
    corrompida:  false,
    evolucion:   { contador:0, umbral:6, nivel:1, max_nivel:5 },
    maestria:    { xp:0, umbral:10, nivel:0, max_nivel:10 },
    origen:      'canalizada',
    canalizada_de: fuente.name,
  };

  Player.addToSlot('magias', magAprendida);
  if(typeof XP!=='undefined') XP.ganar('mente', 35, `magia canalizada: ${magAprendida.nombre}`);

  Out.sp();
  Out.line(`⟨${magAprendida.nombre}⟩ canalizada.`,'t-mag',true);
  Out.line(`Poder: ${magAprendida.poder}  ·  Cargas: ${magAprendida.cargas}  ·  Fragilidad inicial: ${magAprendida.fragilidad}%`,'t-dim');
  Out.line(`Canalizada de ${fuente.name}. Poder reducido al 70% — la canalización es imperfecta.`,'t-dim');
  Out.sp();

  fuente._ultima_magia = null;
  save();
}

// ── Comandos del jugador (sin cambios de v2.0) ────────────────────
function cmdMagias() {
  const mags = Player.get().ext?.magias||[];
  const max  = Player.getSlot('magias');
  Out.sp();
  Out.line(`— MAGIAS CONJURADAS (${mags.length}/${max}) —`,'t-mag');
  if(!mags.length){ Out.line('Sin magias. Usa "conjurar [materiales]" o "canalizar" en batalla.','t-dim'); Out.sp(); return; }
  mags.forEach(m=>{
    _initProgMag(m);
    const frag    = m.fragilidad||0;
    const fragCol = frag>=60?'t-pel':frag>=30?'t-mem':'t-cra';
    const ori     = m.origen==='canalizada'?` [canalizada·${m.canalizada_de}]`:'';
    Out.line(`  ${m.nombre}${ori}  [${m.efecto}]  cargas:${m.cargas}/${m.cargas_max}  frag:${frag}%  evol:N${m.evolucion.nivel} ${m.evolucion.contador}/${m.evolucion.umbral}  maest:N${m.maestria.nivel} ${m.maestria.xp}/${m.maestria.umbral}`,'t-mag');
    Out.line(`    ${m.desc||'—'}`,'t-dim');
    if(frag>=80) Out.line('    ⚠ Próxima a corromperse.','t-pel');
  });
  Out.sp();
}

function cmdLanzar(args) {
  const q    = args.join(' ').trim();
  const mags = Player.get().ext?.magias||[];
  const mag  = q ? mags.find(m=>m.nombre?.toLowerCase().includes(q.toLowerCase())) : mags.find(m=>m.cargas>0);

  if(!mag){ Out.line('Sin magia disponible.','t-dim'); return; }
  if(mag.cargas<=0){ Out.line(`"${mag.nombre}" sin cargas. Usa "recargar".`,'t-dim'); return; }

  const p = Player.get();
  const manaCost = mag.poder||8;
  if((p.mana||0)<manaCost){ Out.line(`Maná insuficiente (necesitas ${manaCost}).`,'t-mag'); return; }
  p.mana = Math.max(0,(p.mana||0)-manaCost);
  mag.cargas--;
  mag.fragilidad = U.clamp((mag.fragilidad||0)+10,0,100);

  _efectoFueraCombate(mag,p);

  if(mag.fragilidad>=100){
    mag.corrompida=true;
    Out.line(`${mag.nombre} se corrompe. Pierdes la magia.`,'t-pel',true);
    Player.removeFromSlot('magias',mag.id);
  }
  refreshStatus(); save();
}

function _efectoFueraCombate(mag,p){
  const n=World.node(Player.pos());
  switch(mag.efecto){
    case 'dmg_dist':{
      const enemies=n?.enemies||[];
      if(!enemies.length){Out.line(`${mag.nombre}: Sin objetivos.`,'t-mag');break;}
      const e=enemies[0]; const dmg=Math.max(1,(mag.poder||8)-(e.def||0));
      e.hp_current=Math.max(0,(e.hp_current||e.hp)-dmg);
      Out.line(`${mag.nombre} → ${e.nombre}  −${dmg}HP`,'t-mag',true);
      if(e.hp_current<=0) World.rmEnemy(Player.pos(),e.id);
      break;
    }
    case 'teleport':{
      const nodos=Object.keys(World.all()).filter(id=>id!==Player.pos());
      if(!nodos.length) break;
      const dest=nodos[Math.floor(Math.random()*nodos.length)];
      const enterNodeSvc = (typeof ServiceRegistry!=='undefined' && ServiceRegistry.get) ? ServiceRegistry.get('gameplay.enter_node') : null;
      if(enterNodeSvc) enterNodeSvc(dest, { tick:1, showLook:false, saveAfter:false, grantXP:false });
      else { Player.setPos(dest); Clock.tick(1); World.visit(dest); }
      Out.line(`${mag.nombre}: teletransportado a ${World.node(dest)?.name||'?'}`,'t-mag',true);
      break;
    }
    case 'invisibilidad':{ p.flags=p.flags||[]; p.flags=p.flags.filter(f=>f.tipo!=='invisible'); p.flags.push({tipo:'invisible',ciclos:3}); Out.line(`${mag.nombre}: invisible por 3 ciclos.`,'t-mag',true); break; }
    case 'duplicar':     { p._duplicar_loot=true; Out.line(`${mag.nombre}: próximo objeto recogido se duplica.`,'t-mag',true); break; }
    case 'revelar':      { const item=p.inventory.find(i=>i.imprint); if(item) Out.line(`${mag.nombre}: ${item.nombre} — hash:${item.imprint?.hash||'?'}`,'t-mag',true); else Out.line('Sin objetos con impronta.','t-dim'); break; }
    case 'debuff':       { const e=(n?.enemies||[])[0]; if(e){const r=Math.max(1,Math.floor(e.atk*0.3));e.atk=Math.max(1,e.atk-r);Out.line(`${mag.nombre} → ${e.nombre}  ATK−${r}`,'t-mag',true);}else Out.line('Sin objetivos.','t-dim'); break; }
    case 'maldicion':    { Out.line(`${mag.nombre}: efecto de maldición solo activo en batalla.`,'t-dim'); break; }
    case 'mana_drain':   { Out.line(`${mag.nombre}: efecto solo activo en batalla.`,'t-dim'); break; }
    default: Out.line(`${mag.nombre} (${mag.efecto}): lanzada.`,'t-mag',true);
  }
}

function cmdRecargar(args){
  const[magQ,...matRest]=args; const matQ=matRest.join(' ').trim();
  const mags=Player.get().ext?.magias||[];
  const mag=magQ?mags.find(m=>m.nombre?.toLowerCase().includes(magQ)):mags[0];
  if(!mag){Out.line('Sin magia para recargar.','t-dim');return;}
  const mat=matQ?Player.findItem(matQ):Player.get().inventory.find(i=>D.matTags(i.blueprint).some(t=>['resonante','corrupto'].includes(t)));
  if(!mat){Out.line('Necesitas un material resonante o corrupto.','t-dim');return;}
  if(!D.matTags(mat.blueprint).some(t=>['resonante','corrupto'].includes(t))){Out.line(`${mat.blueprint} no es válido.`,'t-dim');return;}
  Player.rmItem(mat.id);
  mag.cargas=Math.min(mag.cargas_max||3,(mag.cargas||0)+2);
  mag.fragilidad=Math.max(0,(mag.fragilidad||0)-20);
  mag.corrompida=false;
  Out.line(`${mag.nombre} recargada. Cargas: ${mag.cargas}/${mag.cargas_max}  Fragilidad: ${mag.fragilidad}%`,'t-mag');
  save();
}

// ── Ejecución de magia del jugador en batalla ─────────────────────
function _ejecutarMagiaJugadorBatalla(payload){
  const{actor,mag,target,battle,isMyTurn}=payload;
  const p=Player.get();
  if((p.heridas||[]).includes('CONMOCION')&&U.chance(0.4)){
    battleLog(battle,'💫 Conmoción: la magia falla!','t-dim'); mag.cargas--; payload.handled=true; return payload;
  }
  const actorState=battle.cola.find(c=>c.id===actor.id);
  if(actorState?.silenciado){battleLog(battle,'Silenciado: no puedes usar magias.','t-mag');payload.handled=true;return payload;}
  const manaCost=mag.poder||8;
  if((p.mana||0)<manaCost){battleLog(battle,`Maná insuficiente (necesitas ${manaCost}).`,'t-mag');payload.handled=true;return payload;}
  p.mana=Math.max(0,(p.mana||0)-manaCost);
  mag.cargas--; mag.fragilidad=U.clamp((mag.fragilidad||0)+10,0,100);
  let log='';
  switch(mag.efecto){
    case 'dmg_dist':default:{ if(!target){battleLog(battle,'Sin objetivo.','t-dim');break;} const dmg=Math.max(1,(mag.poder||8)-(target.poise_roto?0:target.def||0)); target.hp=Math.max(0,target.hp-dmg); log=`${actor.name} ⟨${mag.nombre}⟩ → ${target.name}  −${dmg}HP`; battleLog(battle,log,'t-mag'); if(target.hp<=0){target.vivo=false;battleLog(battle,`${target.name} cae.`,'t-cor');} break;}
    case 'debuff':{ if(!target)break; const red=Math.max(1,Math.floor((target.atk||4)*0.3)); const dmg=Math.max(1,Math.floor((mag.poder||8)*0.5)); target.atk=Math.max(1,(target.atk||4)-red); target.hp=Math.max(0,target.hp-dmg); log=`⟨${mag.nombre}⟩ → ${target.name}  ATK−${red}  −${dmg}HP`; battleLog(battle,log,'t-mag'); if(target.hp<=0){target.vivo=false;battleLog(battle,`${target.name} cae.`,'t-cor');} break;}
    case 'duplicar':{ p._duplicar_accion=true; if(target){const dmg=Math.max(1,(mag.poder||8)-(target.def||0));target.hp=Math.max(0,target.hp-dmg);battleLog(battle,`  ↳ −${dmg}HP`,'t-mag');if(target.hp<=0){target.vivo=false;}} log=`⟨${mag.nombre}⟩ — próxima acción duplicada`; battleLog(battle,log,'t-mag'); break;}
    case 'invisibilidad':{ p._niebla_turnos=(p._niebla_turnos||0)+3; log=`⟨${mag.nombre}⟩ — invisible 3 turnos`; battleLog(battle,log,'t-mag'); break;}
    case 'teleport':{ if(target){target.stun_turnos=(target.stun_turnos||0)+1;} log=`⟨${mag.nombre}⟩ — objetivo confundido`; battleLog(battle,log,'t-mag'); break;}
    case 'revelar':{ battle.cola.filter(c=>c.vivo&&(c.tipo==='enemy'||c.tipo==='npc')).forEach(e=>{const habs=(e.habilidades||[]).map(h=>h.nombre).join(', ');const mags_e=(e.magias||[]).map(m=>m.nombre).join(', ');battleLog(battle,`  🔍 ${e.name}: HP ${e.hp}/${e.maxHp}  ATK:${e.atk}${habs?'  Habs:'+habs:''}${mags_e?'  Mags:'+mags_e:''}`,'t-eco');}); log=`⟨${mag.nombre}⟩ — revelar`; break;}
    case 'maldicion':{ if(!target)break; target._maldicion_dmg=Math.max(1,Math.floor((mag.poder||8)*0.4)); target._maldicion_turnos=3; const dmg_i=Math.max(1,Math.floor((mag.poder||8)*0.5)-(target.def||0)); target.hp=Math.max(0,target.hp-dmg_i); log=`⟨${mag.nombre}⟩ → ${target.name}  −${dmg_i}HP  +MALDICIÓN`; battleLog(battle,log,'t-cor'); if(target.hp<=0){target.vivo=false;battleLog(battle,`${target.name} cae.`,'t-cor');} break;}
    case 'mana_drain':{ if(!target)break; const dmg=Math.max(1,(mag.poder||15)-(target.def||0)); target.hp=Math.max(0,target.hp-dmg); log=`⟨${mag.nombre}⟩ → ${target.name}  −${dmg}HP`; battleLog(battle,log,'t-mag'); if(target.hp<=0){target.vivo=false;battleLog(battle,`${target.name} cae.`,'t-cor');} break;}
    case 'corrupcion_total':{ if(!target)break; const dmg=Math.max(1,(mag.poder||20)-(target.poise_roto?0:target.def||0)); const red=Math.max(1,Math.floor((target.atk||4)*0.4)); target.hp=Math.max(0,target.hp-dmg); target.atk=Math.max(1,(target.atk||4)-red); if(typeof Tactics!=='undefined')Tactics.aplicarElemento(target,'VACÍO',battle); log=`⟨${mag.nombre}⟩ → ${target.name}  −${dmg}HP  ATK−${red}  [VACÍO]`; battleLog(battle,log,'t-cor'); if(target.hp<=0){target.vivo=false;battleLog(battle,`${target.name} cae.`,'t-cor');} break;}
  }
  if(isMyTurn && typeof XP!=='undefined') XP.ganar('mente',12,'magia en batalla');
  _progresarMagJugador(mag, actor, battle);
  if(mag.fragilidad>=100){mag.corrompida=true;battleLog(battle,`☠ ⟨${mag.nombre}⟩ se corrompe.`,'t-pel');Player.removeFromSlot('magias',mag.id);}
  payload.handled=true; payload.logEntry=log;
  return payload;
}

// ── Registro del plugin ───────────────────────────────────────────
const pluginMagias = {
  id:      'plugin:magias',
  nombre:  'Sistema de Magias',
  version: '2.1.0',
  descripcion: 'Magias para jugadores y enemigos. "canalizar" aprende magias enemigas lanzadas.',

  hooks: {

    'player:create': {
      fn(payload) {
        payload.player.slots.magias = D.playerDef?.slots_magias||2;
        payload.player.ext.magias   = [];
        payload.player.mana         = 60;
        payload.player.maxMana      = 60;
        return payload;
      }
    },

    'player:calc_slot': {
      fn(payload) {
        if(payload.tipo!=='magias') return payload;
        const base  = D.playerDef?.slots_magias||2;
        const bonus = Player.get().inventory.some(i=>D.mat(i.blueprint)?.efecto_pasivo==='+1_slot_magia')?1:0;
        const extra = Player.get()._extra_mag_slots||0;
        payload.final = base+bonus+extra;
        return payload;
      }
    },

    // Asignar magias a enemigos tras su creación
    'world:request_enemies': {
      priority: 70,  // después de plugin:habilidades (prioridad 60)
      fn(payload) {
        const dif = payload.difficulty||1.0;
        payload.enemies.forEach(e=>{
          e.magias    = _asignarMagiasEnemigo(e, dif);
          e._nivel_mags = e.magias.length;
        });
        return payload;
      }
    },

    // Magia del jugador en batalla
    'combat:resolve_magia': {
      fn(payload) { return _ejecutarMagiaJugadorBatalla(payload); }
    },

    // Tick: maldición activa, invisibilidad de enemigo
    'combat:post_resolve': {
      fn(payload) {
        const{battle}=payload;
        if(!battle) return payload;
        // Tick maldición sobre todos los combatientes
        battle.cola.filter(c=>c.vivo&&(c._maldicion_turnos||0)>0).forEach(c=>_tickMaldicion(c,battle));
        // Tick invisibilidad enemiga
        battle.cola.filter(c=>c.vivo&&(c.tipo==='enemy'||c.tipo==='npc')&&c._invisible).forEach(c=>_tickInvisibilidadEnemigo(c));
        return payload;
      }
    },

    // Evasión por invisibilidad del enemigo en pipeline de daño
    'combat:resolve_damage': {
      priority: 45,
      fn(payload) {
        const target=payload.target;
        if(!target) return payload;
        if(target._invisible&&U.chance(0.6)) {
          payload.finalDmg=0;
          battleLog(payload.battle,`  🌫 ${target.name} es invisible — ataque falla.`,'t-dim');
        }
        return payload;
      }
    },

    'player:tick': {
      fn(payload) {
        const p=payload.player;
        p.flags=(p.flags||[]).map(f=>{
          if(f.tipo==='invisible') return{...f,ciclos:(f.ciclos||0)-1};
          return f;
        }).filter(f=>f.ciclos===undefined||f.ciclos>0);
        return payload;
      }
    },

    // ── Declarar slots MAG y MNA en la status bar ─────────────────
    'output:collect_status': {
      fn(payload) {
        const p    = payload.player;
        const mags = p.ext?.magias || [];
        const max  = Player.getSlot('magias');
        const mana = p.mana ?? p.maxMana ?? 60;
        payload.slots['mag'] = { text: `${mags.length}/${max}`, color: 't-mag' };
        payload.slots['mna'] = { text: `${mana}`,
          color: mana < 15 ? 't-pel' : mana < 30 ? 't-mem' : 't-mag' };
        return payload;
      }
    },
  },

  comandos: {
    'magias':    { fn:()=>cmdMagias(),         meta:{ titulo:'magias', color:'t-mag', desc:'Muestra magias conjuradas y canalizadas.', uso:['magias','mag (atajo)'], notas:['Fragilidad +10% por uso. A 100% se corrompe.','Los enemigos de alto nivel también usan magias.'] } },
    'mag':       { fn:()=>cmdMagias(),         meta:{ titulo:'mag (alias)',   color:'t-mag', desc:'Lista magias.' } },
    'lanzar':    { fn:(args)=>cmdLanzar(args), meta:{ titulo:'lanzar [magia]',color:'t-mag', desc:'Activa una magia fuera de combate.' } },
    'recargar':  { fn:(args)=>cmdRecargar(args),meta:{ titulo:'recargar [magia] [material]',color:'t-mag', desc:'Restaura cargas. Requiere material resonante o corrupto.' } },
    'canalizar': {
      fn:(args)=>cmdCanalizar(args),
      meta:{
        titulo:'canalizar [enemigo]', color:'t-mag',
        desc:'Aprende la última magia lanzada por un enemigo. Poder al 70%, fragilidad inicial elevada.',
        uso:['canalizar','canalizar antiguo','canalizar grieta'],
        notas:[
          'Úsalo justo después de que el enemigo lance su magia.',
          'Poder reducido al 70% (canalizar es imperfecto).',
          'Fragilidad inicial más alta que en magias forjadas.',
          'Algunas magias de enemigo no pueden canalizarse (Invocación, etc.).',
          'Requiere slot libre. "magias" para ver cuántos tienes.',
        ],
      },
    },
  },
};
