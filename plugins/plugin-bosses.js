// ════════════════════════════════════════════════════════════════
// PLUGIN: Bosses v2.0
// Monstruos mundiales que se mueven, amenazan y dejan loot mítico.
// ════════════════════════════════════════════════════════════════
const BossSystem = (() => {

  const BOSSES_DEF = [
    { id:'leviatán_grieta',    nombre:'Leviatán de la Grieta',     titulo:'El Primer Colapso',           desc:'Una fractura del mundo que aprendió a moverse.',            hp:800, atk:45, def:20, tags:['vacío','corrupto','antiguo'],    elemento:'VACÍO',     poise_max:400, color:'t-cor', icon:'◈', xp_base:2000, frase_cerca:'El vacío se expande. Algo sin nombre está muy cerca.',        frase_lejos:'Una tensión extraña desde esa dirección. El mundo se estira.',        loot_especial:['reliquia_fragmento_origen','cristal_vacío_puro','armadura_grieta','arma_colapso','magia_aniquilación','habilidad_ruptura','eco_condensado_mayor','sello_primer_ciclo'], ataques_especiales:['colapso_area','rotura_poise_total','vacío_absoluto'] },
    { id:'antiguo_resonante',  nombre:'El Antiguo Resonante',      titulo:'El Que Recuerda Todos Los Ciclos', desc:'Acumuló los ecos de cada run anterior. Conoce tus patrones.', hp:700, atk:38, def:25, tags:['resonante','antiguo','eco'],     elemento:'RESONANTE', poise_max:350, color:'t-mag', icon:'◎', xp_base:1800, frase_cerca:'El aire vibra con memorias que no son tuyas. Está cerca.',    frase_lejos:'Algo resuena desde esa dirección. Una frecuencia que no deberías reconocer.', loot_especial:['corona_ecos','manto_resonancia','báculo_ciclos','cristal_memoria_total','reliquia_primera_voz','habilidad_eco_perfecto','magia_resonancia_absoluta','fragmento_origen_puro'], ataques_especiales:['eco_masivo','memoria_paralizante','resonancia_area'] },
    { id:'devorador_ciclos',   nombre:'El Devorador de Ciclos',    titulo:'La Hambre sin Nombre',        desc:'Se alimenta del tiempo. Cada ciclo lo hace más fuerte.',    hp:600, atk:35, def:15, tags:['corrupto','hambre','ciclo'],     elemento:'ARDIENDO',  poise_max:300, color:'t-pel', icon:'✦', xp_base:1600, frase_cerca:'El calor aumenta. El aire sabe a ceniza de algo que no existe.',frase_lejos:'Un calor antinatural desde esa dirección. Como si quemara el tiempo.',  loot_especial:['ceniza_del_tiempo','brasas_eternas','armadura_ceniza','reliquia_ciclo_roto','magia_devorar','habilidad_consumir','cristal_hambre','sello_devorador'],                ataques_especiales:['devorar_stamina','ardor_total','consumir_ciclo'] },
  ];

  let bosses = [];

  // ── BFS distancia ─────────────────────────────────────────────
  function distancia(fromId, toId) {
    if(fromId === toId) return 0;
    const visited = new Set([fromId]);
    const queue   = [{ id:fromId, dist:0 }];
    while(queue.length) {
      const { id, dist } = queue.shift();
      if(dist > 6) return 999;
      for(const nextId of Object.values(World.exits(id))) {
        if(nextId === toId) return dist + 1;
        if(!visited.has(nextId)) { visited.add(nextId); queue.push({ id:nextId, dist:dist+1 }); }
      }
    }
    return 999;
  }

  function dirHaciaBoss(fromId, bossNodeId) {
    if(fromId === bossNodeId) return null;
    const visited = new Set([fromId]);
    const queue   = [{ id:fromId, path:[] }];
    while(queue.length) {
      const { id, path } = queue.shift();
      for(const [dir, nextId] of Object.entries(World.exits(id))) {
        if(nextId === bossNodeId) return path[0] || dir;
        if(!visited.has(nextId) && path.length <= 3) { visited.add(nextId); queue.push({ id:nextId, path:path.length?path:[dir] }); }
      }
    }
    return null;
  }

  function genLootBoss(def) {
    const rng = U.rng(Date.now() + def.id);
    return def.loot_especial.map(blueprint => {
      const imp  = Imprint.gen(blueprint, def.tags, { nodeId:'boss', cycle:Clock.cycle, pid:'boss' }, 0.9 + Math.random()*0.1);
      imp.mutations = imp.mutations.concat(def.tags.slice(0,2));
      const tipo = ['arma','armadura','magia','habilidad'].find(t => blueprint.includes(t)) || 'mítico';
      const item = { id:U.uid(), blueprint, nombre:blueprint.replace(/_/g,' '), tipo, tags:[...def.tags,'mítico','boss'], imprint:imp, estado:'boss_drop', desc:`Arrebatado a ${def.nombre}.`, atk:tipo==='arma'?20+U.rand(5,15):0, def:tipo==='armadura'?15+U.rand(3,10):0, poder:30+U.rand(10,20), durabilidad:100, es_mitico:true, boss_id:def.id };
      if(tipo==='magia')     { item.cargas=5; item.cargas_max=5; item.fragilidad=0; item.efecto='dmg_dist'; item.poder=25+U.rand(10,15); }
      if(tipo==='habilidad') { item.efecto='atk_mult'; item.valor=3; item.desc=`Habilidad de ${def.nombre}. ×3 daño.`; }
      return item;
    });
  }

  function spawn() {
    const nodeIds   = Object.keys(World.all());
    const candidatos = nodeIds.filter(id => id !== Player.pos() && !bosses.some(b=>!b.eliminado&&b.nodeId===id) && distancia(Player.pos(),id) >= 4);
    if(!candidatos.length) return;
    const nodeId  = candidatos[Math.floor(Math.random()*candidatos.length)];
    const defBase = BOSSES_DEF[Math.floor(Math.random()*BOSSES_DEF.length)];
    const dif     = EventBus.emit('world:calc_difficulty', { player:Player.get(), difficulty:1.0 })?.difficulty || 1.0;
    const def     = { ...defBase, hp:Math.round(defBase.hp*dif), atk:Math.round(defBase.atk*Math.sqrt(dif)), def:Math.round(defBase.def*Math.sqrt(dif)*0.8), xp_base:Math.round(defBase.xp_base*dif) };
    const bossState = { def, nodeId, hp_actual:def.hp, ciclo_entrada:Clock.cycle, ciclo_salida:Clock.cycle+U.rand(15,40), eliminado:false, en_combate:false, id:U.uid() };
    bosses.push(bossState);
    Out.sp(); Out.sep('═');
    Out.line(`${def.icon} PRESENCIA DETECTADA`, def.color, true);
    Out.line('Algo de poder incalculable ha entrado al mundo.', 't-dim');
    Out.line('Se necesita un equipo para hacerle frente.', 't-pel');
    Out.sep('═'); Out.sp();
    EventBus.emit('boss:spawn', { boss:bossState, nodeId });
  }

  function moverBosses() {
    bosses.filter(b=>!b.eliminado).forEach(boss => {
      if(Clock.cycle >= boss.ciclo_salida) {
        const prev = boss.nodeId;
        boss.eliminado = true;
        if(distancia(Player.pos(), prev) <= 3) { Out.sp(); Out.line(`${boss.def.icon} ${boss.def.nombre} se ha retirado del mundo.`, 't-dim'); Out.sp(); }
        return;
      }
      const exits = Object.values(World.exits(boss.nodeId));
      if(!exits.length) return;
      const prev   = boss.nodeId;
      boss.nodeId  = exits[Math.floor(Math.random()*exits.length)];
      _comprobarProximidad(boss, prev);
    });
    bosses = bosses.filter(b => !b.eliminado || Clock.cycle - b.ciclo_entrada < 5);
  }

  function _comprobarProximidad(boss, prevNode) {
    const playerNode = Player.pos();
    const dist       = distancia(boss.nodeId, playerNode);
    const prevDist   = distancia(prevNode, playerNode);
    if(boss.nodeId === playerNode) { setTimeout(() => _iniciarCombateBoss(boss), 400); return; }
    if(dist === 1 && prevDist > 1) {
      const dir = dirHaciaBoss(playerNode, boss.nodeId) || 'cerca';
      Out.sp(); Out.line(`☠ EL MIEDO SE SIENTE HACIA EL ${dir.toUpperCase()}`, boss.def.color, true); Out.line(boss.def.frase_cerca, 't-pel'); Out.sp();
    } else if(dist === 2 && prevDist > 2) {
      const dir = dirHaciaBoss(playerNode, boss.nodeId) || 'lejos';
      Out.sp(); Out.line(`${boss.def.icon} Algo poderoso se siente hacia el ${dir.toUpperCase()}.`, boss.def.color); Out.line(boss.def.frase_lejos, 't-dim'); Out.sp();
    }
  }

  function _iniciarCombateBoss(boss) {
    if(boss.eliminado || boss.en_combate) return;
    const p   = Player.get();
    const def = boss.def;
    Out.sp(); Out.sep('═');
    Out.line(`${def.icon} ${def.nombre.toUpperCase()}`, def.color, true);
    Out.line(`"${def.titulo}"`, def.color);
    Out.line(def.desc, 't-out');
    Out.line(`HP:${boss.hp_actual}/${def.hp}  ATK:${def.atk}  DEF:${def.def}`, 't-pel');
    Out.line('⚠ Se recomienda un equipo para sobrevivir.', 't-pel', true);
    Out.sep('═'); Out.sp();
    const combatants = [
      { tipo:'player', id:p.id, name:p.name, hp:p.hp, maxHp:p.maxHp, atk:Player.getAtk(), def:Player.getDef(), vivo:true, nodeId:Player.pos(), playerId:p.id },
      { tipo:'enemy', id:boss.id, name:def.nombre, hp:boss.hp_actual, maxHp:def.hp, atk:def.atk, def:def.def, vivo:true, nodeId:Player.pos(), tags:def.tags, poise_max:def.poise_max, poise:def.poise_max, es_boss:true, boss_ref:boss, color:def.color, ataques_especiales:[...def.ataques_especiales] },
    ];
    boss.en_combate = true;
    if(typeof Net !== 'undefined') Net.startBattle(Player.pos(), combatants);
    EventBus.once('combat:enemy_defeat', ({ enemy }) => { if(enemy.es_boss && enemy.id === boss.id) _onBossDefeated(boss); }, 'boss_defeat_'+boss.id);
  }

  function _onBossDefeated(boss) {
    boss.eliminado  = false; // se elimina al final
    boss.en_combate = false;
    const def = boss.def;
    Out.sp(); Out.sep('═');
    Out.line(`${def.icon} ${def.nombre} HA CAÍDO`, def.color, true);
    Out.line(`"${def.titulo}" ya no acecha el mundo.`, 't-dim');
    Out.sep('─');

    if(typeof XP !== 'undefined') {
      XP.ganar('combate',    Math.floor(def.xp_base*0.5),  `boss: ${def.nombre}`);
      XP.ganar('exploración',Math.floor(def.xp_base*0.25), `boss: ${def.nombre}`);
      XP.ganar('narrativa',  Math.floor(def.xp_base*0.25), `boss: ${def.nombre}`);
      Out.line(`⬆ +${def.xp_base} XP distribuida.`, 't-mem', true);
    }

    const lootItems = genLootBoss(def);
    Out.line(`Loot mítico (${lootItems.length} objetos):`, def.color);
    lootItems.forEach(item => {
      Player.addItem(item);
      const col = item.tipo==='arma'?'t-pel':item.tipo==='armadura'?'t-sis':item.tipo==='magia'?'t-mag':item.tipo==='habilidad'?'t-hab':'t-cor';
      Out.line(`  ✦ ${item.nombre}  [${item.tipo.toUpperCase()}]${item.atk?'  ATK+'+item.atk:''}${item.poder?'  POD+'+item.poder:''}`, col);
    });

    GS.addTwist?.({ id:'boss_'+boss.id, titulo:`Caída de ${def.nombre}`, texto:`${def.nombre} fue derrotado en el ciclo ${Clock.cycle}.`, boss:true });
    Object.keys(typeof FactionSystem !== 'undefined' ? FactionSystem.controlNodos||{} : {}).forEach(facId => FactionSystem.modRep(facId, +30));
    Out.line('+30 reputación con todas las facciones.', 't-eco');
    Out.sep('═'); Out.sp();
    boss.eliminado = true;
    EventBus.emit('boss:defeated', { boss, loot:lootItems, xp:def.xp_base });
    save();
  }

  function procesarAtaqueEspecial(bossActor, battle) {
    const specs = bossActor.ataques_especiales;
    if(!specs?.length) return;
    const ataque    = specs[Math.floor(Math.random()*specs.length)];
    const jugadores = battle.cola.filter(c => c.vivo && c.tipo === 'player');
    if(!jugadores.length) return;

    switch(ataque) {
      case 'colapso_area': case 'eco_masivo': case 'ardor_total': {
        const dmg = Math.floor(bossActor.atk * 0.6);
        jugadores.forEach(j => { j.hp = Math.max(0, j.hp-dmg); if(j.hp<=0) j.vivo=false; });
        battleLog(battle, `💥 ${bossActor.name}: ¡ÁREA! Todos −${dmg}HP`, 't-cor'); break;
      }
      case 'rotura_poise_total': jugadores.forEach(j => { j.poise=0; j.poise_roto=true; j.poise_turnos=3; }); battleLog(battle,`⚡ ${bossActor.name}: POSTURA DESTROZADA 3 turnos.`,'t-cor'); break;
      case 'vacío_absoluto': { const t=jugadores[0]; if(t){t.elemento_estado='VACÍO';const dmg=Math.floor(bossActor.atk*0.8);t.hp=Math.max(0,t.hp-dmg);battleLog(battle,`◇ ${bossActor.name}: VACÍO sobre ${t.name} −${dmg}HP`,'t-twi');} break; }
      case 'memoria_paralizante': { const t=jugadores[Math.floor(Math.random()*jugadores.length)]; if(t){t.stun_turnos=2;t.skipping=true;} battleLog(battle,`◎ ${bossActor.name}: MEMORIA — ${t?.name} aturdido 2 turnos.`,'t-mag'); break; }
      case 'resonancia_area': { const dmg=Math.floor(bossActor.atk*0.5); jugadores.forEach(j=>{j.hp=Math.max(0,j.hp-dmg);j.elemento_estado='RESONANTE';}); battleLog(battle,`◎ ${bossActor.name}: RESONANCIA − todos −${dmg}HP [RESONANTE]`,'t-mag'); break; }
      case 'devorar_stamina': { jugadores.forEach(j=>{if(j.playerId===Player.get().id){const p=Player.get();p.stamina=Math.max(0,(p.stamina||0)-40);}}); battleLog(battle,`✦ ${bossActor.name}: DEVORAR STAMINA −40`,'t-pel'); break; }
      case 'consumir_ciclo': { Clock.tick(2); const dmg=Math.floor(bossActor.atk*0.4); jugadores.forEach(j=>{j.hp=Math.max(0,j.hp-dmg);}); battleLog(battle,`✦ ${bossActor.name}: CICLO CONSUMIDO, todos −${dmg}HP`,'t-cor'); break; }
    }
  }

  function cmdBosses() {
    Out.sp(); Out.line('— BOSSES ACTIVOS —', 't-cor');
    const activos = bosses.filter(b => !b.eliminado);
    if(!activos.length) { Out.line('No hay bosses en el mundo actualmente.', 't-dim'); Out.sp(); return; }
    activos.forEach(b => {
      const dist    = distancia(Player.pos(), b.nodeId);
      const nodo    = World.node(b.nodeId);
      const distStr = dist===0?'¡EN TU NODO!':dist===1?'A 1 nodo':dist===2?'A 2 nodos':`A ${dist} nodos`;
      Out.line(`  ${b.def.icon} ${b.def.nombre}  "${b.def.titulo}"`, b.def.color, true);
      Out.line(`    HP:${b.hp_actual}/${b.def.hp}  Nodo:${nodo?.name||b.nodeId}  ${distStr}`, dist<=2?'t-pel':'t-dim');
      Out.line(`    Ciclos restantes: ~${Math.max(0,b.ciclo_salida-Clock.cycle)}  Loot: ${b.def.loot_especial.length} míticos`, 't-dim');
    });
    Out.sp();
  }

  let lastBossTick = 0;
  EventBus.on('world:tick', () => {
    const cycle = Clock.cycle;
    if(cycle - lastBossTick < 3) return;
    lastBossTick = cycle;
    if(bosses.filter(b=>!b.eliminado).length < 2 && cycle >= 5 && Math.random() < 0.08) spawn();
    moverBosses();
    bosses.filter(b=>!b.eliminado&&!b.en_combate&&b.nodeId===Player.pos()).forEach(b=>setTimeout(()=>_iniciarCombateBoss(b),300));
  }, 'boss_tick');

  EventBus.on('world:node_enter', ({ nodeId }) => {
    const boss = bosses.find(b => !b.eliminado && !b.en_combate && b.nodeId === nodeId);
    if(boss) setTimeout(() => _iniciarCombateBoss(boss), 500);
  }, 'boss_enter');

  return { spawn, moverBosses, distancia, procesarAtaqueEspecial, cmdBosses, getBosses:()=>bosses, getBossEnNodo:nid=>bosses.find(b=>!b.eliminado&&b.nodeId===nid) };
})();

const pluginBosses = {
  id:'plugin:bosses', nombre:'Sistema de Bosses', version:'2.0.0',
  descripcion:'Monstruos mundiales que se mueven y dejan loot mítico.',
  comandos: {
    'bosses': { fn:()=>BossSystem.cmdBosses(), meta:{ titulo:'bosses', color:'t-cor', desc:'Ver bosses activos y su distancia.' } },
    'boss':   { fn:()=>BossSystem.cmdBosses(), meta:{ titulo:'boss (alias)', color:'t-cor', desc:'Ver bosses.' } },
  },
};
