// ════════════════════════════════════════════════════════════════
// PLUGIN: Bosses v2.0
// Monstruos mundiales que se mueven, amenazan y dejan loot mítico.
// ════════════════════════════════════════════════════════════════
const BossSystem = (() => {
  function _svc(name) {
    return (typeof ServiceRegistry !== 'undefined' && typeof ServiceRegistry.get === 'function')
      ? ServiceRegistry.get(name)
      : null;
  }
  function _player() {
    const fn = _svc('runtime.player.current');
    return typeof fn === 'function' ? fn() : null;
  }
  function _playerPos() {
    const fn = _svc('runtime.player.position');
    return typeof fn === 'function' ? fn() : null;
  }
  function _playerCombatStats() {
    const fn = _svc('runtime.player.combat_stats');
    return typeof fn === 'function' ? (fn() || {}) : {};
  }
  function _playerAddItem(item) {
    const fn = _svc('runtime.player.add_item');
    return typeof fn === 'function' ? !!fn(item) : false;
  }
  function _worldAll() {
    const fn = _svc('runtime.world.all');
    return typeof fn === 'function' ? (fn() || {}) : {};
  }
  function _worldNode(nodeId) {
    const fn = _svc('runtime.world.node');
    return typeof fn === 'function' ? fn(nodeId) : null;
  }
  function _worldExits(nodeId) {
    const fn = _svc('runtime.world.exits');
    return typeof fn === 'function' ? (fn(nodeId) || {}) : {};
  }
  function _clockCurrent() {
    const fn = _svc('runtime.clock.current');
    return typeof fn === 'function' ? (fn() || {}) : {};
  }
  function _clockTick(delta=1) {
    const fn = _svc('runtime.clock.tick');
    return typeof fn === 'function' ? !!fn(delta) : false;
  }
  function _gsAddTwist(twist) {
    const fn = _svc('runtime.gs.add_twist');
    return typeof fn === 'function' ? !!fn(twist) : false;
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
  function _saveGame() {
    const fn = _svc('runtime.game.save');
    if(typeof fn === 'function') fn();
  }

  const BOSS_ASCII = [
    '              /\\',
    '         /\\  //\\\\  /\\',
    '        /__\\ |||| /__\\',
    '       /____\\||||/____\\',
    '          /\\  ||  /\\',
    '         /  \\ || /  \\',
    '            \\_||_/',
    '             /__\\',
  ];

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
      for(const nextId of Object.values(_worldExits(id))) {
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
      for(const [dir, nextId] of Object.entries(_worldExits(id))) {
        if(nextId === bossNodeId) return path[0] || dir;
        if(!visited.has(nextId) && path.length <= 3) { visited.add(nextId); queue.push({ id:nextId, path:path.length?path:[dir] }); }
      }
    }
    return null;
  }

  function genLootBoss(def) {
    const rng = U.rng(Date.now() + def.id);
    const genImprint = _svc('runtime.imprint.gen');
    return def.loot_especial.map(blueprint => {
      const imp  = typeof genImprint === 'function'
        ? genImprint(blueprint, def.tags, { nodeId:'boss', cycle:_clockCurrent().cycle || 0, pid:'boss' }, 0.9 + Math.random()*0.1)
        : null;
      if(imp) imp.mutations = (imp.mutations || []).concat(def.tags.slice(0,2));
      const tipo = ['arma','armadura','magia','habilidad'].find(t => blueprint.includes(t)) || 'mítico';
      const item = { id:U.uid(), blueprint, nombre:blueprint.replace(/_/g,' '), tipo, tags:[...def.tags,'mítico','boss'], imprint:imp, estado:'boss_drop', desc:`Arrebatado a ${def.nombre}.`, atk:tipo==='arma'?20+U.rand(5,15):0, def:tipo==='armadura'?15+U.rand(3,10):0, poder:30+U.rand(10,20), durabilidad:100, es_mitico:true, boss_id:def.id };
      if(tipo==='magia')     { item.cargas=5; item.cargas_max=5; item.fragilidad=0; item.efecto='dmg_dist'; item.poder=25+U.rand(10,15); }
      if(tipo==='habilidad') { item.efecto='atk_mult'; item.valor=3; item.desc=`Habilidad de ${def.nombre}. ×3 daño.`; }
      return item;
    });
  }

  function spawn() {
    const player = _player();
    const playerPos = _playerPos();
    const nodeIds = Object.keys(_worldAll());
    const candidatos = nodeIds.filter(id => id !== playerPos && !bosses.some(b=>!b.eliminado&&b.nodeId===id) && distancia(playerPos, id) >= 4);
    if(!candidatos.length) return;
    const nodeId  = candidatos[Math.floor(Math.random()*candidatos.length)];
    const defBase = BOSSES_DEF[Math.floor(Math.random()*BOSSES_DEF.length)];
    const dif = EventBus.emit('world:calc_difficulty', { player, difficulty:1.0 })?.difficulty || 1.0;
    const cycle = _clockCurrent().cycle || 0;
    const def = { ...defBase, hp:Math.round(defBase.hp*dif), atk:Math.round(defBase.atk*Math.sqrt(dif)), def:Math.round(defBase.def*Math.sqrt(dif)*0.8), xp_base:Math.round(defBase.xp_base*dif) };
    const bossState = { def, nodeId, hp_actual:def.hp, ciclo_entrada:cycle, ciclo_salida:cycle+U.rand(15,40), eliminado:false, en_combate:false, id:U.uid() };
    bosses.push(bossState);
    _sp(); _sep('═');
    _line(`${def.icon} PRESENCIA DETECTADA`, def.color, true);
    _line('Algo de poder incalculable ha entrado al mundo.', 't-dim');
    _line('Se necesita un equipo para hacerle frente.', 't-pel');
    _sep('═'); _sp();
    EventBus.emit('boss:spawn', { boss:bossState, nodeId });
  }

  function moverBosses() {
    bosses.filter(b=>!b.eliminado).forEach(boss => {
      if((_clockCurrent().cycle || 0) >= boss.ciclo_salida) {
        const prev = boss.nodeId;
        boss.eliminado = true;
        if(distancia(_playerPos(), prev) <= 3) { _sp(); _line(`${boss.def.icon} ${boss.def.nombre} se ha retirado del mundo.`, 't-dim'); _sp(); }
        return;
      }
      const exits = Object.values(_worldExits(boss.nodeId));
      if(!exits.length) return;
      const prev   = boss.nodeId;
      boss.nodeId  = exits[Math.floor(Math.random()*exits.length)];
      _comprobarProximidad(boss, prev);
    });
    bosses = bosses.filter(b => !b.eliminado || (_clockCurrent().cycle || 0) - b.ciclo_entrada < 5);
  }

  function _comprobarProximidad(boss, prevNode) {
    const playerNode = _playerPos();
    const dist       = distancia(boss.nodeId, playerNode);
    const prevDist   = distancia(prevNode, playerNode);
    if(boss.nodeId === playerNode) { setTimeout(() => _iniciarCombateBoss(boss), 400); return; }
    if(dist === 1 && prevDist > 1) {
      const dir = dirHaciaBoss(playerNode, boss.nodeId) || 'cerca';
      _sp(); _line(`☠ EL MIEDO SE SIENTE HACIA EL ${dir.toUpperCase()}`, boss.def.color, true); _line(boss.def.frase_cerca, 't-pel'); _sp();
    } else if(dist === 2 && prevDist > 2) {
      const dir = dirHaciaBoss(playerNode, boss.nodeId) || 'lejos';
      _sp(); _line(`${boss.def.icon} Algo poderoso se siente hacia el ${dir.toUpperCase()}.`, boss.def.color); _line(boss.def.frase_lejos, 't-dim'); _sp();
    }
  }

  function _iniciarCombateBoss(boss) {
    if(boss.eliminado || boss.en_combate) return;
    const p = _player();
    const stats = _playerCombatStats();
    if(!p) return;
    const def = boss.def;
    const nodeId = _playerPos();
    _sp(); _sep('═');
    BOSS_ASCII.forEach(line => _line(line, def.color));
    _line(`${def.icon} ${def.nombre.toUpperCase()}`, def.color, true);
    _line(`"${def.titulo}"`, def.color);
    _line(def.desc, 't-out');
    _line(`HP:${boss.hp_actual}/${def.hp}  ATK:${def.atk}  DEF:${def.def}`, 't-pel');
    _line('⚠ Se recomienda un equipo para sobrevivir.', 't-pel', true);
    _sep('═'); _sp();
    const combatants = [
      { tipo:'player', id:p.id, name:p.name, hp:p.hp, maxHp:p.maxHp, atk:stats.atk || 0, def:stats.def || 0, vivo:true, nodeId, playerId:p.id },
      { tipo:'enemy', id:boss.id, name:def.nombre, hp:boss.hp_actual, maxHp:def.hp, atk:def.atk, def:def.def, vivo:true, nodeId, tags:def.tags, poise_max:def.poise_max, poise:def.poise_max, es_boss:true, boss_ref:boss, color:def.color, ataques_especiales:[...def.ataques_especiales] },
    ];
    boss.en_combate = true;
    const startBattleSvc = _svc('runtime.battle.start');
    if(startBattleSvc) startBattleSvc(nodeId, combatants);
    else _line('Servicio runtime.battle.start no disponible para boss.', def.color);
  }

  function _onBossDefeated(boss) {
    boss.eliminado  = false; // se elimina al final
    boss.en_combate = false;
    const def = boss.def;
    _sp(); _sep('═');
    _line(`${def.icon} ${def.nombre} HA CAÍDO`, def.color, true);
    _line(`"${def.titulo}" ya no acecha el mundo.`, 't-dim');
    _sep('─');

    const gainXp = _svc('runtime.xp.gain');
    if(typeof gainXp === 'function') {
      gainXp('combate',    Math.floor(def.xp_base*0.5),  `boss: ${def.nombre}`);
      gainXp('exploración',Math.floor(def.xp_base*0.25), `boss: ${def.nombre}`);
      gainXp('narrativa',  Math.floor(def.xp_base*0.25), `boss: ${def.nombre}`);
      _line(`⬆ +${def.xp_base} XP distribuida.`, 't-mem', true);
    }

    const lootItems = genLootBoss(def);
    _line(`Loot mítico (${lootItems.length} objetos):`, def.color);
    lootItems.forEach(item => {
      _playerAddItem(item);
      const col = item.tipo==='arma'?'t-pel':item.tipo==='armadura'?'t-sis':item.tipo==='magia'?'t-mag':item.tipo==='habilidad'?'t-hab':'t-cor';
      _line(`  ✦ ${item.nombre}  [${item.tipo.toUpperCase()}]${item.atk?'  ATK+'+item.atk:''}${item.poder?'  POD+'+item.poder:''}`, col);
    });

    _gsAddTwist({ id:'boss_'+boss.id, titulo:`Caída de ${def.nombre}`, texto:`${def.nombre} fue derrotado en el ciclo ${_clockCurrent().cycle || 0}.`, boss:true });
    _line('+30 reputación con todas las facciones.', 't-eco');
    _sep('═'); _sp();
    boss.eliminado = true;
    EventBus.emit('boss:defeated', { boss, loot:lootItems, xp:def.xp_base });
    _saveGame();
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
      case 'devorar_stamina': { const p = _player(); jugadores.forEach(j=>{if(p && j.playerId===p.id){p.stamina=Math.max(0,(p.stamina||0)-40);}}); battleLog(battle,`✦ ${bossActor.name}: DEVORAR STAMINA −40`,'t-pel'); break; }
      case 'consumir_ciclo': { _clockTick(2); const dmg=Math.floor(bossActor.atk*0.4); jugadores.forEach(j=>{j.hp=Math.max(0,j.hp-dmg);}); battleLog(battle,`✦ ${bossActor.name}: CICLO CONSUMIDO, todos −${dmg}HP`,'t-cor'); break; }
    }
  }

  function cmdBosses() {
    _sp(); _line('— BOSSES ACTIVOS —', 't-cor');
    const activos = bosses.filter(b => !b.eliminado);
    if(!activos.length) { _line('No hay bosses en el mundo actualmente.', 't-dim'); _sp(); return; }
    activos.forEach(b => {
      const dist = distancia(_playerPos(), b.nodeId);
      const nodo = _worldNode(b.nodeId);
      const distStr = dist===0?'¡EN TU NODO!':dist===1?'A 1 nodo':dist===2?'A 2 nodos':`A ${dist} nodos`;
      _line(`  ${b.def.icon} ${b.def.nombre}  "${b.def.titulo}"`, b.def.color, true);
      _line(`    HP:${b.hp_actual}/${b.def.hp}  Nodo:${nodo?.name||b.nodeId}  ${distStr}`, dist<=2?'t-pel':'t-dim');
      _line(`    Ciclos restantes: ~${Math.max(0,b.ciclo_salida-(_clockCurrent().cycle || 0))}  Loot: ${b.def.loot_especial.length} míticos`, 't-dim');
    });
    _sp();
  }

  let lastBossTick = 0;

  function onWorldTick(payload) {
    const cycle = _clockCurrent().cycle || 0;
    if(cycle - lastBossTick < 3) return payload;
    lastBossTick = cycle;
    if(bosses.filter(b=>!b.eliminado).length < 2 && cycle >= 5 && Math.random() < 0.08) spawn();
    moverBosses();
    bosses.filter(b=>!b.eliminado&&!b.en_combate&&b.nodeId===_playerPos()).forEach(b=>setTimeout(()=>_iniciarCombateBoss(b),300));
    return payload;
  }

  function onNodeEnter(payload) {
    const boss = bosses.find(b => !b.eliminado && !b.en_combate && b.nodeId === payload.nodeId);
    if(boss) setTimeout(() => _iniciarCombateBoss(boss), 500);
    return payload;
  }

  function onEnemyDefeat(payload) {
    const enemy = payload?.enemy;
    if(!enemy?.es_boss) return payload;
    const boss = bosses.find(row => row.id === enemy.id || row === enemy.boss_ref || row?.def?.id === enemy.boss_ref?.def?.id);
    if(boss && !boss.eliminado) _onBossDefeated(boss);
    return payload;
  }

  return { spawn, moverBosses, distancia, procesarAtaqueEspecial, cmdBosses, onWorldTick, onNodeEnter, onEnemyDefeat, getBosses:()=>bosses, getBossEnNodo:nid=>bosses.find(b=>!b.eliminado&&b.nodeId===nid) };
})();

const pluginBosses = {
  id:'plugin:bosses', nombre:'Sistema de Bosses', version:'2.0.0',
  descripcion:'Monstruos mundiales que se mueven y dejan loot mítico.',
  hooks: {
    'world:tick': {
      fn(payload) {
        return BossSystem.onWorldTick(payload);
      }
    },
    'world:node_enter': {
      fn(payload) {
        return BossSystem.onNodeEnter(payload);
      }
    },
    'combat:enemy_defeat': {
      fn(payload) {
        return BossSystem.onEnemyDefeat(payload);
      }
    },
  },
  comandos: {
    'bosses': { fn:()=>BossSystem.cmdBosses(), meta:{ titulo:'bosses', color:'t-cor', desc:'Ver bosses activos y su distancia.' } },
    'boss':   { fn:()=>BossSystem.cmdBosses(), meta:{ titulo:'boss (alias)', color:'t-cor', desc:'Ver bosses.' } },
  },
};
