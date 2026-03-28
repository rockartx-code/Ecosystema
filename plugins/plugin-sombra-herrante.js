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

  function _lastRun() {
    if(typeof RunMem === 'undefined') return null;
    const runs = RunMem.runs?.() || [];
    return runs.length ? runs[runs.length - 1] : null;
  }

  function _findSombra() {
    const nodes = World.all?.() || {};
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

    const nodes = Object.values(World.all?.() || {});
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
    const getCurrentBattle = ServiceRegistry?.get?.('gameplay.battle.current');
    if(!sombra || (typeof getCurrentBattle === 'function' && getCurrentBattle())) return;
    const p = Player.get();

    Out.sp();
    Out.sep('═');
    SOMBRA_ASCII.forEach(line => Out.line(line, 't-cor'));
    Out.line('☠ SOMBRA DEL HERRANTE', 't-cor', true);
    Out.line(`Te encuentra la run anterior de ${sombra?.sombra_data?.player_name || 'alguien'}.`, 't-dim');
    Out.line('Si la derrotas, recuperas su inventario completo.', 't-cra');
    Out.sep('═');

    const startBattle = ServiceRegistry?.get?.('gameplay.battle.start');
    const actors = [
      {
        tipo: 'player', id: p.id, name: p.name,
        hp: p.hp, maxHp: p.maxHp, atk: Player.getAtk(), def: Player.getDef(),
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
    else Out.line('Servicio gameplay.battle.start no disponible para Sombra del Herrante.', 't-dim');
  }

  function _lootToNode(nodeId, items = []) {
    const node = World.node(nodeId);
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

    Out.sp();
    Out.line(`La Sombra del Herrante se disipa y deja ${added} objeto(s) de su última run.`, 't-cra', true);
    if(snap?.xp) {
      const ramas = Object.entries(snap.xp?.ramas || {})
        .map(([k, v]) => `${k}:${v?.xp || 0}xp`)
        .join(' · ');
      if(ramas) Out.line(`Memoria de experiencia: ${ramas}`, 't-mem');
    }
    if(items.length) {
      items.slice(0, 8).forEach(it => Out.line(`  ▸ ${it.nombre || it.blueprint || 'objeto sin nombre'}`, 't-dim'));
      if(items.length > 8) Out.line(`  … y ${items.length - 8} más`, 't-dim');
    }
  }

  function _wander(payload) {
    const found = _findSombra();
    const getCurrentBattle = ServiceRegistry?.get?.('gameplay.battle.current');
    if(!found || (typeof getCurrentBattle === 'function' && getCurrentBattle())) return payload;

    const exits = World.exits(found.nodeId);
    const nextId = U.pick(Object.values(exits), U.rng(`${Clock.cycle}:${found.enemy.id}`));
    if(!nextId || !U.chance(0.60)) return payload;

    const fromEnemies = found.node.enemies || [];
    found.node.enemies = fromEnemies.filter(e => e !== found.enemy);

    const toNode = World.node(nextId);
    toNode.enemies = toNode.enemies || [];
    found.enemy.nodeId = nextId;
    toNode.enemies.push(found.enemy);

    if(nextId === Player.pos()) {
      setTimeout(() => _battleSombra(nextId, found.enemy), 120);
    }

    return payload;
  }

  function _onNodeEnter(payload) {
    const node = World.node(payload.nodeId);
    const sombra = (node?.enemies || []).find(e => e?.es_sombra_herrante);
    if(!sombra) return payload;
    setTimeout(() => _battleSombra(payload.nodeId, sombra), 120);
    return payload;
  }

  function _attachRunSnapshot(payload, ctx) {
    if(!payload?.run || !payload?.player) return payload;

    payload.run.sombra_herrante = {
      player_name: payload.player.name,
      run_id: payload.run.id,
      stats: {
        maxHp: payload.player.maxHp,
        atk: Math.max(1, Math.floor(ctx?.Player?.getAtk?.() || payload.player.atk || 1)),
        def: Math.max(0, Math.floor(ctx?.Player?.getDef?.() || payload.player.def || 0)),
      },
      inventory: _clone(payload.player.inventory || []),
      equipped: _clone(payload.player.equipped || {}),
      xp: _clone(ctx?.XP?.ser?.() || null),
      ciclo: Clock.cycle,
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
