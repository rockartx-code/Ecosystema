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
  function _playerCombatStats(p = _player()) {
    const fn = _svc('runtime.player.combat_stats');
    const stats = typeof fn === 'function' ? (fn() || {}) : {};
    return {
      atk: Math.max(1, Math.floor(stats.atk || p?.atk || 1)),
      def: Math.max(0, Math.floor(stats.def || p?.def || 0)),
    };
  }
  function _worldNode(nodeId) {
    const fn = _svc('runtime.world.node');
    return typeof fn === 'function' ? fn(nodeId) : null;
  }
  function _worldExits(nodeId) {
    const fn = _svc('runtime.world.exits');
    return typeof fn === 'function' ? (fn(nodeId) || {}) : {};
  }
  function _worldExpandSection(fromNodeId, dir) {
    const fn = _svc('runtime.world.expand_section');
    return typeof fn === 'function' ? fn(fromNodeId, dir) : null;
  }
  function _worldIsBorder(nodeId) {
    const fn = _svc('runtime.world.is_border');
    return typeof fn === 'function' ? !!fn(nodeId) : false;
  }
  function _worldVisit(nodeId) {
    const fn = _svc('runtime.world.visit');
    return typeof fn === 'function' ? !!fn(nodeId) : false;
  }
  function _clockTick(delta=1) {
    const fn = _svc('runtime.clock.tick');
    return typeof fn === 'function' ? !!fn(delta) : false;
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

  function _currentDifficulty() {
    const node = _worldNode(_playerPos());
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

    _sp();
    _sep('═');
    _line('☾ REINO PESADILLA', 't-cor', true);
    _line('La frontera se retuerce y te arrastra a un nodo de pesadilla.', 't-pel');
    _line(`Debes derrotar ${TOTAL_MONSTRUOS} monstruos seguidos para abrir la nueva sección.`, 't-dim');
    _sep('═');
    _sp();

    setTimeout(() => _spawnNextNightmare(), 180);
  }

  function _buildNightmareEnemy(index) {
    const p = _player();
    const stats = _playerCombatStats(p);
    const baseHp = Math.max(18, Math.floor((p.maxHp || p.hp || 20) * 1.5));
    const baseAtk = Math.max(2, Math.floor((stats.atk || p.atk || 6) * 1.5));
    const baseDef = Math.max(1, Math.floor((stats.def || p.def || 2) * 1.5));

    const statBoost = U.pick(['hp', 'atk', 'def'], U.rng(`${state.runId}:${index}`));
    let hp = baseHp;
    let atk = baseAtk;
    let def = baseDef;

    if(statBoost === 'hp') hp = Math.max(hp, Math.floor((p.maxHp || p.hp || 20) * 3));
    if(statBoost === 'atk') atk = Math.max(atk, Math.floor((stats.atk || p.atk || 6) * 3));
    if(statBoost === 'def') def = Math.max(def, Math.floor((stats.def || p.def || 2) * 3));

    return {
      tipo: 'enemy',
      id: `pesadilla_${state.runId}_${index}`,
      name: `Pesadilla ${index}`,
      hp,
      maxHp: hp,
      atk,
      def,
      vivo: true,
      nodeId: _playerPos(),
      tags: ['pesadilla', 'abismo', 'corrupto'],
      es_pesadilla: true,
      pesadilla_run_id: state.runId,
      pesadilla_boost: statBoost,
    };
  }

  function _spawnNextNightmare() {
    if(!state.activa || state.vencidos >= TOTAL_MONSTRUOS) return;
    const getCurrentBattle = _svc('runtime.battle.current');
    if(typeof getCurrentBattle === 'function' && getCurrentBattle()) return;

    const idx = state.vencidos + 1;
    const p = _player();
    const stats = _playerCombatStats(p);
    const enemy = _buildNightmareEnemy(idx);

    _line(`☠ Oleada ${idx}/${TOTAL_MONSTRUOS}: ${enemy.name} [boost ${enemy.pesadilla_boost.toUpperCase()}]`, 't-cor', true);

    const startBattle = _svc('runtime.battle.start');
    const actors = [
      {
        tipo: 'player',
        id: p.id,
        name: p.name,
        hp: p.hp,
        maxHp: p.maxHp,
        atk: stats.atk,
        def: stats.def,
        vivo: true,
        nodeId: _playerPos(),
        playerId: p.id,
      },
      enemy,
    ];
    if(typeof startBattle === 'function') startBattle(_playerPos(), actors);
    else _line('Servicio runtime.battle.start no disponible para Reino Pesadilla.', 't-dim');
  }

  function _onEnemyDefeat(payload) {
    const enemy = payload?.enemy;
    if(!state.activa || !enemy?.es_pesadilla || enemy?.pesadilla_run_id !== state.runId) return payload;

    state.vencidos++;
    _line(`✓ Pesadilla derrotada (${state.vencidos}/${TOTAL_MONSTRUOS})`, 't-cra');

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

    const getBattleActor = _svc('runtime.battle.actor');
    const actor = typeof getBattleActor === 'function' ? getBattleActor(battle) : null;
    const me = _player();
    if(!actor || actor.tipo !== 'player' || actor.playerId !== me.id) return payload;

    setTimeout(() => {
      const getCurrentBattle = _svc('runtime.battle.current');
      const current = typeof getCurrentBattle === 'function' ? getCurrentBattle() : null;
      if(!current || current.id !== battle.id || current.estado !== 'activo') return;
      const combatAction = _svc('runtime.battle.action');
      if(typeof combatAction === 'function') combatAction(current.id, me.id, 'atacar', null);
      else _line('Servicio runtime.battle.action no disponible para autoplay en Reino Pesadilla.', 't-dim');
    }, 140);

    return payload;
  }

  function _finishNightmare() {
    const fromNodeId = state.fromNodeId;
    const dir = state.dir;

    _sp();
    _sep('═');
    _line('✦ EL REINO PESADILLA SE DESVANECE', 't-eco', true);
    _line('La frontera vuelve a estabilizarse.', 't-dim');
    _sep('═');

    state.activa = false;
    state.runId = null;

    const dest = _worldExpandSection(fromNodeId, dir);
    if(!dest) {
      _line('No se pudo crear la nueva sección.', 't-pel');
      return;
    }
    const enterNode = _svc('runtime.world.enter_node');
    if(typeof enterNode === 'function') {
      enterNode(dest, { tick:1, showLook:true, saveAfter:true, grantXP:true });
    } else {
      const setPos = _svc('runtime.player.set_position');
      if(typeof setPos === 'function') setPos(dest);
      _clockTick(1);
      EventBus.emit('player:tick', { player: _player() });
      _worldVisit(dest);
      const look = _svc('runtime.world.look');
      if(typeof look === 'function') look();
      _saveGame();
    }
  }

  function _onCommandBefore(payload) {
    if(!payload) return payload;

    if(state.activa) {
      const allowed = new Set(['atacar', 'atk', 'a', 'defender', 'd', 'magia', 'habilidad', 'estado', 'stats', 'examinar', 'ex', 'batalla', 'b', 'huir', 'h']);
      if(!allowed.has(payload.verb)) {
        _line('El Reino Pesadilla te mantiene atrapado. Sobrevive al combate.', 't-cor');
        payload.cancelled = true;
      }
      return payload;
    }

    if(!_isMoveVerb(payload.verb)) return payload;

    const dir = _resolveDir(payload.verb, payload.args || []);
    if(!dir || !['norte', 'sur', 'este', 'oeste'].includes(dir)) return payload;

    const fromNodeId = _playerPos();
    const exits = _worldExits(fromNodeId);
    if(exits?.[dir]) return payload;
    if(!_worldIsBorder(fromNodeId)) return payload;

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
