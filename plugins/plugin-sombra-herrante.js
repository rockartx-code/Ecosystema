// ════════════════════════════════════════════════════════════════
// PLUGIN: Sombra del Herrante
// Materializa la última run como un enemigo errante con su inventario.
// ════════════════════════════════════════════════════════════════
const SombraHerrante = (() => {
  const ENEMY_ID = 'sombra_del_herrante';
  const SOMBRA_ASCII = [
    '           .-.',
    '          (   )',
    '           \\ /',
    '      .-"""""""-.',
    '     /  .===.    \\',
    '    /  / 6 6 \\    \\',
    '    |  \\  ^  /    |',
    '    |   `---\'     |',
    '     \\  .___,    /',
    '      `-._____.-\'',
  ];

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
  function _playerCombatStats(p = _player()) {
    const fn = _svc('runtime.player.combat_stats');
    const stats = typeof fn === 'function' ? (fn() || {}) : {};
    return {
      atk: Math.max(1, Math.floor(stats.atk || p?.atk || 1)),
      def: Math.max(0, Math.floor(stats.def || p?.def || 0)),
    };
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
  function _clockCycle() {
    const fn = _svc('runtime.clock.current');
    const current = typeof fn === 'function' ? fn() : null;
    return current?.cycle ?? 0;
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
  function _xpRead() {
    const fn = _svc('runtime.xp.read');
    return typeof fn === 'function' ? (fn() || null) : null;
  }

  function _lastRun() {
    const getRuns = _svc('runtime.memory.runs');
    if(typeof getRuns === 'function') {
      const runs = getRuns() || [];
      return runs.length ? runs[runs.length - 1] : null;
    }
    return null;
  }

  function _findSombra() {
    const nodes = _worldAll();
    for(const [nodeId, node] of Object.entries(nodes)) {
      const enemy = (node.enemies || []).find(e => e?.es_sombra_herrante);
      if(enemy) return { nodeId, node, enemy };
    }
    return null;
  }

  function _spawnFromLastRun(payload) {
    const run = _lastRun();
    const snap = run?.sombra_herrante;
    if(!snap) return payload;
    if(_findSombra()) return payload;

    const nodes = Object.values(_worldAll());
    if(!nodes.length) return payload;

    const spawn = U.pick(nodes, U.rng(`${run.id}:${Date.now()}`));
    spawn.enemies = spawn.enemies || [];

    const hp = Math.max(10, Math.floor(snap.stats?.maxHp || 50));
    const enemy = {
      id: ENEMY_ID,
      name: 'sombra_del_herrante',
      nombre: 'sombra_del_herrante',
      tipo: 'enemy',
      hp,
      hp_current: hp,
      maxHp: hp,
      atk: Math.max(1, Math.floor(snap.stats?.atk || 6)),
      def: Math.max(0, Math.floor(snap.stats?.def || 1)),
      tags: ['sombra', 'eco', 'herrante'],
      nodeId: spawn.id,
      vivo: true,
      es_sombra_herrante: true,
      sombra_data: _clone(snap),
    };

    spawn.enemies.push(enemy);
    return payload;
  }

  function _battleSombra(nodeId, sombra) {
    const getCurrentBattle = _svc('runtime.battle.current');
    if(!sombra || (typeof getCurrentBattle === 'function' && getCurrentBattle())) return;
    const p = _player();
    const stats = _playerCombatStats(p);

    _sp();
    _sep('═');
    SOMBRA_ASCII.forEach(line => _line(line, 't-cor'));
    _line('☠ SOMBRA DEL HERRANTE', 't-cor', true);
    _line(`Te encuentra la run anterior de ${sombra?.sombra_data?.player_name || 'alguien'}.`, 't-dim');
    _line('Si la derrotas, recuperas su inventario completo.', 't-cra');
    _sep('═');

    const startBattle = _svc('runtime.battle.start');
    const actors = [
      {
        tipo: 'player', id: p.id, name: p.name,
        hp: p.hp, maxHp: p.maxHp, atk: stats.atk, def: stats.def,
        nodeId, playerId: p.id, vivo: true,
      },
      {
        tipo: 'enemy',
        id: sombra.id,
        name: sombra.nombre || sombra.name || 'Sombra del Herrante',
        hp: sombra.hp_current || sombra.hp,
        maxHp: sombra.maxHp || sombra.hp,
        atk: sombra.atk,
        def: sombra.def || 0,
        nodeId,
        tags: sombra.tags || ['sombra'],
        vivo: true,
        es_sombra_herrante: true,
        sombra_data: _clone(sombra.sombra_data || {}),
      },
    ];
    if(typeof startBattle === 'function') startBattle(nodeId, actors);
    else _line('Servicio runtime.battle.start no disponible para Sombra del Herrante.', 't-dim');
  }

  function _lootToNode(nodeId, items = []) {
    const node = _worldNode(nodeId);
    if(!node) return 0;
    node.loot = node.loot || [];
    node.loot._items = node.loot._items || [];

    let added = 0;
    items.forEach(raw => {
      if(!raw) return;
      const item = _clone(raw);
      item.id = U.uid();
      node.loot._items.push(item);
      added++;
    });

    return added;
  }

  function _collectRunInventory(snapshot = {}) {
    const inv = Array.isArray(snapshot.inventory) ? snapshot.inventory : [];
    const equip = snapshot.equipped || {};

    const merged = [...inv];
    ['arma', 'armadura', 'reliquia', 'mitico'].forEach(slot => {
      if(equip[slot]) merged.push(equip[slot]);
    });

    const seen = new Set();
    return merged.filter(i => {
      const key = `${i?.id || ''}:${i?.blueprint || ''}:${i?.nombre || ''}`;
      if(!key.trim() || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function _dropSombraLoot(enemy, nodeId) {
    const snap = enemy?.sombra_data || {};
    const items = _collectRunInventory(snap);
    const added = _lootToNode(nodeId, items);

    _sp();
    _line(`La Sombra del Herrante se disipa y deja ${added} objeto(s) de su última run.`, 't-cra', true);
    if(snap?.xp) {
      const ramas = Object.entries(snap.xp?.ramas || {})
        .map(([k, v]) => `${k}:${v?.xp || 0}xp`)
        .join(' · ');
      if(ramas) _line(`Memoria de experiencia: ${ramas}`, 't-mem');
    }
    if(items.length) {
      items.slice(0, 8).forEach(it => _line(`  ▸ ${it.nombre || it.blueprint || 'objeto sin nombre'}`, 't-dim'));
      if(items.length > 8) _line(`  ... y ${items.length - 8} más`, 't-dim');
    }
  }

  function _wander(payload) {
    const found = _findSombra();
    const getCurrentBattle = _svc('runtime.battle.current');
    if(!found || (typeof getCurrentBattle === 'function' && getCurrentBattle())) return payload;

    const exits = _worldExits(found.nodeId);
    const nextId = U.pick(Object.values(exits), U.rng(`${_clockCycle()}:${found.enemy.id}`));
    if(!nextId || !U.chance(0.60)) return payload;

    const fromEnemies = found.node.enemies || [];
    found.node.enemies = fromEnemies.filter(e => e !== found.enemy);

    const toNode = _worldNode(nextId);
    toNode.enemies = toNode.enemies || [];
    found.enemy.nodeId = nextId;
    toNode.enemies.push(found.enemy);

    if(nextId === _playerPos()) {
      setTimeout(() => _battleSombra(nextId, found.enemy), 120);
    }

    return payload;
  }

  function _onNodeEnter(payload) {
    const node = _worldNode(payload.nodeId);
    const sombra = (node?.enemies || []).find(e => e?.es_sombra_herrante);
    if(!sombra) return payload;
    setTimeout(() => _battleSombra(payload.nodeId, sombra), 120);
    return payload;
  }

  function _attachRunSnapshot(payload) {
    if(!payload?.run || !payload?.player) return payload;

    const stats = _playerCombatStats(payload.player);
    const xpState = _xpRead();
    payload.run.sombra_herrante = {
      player_name: payload.player.name,
      run_id: payload.run.id,
      stats: {
        maxHp: payload.player.maxHp,
        atk: stats.atk || Math.max(1, Math.floor(payload.player.atk || 1)),
        def: stats.def || Math.max(0, Math.floor(payload.player.def || 0)),
      },
      inventory: _clone(payload.player.inventory || []),
      equipped: _clone(payload.player.equipped || {}),
      xp: _clone(xpState?.ser || null),
      ciclo: _clockCycle(),
    };

    return payload;
  }

  return {
    spawnFromLastRun: _spawnFromLastRun,
    onNodeEnter: _onNodeEnter,
    onTick: _wander,
    onDefeat: _dropSombraLoot,
    onRunEnd: _attachRunSnapshot,
  };
})();

const pluginSombraHerrante = {
  id: 'plugin:sombra_herrante',
  nombre: 'Sombra del Herrante',
  version: '1.0.0',
  descripcion: 'La última run regresa como un enemigo errante con su inventario completo.',

  hooks: {
    'memory:run_end': {
      fn(payload, ctx) {
        return SombraHerrante.onRunEnd(payload, ctx);
      }
    },

    'world:after_gen': {
      priority: 60,
      fn(payload) {
        return SombraHerrante.spawnFromLastRun(payload);
      }
    },

    'world:node_enter': {
      priority: 35,
      fn(payload) {
        return SombraHerrante.onNodeEnter(payload);
      }
    },

    'world:tick': {
      priority: 70,
      fn(payload) {
        return SombraHerrante.onTick(payload);
      }
    },

    'combat:enemy_defeat': {
      fn(payload) {
        if(!payload?.enemy?.es_sombra_herrante) return payload;
        SombraHerrante.onDefeat(payload.enemy, payload.nodeId);
        return payload;
      }
    },
  },
};
