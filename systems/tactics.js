// ════════════════════════════════════════════════════════════════
// TACTICS Logic — motor desacoplado de datos
// ════════════════════════════════════════════════════════════════
(function initTacticsLogic(global) {
  function create({ data, deps }) {
    const { U, Player, World, Out, EventBus, Combat, ModuleLoader } = deps;

  const ELEMENTOS = data?.elementos || {};
  const REACCIONES = data?.reacciones || {};
  const CLIMAS_NODO = data?.climas_nodo || {};
  const REACCIONES_SUPERFICIE = data?.reacciones_superficie || {};
  const EFECTOS_SUPERFICIE = data?.efectos_superficie || {};
  const HERIDAS = data?.heridas || {};


  function calcularHerida(dmg, maxHp) {
    const pct = dmg / maxHp;
    if(pct >= 0.4)  return U.chance(0.6)?'FRACTURA':U.chance(0.5)?'HEMORRAGIA':'CONMOCION';
    if(pct >= 0.25) return U.chance(0.35)?'HEMORRAGIA':U.chance(0.3)?'CONMOCION':null;
    if(pct >= 0.15) return U.chance(0.15)?'QUEMADURA':null;
    return null;
  }

  const superficies = {};
  function getSup(nodeId)  { return superficies[nodeId] || { tipo:'normal', turnosRestantes:0 }; }
  function setSup(nodeId, tipo, dur) { superficies[nodeId] = { tipo, turnosRestantes:dur, icon:EFECTOS_SUPERFICIE[tipo]?.icon||'', color:EFECTOS_SUPERFICIE[tipo]?.color||'t-dim' }; }
  function tickSup(nodeId) {
    const s = superficies[nodeId];
    if(!s || s.tipo==='normal') return;
    s.turnosRestantes--;
    if(s.turnosRestantes <= 0) delete superficies[nodeId];
  }

  function aplicarElemento(combatiente, elemento, battle) {
    const prev   = combatiente.elemento_estado;
    const reacKey= prev ? `${prev}+${elemento}` : null;
    const reac   = reacKey ? REACCIONES[reacKey] : null;
    if(reac) return { reaccion:reac, prev, nuevo:elemento };
    combatiente.elemento_estado = elemento;
    return { reaccion:null, prev, nuevo:elemento };
  }

  function aplicarReaccion(reaccion, actor, target, battle) {
    if(!reaccion) return;
    if(reaccion.area) {
      battle.cola.filter(c=>c.vivo&&c.id!==actor.id&&_sonEnemigos(actor,c)&&c.id!==target.id).forEach(c => {
        const splash = Math.floor(Math.random()*6) + 3;
        c.hp = Math.max(0, c.hp - splash);
        battleLog(battle, `  ↳ ${c.name} recibe ${splash} en área.`, 't-pel');
        if(c.hp <= 0) { c.vivo=false; battleLog(battle, `  ${c.name} cae.`, 't-cor'); }
      });
    }
    if(reaccion.efecto==='stun_1t'||reaccion.stun) { target.stun_turnos=1; battleLog(battle,`  ↳ ${target.name} ATURDIDO 1 turno.`,'t-acc'); }
    if(reaccion.efecto==='inmovil')  { target.inmovil_turnos=reaccion.dura||2; battleLog(battle,`  ↳ ${target.name} INMÓVIL ${reaccion.dura||2} turnos.`,'t-acc'); }
    if(reaccion.silence)             { target.silenciado=true; battleLog(battle,`  ↳ ${target.name} SILENCIADO.`,'t-mag'); }
    if(reaccion.def_break)           { target.def_rota=true; battleLog(battle,`  ↳ DEF de ${target.name} ELIMINADA.`,'t-cor'); }
    if(reaccion.poise_dmg)           { aplicarPoiseDmg(target, reaccion.poise_dmg, battle); }
    if(reaccion.remove)              { target.elemento_estado=null; }
    target.elemento_estado = null;
  }

  function actualizarSuperficie(nodeId, elemento, battle) {
    const s   = getSup(nodeId);
    const key = `${s.tipo}+${elemento}`;
    const reacSup = REACCIONES_SUPERFICIE[key];
    if(reacSup) {
      setSup(nodeId, reacSup.resultado, reacSup.dur);
      battleLog(battle, `  ↳ Superficie → ${reacSup.resultado.toUpperCase()} (${reacSup.dur}t). ${EFECTOS_SUPERFICIE[reacSup.resultado]?.desc||''}`, EFECTOS_SUPERFICIE[reacSup.resultado]?.color||'t-dim');
    } else {
      const directKey = `normal+${elemento}`;
      const directReac = REACCIONES_SUPERFICIE[directKey];
      if(directReac && s.tipo==='normal') setSup(nodeId, directReac.resultado, directReac.dur);
    }
    _aplicarEfectoSup(nodeId, battle);
  }

  function _aplicarEfectoSup(nodeId, battle) {
    const s = getSup(nodeId);
    if(s.tipo==='normal') return;
    if(s.tipo==='mojada'||s.tipo==='agua') battle.cola.filter(c=>c.vivo&&!c.elemento_estado).forEach(c=>{c.elemento_estado='MOJADO';});
    if(s.tipo==='electrificada'||s.tipo==='ardiente') {
      const dmg = s.tipo==='electrificada'?2:1;
      battle.cola.filter(c=>c.vivo).forEach(c=>{c.hp=Math.max(0,c.hp-dmg);if(c.hp<=0)c.vivo=false;});
      battleLog(battle, `  ↳ Superficie ${EFECTOS_SUPERFICIE[s.tipo].icon} daña a todos (${dmg}HP).`, EFECTOS_SUPERFICIE[s.tipo].color);
    }
    if(s.tipo==='congelada') { const p=Player.get(); p.stamina=Math.max(0,(p.stamina||0)-10); battleLog(battle,'  ❄ Superficie congelada — stamina −10.','t-acc'); }
    if(s.tipo==='ceniza') battle.cola.filter(c=>c.vivo&&c.tipo!=='player').forEach(c=>{if(Math.random()<0.3)c.skipping=true;});
  }

  function calcPoise(e) { return e.poise_max || ({player:80,npc:60,enemy:50,creature:40}[e.tipo]||50); }

  function aplicarPoiseDmg(combatiente, dmg, battle) {
    if(combatiente.tipo==='player') return false;
    combatiente.poise = combatiente.poise != null ? combatiente.poise : calcPoise(combatiente);
    combatiente.poise = Math.max(0, combatiente.poise - dmg);
    if(combatiente.poise <= 0 && !combatiente.poise_roto) {
      combatiente.poise_roto  = true;
      combatiente.poise_turnos= 2;
      battleLog(battle, `⚡ POSTURA ROTA — ${combatiente.name} VULNERABLE (crítico ×1.5)!`, 't-cor');
      return true;
    }
    return false;
  }

  function getAuraComp(nodeId) {
    const comps = Player.get().compañeros?.filter(c=>!c.nodeId||c.nodeId===nodeId) || [];
    if(!comps.length) return null;
    const tags = comps[0].tags || comps[0].arquetipo_tags || [];
    if(tags.includes('fuego'))                              return 'ARDIENDO';
    if(tags.includes('agua'))                               return 'MOJADO';
    if(tags.includes('rayo'))                               return 'ELECTRIZADO';
    if(tags.includes('hielo'))                              return 'CONGELADO';
    if(tags.includes('eco')||tags.includes('resonante'))    return 'RESONANTE';
    if(tags.includes('corrupto')||tags.includes('vacío'))   return 'VACÍO';
    return null;
  }

  function aplicarAura(battle, nodeId) {
    const aura = getAuraComp(nodeId);
    if(!aura) return;
    const enemigos = battle.cola.filter(c=>c.vivo&&(c.tipo==='enemy'||c.tipo==='npc'));
    if(!enemigos.length) return;
    const target = enemigos[Math.floor(Math.random()*enemigos.length)];
    if(!target.elemento_estado) {
      target.elemento_estado = aura;
      battleLog(battle, `  ✦ Aura del compañero aplica ${aura} a ${target.name}.`, ELEMENTOS[aura]?.color||'t-eco');
    }
  }

  function getElementoArma(arma) {
    if(!arma) return null;
    if(arma._elemento_temporal && (arma._elemento_dur||0) > 0) return arma._elemento_temporal;
    const tags = arma.tags || [];
    if(tags.includes('fuego')||tags.includes('ardiente'))  return 'ARDIENDO';
    if(tags.includes('agua')||tags.includes('mojado'))     return 'MOJADO';
    if(tags.includes('rayo')||tags.includes('eléctrico'))  return 'ELECTRIZADO';
    if(tags.includes('hielo')||tags.includes('frío'))      return 'CONGELADO';
    if(tags.includes('resonante')||tags.includes('sonido'))return 'RESONANTE';
    if(tags.includes('vacío')||tags.includes('corrupto'))  return 'VACÍO';
    if(tags.includes('veneno'))                            return 'ENVENENADO';
    return null;
  }

  function getElementoMagia(mag) {
    if(!mag) return null;
    const tags = mag.tags || [];
    if(tags.includes('fuego'))      return 'ARDIENDO';
    if(tags.includes('agua'))       return 'MOJADO';
    if(tags.includes('rayo'))       return 'ELECTRIZADO';
    if(tags.includes('hielo'))      return 'CONGELADO';
    if(tags.includes('resonante'))  return 'RESONANTE';
    if(tags.includes('vacío'))      return 'VACÍO';
    if(tags.includes('veneno'))     return 'ENVENENADO';
    const n = (mag.nombre||'').toLowerCase();
    if(n.includes('fuego')||n.includes('llama'))    return 'ARDIENDO';
    if(n.includes('agua')||n.includes('lluvia'))    return 'MOJADO';
    if(n.includes('rayo')||n.includes('tormenta'))  return 'ELECTRIZADO';
    if(n.includes('hielo')||n.includes('escarcha')) return 'CONGELADO';
    if(n.includes('eco')||n.includes('resonan'))    return 'RESONANTE';
    if(n.includes('vacío')||n.includes('corru'))    return 'VACÍO';
    return null;
  }

  function desgastarArma(arma) {
    if(!arma) return;
    arma.durabilidad = Math.max(0, (arma.durabilidad!=null?arma.durabilidad:100) - U.rand(1,4));
    if(arma.durabilidad === 0) arma.mellada = true;
    if(arma._elemento_temporal && arma._elemento_dur > 0) {
      arma._elemento_dur--;
      if(arma._elemento_dur <= 0) { arma._elemento_temporal=null; arma._elemento_dur=0; }
    }
  }

  function consumirStamina(coste) { const p=Player.get(); p.stamina=Math.max(0,(p.stamina!=null?p.stamina:p.maxStamina||100)-coste); }
  function consumirMana(coste)    { const p=Player.get(); p.mana   =Math.max(0,(p.mana   !=null?p.mana   :p.maxMana||60)-coste); return p.mana>=0; }
  function staminaPct()           { const p=Player.get(); return (p.stamina!=null?p.stamina:p.maxStamina||100)/(p.maxStamina||100); }
  function getClimaDesc(nodeId)   { const n=World.node(nodeId); return CLIMAS_NODO[n?.tipo||'hub']||CLIMAS_NODO.hub||{ nombre:'Neutro', desc:'Sin efectos especiales', mult_reac:1.0, elemento_base:null, color:'t-dim' }; }

  function calcularDaño(actor, target, arma, elemento, battle) {
    const p       = Player.get();
    const nodeId  = battle.nodeId;
    let base      = actor.atk + (arma?.atk||0) + (arma?.tension_bonus||0) + (arma?.imprint?.tension?Math.floor(arma.imprint.tension*5):0);
    const stamina = p.stamina!=null?p.stamina:(p.maxStamina||100);
    const staMult = stamina<(p.maxStamina||100)*0.2?0.5:stamina<(p.maxStamina||100)*0.5?0.75:1.0;
    const climaMult = elemento ? (CLIMAS_NODO[World.node(nodeId)?.tipo||'hub']?.mult_reac||1.0) : 1.0;
    const supMult   = elemento ? (() => { const s=getSup(nodeId); const k=`${s.tipo}+${elemento}`; return REACCIONES_SUPERFICIE[k]?1.3:1.0; })() : 1.0;
    let reacMult=1.0, reaccion=null;
    if(elemento&&target.elemento_estado){const k=`${target.elemento_estado}+${elemento}`; reaccion=REACCIONES[k]; if(reaccion) reacMult=reaccion.mult*climaMult;}
    const reacBoostMult = (reaccion&&actor.playerId===p.id&&p._reaccion_boost) ? (() => {const v=p._reaccion_boost;p._reaccion_boost=null;return v;})() : 1.0;
    const poiseMult  = target.poise_roto ? 1.5 : 1.0;
    const heridasMult= (p.heridas||[]).includes('FRACTURA') ? 0.7 : 1.0;
    let defTarget = target.poise_roto ? 0 : (reaccion?.def_break||reaccion?.ignore_def) ? 0 : (target.def||0)+(target.defendiendo?Math.ceil((target.def||1)/2):0);
    if(target.elemento_estado==='VACÍO') defTarget=Math.floor(defTarget*0.6);
    if((target.heridas||[]).includes('QUEMADURA')) defTarget=Math.floor(defTarget*0.8);
    const durMult = arma ? Math.max(0.3,(arma.durabilidad||100)/100) : 1.0;
    const raw = base * staMult * supMult * reacMult * reacBoostMult * poiseMult * heridasMult * durMult;
    const dmg = Math.max(1, Math.floor(raw - defTarget));
    return { dmg, reaccion, staMult, climaMult, supMult, reacMult, poiseMult };
  }

  function tickTurno(combatiente, battle) {
    if((combatiente.heridas||[]).includes('HEMORRAGIA')) { combatiente.hp=Math.max(0,combatiente.hp-3); battleLog(battle,`  🩸 ${combatiente.name} sangra (−3HP).`,'t-pel'); if(combatiente.hp<=0)combatiente.vivo=false; }
    if(combatiente.elemento_estado==='ENVENENADO')       { const dmg=combatiente.veneno_stacks||2; combatiente.hp=Math.max(0,combatiente.hp-dmg); combatiente.veneno_stacks=(combatiente.veneno_stacks||2)+1; battleLog(battle,`  ☠ ${combatiente.name} envenenado (−${dmg}HP).`,'t-mem'); if(combatiente.hp<=0)combatiente.vivo=false; }
    if(combatiente.elemento_estado==='ARDIENDO')         { combatiente.hp=Math.max(0,combatiente.hp-2); battleLog(battle,`  🔥 ${combatiente.name} arde (−2HP).`,'t-pel'); if(combatiente.hp<=0)combatiente.vivo=false; }
    if(combatiente.elemento_estado==='ELECTRIZADO')      { combatiente.hp=Math.max(0,combatiente.hp-2); battleLog(battle,`  ⚡ ${combatiente.name} electrizado (−2HP).`,'t-mag'); if(combatiente.hp<=0)combatiente.vivo=false; }
    if(combatiente.elemento_estado==='CONGELADO') { combatiente._congelado_tick=(combatiente._congelado_tick||0)+1; if(combatiente._congelado_tick%2===0){combatiente.skipping=true;battleLog(battle,`  ❄ ${combatiente.name} congelado, no puede actuar.`,'t-acc');} } else { combatiente._congelado_tick=0; }
    if(combatiente.elemento_estado==='RESONANTE')        { combatiente._resonante_listo=true; }
    if(combatiente.poise_roto) { combatiente.poise_turnos=(combatiente.poise_turnos||0)-1; if(combatiente.poise_turnos<=0){combatiente.poise_roto=false;combatiente.poise=calcPoise(combatiente)*0.5;battleLog(battle,`  ${combatiente.name} recupera postura.`,'t-dim');} }
    if(combatiente.stun_turnos>0)    { combatiente.stun_turnos--; if(combatiente.stun_turnos>0)combatiente.skipping=true; } else if(!combatiente.inmovil_turnos) combatiente.skipping=false;
    if(combatiente.inmovil_turnos>0) { combatiente.inmovil_turnos--; combatiente.skipping=true; }
    if(combatiente.silenciado)       { combatiente._silencio_turnos=(combatiente._silencio_turnos||2)-1; if(combatiente._silencio_turnos<=0)combatiente.silenciado=false; }
    if(combatiente.def_rota) combatiente.def_rota=false;
  }

  function initBattle(battle) {
    const n     = World.node(battle.nodeId);
    const clima = CLIMAS_NODO[n?.tipo||'hub'] || CLIMAS_NODO.hub || { nombre:'Neutro', mult_reac:1.0, elemento_base:null, color:'t-dim' };
    if(clima.elemento_base) {
      battle.cola.filter(c=>c.vivo).forEach(c=>{c.elemento_estado=clima.elemento_base;});
      battleLog(battle, `Clima "${clima.nombre}": todos empiezan ${clima.elemento_base}.`, clima.color||'t-dim');
    }
    battle.cola.filter(c=>c.tipo!=='player').forEach(c=>{c.poise=calcPoise(c);c.poise_roto=false;});
  }

  async function cmdDescansar() {
    const p  = Player.get();
    const n  = World.node(Player.pos());
    const ok = n?.tipo==='hub' || n?.estado==='pacificado';
    Out.sp(); Out.sep('─'); Out.line('DESCANSO', 't-acc', true);
    const hambreCosto = ok ? 15 : 25;
    p.hunger = Math.max(0, p.hunger - hambreCosto);
    Clock.tick(3);
    Out.line(`Hambre −${hambreCosto}  ·  Ciclo avanza.`, 't-dim');
    if(p.hunger <= 0) { Out.line('Demasiada hambre para descansar bien.','t-pel'); p.stamina=Math.min(p.maxStamina||100,(p.stamina||0)+30); Out.sep('─');Out.sp();refreshStatus();save();return; }
    p.stamina = p.maxStamina || 100;
    p.mana    = p.maxMana    || 60;
    const heridas   = [...(p.heridas||[])];
    const medicina  = p.inventory.find(i=>i.blueprint?.includes('medicina')||i.tags?.includes('medicina'));
    if(ok || medicina) {
      if(medicina) { Player.rmItem(medicina.id); Out.line(`Usas ${medicina.nombre} para curar heridas.`,'t-cra'); }
      p.heridas = heridas.filter(h=>HERIDAS[h]?.turnosDuracion>0);
      if(heridas.length>p.heridas.length) Out.line(`Heridas curadas: ${heridas.filter(h=>!p.heridas.includes(h)).join(', ')}`,'t-mem');
    } else if(heridas.length) {
      Out.line(`Heridas persisten: ${heridas.map(h=>HERIDAS[h]?.icon+h).join(', ')}`,'t-pel');
      Out.line('Necesitas nodo HUB o medicina para curar heridas graves.','t-dim');
    }
    const hpRec = ok ? Math.floor(p.maxHp*0.4) : Math.floor(p.maxHp*0.2);
    p.hp = Math.min(p.maxHp, p.hp + hpRec);
    Out.line(`+${hpRec}HP  Stamina restaurada  Maná restaurado`,'t-cra');
    if(!ok) {
      const riesgo = ['abismo','yermo','umbral','ruina'].includes(n?.tipo) ? 0.4 : 0.25;
      if(U.chance(riesgo)) { Out.line('¡EMBOSCADA! Enemies atacan mientras descansabas.','t-pel',true); Out.sep('─');Out.sp();refreshStatus();save();return; }
    }
    Out.line(ok?'Descansas en un lugar seguro.':'Descansas en terreno peligroso. Con un ojo abierto.','t-dim');
    Out.sep('─'); Out.sp(); refreshStatus(); save();
  }

  function cmdTactica() {
    const nodeId = Player.pos();
    const n      = World.node(nodeId);
    const clima  = getClimaDesc(nodeId);
    const sup    = getSup(nodeId);
    const aura   = getAuraComp(nodeId);
    Out.sp(); Out.line('— SITUACIÓN TÁCTICA —','t-acc');
    Out.line(`Nodo: ${n?.name||'—'}  [${n?.tipo||'—'}]`,'t-dim');
    Out.line(`Clima: ${clima.nombre}  — ${clima.desc}`,'t-sis');
    Out.line(`Reacciones: ×${clima.mult_reac}${clima.elemento_base?'  | Elem. base: '+clima.elemento_base:''}`,'t-dim');
    if(sup.tipo!=='normal') Out.line(`Superficie: ${EFECTOS_SUPERFICIE[sup.tipo]?.icon} ${sup.tipo.toUpperCase()}  (${sup.turnosRestantes}t)  — ${EFECTOS_SUPERFICIE[sup.tipo]?.desc}`,EFECTOS_SUPERFICIE[sup.tipo]?.color||'t-dim');
    else Out.line('Superficie: normal','t-dim');
    if(aura) Out.line(`Aura compañero: ${aura}  ${ELEMENTOS[aura]?.desc||''}`,ELEMENTOS[aura]?.color||'t-eco');
    const p   = Player.get();
    const st  = Math.round(staminaPct()*100);
    const mn  = Math.round(((p.mana!=null?p.mana:60)/(p.maxMana||60))*100);
    Out.line(`Stamina: ${st}%  Maná: ${mn}%`,'t-dim');
    if((p.heridas||[]).length) { Out.line('Heridas activas:','t-pel'); p.heridas.forEach(h=>Out.line(`  ${HERIDAS[h]?.icon} ${h}: ${HERIDAS[h]?.desc}`,'t-pel')); }
    const arma = p.equipped?.arma;
    if(arma) { const el=getElementoArma(arma); const dur=arma.durabilidad!=null?arma.durabilidad:100; Out.line(`Arma: ${arma.nombre||arma.blueprint}  Dur:${dur}%${arma.mellada?' [MELLADA]':''}${el?'  ['+el+']':''}`,dur<30?'t-pel':'t-cra'); }
    Out.sp();
  }

  function renderTactico(battle) {
    const nodeId = battle.nodeId;
    const clima  = getClimaDesc(nodeId);
    const sup    = getSup(nodeId);
    Out.sp();
    Out.line(`  CLIMA: ${clima.nombre} ${sup.tipo!=='normal'?'| SUP: '+sup.tipo.toUpperCase()+'('+sup.turnosRestantes+'t)':''}  — ${clima.desc}`,'t-dim');
    const aura = getAuraComp(nodeId);
    if(aura) Out.line(`  ✦ AURA COMPAÑERO: ${aura}  ${ELEMENTOS[aura]?.desc||''}`,ELEMENTOS[aura]?.color||'t-eco');
    battle.cola.filter(c=>c.vivo).forEach(c=>{
      const el    = c.elemento_estado?` [${c.elemento_estado}${ELEMENTOS[c.elemento_estado]?.icon||''}]`:'';
      const poise = c.poise!=null?` POISE:${c.poise}/${calcPoise(c)}`:'';
      const roto  = c.poise_roto?' ⚡VULNERABLE':'';
      const stun  = c.stun_turnos>0?' 💫ATURDIDO':'';
      if(el||poise||roto||stun) Out.line(`  ${c.name}:${el}${poise}${roto}${stun}`,'t-dim');
    });
    const p    = Player.get();
    const stpct= Math.round(staminaPct()*100);
    const mnapct=Math.round(((p.mana!=null?p.mana:60)/(p.maxMana||60))*100);
    Out.line(`  STAMINA: ${stpct}%${stpct<20?' ⚠AGOTADO':''}  MANÁ: ${mnapct}%  HP: ${p.hp}/${p.maxHp}`,'t-dim');
    if((p.heridas||[]).length) Out.line(`  HERIDAS: ${p.heridas.map(h=>HERIDAS[h]?.icon+h).join(', ')}`,'t-pel');
    Out.sp();
  }

  return {
    calcularDaño, aplicarElemento, aplicarReaccion, actualizarSuperficie,
    aplicarAura, tickTurno, initBattle, renderTactico,
    calcPoise, aplicarPoiseDmg, desgastarArma,
    consumirStamina, consumirMana, staminaPct,
    getElementoArma, getElementoMagia, getAuraComp,
    getClimaDesc, getSup, setSup, tickSup,
    cmdDescansar, cmdTactica,
    ELEMENTOS, REACCIONES, CLIMAS_NODO, EFECTOS_SUPERFICIE, HERIDAS,
    calcularHerida,
  };
  }

  global.TacticsLogic = { create };
})(globalThis);

// ════════════════════════════════════════════════════════════════
// TACTICS ENGINE — bootstrap (data + lógica)
// ════════════════════════════════════════════════════════════════
const Tactics = (() => {
  const TACTICS_DATA_FALLBACK = {
    elementos: {},
    reacciones: {},
    climas_nodo: {},
    reacciones_superficie: {},
    efectos_superficie: {},
    heridas: {},
  };

  function loadTacticsData() {
    // Fuente consolidada en data/module.json
    try { return ModuleLoader?.getSystemData?.('tactics', TACTICS_DATA_FALLBACK) || TACTICS_DATA_FALLBACK; }
    catch {}
    return TACTICS_DATA_FALLBACK;
  }

  const create = globalThis.TacticsLogic?.create;
  if (typeof create !== 'function') {
    console.warn('[Tactics] TacticsLogic no disponible; tácticas deshabilitadas.');
    return {
      initBattle: ()=>{},
      applyTurnEffects: ()=>{},
      onActionResolved: ()=>{},
      cmdTactica: ()=>{},
      getClima: ()=>null,
    };
  }

  return create({
    data: loadTacticsData(),
    deps: {
      U,
      Player,
      World,
      Out,
      EventBus,
      Combat: typeof globalThis.Combat !== 'undefined' ? globalThis.Combat : undefined,
      ModuleLoader,
    },
  });
})();

globalThis.Tactics = Tactics;
