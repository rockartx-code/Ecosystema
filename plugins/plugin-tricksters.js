// ════════════════════════════════════════════════════════════════
// PLUGIN: Tricksters v1.0
// Seres caóticos que aparecen al azar según la suerte del jugador.
// ════════════════════════════════════════════════════════════════
const TricksterSystem = (() => {
  const TRICKSTER_ASCII = [
    "      .-\"\"\"\"-.",
    "    .'  .--.  `.",
    "   /   (o  o)   \\",
    "  |   .-`--'-.   |",
    "  |  /  /\\_/\\ \\  |",
    "   \\  \\ \\___/ /  /",
    "    `._`-.__.-'_.`",
    "       `--..--'",
  ];

  const ESTADOS = ['ARDIENDO', 'MOJADO', 'ELECTRIZADO', 'CONGELADO', 'RESONANTE', 'VACÍO'];

  const TRICKSTERS = [
    {
      id: 'saqueador_eterno',
      nombre: 'Saqueador Eterno',
      desc: 'Cada golpe que recibe transforma el caos en loot para ti.',
      hp: 999,
      atk: 18,
      def: 30,
      tags: ['trickster', 'caos', 'tesoro'],
      danoFijo: true,
      lootPorGolpe: true,
      escapeCadaTurno: true,
      poolLoot: ['fragmento_eco', 'resina_viva', 'polvo_resonante', 'núcleo_vacío', 'gema_táctica'],
    },
    {
      id: 'kamikaze_reliquia',
      nombre: 'Kamikaze de Reliquia',
      desc: 'Explota en su turno, se autodestruye y deja un ítem raro.',
      hp: 999,
      atk: 8,
      def: 30,
      tags: ['trickster', 'explosivo', 'raro'],
      explota: true,
      dañoExplosion: 30,
      lootRaro: 'núcleo_kamikaze_legendario',
    },
    {
      id: 'hechicero_del_desfase',
      nombre: 'Hechicero del Desfase',
      desc: 'Cada turno altera estados y suelta una magia aleatoria.',
      hp: 999,
      atk: 12,
      def: 30,
      tags: ['trickster', 'mago', 'caótico'],
      estadoPorTurno: true,
      lootMagiaPorTurno: true,
      poolMagias: ['magia_chispa_caotica', 'magia_escarcha_errante', 'magia_eco_abismal', 'magia_fulgor_null'],
      escapeCadaTurno: true,
    },
    {
      id: 'espejo_ladron',
      nombre: 'Espejo Ladrón',
      desc: 'Refleja el daño y deja fragmentos de duplicación.',
      hp: 999,
      atk: 14,
      def: 30,
      tags: ['trickster', 'reflejo', 'engaño'],
      dañoReflejadoPct: 0.25,
      lootPorGolpe: true,
      poolLoot: ['fragmento_espejo', 'sello_duplicidad', 'lente_quebrada'],
      escapeCadaTurno: true,
    },
    {
      id: 'parca_del_trueque',
      nombre: 'Parca del Trueque',
      desc: 'Intercambia dolor por recursos y puede fugarse entre sombras.',
      hp: 999,
      atk: 20,
      def: 30,
      tags: ['trickster', 'trueque', 'sombra'],
      drenajeStamina: 20,
      lootPorGolpe: true,
      poolLoot: ['ficha_trueque', 'ancla_sombría', 'token_parca'],
      escapeCadaTurno: true,
    },
  ];

  function _svc(name) {
    return (typeof ServiceRegistry !== 'undefined' && typeof ServiceRegistry.get === 'function')
      ? ServiceRegistry.get(name)
      : null;
  }
  function _player() {
    const fn = _svc('runtime.player.current');
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

  function _chanceAparicion() {
    const suerte = _player()?.suerte || 0;
    return Math.min(0.75, 0.06 + suerte * 0.03);
  }

  function _crearItem(blueprint, tipo = 'material', tags = []) {
    return {
      id: U.uid(),
      blueprint,
      nombre: blueprint.replace(/_/g, ' '),
      tipo,
      tags,
      estado: 'trickster_drop',
      desc: `Drop de trickster (${blueprint}).`,
    };
  }

  function _darLootAleatorio(pool, tipo = 'material', tags = ['trickster']) {
    if(!Array.isArray(pool) || !pool.length) return null;
    const blueprint = U.pick(pool, U.rng(Date.now() + Math.random()));
    const item = _crearItem(blueprint, tipo, tags);
    _playerAddItem(item);
    return item;
  }

  function _spawnEnNodo(nodeId) {
    const def = U.pick(TRICKSTERS, U.rng(Date.now() + nodeId));
    const p = _player();
    const stats = _playerCombatStats();

    _sp();
    _sep('═');
    TRICKSTER_ASCII.forEach(line => _line(line, 't-mag'));
    _line(`✶ TRICKSTER — ${def.nombre}`, 't-mag', true);
    _line(def.desc, 't-dim');
    _line(`HP:${def.hp}  DEF:${def.def}  (Aparece con suerte alta)`, 't-mag');
    _sep('═');
    _sp();

    const startBattle = _svc('runtime.battle.start');
    const actors = [
      {
        tipo: 'player', id: p.id, name: p.name,
        hp: p.hp, maxHp: p.maxHp, atk: stats.atk || p.atk || 0, def: stats.def || p.def || 0,
        nodeId, playerId: p.id, vivo: true,
      },
      {
        tipo: 'enemy',
        id: U.uid(),
        name: def.nombre,
        hp: def.hp,
        maxHp: def.hp,
        atk: def.atk,
        def: def.def,
        vivo: true,
        nodeId,
        tags: def.tags,
        es_trickster: true,
        trickster: { ...def },
      },
    ];
    if(typeof startBattle === 'function') startBattle(nodeId, actors);
    else _line('Servicio runtime.battle.start no disponible para Tricksters.', 't-dim');
  }

  function _tryEscape(actor, battle) {
    if(!actor?.trickster?.escapeCadaTurno) return false;
    if(U.chance(0.30)) {
      actor.vivo = false;
      actor.huyó = true;
      battleLog(battle, `💨 ${actor.name} escapa entre distorsiones (30%).`, 't-mem');
      return true;
    }
    battleLog(battle, `${actor.name} intenta escapar, pero falla.`, 't-dim');
    return false;
  }

  function _aplicarEfectoTurno(actor, battle) {
    const cfg = actor.trickster || {};
    const players = battle.cola.filter(c => c.vivo && c.tipo === 'player');
    const target = players[0];
    if(!target) return;

    if(cfg.explota) {
      actor.hp = 0;
      actor.vivo = false;
      const dmg = cfg.dañoExplosion || 30;
      target.hp = Math.max(0, target.hp - dmg);
      const player = _player();
      if(target.playerId === player?.id) player.hp = target.hp;
      battleLog(battle, `💥 ${actor.name} explota y causa ${dmg} de daño.`, 't-cor');
      const raro = _crearItem(cfg.lootRaro || 'reliquia_trickster_rara', 'mítico', ['trickster', 'raro']);
      _playerAddItem(raro);
      battleLog(battle, `🎁 Loot raro: ${raro.nombre}.`, 't-cor');
      if(target.hp <= 0) {
        target.vivo = false;
        battleLog(battle, `${target.name} cae.`, 't-cor');
      }
      return;
    }

    if(cfg.estadoPorTurno) {
      const est = U.pick(ESTADOS, U.rng(Date.now() + actor.id));
      target.elemento_estado = est;
      battleLog(battle, `☣ ${actor.name} aplica estado ${est} a ${target.name}.`, 't-mag');
    }

    if(cfg.lootMagiaPorTurno) {
      const mag = _darLootAleatorio(cfg.poolMagias || [], 'magia', ['trickster', 'magia']);
      if(mag) battleLog(battle, `📜 Loot mágico: ${mag.nombre}.`, 't-mag');
    }

    const player = _player();
    if(cfg.drenajeStamina && target.playerId === player?.id) {
      const p = player;
      p.stamina = Math.max(0, (p.stamina || 100) - cfg.drenajeStamina);
      battleLog(battle, `🕳 ${actor.name} drena ${cfg.drenajeStamina} de stamina.`, 't-pel');
    }

    const dmg = Math.max(1, (actor.atk || 8) - (target.def || 0));
    target.hp = Math.max(0, target.hp - dmg);
    if(target.playerId === player?.id) player.hp = target.hp;
    battleLog(battle, `${actor.name} → ${target.name}  −${dmg}HP`, 't-pel');
    if(target.hp <= 0) {
      target.vivo = false;
      battleLog(battle, `${target.name} cae.`, 't-cor');
    }
  }

  function _onGolpeTrickster(payload) {
    const { actor, target, battle, dmg } = payload;
    if(!target?.es_trickster || actor?.tipo !== 'player') return payload;

    const cfg = target.trickster || {};

    if(cfg.lootPorGolpe) {
      const item = _darLootAleatorio(cfg.poolLoot || ['esquirla_trickster'], 'material', ['trickster', 'loot']);
      if(item) battleLog(battle, `🎁 ${target.name} suelta ${item.nombre} al ser golpeado.`, 't-cra');
    }

    const player = _player();
    if(cfg.dañoReflejadoPct && actor.playerId === player?.id) {
      const reflejo = Math.max(1, Math.floor(dmg * cfg.dañoReflejadoPct));
      const p = player;
      p.hp = Math.max(0, p.hp - reflejo);
      actor.hp = p.hp;
      battleLog(battle, `🪞 Reflejo: recibes ${reflejo} de daño.`, 't-pel');
      if(actor.hp <= 0) {
        actor.vivo = false;
        battleLog(battle, `${actor.name} cae por el reflejo.`, 't-cor');
      }
    }

    return payload;
  }

  function cmdTricksters() {
    _sp();
    _line('— TRICKSTERS DISPONIBLES —', 't-mag', true);
    TRICKSTERS.forEach(t => {
      _line(`✶ ${t.nombre}  HP:${t.hp} DEF:${t.def}`, 't-mag');
      _line(`   ${t.desc}`, 't-dim');
    });
    _line(`Chance actual de aparición: ${(100 * _chanceAparicion()).toFixed(0)}%`, 't-cra');
    _sp();
  }

  return {
    chance: _chanceAparicion,
    spawn: _spawnEnNodo,
    onGolpe: _onGolpeTrickster,
    tryEscape: _tryEscape,
    aplicarTurno: _aplicarEfectoTurno,
    cmdTricksters,
  };
})();

const pluginTricksters = {
  id: 'plugin:tricksters',
  nombre: 'Tricksters Aleatorios',
  version: '1.0.0',
  descripcion: 'Seres trickster que aparecen por suerte y rompen reglas del combate.',

  hooks: {
    'world:node_enter': {
      fn(payload) {
        const { nodeId } = payload;
        const getCurrentBattle = _svc('runtime.battle.current');
        if(typeof getCurrentBattle === 'function' && getCurrentBattle()) return payload;
        if(Math.random() > TricksterSystem.chance()) return payload;
        setTimeout(() => TricksterSystem.spawn(nodeId), 180);
        return payload;
      }
    },

    'combat:before_damage_apply': {
      fn(payload) {
        const target = payload?.target;
        if(target?.es_trickster && target?.trickster?.danoFijo) {
          payload.dmg = 1;
        }
        return payload;
      },
    },

    'combat:after_damage_apply': {
      fn(payload) {
        return TricksterSystem.onGolpe(payload);
      }
    },

    'combat:resolve_ia': {
      priority: 10,
      fn(payload) {
        const { actor, battle } = payload;
        if(!actor?.es_trickster) return payload;

        if(TricksterSystem.tryEscape(actor, battle)) {
          payload.handled = true;
          payload.cancelled = true;
          return payload;
        }

        TricksterSystem.aplicarTurno(actor, battle);
        payload.handled = true;
        payload.cancelled = true;
        return payload;
      }
    },
  },

  comandos: {
    'tricksters': {
      fn: () => TricksterSystem.cmdTricksters(),
      meta: {
        titulo: 'tricksters',
        color: 't-mag',
        desc: 'Lista los tricksters activos del plugin y su mecánica.',
      },
    },
  },
};
