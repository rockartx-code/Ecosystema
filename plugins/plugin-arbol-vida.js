// ════════════════════════════════════════════════════════════════
// PLUGIN: Árbol de la Vida
// - Añade monstruo Ninfa con escalado dinámico al jugador.
// - Ninfa siempre suelta Semilla de la vida.
// - Comando sembrar para plantar un checkpoint en 10 ciclos.
// - Si el jugador muere con árbol activo: revive en el árbol,
//   se destruye, pierde inventario/equipo y aparece una sombra.
// ════════════════════════════════════════════════════════════════

const pluginArbolVida = (() => {
  const SEMILLA_BP = 'semilla_vida';
  const SEMILLA_NOMBRE = 'Semilla de la vida';
  const NINFA_ID = 'ninfa_guardiana';
  const SOMBRA_ARBOL_ID = 'sombra_arbol_vida';

  const state = {
    planted: [], // [{ nodeId, targetCycle, plantedCycle }]
    trees: [],   // [{ nodeId, grownCycle }]
  };

  function _clone(v) {
    return JSON.parse(JSON.stringify(v));
  }
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
  function _playerRemoveItem(itemId) {
    const fn = _svc('runtime.player.remove_item');
    return typeof fn === 'function' ? !!fn(itemId) : false;
  }
  function _worldNode(nodeId) {
    const fn = _svc('runtime.world.node');
    return typeof fn === 'function' ? fn(nodeId) : null;
  }
  function _clockCurrent() {
    const fn = _svc('runtime.clock.current');
    return typeof fn === 'function' ? (fn() || {}) : {};
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

  function _ensureArrays() {
    if(!Array.isArray(state.planted)) state.planted = [];
    if(!Array.isArray(state.trees)) state.trees = [];
  }

  function _hasTreeInNode(nodeId) {
    return state.trees.some(t => t.nodeId === nodeId);
  }

  function _hasPlantInNode(nodeId) {
    return state.planted.some(p => p.nodeId === nodeId);
  }

  function _bestTree() {
    if(!state.trees.length) return null;
    return [...state.trees].sort((a, b) => (b.grownCycle || 0) - (a.grownCycle || 0))[0] || null;
  }

  function _clearInventoryAndEquipment(player) {
    player.inventory = [];
    player.equipped = {
      casco:null, guantes:null, peto:null, botas:null,
      mano_izquierda:null, mano_derecha:null,
      accesorio_1:null, accesorio_2:null,
      arma:null, armadura:null, reliquia:null, mitico:null,
    };
  }

  function _spawnSombraAt(nodeId, playerSnap) {
    const node = _worldNode(nodeId);
    if(!node) return;

    node.enemies = node.enemies || [];

    const hp = Math.max(20, Math.floor(playerSnap.maxHp || 50));
    const stats = _playerCombatStats();
    const atk = Math.max(1, Math.floor(stats.atk || playerSnap.atk || 6));
    const def = Math.max(0, Math.floor(stats.def || playerSnap.def || 1));

    node.enemies.push({
      id: U.uid(),
      enemigo_id: SOMBRA_ARBOL_ID,
      name: 'Sombra del Árbol de la Vida',
      nombre: 'Sombra del Árbol de la Vida',
      tipo: 'enemy',
      hp,
      hp_current: hp,
      maxHp: hp,
      atk,
      def,
      tags: ['sombra', 'vida', 'residuo'],
      nodeId,
      vivo: true,
      es_sombra_arbol_vida: true,
      sombra_data: {
        player_name: playerSnap.name,
        inventory: _clone(playerSnap.inventory || []),
        equipped: _clone(playerSnap.equipped || {}),
        ciclo: _clockCurrent().cycle || 0,
      },
    });
  }

  function _tickGrowth() {
    _ensureArrays();
    if(!state.planted.length) return;

    const cycle = _clockCurrent().cycle || 0;
    const matured = state.planted.filter(seed => cycle >= (seed.targetCycle || Infinity));
    if(!matured.length) return;

    matured.forEach(seed => {
      if(!_hasTreeInNode(seed.nodeId)) {
        state.trees.push({ nodeId: seed.nodeId, grownCycle: cycle });
        if(_playerPos() === seed.nodeId) {
          _line('🌳 La semilla germina: un Árbol de la Vida emerge.', 't-cra', true);
        }
      }
    });

    state.planted = state.planted.filter(seed => cycle < (seed.targetCycle || Infinity));
  }

  function _cmdSembrar() {
    _ensureArrays();
    const p = _player();
    const nodeId = _playerPos();
    const cycle = _clockCurrent().cycle || 0;

    if(_hasTreeInNode(nodeId)) {
      _line('Ya existe un Árbol de la Vida activo en este nodo.', 't-dim');
      return;
    }

    if(_hasPlantInNode(nodeId)) {
      const seed = state.planted.find(x => x.nodeId === nodeId);
      const turns = Math.max(0, (seed?.targetCycle || cycle) - cycle);
      _line(`Ya hay una semilla plantada aquí. Crece en ${turns} ciclo(s).`, 't-dim');
      return;
    }

    const semilla = p.inventory.find(i => i.blueprint === SEMILLA_BP || (i.nombre || '').toLowerCase() === SEMILLA_NOMBRE.toLowerCase());
    if(!semilla) {
      _line(`Necesitas ${SEMILLA_NOMBRE} para usar "sembrar".`, 't-dim');
      return;
    }

    _playerRemoveItem(semilla.id);
    state.planted.push({
      nodeId,
      plantedCycle: cycle,
      targetCycle: cycle + 10,
    });

    _line('Siembras la Semilla de la vida.', 't-cra', true);
    _line('En 10 ciclos crecerá un Árbol de la Vida en este lugar.', 't-dim');
    _saveGame();
  }

  function _spawnNinfa(payload) {
    const nodeId = payload?.nodeId;
    if(!nodeId || !payload?.enemies) return payload;
    if(!U.chance(0.14)) return payload;

    const player = _player();
    const stats = _playerCombatStats();
    const pAtk = Math.max(1, stats.atk || player?.atk || 1);
    const pDef = Math.max(0, stats.def || player?.def || 0);
    const pHp  = Math.max(20, player?.maxHp || 50);

    const hp = Math.max(12, Math.round(pHp * 1.3));
    const atk = Math.max(2, Math.round(pAtk * 1.3));
    const def = Math.max(1, Math.round(pDef * 1.8));

    payload.enemies.push(EntityRegistry.create('enemy', {
      id: NINFA_ID,
      nombre: 'Ninfa',
      tipo: 'enemy',
      hp,
      hp_current: hp,
      atk,
      def,
      desc: 'Espíritu protector de brotes imposibles.',
      tags: ['vida', 'bosque', 'resonante'],
      nodeId,
      es_ninfa: true,
      vivo: true,
    }));

    return payload;
  }

  function _onNinfaDefeated(payload) {
    if(!payload?.enemy?.es_ninfa) return payload;

    _playerAddItem({
      id: U.uid(),
      blueprint: SEMILLA_BP,
      nombre: SEMILLA_NOMBRE,
      tipo: 'material',
      tags: ['vida', 'semilla', 'resonante'],
      estado: 'nativo',
      desc: 'Semilla que enraiza un Árbol de la Vida como punto de retorno.',
    });

    _line(`La Ninfa deja caer: ${SEMILLA_NOMBRE}.`, 't-cra');
    return payload;
  }

  function _onPlayerDie(payload) {
    _ensureArrays();
    const tree = _bestTree();
    if(!tree) return payload;

    const p = payload.player;
    const deathNode = p.position;
    const snap = _clone({
      name: p.name,
      inventory: p.inventory || [],
      equipped: p.equipped || {},
      maxHp: p.maxHp,
      atk: p.atk,
      def: p.def,
    });

    _spawnSombraAt(deathNode, snap);

    state.trees = state.trees.filter(t => t.nodeId !== tree.nodeId);

    _clearInventoryAndEquipment(p);
    p.hp = p.maxHp;
    p.position = tree.nodeId;

    _sp();
    _sep('═');
    _line('🌳 El Árbol de la Vida absorbe tu muerte.', 't-cra', true);
    _line(`Revives en ${_worldNode(tree.nodeId)?.name || tree.nodeId}.`, 't-cra');
    _line('El árbol se destruye, pierdes inventario y equipo.', 't-pel');
    _line('Una sombra nace en el lugar de tu caída.', 't-cor');
    _sep('═');

    _saveGame();

    return { ...payload, cancelled: true, revivedByLifeTree: true };
  }

  function _onNodeExtra(payload) {
    _ensureArrays();
    const nodeId = payload?.nodeId;
    if(!nodeId) return payload;

    const plant = state.planted.find(p => p.nodeId === nodeId);
    const tree = state.trees.find(t => t.nodeId === nodeId);

    if(plant) {
      const cycle = _clockCurrent().cycle || 0;
      const remain = Math.max(0, (plant.targetCycle || cycle) - cycle);
      payload.lines.push({ text: `🌱 Semilla de vida plantada (crece en ${remain} ciclo(s)).`, color: 't-cra' });
    }
    if(tree) {
      payload.lines.push({ text: '🌳 Árbol de la Vida activo aquí.', color: 't-cra' });
    }
    return payload;
  }

  function _onSave() {
    return _clone(state);
  }

  function _onLoadSave(data) {
    state.planted = Array.isArray(data?.planted) ? data.planted : [];
    state.trees = Array.isArray(data?.trees) ? data.trees : [];
    _ensureArrays();
  }

  return {
    id: 'plugin:arbol_vida',
    nombre: 'Árbol de la Vida',
    version: '1.0.0',
    descripcion: 'Ninfas, semilla de vida, siembra y resurrección por árbol.',

    hooks: {
      'world:request_enemies': {
        priority: 65,
        fn(payload) {
          return _spawnNinfa(payload);
        },
      },

      'world:tick': {
        priority: 55,
        fn(payload) {
          _tickGrowth();
          return payload;
        },
      },

      'combat:enemy_defeat': {
        fn(payload) {
          return _onNinfaDefeated(payload);
        },
      },

      'player:die': {
        priority: 10,
        fn(payload) {
          return _onPlayerDie(payload);
        },
      },

      'render:node_extra': {
        fn(payload) {
          return _onNodeExtra(payload);
        },
      },
    },

    comandos: {
      sembrar: {
        meta: {
          titulo: 'sembrar',
          desc: `Planta una ${SEMILLA_NOMBRE} para crear un Árbol de la Vida (10 ciclos).`,
          uso: ['sembrar'],
        },
        fn() {
          _cmdSembrar();
        },
      },
    },

    onSave: _onSave,
    onLoadSave: _onLoadSave,
  };
})();
