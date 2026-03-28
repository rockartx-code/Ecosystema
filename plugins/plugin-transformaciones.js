// ════════════════════════════════════════════════════════════════
// PLUGIN TRANSFORMACIONES
//
// Reglas:
//  - Si un enemigo llega a 5HP o menos, puede aparecer al azar el aviso
//    para usar "interiorizar".
//  - "interiorizar" añade 1 punto del tipo de enemigo elegido.
//  - Si el jugador cae por debajo de 5HP, aparece aviso para "transformar".
//  - "transformar" consume TODOS los puntos del tipo elegido y lanza
//    un ataque escalado por la cantidad de puntos.
//  - Al transformar se rompe un equipo equipado al azar.
// ════════════════════════════════════════════════════════════════

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
function _playerRecalcResonances() {
  const fn = _svc('runtime.player.recalc_resonances');
  return typeof fn === 'function' ? !!fn() : false;
}
function _line(text, color='t-out', bold=false) {
  const fn = _svc('runtime.output.line');
  if(typeof fn === 'function') fn(text, color, bold);
}
function _sp() {
  const fn = _svc('runtime.output.sp');
  if(typeof fn === 'function') fn();
}
function _saveGame() {
  const fn = _svc('runtime.game.save');
  if(typeof fn === 'function') fn();
}

function _txData() {
  const p = _player();
  p.ext = p.ext || {};
  p.ext.transformaciones = p.ext.transformaciones || {
    puntos: {},
  };
  return p.ext.transformaciones;
}

function _normTipo(name = '') {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _tipoFromEnemy(enemy) {
  const base = enemy?.arquetipo || enemy?.blueprint || enemy?.tipo_base || enemy?.name || enemy?.nombre || 'desconocido';
  return {
    key: _normTipo(base) || 'desconocido',
    label: String(base || 'Desconocido'),
  };
}

function _findEnemyInteriorizable(battle, q = '') {
  const query = _normTipo(q || '');
  const pool = (battle?.cola || []).filter(e => e?.vivo && e.tipo !== 'player' && (e.hp || 0) <= 5);
  if(!pool.length) return null;
  if(!query) return pool[0];
  const byName = pool.find(e => _normTipo(e.name).includes(query));
  if(byName) return byName;
  return pool.find(e => _tipoFromEnemy(e).key.includes(query)) || null;
}

function _rebuildEquipRefs(eq) {
  eq.arma = eq.mano_derecha || eq.mano_izquierda || null;
  eq.armadura = eq.peto || eq.casco || eq.guantes || eq.botas || null;
}

function _romperEquipoAleatorio() {
  const p = _player();
  const eq = p.equipped || {};
  const slots = [
    'mano_izquierda','mano_derecha','casco','guantes','peto','botas','accesorio_1','accesorio_2','mitico','reliquia',
  ];
  const ocupados = slots.filter(s => eq[s]);
  if(!ocupados.length) return null;

  const slot = ocupados[U.rand(0, ocupados.length - 1)];
  const it = eq[slot];
  eq[slot] = null;
  _rebuildEquipRefs(eq);
  _playerRecalcResonances();
  return { slot, item: it };
}

function _interiorizarEnBatalla(payload) {
  const { battle, actor, arg } = payload;
  if(actor?.tipo !== 'player') {
    battleLog(battle, 'Solo el jugador puede interiorizar.', 't-dim');
    return { handled:true, consumeTurn:false };
  }

  const enemy = _findEnemyInteriorizable(battle, arg);
  if(!enemy) {
    battleLog(battle, 'No hay enemigos en estado interiorizable (≤5HP).', 't-dim');
    return { handled:true, consumeTurn:false };
  }

  battle._txInteriorizados = battle._txInteriorizados || {};
  if(battle._txInteriorizados[enemy.id]) {
    battleLog(battle, `${enemy.name} ya fue interiorizado en esta batalla.`, 't-dim');
    return { handled:true, consumeTurn:false };
  }

  const tx = _txData();
  const tipo = _tipoFromEnemy(enemy);
  tx.puntos[tipo.key] = (tx.puntos[tipo.key] || 0) + 1;

  battle._txInteriorizados[enemy.id] = true;
  battleLog(battle, `🜂 Interiorizas a ${enemy.name}. +1 punto de transformación [${tipo.label}] (total: ${tx.puntos[tipo.key]}).`, 't-mag');
  _xpGanar('mente', 10, `interiorizar ${tipo.label}`);
  _saveGame();

  return { handled:true, consumeTurn:true };
}

function _transformarEnBatalla(payload) {
  const { battle, actor, arg } = payload;
  if(actor?.tipo !== 'player') {
    battleLog(battle, 'Solo el jugador puede transformar.', 't-dim');
    return { handled:true, consumeTurn:false };
  }

  const p = _player();
  const tx = _txData();
  const vivos = battle.cola.filter(c => c.vivo && c.tipo !== 'player');
  if(!vivos.length) {
    battleLog(battle, 'No hay objetivo para transformar.', 't-dim');
    return { handled:true, consumeTurn:false };
  }

  const q = _normTipo(arg || '');
  let entry = null;
  if(q) {
    entry = Object.entries(tx.puntos).find(([k, v]) => v > 0 && k.includes(q));
  }
  if(!entry) {
    entry = Object.entries(tx.puntos)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])[0] || null;
  }

  if(!entry) {
    battleLog(battle, 'No tienes puntos de transformación. Usa "interiorizar" primero.', 't-dim');
    return { handled:true, consumeTurn:false };
  }

  const [tipoKey, puntos] = entry;
  const target = vivos[0];

  const baseAtk = _playerCombatStats().atk || actor.atk || 1;
  const bonus = Math.floor(puntos * 8 + (puntos * puntos * 0.75));
  const dmg = Math.max(1, Math.floor(baseAtk + bonus - (target.def || 0)));

  tx.puntos[tipoKey] = 0;
  target.hp = Math.max(0, target.hp - dmg);

  battleLog(battle, `✶ ${actor.name} transforma el vínculo [${tipoKey}] y desata un golpe interior: −${dmg}HP (${puntos} punto${puntos>1?'s':''}).`, 't-cor');
  if(target.hp <= 0) {
    target.vivo = false;
    battleLog(battle, `${target.name} cae.`, 't-cor');
  }

  const roto = _romperEquipoAleatorio();
  if(roto?.item) {
    battleLog(battle, `⚠ La transformación quiebra tu equipo: ${roto.item.nombre || roto.item.blueprint || 'objeto'} (${roto.slot}).`, 't-pel');
  } else {
    battleLog(battle, '⚠ La transformación intenta romper equipo, pero no llevas nada equipado.', 't-dim');
  }

  _xpGanar('combate', Math.ceil(dmg / 2), 'transformación');
  _saveGame();

  return { handled:true, consumeTurn:true };
}

function _xpGanar(attr, amount, reason) {
  const gain = _svc('runtime.xp.gain');
  if(typeof gain === 'function') return !!gain(attr, amount, reason);
  return false;
}

const pluginTransformaciones = {
  id: 'plugin:transformaciones',
  nombre: 'Sistema de Transformaciones',
  version: '1.0.0',
  descripcion: 'Interiorizar enemigos debilitados y transformar el vínculo en un ataque devastador.',

  hooks: {
    'player:create': {
      fn(payload) {
        payload.player.ext = payload.player.ext || {};
        payload.player.ext.transformaciones = payload.player.ext.transformaciones || { puntos:{} };
        return payload;
      },
    },

    'combat:after_damage_apply': {
      fn(payload) {
        const { battle, target } = payload;
        if(!battle || !target) return payload;

        if(target.tipo !== 'player' && target.vivo && (target.hp || 0) <= 5) {
          battle._txAvisadoEnemy = battle._txAvisadoEnemy || {};
          if(!battle._txAvisadoEnemy[target.id] && U.chance(0.5)) {
            battle._txAvisadoEnemy[target.id] = true;
            battleLog(battle, 'sientes el vínculo usa el comando interiorizar', 't-mag');
          }
        }

        const player = _player();
        const playerActor = battle.cola.find(c => c.tipo === 'player' && c.playerId === player?.id);
        const hpPlayer = playerActor?.hp ?? player?.hp;
        if(hpPlayer < 5 && !battle._txAvisadoLowHp) {
          battle._txAvisadoLowHp = true;
          battleLog(battle, 'el vínculo se siente presente usa el commandos transformar', 't-cor');
        }

        return payload;
      },
    },

    'combat:player_action': {
      fn(payload) {
        if(payload.verb === 'interiorizar') {
          const r = _interiorizarEnBatalla(payload);
          payload.handled = true;
          payload.consumeTurn = r.consumeTurn;
          return payload;
        }
        if(payload.verb === 'transformar') {
          const r = _transformarEnBatalla(payload);
          payload.handled = true;
          payload.consumeTurn = r.consumeTurn;
          return payload;
        }
        return payload;
      },
    },
  },

  comandos: {
    'transformaciones': {
      fn: () => {
        const tx = _txData();
        const list = Object.entries(tx.puntos || {}).filter(([,v]) => v > 0);
        _sp();
        _line('— TRANSFORMACIONES —', 't-mag');
        if(!list.length) {
          _line('Sin puntos. Debilita enemigos (≤5HP) e interioriza en batalla.', 't-dim');
          _sp();
          return;
        }
        list.sort((a,b) => b[1] - a[1]).forEach(([k,v]) => _line(`  ${k}: ${v}`, 't-mag'));
        _sp();
      },
      meta: {
        titulo: 'transformaciones',
        color: 't-mag',
        desc: 'Muestra puntos de transformación acumulados por tipo.',
      },
    },
  },
};
