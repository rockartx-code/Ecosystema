// ════════════════════════════════════════════════════════════════
// PLUGIN: Guaridas
// Marca refugios aleatorios, habilita modo refugio y cofre persistente.
// ════════════════════════════════════════════════════════════════
const pluginGuarida = (() => {
  const PLUGIN_ID = 'plugin:guarida';

  function _clone(v) {
    return JSON.parse(JSON.stringify(v));
  }
  function _svc(name) {
    return (typeof ServiceRegistry !== 'undefined' && typeof ServiceRegistry.get === 'function')
      ? ServiceRegistry.get(name)
      : null;
  }

  function _getChest() {
    const getData = _svc('runtime.memory.data.get');
    const setData = _svc('runtime.memory.data.set');
    if(typeof getData === 'function' && typeof setData === 'function') {
      const data = getData() || {};
      if(!Array.isArray(data.refugio_cofre)) data.refugio_cofre = [];
      setData(data);
      return data.refugio_cofre;
    }
    return [];
  }

  function _saveChest() {
    const saveMem = _svc('runtime.memory.save');
    if(typeof saveMem === 'function') { saveMem(); return; }
  }

  function _inRefuge() {
    return !!Player.get()?.ext?.guarida?.enRefugio;
  }

  function _setRefugeMode(v) {
    const p = Player.get();
    p.ext = p.ext || {};
    p.ext.guarida = p.ext.guarida || {};
    p.ext.guarida.enRefugio = !!v;
  }

  function _currentNode() {
    return World.node(Player.pos());
  }

  function _isLair(node) {
    return !!node?.es_guarida;
  }

  function _formatItem(it) {
    if(!it) return 'objeto_desconocido';
    return it.nombre || it.blueprint || it.id || 'objeto_desconocido';
  }

  function _parseQty(raw) {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  function _markRandomLairs(nodesMap, salt = 'base') {
    const nodes = Object.values(nodesMap || {});
    if(!nodes.length) return 0;

    const rng = U.rng(`${World.seed}:guarida:${salt}:${nodes.length}`);
    const candidates = nodes.filter(n => n && n.tipo !== 'abismo');
    const target = Math.max(1, Math.floor(candidates.length * 0.12));

    let added = 0;
    const shuffled = [...candidates].sort(() => rng() - 0.5);
    for(const node of shuffled) {
      if(added >= target) break;
      if(node.es_guarida) continue;
      node.es_guarida = true;
      node.guarida_id = node.guarida_id || U.hex(`${node.id}:guarida`);
      added++;
    }

    return added;
  }

  function _onNodeEnter(payload) {
    if(!_isLair(payload?.node)) {
      if(_inRefuge()) {
        _setRefugeMode(false);
        Out.line('Sales del modo refugio al abandonar la guarida.', 't-dim');
      }
      return payload;
    }

    Out.sp();
    Out.line('Este es un lugar apropiado para descansar.', 't-eco', true);
    Out.line('Escribe "refugio" para entrar al modo refugio.', 't-dim');
    return payload;
  }

  function _onCommandBefore(payload) {
    if(!_inRefuge()) return payload;

    const allow = new Set(['cofre', 'descansar', 'refugio']);
    if(allow.has(payload.verb)) return payload;

    Out.line('Estás en modo refugio. Solo puedes usar: cofre, descansar o refugio.', 't-dim');
    payload.cancelled = true;
    return payload;
  }

  function _cmdRefugio() {
    const node = _currentNode();
    if(!_isLair(node)) {
      Out.line('Solo puedes usar "refugio" dentro de una guarida.', 't-dim');
      return;
    }

    if(_inRefuge()) {
      _setRefugeMode(false);
      Out.line('Sales del modo refugio.', 't-dim');
      return;
    }

    _setRefugeMode(true);
    Out.sp();
    Out.sep('─');
    Out.line('MODO REFUGIO ACTIVO', 't-acc', true);
    Out.line('Comandos disponibles: cofre · descansar · refugio', 't-dim');
    Out.sep('─');
    Out.sp();
  }

  function _cmdDescansar() {
    if(!_inRefuge()) {
      Out.line('Debes entrar en modo refugio con "refugio".', 't-dim');
      return;
    }

    const p = Player.get();
    p.hp = p.maxHp || p.hp;
    p.mana = p.maxMana || p.mana || 0;
    if(p.maxStamina != null) p.stamina = p.maxStamina;
    p.heridas = [];
    p.elemento_estado = null;
    p.veneno_stacks = 0;
    p.silenciado = false;
    p._silencio_turnos = 0;

    Clock.tick(1);
    Out.line('Descansas plenamente: HP, Maná y estados alterados restaurados.', 't-cra');
    refreshStatus();
    save();
  }

  function _cmdCofre(args = []) {
    if(!_inRefuge()) {
      Out.line('Debes entrar en modo refugio con "refugio" para usar el cofre.', 't-dim');
      return;
    }

    const chest = _getChest();
    const sub = (args[0] || 'listar').toLowerCase();

    if(['listar', 'ver', 'ls'].includes(sub)) {
      Out.line(`Cofre compartido: ${chest.length} objeto(s).`, 't-mem');
      if(!chest.length) {
        Out.line('El cofre está vacío.', 't-dim');
      } else {
        chest.slice(0, 20).forEach(it => Out.line(`  ▸ ${_formatItem(it)}`, 't-dim'));
        if(chest.length > 20) Out.line(`  … y ${chest.length - 20} más`, 't-dim');
      }
      Out.line('Uso: cofre guardar <item> [cantidad] · cofre retirar <item> [cantidad]', 't-dim');
      return;
    }

    if(sub === 'guardar') {
      const query = (args[1] || '').trim();
      const qty = _parseQty(args[2]);
      if(!query) {
        Out.line('Uso: cofre guardar <item> [cantidad]', 't-dim');
        return;
      }

      const p = Player.get();
      const q = query.toLowerCase().replace(/_/g, ' ');
      const matches = (p.inventory || []).filter(i => {
        const name = (i.nombre || i.blueprint || '').toLowerCase();
        return name.includes(q) || i.id === query;
      });

      if(!matches.length) {
        Out.line(`No tienes "${query}" en el inventario.`, 't-dim');
        return;
      }

      const toMove = matches.slice(0, qty);
      toMove.forEach(it => {
        Player.rmItem(it.id);
        chest.push(_clone(it));
      });
      _saveChest();

      Out.line(`Guardaste ${toMove.length} objeto(s) en el cofre compartido.`, 't-cra');
      save();
      return;
    }

    if(sub === 'retirar') {
      const query = (args[1] || '').trim();
      const qty = _parseQty(args[2]);
      if(!query) {
        Out.line('Uso: cofre retirar <item> [cantidad]', 't-dim');
        return;
      }

      const q = query.toLowerCase().replace(/_/g, ' ');
      const idxs = [];
      for(let i = 0; i < chest.length; i++) {
        const it = chest[i];
        const name = (it.nombre || it.blueprint || '').toLowerCase();
        if(name.includes(q) || it.id === query) idxs.push(i);
        if(idxs.length >= qty) break;
      }

      if(!idxs.length) {
        Out.line(`No hay "${query}" en el cofre.`, 't-dim');
        return;
      }

      const picked = [];
      idxs.reverse().forEach(i => {
        const [it] = chest.splice(i, 1);
        if(it) picked.push(it);
      });

      picked.reverse().forEach(it => Player.addItem(_clone(it)));
      _saveChest();

      Out.line(`Retiraste ${picked.length} objeto(s) del cofre compartido.`, 't-cra');
      save();
      return;
    }

    Out.line('Subcomando no válido. Usa: cofre listar | guardar | retirar.', 't-dim');
  }

  return {
    id: PLUGIN_ID,
    nombre: 'Guaridas y Cofre Compartido',
    version: '1.0.0',
    descripcion: 'Añade guaridas aleatorias con modo refugio, descanso total y cofre persistente entre runs.',

    hooks: {
      'player:create': {
        fn(payload) {
          payload.player.ext = payload.player.ext || {};
          payload.player.ext.guarida = payload.player.ext.guarida || { enRefugio: false };
          return payload;
        }
      },

      'world:after_gen': {
        priority: 55,
        fn(payload) {
          _markRandomLairs(payload?.nodes || {}, 'world');
          return payload;
        }
      },

      'world:section_expand': {
        priority: 55,
        fn(payload) {
          const nodes = Object.fromEntries((payload?.nodeIds || []).map(id => [id, World.node(id)]));
          _markRandomLairs(nodes, `sec:${payload?.seccion || 0}`);
          return payload;
        }
      },

      'world:node_enter': {
        priority: 40,
        fn(payload) {
          return _onNodeEnter(payload);
        }
      },

      'world:node_exit': {
        fn(payload) {
          if(_inRefuge()) _setRefugeMode(false);
          return payload;
        }
      },

      'command:before': {
        priority: 10,
        fn(payload) {
          return _onCommandBefore(payload);
        }
      },
    },

    comandos: {
      refugio: {
        meta: { cat: 'GUARIDA', help: 'Entrar/salir del modo refugio en una guarida.' },
        fn() {
          _cmdRefugio();
        },
      },
      cofre: {
        meta: { cat: 'GUARIDA', help: 'Cofre compartido entre runs: listar/guardar/retirar.' },
        fn(args) {
          _cmdCofre(args || []);
        },
      },
      descansar: {
        meta: { cat: 'GUARIDA', help: 'En modo refugio restaura HP, Maná y cura estados alterados.' },
        fn() {
          _cmdDescansar();
        },
      },
    },
  };
})();
