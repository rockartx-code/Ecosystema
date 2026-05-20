// ════════════════════════════════════════════════════════════════
// PLUGIN — Battle Engine
//
// Maquina tactica extraida de systems/net.js (C1 del audit SOLID).
// Antes: net.js mezclaba sincronizacion P2P con la maquina de batalla
//        (~350 lineas: startBattle, sendBattleAction, _execSimpleAI,
//        _checkBattleEnd, _advanceTurn/_advanceTurnIfAI, renderBattle).
// Ahora: la logica vive aqui y se expone via servicios runtime.battle.*
//        y gameplay.battle.*. net.js queda como adaptador de red puro.
//
// Frontera: el plugin accede a Player/World/Out/save/refreshStatus via
// los helpers de core/plugin-helpers.js (runtime.* services). U, D,
// EventBus, battleLog y ConcentracionSystem son globales permitidos.
// ════════════════════════════════════════════════════════════════
'use strict';

const pluginBattleEngine = (() => {
  // Estado privado del motor. Persiste mientras el plugin esta cargado.
  const battles = {};
  let myBattleId = null;

  // Helpers locales de dependencias.
  function _tactics() {
    const fn = _svc('runtime.tactics.api');
    return typeof fn === 'function' ? (fn() || null) : null;
  }
  function _items() {
    const fn = _svc('runtime.items.api');
    return typeof fn === 'function' ? (fn() || null) : null;
  }
  // Nota: el flag legacy globalThis.Combat.active se elimino en fase 1.6
  // (M6 del audit). El estado de batalla vive en el objeto battle.estado
  // y se consulta via runtime.battle.current().
  function _concentracionParseVariant(arg) {
    if(typeof ConcentracionSystem !== 'undefined' && ConcentracionSystem.parseVariantArg) {
      return ConcentracionSystem.parseVariantArg(arg);
    }
    return { raw: String(arg || ''), variant: 'base', variantLabel: '', variantRaw: '' };
  }

  function actorActual(battle) {
    if(!battle?.cola) return null;
    const total = battle.cola.length;
    if(!total) return null;
    let idx = (battle.turno || 0) % total, loops = 0;
    while(loops < total) {
      const c = battle.cola[idx];
      if(c?.vivo && !c.huyó) return c;
      idx = (idx + 1) % total; loops++;
    }
    return null;
  }

  function _advanceTurn(battle) {
    battle.turno = (battle.turno || 0) + 1;
    if(battle.turno % battle.cola.length === 0) battle.ronda = (battle.ronda || 1) + 1;
  }

  function _advanceTurnIfAI(battle) {
    if(battle.estado !== 'activo') return;
    if(battle._aiThinking) return;
    const actor = actorActual(battle);
    if(!actor || actor.tipo === 'player') return;
    battle._aiThinking = true;
    setTimeout(() => {
      if(battle.estado !== 'activo') { battle._aiThinking = false; return; }
      const actorTurno = actorActual(battle);
      if(!actorTurno || actorTurno.tipo === 'player') { battle._aiThinking = false; return; }
      if(actorTurno.skipping) {
        battleLog(battle, `${actorTurno.name} pierde el turno.`, 't-dim');
        actorTurno.skipping = false;
        battle._aiThinking = false;
        _checkBattleEnd(battle);
        if(battle.estado === 'activo') { _advanceTurn(battle); _advanceTurnIfAI(battle); }
        renderBattle(battle);
        _refreshStatus();
        return;
      }
      EventBus.emit('combat:enemy_turn_announce', { actor: actorTurno, battle });
      _tactics()?.tickTurno?.(actorTurno, battle);
      if(actorTurno.skipping) {
        battleLog(battle, `${actorTurno.name} no puede actuar este turno.`, 't-dim');
      } else {
        const payload = EventBus.emit('combat:resolve_ia', { actor: actorTurno, battle });
        if(!payload?.handled) _execSimpleAI(actorTurno, battle);
      }
      battle._aiThinking = false;
      _checkBattleEnd(battle);
      if(battle.estado === 'activo') { _advanceTurn(battle); _advanceTurnIfAI(battle); }
      renderBattle(battle);
      _refreshStatus();
    }, 600);
  }

  function _execSimpleAI(actor, battle) {
    const targets = battle.cola.filter(c => c.vivo && c.tipo === 'player');
    if(!targets.length) { battleLog(battle, `${actor.name} espera.`, 't-dim'); return; }
    const target = targets[0];
    const dmg = Math.max(1, (actor.atk || 4) - (target.poise_roto ? 0 : target.def || 0));
    target.hp = Math.max(0, target.hp - dmg);
    const p = _player();
    if(p && target.playerId === p.id) p.hp = target.hp;
    battleLog(battle, `${actor.name} → ${target.name}  −${dmg}HP  (${target.hp}/${target.maxHp})`, 't-pel');
    if(target.hp <= 0) { target.vivo = false; battleLog(battle, `${target.name} cae.`, 't-cor'); }
  }

  function _checkBattleEnd(battle) {
    const jugadores = battle.cola.filter(c => c.tipo === 'player' && c.vivo && !c.huyó);
    const enemigos  = battle.cola.filter(c => c.tipo !== 'player' && c.vivo && !c.huyó);

    if(!jugadores.length) {
      battle.estado = 'fin'; battle.ganadores = enemigos.map(c => c.id);
      battleLog(battle, 'Los jugadores han caído.', 't-pel');
      const p = _player();
      const yoCaido = battle.cola.find(c => p && c.playerId === p.id && !c.vivo && !c.huyó);
      if(yoCaido) setTimeout(() => _gameDie('caído en batalla'), 600);
    } else if(!enemigos.length) {
      battle.estado = 'fin'; battle.ganadores = jugadores.map(c => c.id);
      battleLog(battle, '¡Victoria!', 't-cra');
      const p = _player();
      battle.cola.filter(c => c.tipo !== 'player' && !c.vivo && !c._deathProcessed).forEach(e => {
        e._deathProcessed = true;
        if(e.es_boss) { EventBus.emit('combat:enemy_defeat', { enemy:e, nodeId: battle.nodeId }); return; }
        const suerteBonus = (p?.suerte || 0) * 0.02;
        const edef = (D?.enemies || []).find(x => x.id === e.id || x.nombre === e.name);
        if(edef?.loot?.length && U.chance(0.45 + suerteBonus)) {
          const dropName = U.pick(edef.loot, U.rng(Math.random()));
          _playerAddItem({ id: U.uid(), blueprint: dropName, nombre: dropName, tipo: 'material', tags: D.matTags(dropName), estado: 'nativo', desc: D.mat(dropName)?.desc });
          battleLog(battle, `Loot: ${dropName}`, 't-cra');
        }
        if(U.chance(0.30 + suerteBonus)) {
          const nodo = _worldNode(battle.nodeId);
          const itemTac = _items()?.genLootTactico?.(nodo?.tipo || 'ruina', U.rng(Date.now()));
          if(itemTac) { _playerAddItem({ ...itemTac, id: U.uid() }); battleLog(battle, `Loot táctico: ${itemTac.nombre}`, 't-cra'); }
        }
        const xpKill = 20 + (e.maxHp || 10) / 5;
        _xpGanar('combate', Math.floor(xpKill), `kill: ${e.name}`);
        if(e.tipo === 'enemy') _worldRemoveEnemy(battle.nodeId, e.id);
        EventBus.emit('combat:enemy_defeat', { enemy: e, nodeId: battle.nodeId });
      });
      if(jugadores.length === battle.cola.filter(c => c.tipo === 'player').length) {
        _xpGanar('combate', 10, 'victoria sin bajas');
      }
      EventBus.emit('combat:post_resolve', { battle, finalDmg: 0, actor: null });
    }

    if(battle.estado === 'fin') {
      if(myBattleId === battle.id) myBattleId = null;
      _saveGame();
    }
  }

  function renderBattle(battle) {
    if(!battle) return;
    _sp(); _sep('─');
    _line(`Ronda ${battle.ronda || 1} — Turno de ${actorActual(battle)?.name || '?'}`, 't-acc');
    battle.cola.filter(c => c.vivo).forEach(c => {
      const col  = c.tipo === 'player' ? 't-cra' : 't-pel';
      const el   = c.elemento_estado ? ` [${c.elemento_estado}]` : '';
      const vul  = c.poise_roto ? ' ⚡' : '';
      const stun = c.skipping ? ' 💫' : '';
      _line(`  ${c.name.padEnd(18)} HP:${c.hp}/${c.maxHp}  ATK:${c.atk}${el}${vul}${stun}`, col);
    });
    if(battle.log?.length) {
      _sep('─');
      battle.log.slice(-6).forEach(l => _line(`  ${l.txt}`, l.color || 't-out'));
    }
    _sep('─'); _sp();
  }

  function startBattle(nodeId, combatants) {
    const id = U.uid();
    const cola = combatants.map(c => ({
      ...c,
      vivo:        c.vivo ?? true,
      huyó:        false,
      defendiendo: false,
      poise:       _tactics()?.calcPoise?.(c) || 50,
      poise_roto:  false,
      poise_turnos: 0,
      habilidades: c.habilidades || [],
      magias:      c.magias || [],
      _ultima_habilidad: null,
      _ultima_magia: null,
    }));
    cola.sort((a, b) => (b.iniciativa || b.atk || 0) - (a.iniciativa || a.atk || 0));

    const battle = {
      id, nodeId, estado: 'activo',
      cola, turno: 0, ronda: 1,
      log: [], ganadores: [],
      _aiThinking: false,
    };

    _tactics()?.initBattle?.(battle);
    battles[id]  = battle;
    myBattleId   = id;

    _sp();
    _line('⚔ BATALLA INICIADA', 't-pel', true);
    _line(`${cola.filter(c => c.tipo === 'player').map(c => c.name).join(', ')} vs ${cola.filter(c => c.tipo !== 'player').map(c => c.name).join(', ')}`, 't-dim');
    _sep('─');
    _line('Tu turno: atacar [variante] · defender [variante] · magia [variante] · habilidad [variante] · concentración ... | ... · interiorizar · transformar · huir · examinar', 't-dim');

    renderBattle(battle);
    EventBus.emit('combat:start', { battle, nodeId });
    _advanceTurnIfAI(battle);
    return battle;
  }

  function joinBattle(battleId) {
    const battle = battles[battleId];
    if(!battle) return;
    myBattleId = battleId;
    renderBattle(battle);
  }

  function sendBattleAction(battleId, playerId, verb, arg, opts = {}) {
    const battle = battles[battleId];
    if(!battle || battle.estado !== 'activo') return;
    const actor = actorActual(battle);
    if(!actor || actor.playerId !== playerId) return;

    const p = _player();
    let consumeTurn = true;

    switch(verb) {
      case 'atacar': {
        const parsedArg = _concentracionParseVariant(arg);
        const query = String(parsedArg.raw || '').toLowerCase().replace(/_/g, ' ').trim();
        const qHash = query.replace(/^#/, '');
        const target = query
          ? battle.cola.find(c => {
              if(!c?.vivo || c.tipo === 'player') return false;
              const name = String(c.name || '').toLowerCase();
              const id   = String(c.id || '').toLowerCase();
              const hash = String(c.imprint?.hash || c.hash || '').toLowerCase();
              const short = hash ? hash.slice(0, 6) : '';
              return id === query || hash === qHash || short === qHash || id.startsWith(query) || name.includes(query);
            })
          : battle.cola.find(c => c.vivo && c.tipo !== 'player');
        if(!target) { _line('Sin objetivo.', 't-dim'); return; }

        const arma     = p?.equipped?.arma;
        const tactics  = _tactics();
        const elemento = tactics?.getElementoArma?.(arma) || null;
        let dmg, reaccion;

        if(tactics?.calcularDaño) {
          const res = tactics.calcularDaño(actor, target, arma, elemento, battle);
          dmg      = res.dmg;
          reaccion = res.reaccion;
          if(arma) tactics.desgastarArma?.(arma);
          tactics.consumirStamina?.(12);
        } else {
          dmg = Math.max(1, actor.atk - (target.def || 0));
        }

        const beforeApply = EventBus.emit('combat:before_damage_apply', {
          battle, actor, target, dmg, source: 'player_attack', cancelled: false,
        });
        if(beforeApply?.cancelled) {
          battleLog(battle, `${actor.name} cancela su ataque.`, 't-dim');
          break;
        }
        dmg = beforeApply?.dmg ?? dmg;

        target.hp = Math.max(0, target.hp - dmg);
        let log = `${actor.name}${parsedArg.variantLabel || ''} → ${target.name}  −${dmg}HP  (${target.hp}/${target.maxHp})`;
        if(reaccion) {
          log += `  ⚗${reaccion.nombre}!`;
          if(tactics) {
            tactics.aplicarReaccion?.(reaccion, actor, target, battle);
            tactics.actualizarSuperficie?.(battle.nodeId, elemento, battle);
          }
        } else if(elemento && tactics) {
          tactics.aplicarElemento?.(target, elemento, battle);
        }
        battleLog(battle, log, reaccion ? 't-cor' : 't-pel');
        if(tactics && !reaccion) tactics.aplicarPoiseDmg?.(target, Math.floor(dmg * 0.4), battle);
        if(target.hp <= 0) { target.vivo = false; battleLog(battle, `${target.name} cae.`, 't-cor'); }

        EventBus.emit('combat:after_damage_apply', {
          battle, actor, target, dmg, source: 'player_attack', targetDied: target.hp <= 0,
        });

        _xpGanar('combate', Math.ceil(dmg / 3), 'daño en batalla');
        break;
      }
      case 'defender':
        actor.defendiendo = true;
        battleLog(battle, `${actor.name} adopta postura defensiva.`, 't-sis');
        _tactics()?.consumirStamina?.(-5);
        break;
      case 'magia': {
        const parsedArg = _concentracionParseVariant(arg);
        const magName = parsedArg.raw?.toLowerCase();
        const mags    = (p?.ext?.magias || p?.magias || []).filter(m => !m.corrompida && m.cargas > 0);
        const mag     = magName ? mags.find(m => m.nombre.toLowerCase().includes(magName)) : mags[0];
        if(!mag) { battleLog(battle, 'Sin magia disponible.', 't-dim'); break; }
        if(parsedArg.variantLabel) battleLog(battle, `${actor.name} canaliza ${parsedArg.variantLabel}.`, 't-mag');
        const target  = battle.cola.find(c => c.vivo && c.tipo !== 'player');
        const payload = { actor, mag, target, battle, isMyTurn: true };
        const result  = EventBus.emit('combat:resolve_magia', payload);
        if(!result?.handled) battleLog(battle, 'Magia sin efecto.', 't-dim');
        break;
      }
      case 'habilidad': {
        const parsedArg = _concentracionParseVariant(arg);
        const habName = parsedArg.raw?.toLowerCase();
        const habs    = p?.ext?.habilidades || p?.habilidades || [];
        const hab     = habName ? habs.find(h => h.nombre.toLowerCase().includes(habName)) : habs[0];
        if(!hab) { battleLog(battle, 'Sin habilidad disponible.', 't-dim'); break; }
        if(parsedArg.variantLabel) battleLog(battle, `${actor.name} usa ${parsedArg.variantLabel}.`, 't-hab');
        const target  = battle.cola.find(c => c.vivo && c.tipo !== 'player');
        const payload = { actor, hab, target, battle, isMyTurn: true };
        const result  = EventBus.emit('combat:resolve_habilidad', payload);
        if(!result?.handled) battleLog(battle, 'Habilidad sin efecto.', 't-dim');
        break;
      }
      case 'concentracion': {
        if(typeof ConcentracionSystem === 'undefined') {
          battleLog(battle, 'Sistema de concentración no disponible.', 't-dim');
          break;
        }
        const plan = ConcentracionSystem.buildPlan(arg, actor, battle);
        if(!plan.ok) {
          battleLog(battle, plan.error || 'No se pudo preparar la secuencia.', 't-dim');
          consumeTurn = false;
          break;
        }
        const roll = Math.random();
        if(roll > plan.successChance) {
          actor._concentracion_pendiente = {
            acciones: plan.actions,
            varianteCadena: plan.variantChain,
            turnos: 1,
          };
          battleLog(battle, `⧖ Concentración inestable (${Math.round(plan.successChance * 100)}%): la cadena queda diferida 1 turno.`, 't-acc');
          battleLog(battle, `   Cadena: ${plan.actions.map(a => `${a.verb}${a.variantLabel || ''}${a.arg ? ` ${a.arg}` : ''}`).join(' | ')}`, 't-dim');
          break;
        }
        battleLog(battle, `◎ Concentración perfecta (${Math.round(plan.successChance * 100)}%): ejecutas toda la cadena ahora.`, 't-cor');
        for(const step of plan.actions) {
          sendBattleAction(battleId, playerId, step.verb, `${step.variantRaw || ''}${step.arg ? ` ${step.arg}` : ''}`.trim(), { skipTurnAdvance: true, silentRender: true });
          if(battle.estado !== 'activo') break;
        }
        break;
      }
      case 'concentracion_resolver': {
        const pending = actor._concentracion_pendiente;
        if(!pending?.acciones?.length) { consumeTurn = false; break; }
        battleLog(battle, `◎ Cadena de concentración liberada: ${pending.acciones.length} acción(es).`, 't-cor');
        for(const step of pending.acciones) {
          sendBattleAction(battleId, playerId, step.verb, `${step.variantRaw || ''}${step.arg ? ` ${step.arg}` : ''}`.trim(), { skipTurnAdvance: true, silentRender: true });
          if(battle.estado !== 'activo') break;
        }
        actor._concentracion_pendiente = null;
        break;
      }
      case 'huir':
        if(U.chance(0.45)) {
          actor.vivo = false; actor.huyó = true;
          battleLog(battle, `${actor.name} escapa.`, 't-mem');
        } else {
          battleLog(battle, 'No consigues escapar.', 't-dim');
          const enemy = battle.cola.find(c => c.vivo && c.tipo !== 'player');
          if(enemy) {
            const dmg = Math.max(1, (enemy.atk || 4) - (actor.def || 0));
            actor.hp = Math.max(0, actor.hp - dmg);
            if(p) p.hp = actor.hp;
            battleLog(battle, `${enemy.name} aprovecha — −${dmg}HP`, 't-pel');
          }
        }
        break;
      default: {
        const custom = EventBus.emit('combat:player_action', {
          battle, actor, verb, arg, handled: false, consumeTurn: false,
        });
        if(!custom?.handled) {
          _line(`Acción no válida en batalla: ${verb}`, 't-dim');
          return;
        }
        consumeTurn = custom.consumeTurn !== false;
        break;
      }
    }

    // Sincronizar HP del jugador local con el actor
    if(p) actor.hp = p.hp;
    _checkBattleEnd(battle);
    if(battle.estado === 'activo' && consumeTurn && !opts.skipTurnAdvance) {
      _advanceTurn(battle); _advanceTurnIfAI(battle);
    }
    if(!opts.silentRender) renderBattle(battle);
    _refreshStatus();
  }

  // ── Selector de target (extraido de systems/commands.js pickTarget) ──
  function _normTarget(q) { return String(q || '').toLowerCase().replace(/_/g, ' ').trim(); }
  function _pickByQuery(q, list, getName, getId, getHash) {
    const query = _normTarget(q);
    if(!list?.length) return null;
    if(!query) return list[0] || null;
    const scored = list.map(t => {
      const name  = String(getName?.(t) ?? t?.nombre ?? t?.name ?? '').toLowerCase();
      const id    = String(getId?.(t) ?? t?.id ?? '').toLowerCase();
      const hash  = String(getHash?.(t) ?? t?.imprint?.hash ?? t?.hash ?? '').toLowerCase();
      const qh    = query.replace(/^#/, '');
      const short = hash ? hash.slice(0, 6) : '';
      let score = 0;
      if(id && id === query) score = 1000;
      else if(hash && hash === qh) score = 900;
      else if(short && short === qh) score = 875;
      else if(name === query) score = 850;
      else if(id && id.startsWith(query)) score = 760;
      else if(name.startsWith(query)) score = 700;
      else if(name.includes(query)) score = 600 - Math.max(0, name.indexOf(query));
      return { t, score };
    }).filter(x => x.score > 0);
    if(!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    return scored[0].t;
  }
  function _npcCombatStatsLocal(npc) {
    const fn = _svc('runtime.npc.combat_stats');
    return typeof fn === 'function' ? (fn(npc) || { hp:20, atk:5, def:1 }) : { hp:20, atk:5, def:1 };
  }
  function _findNpcEnNodoLocal(q, nodeId) {
    const fn = _svc('runtime.gs.npcs_in_node');
    const list = typeof fn === 'function' ? (fn(nodeId) || []) : [];
    return _pickByQuery(q, list, (n)=>n?.nombre, (n)=>n?.id, (n)=>n?.imprint?.hash || n?.hash);
  }

  // ── cmdAtacar (migrado de systems/commands.js en C2) ─────────
  function _cmdAtacar(q) {
    const p = _player();
    if(!p) return;
    const nodeId = _playerPos();
    const n = _worldNode(nodeId);
    if(!n) return;
    const qn = _normTarget(q);
    const { atk, def } = _playerCombatStats();

    // 1) NPC
    const npc = _findNpcEnNodoLocal(qn, nodeId);
    if(npc) {
      const stats = _npcCombatStatsLocal(npc);
      startBattle(n.id, [
        { tipo:'player', id:p.id, name:p.name, hp:p.hp, maxHp:p.maxHp, atk, def, nodeId:n.id, playerId:p.id, vivo:true },
        { tipo:'npc',    id:npc.id, name:npc.nombre, hp:stats.hp, maxHp:stats.hp, atk:stats.atk, def:stats.def, nodeId:n.id, vivo:true, npc_ref:npc },
      ]);
      return;
    }

    // 2) Enemigo
    const enemy = _pickByQuery(qn, n.enemies || [], (e)=>e?.nombre, (e)=>e?.id, (e)=>e?.imprint?.hash || e?.hash) || (n.enemies?.[0]);
    if(enemy) {
      startBattle(n.id, [
        { tipo:'player', id:p.id, name:p.name, hp:p.hp, maxHp:p.maxHp, atk, def, nodeId:n.id, playerId:p.id, vivo:true },
        { tipo:'enemy',  id:enemy.id, name:enemy.nombre, hp:enemy.hp_current||enemy.hp, maxHp:enemy.hp, atk:enemy.atk, def:enemy.def||0, nodeId:n.id, tags:enemy.tags||[], vivo:true, imprint:enemy.imprint||null, hash:enemy.hash||null },
      ]);
      return;
    }

    // 3) Criatura
    const creature = _pickByQuery(qn, n.creatures || [], (c)=>c?.nombre, (c)=>c?.id, (c)=>c?.imprint?.hash || c?.hash) || (n.creatures?.[0]);
    if(!creature) {
      _line(q ? `No hay "${q}" aquí.` : 'No hay enemigos o criaturas aquí.', 't-dim');
      return;
    }
    startBattle(n.id, [
      { tipo:'player',   id:p.id, name:p.name, hp:p.hp, maxHp:p.maxHp, atk, def, nodeId:n.id, playerId:p.id, vivo:true },
      { tipo:'creature', id:creature.id, name:creature.nombre, hp:creature.hp_current||creature.hp, maxHp:creature.maxHp||creature.hp, atk:creature.atk||4, def:creature.def||0, nodeId:n.id, tags:creature.tags||[], vivo:true, _cre_ref:creature, imprint:creature.imprint||null, hash:creature.hash||null },
    ]);
  }

  // ── cmdExaminar (migrado, ruta fuera-de-combate; la in-combat la
  //    maneja el dispatch en commands.js) ────────────────────────
  function _cmdExaminar(q) {
    if(!q) {
      // Sin arg: delega al runtime.player.show_status si existe; si no,
      // commands.js ya tiene un cmdEstado global como fallback.
      const fn = _svc('runtime.player.show_status');
      if(typeof fn === 'function') { fn(); return; }
      return;
    }
    const npc = _findNpcEnNodoLocal(q, _playerPos());
    if(npc) {
      // Delega a la mismo handler de "observar" del plugin-npcs.
      const obs = _svc('runtime.npc.observe')?.(npc) || [];
      _sp(); _line(`— OBSERVACIÓN: ${npc.nombre} —`, 't-acc');
      obs.forEach((o, i) => _line(o, i === 0 ? 't-npc' : (npc.arq_ocu_expuesto && i > 3 ? 't-twi' : 't-dim')));
      _sp();
      return;
    }
    const item = _playerFindItem(q);
    if(!item) { _line(`No encuentras "${q}".`, 't-dim'); return; }
    const nombre = item.nombre || item.blueprint || 'objeto';
    const tipo   = item.tipo || item.categoria || 'desconocido';
    const pares = [
      ['Blueprint', item.blueprint], ['ID', item.id], ['Tipo', tipo],
      ['Categoría', item.categoria], ['Estado', item.estado], ['Raridad', item.raridad],
      ['Slot', item.slot || item.slot_preferido],
      ['ATK', item.atk], ['DEF', item.def], ['Poder', item.poder],
      ['Crit', item.crit], ['Evasión', item.evasion], ['Valor', item.valor],
      ['Efecto', item.efecto], ['Elemento', item.elemento], ['Duración', item.dur],
      ['Durabilidad', item.durabilidad != null ? `${item.durabilidad}%` : null],
      ['Cargas', (item.cargas != null || item.cargas_max != null) ? `${item.cargas ?? '?'} / ${item.cargas_max ?? '?'}` : null],
      ['Fragilidad', item.fragilidad != null ? `${item.fragilidad}%` : null],
      ['NPC origen', item.npc_origen], ['Forjado', item.forjado ? 'sí' : null],
    ].filter(([, v]) => v != null && String(v).trim() !== '');
    _sp(); _line(`— EXAMINAR OBJETO: ${nombre} —`, 't-out', true);
    _line(item.desc || 'Sin descripción.', 't-dim');
    pares.forEach(([k, v]) => _line(`  ${k}: ${v}`, 't-out'));
    if(Array.isArray(item.tags) && item.tags.length) _line(`  Tags: ${item.tags.join(', ')}`, 't-cra');
    if(item.efecto_accesorio?.stat || item.efecto_accesorio?.valor != null) {
      const ea = item.efecto_accesorio;
      _line(`  Efecto accesorio: ${ea.stat || '—'}${ea.valor != null ? ` +${ea.valor}` : ''}`, 't-mag');
    }
    if(item._elemento_temporal) {
      const durEl = item._elemento_dur != null ? ` (${item._elemento_dur} uso${item._elemento_dur === 1 ? '' : 's'})` : '';
      _line(`  Infusión temporal: ${item._elemento_temporal}${durEl}`, 't-mag');
    }
    if(item.imprint) {
      _line(`  Impronta: #${item.imprint.hash || '—'}`, 't-dim');
      if(item.imprint.tension != null) _line(`  Tensión de impronta: ${((item.imprint.tension || 0) * 100).toFixed(0)}%`, 't-dim');
      if(item.imprint.seed != null) _line(`  Seed: ${item.imprint.seed}`, 't-dim');
      if(item.imprint.mutations?.length) _line(`  Mutaciones: ${item.imprint.mutations.join(', ')}`, 't-dim');
      else _line('  Mutaciones: —', 't-dim');
    }
    const extras = Object.keys(item).filter(k => ![
      'id','blueprint','nombre','tipo','categoria','estado','raridad','slot','slot_preferido',
      'atk','def','poder','crit','evasion','valor','efecto','elemento','dur','durabilidad',
      'cargas','cargas_max','fragilidad','npc_origen','forjado','desc','tags','efecto_accesorio',
      '_elemento_temporal','_elemento_dur','imprint',
    ].includes(k)).sort();
    if(extras.length) _line(`  Extras: ${extras.join(', ')}`, 't-dim');
    _sp();
  }

  // ── API publica del plugin (servicios runtime.battle.* y aliases) ─
  return {
    id: 'plugin:battle-engine',
    nombre: 'Motor de Batalla',
    version: '1.0.0',
    descripcion: 'Maquina tactica extraida de net.js. Provee runtime.battle.* y gameplay.battle.*.',
    comandos: {
      'atacar':   { fn: (args)=>_cmdAtacar(args.join(' ')),   meta:{ titulo:'atacar [target]',   color:'t-pel', desc:'Inicia batalla contra NPC, enemigo o criatura del nodo.' } },
      'a':        { fn: (args)=>_cmdAtacar(args.join(' ')),   meta:{ titulo:'a (alias atacar)',  color:'t-pel', desc:'Alias de atacar.' } },
      'examinar': { fn: (args)=>_cmdExaminar(args.join(' ')), meta:{ titulo:'examinar [target]', color:'t-out', desc:'Examinar NPC, item o estado del jugador.' } },
      'ex':       { fn: (args)=>_cmdExaminar(args.join(' ')), meta:{ titulo:'ex (alias examinar)', color:'t-out', desc:'Alias de examinar.' } },
    },
    services: {
      // Contratos runtime.* (facade estable)
      'runtime.battle.start':   (nodeId, combatants=[]) => startBattle(nodeId, combatants),
      'runtime.battle.action':  (battleId, playerId, action, payload=null) => { sendBattleAction(battleId, playerId, action, payload); return true; },
      'runtime.battle.current': () => myBattleId ? battles[myBattleId] : null,
      'runtime.battle.actor':   (battle=null) => actorActual(battle),
      'runtime.battle.render':  (battle=null) => { const b = battle || (myBattleId ? battles[myBattleId] : null); if(!b) return false; renderBattle(b); return true; },
      'runtime.battle.tick_ai': (battle=null) => { const b = battle || (myBattleId ? battles[myBattleId] : null); if(!b) return false; _advanceTurnIfAI(b); return true; },
      'runtime.battle.join':    (battleId) => { joinBattle(battleId); return true; },
      // Aliases gameplay.* (compat con consumers actuales en commands.js)
      'gameplay.battle.start':  (nodeId, combatants=[]) => { startBattle(nodeId, combatants); return true; },
      'gameplay.battle.current':() => myBattleId ? battles[myBattleId] : null,
      'gameplay.battle.actor':  (battle) => actorActual(battle),
      'gameplay.combat.action': (battleId, playerId, action, payload=null) => { sendBattleAction(battleId, playerId, action, payload); return true; },
      'gameplay.combat.escape': (battle, playerId) => { if(!battle?.id || !playerId) return false; sendBattleAction(battle.id, playerId, 'huir', null); return true; },
    },
  };
})();

// Exponer al manifest declarativo en core/boot.js. En scripts clasicos
// los `const` top-level NO se enganchan a globalThis automaticamente.
globalThis.pluginBattleEngine = pluginBattleEngine;
