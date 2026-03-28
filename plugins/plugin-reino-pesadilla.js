// ════════════════════════════════════════════════════════════════
// PLUGIN: Reino Pesadilla
// En fronteras de alta dificultad puede activar una gauntlet de 8
// monstruos de pesadilla antes de permitir crear la nueva sección.
// ════════════════════════════════════════════════════════════════
const pluginReinoPesadilla = (() => {
  const PLUGIN_ID = 'plugin:reino_pesadilla';
  const DIFICULTAD_MIN = 5;
  const CHANCE = 0.10;
  const TOTAL_MONSTRUOS = 8;

  const state = {
    activa: false,
    runId: null,
    fromNodeId: null,
    dir: null,
    vencidos: 0,
  };

  function _currentDifficulty() {
    const node = World.node(Player.pos());
    return Number(node?.dificultad || 0);
  }

  function _isMoveVerb(verb) {
    return ['ir', 'i', 'n', 's', 'e', 'o', 'norte', 'sur', 'este', 'oeste'].includes((verb || '').toLowerCase());
  }

  function _resolveDir(verb, args = []) {
    const v = (verb || '').toLowerCase();
    if(['norte', 'sur', 'este', 'oeste'].includes(v)) return v;
    if(v === 'n') return 'norte';
    if(v === 's') return 'sur';
    if(v === 'e') return 'este';
    if(v === 'o') return 'oeste';
    return (args[0] || '').toLowerCase();
  }

  function _startNightmare(fromNodeId, dir) {
    state.activa = true;
    state.runId = U.uid();
    state.fromNodeId = fromNodeId;
    state.dir = dir;
    state.vencidos = 0;

    Out.sp();
    Out.sep('═');
    Out.line('☾ REINO PESADILLA', 't-cor', true);
    Out.line('La frontera se retuerce y te arrastra a un nodo de pesadilla.', 't-pel');
    Out.line(`Debes derrotar ${TOTAL_MONSTRUOS} monstruos seguidos para abrir la nueva sección.`, 't-dim');
    Out.sep('═');
    Out.sp();

    setTimeout(() => _spawnNextNightmare(), 180);
  }

  function _buildNightmareEnemy(index) {
    const p = Player.get();
    const baseHp = Math.max(18, Math.floor((p.maxHp || p.hp || 20) * 1.5));
    const baseAtk = Math.max(2, Math.floor((Player.getAtk?.() || p.atk || 6) * 1.5));
    const baseDef = Math.max(1, Math.floor((Player.getDef?.() || p.def || 2) * 1.5));

    const statBoost = U.pick(['hp', 'atk', 'def'], U.rng(`${state.runId}:${index}`));
    let hp = baseHp;
    let atk = baseAtk;
    let def = baseDef;

    if(statBoost === 'hp') hp = Math.max(hp, Math.floor((p.maxHp || p.hp || 20) * 3));
    if(statBoost === 'atk') atk = Math.max(atk, Math.floor((Player.getAtk?.() || p.atk || 6) * 3));
    if(statBoost === 'def') def = Math.max(def, Math.floor((Player.getDef?.() || p.def || 2) * 3));

    return {
      tipo: 'enemy',
      id: `pesadilla_${state.runId}_${index}`,
      name: `Pesadilla ${index}`,
      hp,
      maxHp: hp,
      atk,
      def,
      vivo: true,
      nodeId: Player.pos(),
      tags: ['pesadilla', 'abismo', 'corrupto'],
      es_pesadilla: true,
      pesadilla_run_id: state.runId,
      pesadilla_boost: statBoost,
    };
  }

  function _spawnNextNightmare() {
    if(!state.activa || state.vencidos >= TOTAL_MONSTRUOS) return;
    const getCurrentBattle = ServiceRegistry?.get?.('gameplay.battle.current');
    if((typeof getCurrentBattle === 'function' ? getCurrentBattle() : Net.getMyBattle?.())) return;

    const idx = state.vencidos + 1;
    const p = Player.get();
    const enemy = _buildNightmareEnemy(idx);

    Out.line(`☠ Oleada ${idx}/${TOTAL_MONSTRUOS}: ${enemy.name} [boost ${enemy.pesadilla_boost.toUpperCase()}]`, 't-cor', true);

    const startBattle = ServiceRegistry?.get?.('gameplay.battle.start');
    const actors = [
      {
        tipo: 'player',
        id: p.id,
        name: p.name,
        hp: p.hp,
        maxHp: p.maxHp,
        atk: Player.getAtk(),
        def: Player.getDef(),
        vivo: true,
        nodeId: Player.pos(),
        playerId: p.id,
      },
      enemy,
    ];
    if(typeof startBattle === 'function') startBattle(Player.pos(), actors);
    else Net.startBattle(Player.pos(), actors);
  }

  function _onEnemyDefeat(payload) {
    const enemy = payload?.enemy;
    if(!state.activa || !enemy?.es_pesadilla || enemy?.pesadilla_run_id !== state.runId) return payload;

    state.vencidos++;
    Out.line(`✓ Pesadilla derrotada (${state.vencidos}/${TOTAL_MONSTRUOS})`, 't-cra');

    if(state.vencidos >= TOTAL_MONSTRUOS) {
      _finishNightmare();
    } else {
      setTimeout(() => _spawnNextNightmare(), 220);
    }

    return payload;
  }

  function _autoPlayTurn(payload) {
    if(!state.activa) return payload;
    const battle = payload?.battle;
    if(!battle?.estado || battle.estado !== 'activo') return payload;

    const getBattleActor = ServiceRegistry?.get?.('gameplay.battle.actor');
    const actor = typeof getBattleActor === 'function' ? getBattleActor(battle) : Net.getBattleActor?.(battle);
    const me = Player.get();
    if(!actor || actor.tipo !== 'player' || actor.playerId !== me.id) return payload;

    setTimeout(() => {
      const getCurrentBattle = ServiceRegistry?.get?.('gameplay.battle.current');
      const current = typeof getCurrentBattle === 'function' ? getCurrentBattle() : Net.getMyBattle?.();
      if(!current || current.id !== battle.id || current.estado !== 'activo') return;
      const combatAction = ServiceRegistry?.get?.('gameplay.combat.action');
      if(typeof combatAction === 'function') combatAction(current.id, me.id, 'atacar', null);
      else Net.sendBattleAction(current.id, me.id, 'atacar', null);
    }, 140);

    return payload;
  }

  function _finishNightmare() {
    const fromNodeId = state.fromNodeId;
    const dir = state.dir;

    Out.sp();
    Out.sep('═');
    Out.line('✦ EL REINO PESADILLA SE DESVANECE', 't-eco', true);
    Out.line('La frontera vuelve a estabilizarse.', 't-dim');
    Out.sep('═');

    state.activa = false;
    state.runId = null;

    const dest = World.expandSection(fromNodeId, dir);
    if(!dest) {
      Out.line('No se pudo crear la nueva sección.', 't-pel');
      return;
    }
    const enterNode = ServiceRegistry?.get?.('gameplay.enter_node');
    if(typeof enterNode === 'function') {
      enterNode(dest, { tick:1, showLook:true, saveAfter:true, grantXP:true });
    } else {
      Player.setPos(dest);
      Clock.tick(1);
      EventBus.emit('player:tick', { player: Player.get() });
      World.visit(dest);
      const look = ServiceRegistry?.get?.('gameplay.look');
      if(typeof look === 'function') look();
      save();
    }
  }

  function _onCommandBefore(payload) {
    if(!payload) return payload;

    if(state.activa) {
      const allowed = new Set(['atacar', 'atk', 'a', 'defender', 'd', 'magia', 'habilidad', 'estado', 'stats', 'examinar', 'ex', 'batalla', 'b', 'huir', 'h']);
      if(!allowed.has(payload.verb)) {
        Out.line('El Reino Pesadilla te mantiene atrapado. Sobrevive al combate.', 't-cor');
        payload.cancelled = true;
      }
      return payload;
    }

    if(!_isMoveVerb(payload.verb)) return payload;

    const dir = _resolveDir(payload.verb, payload.args || []);
    if(!dir || !['norte', 'sur', 'este', 'oeste'].includes(dir)) return payload;

    const fromNodeId = Player.pos();
    const exits = World.exits(fromNodeId);
    if(exits?.[dir]) return payload;
    if(!World.isBorder(fromNodeId)) return payload;

    if(_currentDifficulty() < DIFICULTAD_MIN) return payload;
    if(!U.chance(CHANCE)) return payload;

    payload.cancelled = true;
    _startNightmare(fromNodeId, dir);
    return payload;
  }

  return {
    id: PLUGIN_ID,
    nombre: 'Reino Pesadilla',
    version: '1.0.0',
    descripcion: 'En dificultad ×5+ la expansión de frontera puede requerir una gauntlet automática de 8 pesadillas.',
    hooks: {
      'command:before': {
        priority: 2,
        fn(payload) {
          return _onCommandBefore(payload);
        }
      },
      'combat:start': {
        fn(payload) {
          return _autoPlayTurn(payload);
        }
      },
      'combat:after_damage_apply': {
        fn(payload) {
          return _autoPlayTurn(payload);
        }
      },
      'combat:enemy_turn_announce': {
        fn(payload) {
          return _autoPlayTurn(payload);
        }
      },
      'combat:enemy_defeat': {
        priority: 20,
        fn(payload) {
          return _onEnemyDefeat(payload);
        }
      },
      'player:die': {
        fn(payload) {
          if(state.activa) {
            state.activa = false;
            state.runId = null;
            state.vencidos = 0;
          }
          return payload;
        }
      }
    }
  };
})();
