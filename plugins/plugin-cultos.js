// ════════════════════════════════════════════════════════════════
// PLUGIN: Cultos Rivales
// 3 líneas de culto con misiones exclusivas, hostilidad cruzada
// y dioses invocados al reunir 5 reliquias del mismo culto.
// ════════════════════════════════════════════════════════════════

const pluginCultos = (() => {
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
  function _playerAddItem(item) {
    const fn = _svc('runtime.player.add_item');
    return typeof fn === 'function' ? !!fn(item) : false;
  }
  function _worldNode(nodeId) {
    const fn = _svc('runtime.world.node');
    return typeof fn === 'function' ? fn(nodeId) : null;
  }
  function _worldMeta() {
    const fn = _svc('runtime.world.read');
    return typeof fn === 'function' ? (fn() || {}) : {};
  }
  function _clockCycle() {
    const fn = _svc('runtime.clock.current');
    const current = typeof fn === 'function' ? fn() : null;
    return current?.cycle ?? 0;
  }
  function _gsAllNPCs() {
    const fn = _svc('runtime.gs.all_npcs');
    return typeof fn === 'function' ? (fn() || []) : [];
  }
  function _gsAddNPC(npc) {
    const fn = _svc('runtime.gs.add_npc');
    return typeof fn === 'function' ? !!fn(npc) : false;
  }
  function _gsMision(misionId) {
    const fn = _svc('runtime.gs.mision');
    return typeof fn === 'function' ? fn(misionId) : null;
  }
  function _gsAddMision(mision) {
    const fn = _svc('runtime.gs.add_mision');
    return typeof fn === 'function' ? !!fn(mision) : false;
  }
  function _gsAllMisiones() {
    const fn = _svc('runtime.gs.all_misiones');
    return typeof fn === 'function' ? (fn() || []) : [];
  }
  function _gsNpc(npcId) {
    const fn = _svc('runtime.gs.npc');
    return typeof fn === 'function' ? fn(npcId) : null;
  }
  function _line(text, color='t-out', bold=false) {
    const fn = _svc('runtime.output.line');
    if(typeof fn === 'function') fn(text, color, bold);
  }
  function _sp() {
    const fn = _svc('runtime.output.sp');
    if(typeof fn === 'function') fn();
  }

  const PLUGIN_ID = 'plugin:cultos';

  const CULTOS = {
    alas_blancas: {
      id: 'alas_blancas',
      npcNombre: 'Miembro del Culto de las Alas Blancas',
      misionTitulo: 'Voto de Pluma Alba',
      misionDesc: 'Purga una amenaza en nombre de las Alas Blancas y retorna con el juramento intacto.',
      misionFallo: 'Las alas se ciernen sobre ti con juicio eterno.',
      itemMision: {
        blueprint: 'sigilo_ala_blanca',
        nombre: 'Sigilo de Ala Blanca',
        tipo: 'reliquia',
        tags: ['culto', 'alas_blancas', 'único'],
        desc: 'Sello ritual de las Alas Blancas. Contiene un voto imposible de falsificar.',
      },
      dios: {
        id: 'dios_alas_blancas',
        nombre: 'Hierofante de las Alas Blancas',
        icono: '🜊',
        enfoque: 'def',
        estrategia: 'baluarte_luz',
        desc: 'Combina fases de barrera con contraataques de precisión angular.',
      },
      accesorio: {
        blueprint: 'relicario_de_alas_soberanas',
        nombre: 'Relicario de Alas Soberanas',
        efecto: '+35% mitigación el primer golpe de cada ronda y +20 DEF plana.',
      },
    },
    serpiente: {
      id: 'serpiente',
      npcNombre: 'Miembro del Culto de la Serpiente',
      misionTitulo: 'Mandato del Colmillo Enroscado',
      misionDesc: 'Extiende el veneno del culto mediante un encargo silencioso y sin testigos.',
      misionFallo: 'Las escamas guardan memoria de toda traición.',
      itemMision: {
        blueprint: 'colmillo_ritual_serpiente',
        nombre: 'Colmillo Ritual de Serpiente',
        tipo: 'reliquia',
        tags: ['culto', 'serpiente', 'único'],
        desc: 'Fragmento ofídico que late con hambre táctica.',
      },
      dios: {
        id: 'dios_serpiente',
        nombre: 'Oráculo de la Serpiente Infinita',
        icono: '🐍',
        enfoque: 'atk',
        estrategia: 'veneno_patron',
        desc: 'Alterna marcas de veneno con ráfagas de ejecución al tercer patrón.',
      },
      accesorio: {
        blueprint: 'anillo_de_muda_eternal',
        nombre: 'Anillo de Muda Eternal',
        efecto: '+45% daño contra objetivos con estado y +15 ATK.',
      },
    },
    tentaculos: {
      id: 'tentaculos',
      npcNombre: 'Miembro del Culto de los Tentáculos',
      misionTitulo: 'Pacto de la Marea Tentacular',
      misionDesc: 'Alimenta el abismo con un acto de entrega y regresa antes de la siguiente marea.',
      misionFallo: 'El oleaje de tentáculos te reclama como deuda viva.',
      itemMision: {
        blueprint: 'nucleo_tentacular_abisal',
        nombre: 'Núcleo Tentacular Abisal',
        tipo: 'reliquia',
        tags: ['culto', 'tentaculos', 'único'],
        desc: 'Matriz pulsante del culto de los Tentáculos.',
      },
      dios: {
        id: 'dios_tentaculos',
        nombre: 'Profeta de los Mil Tentáculos',
        icono: '🜄',
        enfoque: 'hp',
        estrategia: 'control_caotico',
        desc: 'Usa control de ritmo, inmoviliza y desordena prioridades de combate.',
      },
      accesorio: {
        blueprint: 'orbe_de_marea_primigenia',
        nombre: 'Orbe de Marea Primigenia',
        efecto: 'Cada 2 turnos inflige pulso abisal en área y recupera 8% de HP máximo.',
      },
    },
  };

  function _store() {
    const s = PluginLoader.getStore(PLUGIN_ID);
    s.secciones = s.secciones || {};
    s.misionesProcesadas = s.misionesProcesadas || {};
    s.cultoElegido = s.cultoElegido || null;
    s.diosInvocado = s.diosInvocado || { alas_blancas:false, serpiente:false, tentaculos:false };
    s.ultEmboscada = s.ultEmboscada || { nodeId:null, ciclo:0 };
    return s;
  }

  function _playerState() {
    const p = _player();
    p.ext = p.ext || {};
    p.ext.cultos = p.ext.cultos || { culto_activo:null, items_entregados:{ alas_blancas:0, serpiente:0, tentaculos:0 } };
    return p.ext.cultos;
  }

  function _nodesFromPayload(payload) {
    if(Array.isArray(payload?.nodeIds) && payload.nodeIds.length) return payload.nodeIds;
    return Object.keys(payload?.nodes || {});
  }

  function _seccionFromPayload(payload) {
    if(payload?.seccion) return payload.seccion;
    const sec = _worldMeta().sectionCount || 1;
    return sec < 1 ? 1 : sec;
  }

  function _crearNPCCulto(culto, nodeId, seccion, idx) {
    return {
      id: U.uid(),
      nombre: `${culto.npcNombre} · S${seccion}`,
      arq_vis: 'cultista',
      arq_ocu: 'culto',
      deseo: 'Extender la doctrina de su deidad.',
      necesidad: 'Reclutar o eliminar disidentes.',
      miedo: 'Ser borrado por su propio dios.',
      secreto: `Responde al ${culto.dios.nombre}.`,
      trauma: 'Vio caer a su círculo en un ritual anterior.',
      lealtad: 35,
      corrupcion: 50,
      desesperacion: 20,
      nodeId,
      estado: 'vivo',
      secreto_expuesto: false,
      arq_ocu_expuesto: true,
      fragmentos: [],
      vinculos: [],
      misiones_ofrecidas: [],
      interacciones: 0,
      eco_run_id: null,
      twists_activados: [],
      hp_combat: null,
      faccion: 'cultos_rivales',
      culto_id: culto.id,
      culto_seccion: seccion,
      culto_slot: idx,
      culto_hostil: false,
      culto_ya_hablo: false,
      culto_mision_id: null,
      culto_recompensa_entregada: false,
    };
  }

  function _spawnearNPCsEnSeccion(payload) {
    const s = _store();
    const seccion = _seccionFromPayload(payload);
    if(s.secciones[seccion]) return payload;

    const nodes = _nodesFromPayload(payload);
    if(!nodes.length) return payload;

    const rng = U.rng(`cultos:${seccion}:${payload?.seed || _worldMeta().seed}`);
    const cultos = Object.values(CULTOS);

    cultos.forEach((culto, idx) => {
      const nodeId = nodes[Math.floor(rng() * nodes.length)];
      if(!nodeId) return;
      const npc = _crearNPCCulto(culto, nodeId, seccion, idx);
      _gsAddNPC(npc);
    });

    s.secciones[seccion] = true;
    return payload;
  }

  function _buscarMisionCulto(npc) {
    if(!npc?.culto_mision_id) return null;
    return _gsMision(npc.culto_mision_id);
  }

  function _crearMisionCulto(npc) {
    const culto = CULTOS[npc.culto_id];
    if(!culto) return null;
    const m = {
      id: `m_culto_${npc.culto_id}_${npc.culto_seccion}_${U.uid().slice(0,6)}`,
      tipo: 'culto',
      npc_id: npc.id,
      titulo: culto.misionTitulo,
      desc: culto.misionDesc,
      objetivo: `Cumplir encargo del ${culto.npcNombre}.`,
      recompensa: culto.itemMision.nombre,
      consecuencia_fallo: culto.misionFallo,
      victima_id: null,
      eco_id: null,
      es_trampa: false,
      es_imposible: false,
      completada: false,
      fallida: false,
      aceptada: false,
      ciclo: _clockCycle(),
      culto_id: npc.culto_id,
      culto_especial: true,
    };
    npc.culto_mision_id = m.id;
    npc.misiones_ofrecidas.push(m.id);
    _gsAddMision(m);
    return m;
  }

  function _onNPCSpeak(payload) {
    const npc = payload?.npc;
    if(!npc?.culto_id) return payload;

    npc.culto_ya_hablo = true;
    const s = _store();

    if(npc.culto_hostil && s.cultoElegido && s.cultoElegido !== npc.culto_id) {
      payload.text = `${payload.text} "Has elegido otro credo. Aléjate o sangra."`;
      return payload;
    }

    let mision = _buscarMisionCulto(npc);
    if(!mision || mision.fallida || mision.completada) {
      mision = _crearMisionCulto(npc);
    }

    if(mision && !mision.aceptada) {
      payload.text = `${payload.text} "Tengo una misión para ti: ${mision.titulo}."`;
      setTimeout(() => {
        _line(`◈ MISIÓN DE CULTO — "${mision.titulo}"`, 't-mag', true);
        _line(mision.desc, 't-out');
        _line(`Recompensa única: ${mision.recompensa}`, 't-cra');
        _line('Escribe "aceptar" para jurar lealtad a este culto.', 't-dim');
      }, 40);
    }

    return payload;
  }

  function _darItemCulto(cultoId) {
    const culto = CULTOS[cultoId];
    if(!culto) return null;
    const item = {
      id: U.uid(),
      ...culto.itemMision,
      estado: 'ligado',
      culto_id: cultoId,
      irrepetible: false,
      obtenido_en_ciclo: _clockCycle(),
    };
    _playerAddItem(item);
    return item;
  }

  function _volverHostilesOtrosCultos(cultoElegido) {
    _gsAllNPCs().forEach(npc => {
      if(!npc.culto_id || npc.estado !== 'vivo') return;
      if(npc.culto_id !== cultoElegido) {
        npc.culto_hostil = true;
        npc.estado = 'hostil';
      } else {
        npc.culto_hostil = false;
        npc.estado = 'vivo';
      }
    });
  }

  function _procesarAceptaciones() {
    const s = _store();
    const ps = _playerState();

    _gsAllMisiones().forEach(m => {
      if(!m?.culto_especial || !m.aceptada || s.misionesProcesadas[m.id]) return;
      const npc = _gsNpc(m.npc_id);
      if(!npc?.culto_id) return;

      s.misionesProcesadas[m.id] = true;
      s.cultoElegido = npc.culto_id;
      ps.culto_activo = npc.culto_id;

      const item = _darItemCulto(npc.culto_id);
      ps.items_entregados[npc.culto_id] = (ps.items_entregados[npc.culto_id] || 0) + 1;

      _volverHostilesOtrosCultos(npc.culto_id);

      _sp();
      _line(`☩ Juramento sellado con el culto: ${npc.culto_id.replace(/_/g, ' ').toUpperCase()}`, 't-mag', true);
      if(item) _line(`Obtienes ${item.nombre}.`, 't-cra');
      _line('Los otros dos cultos te consideran objetivo inmediato.', 't-pel');
      _sp();
    });
  }

  function _combatienteDesdeNPC(npc, p) {
    const stats = _playerCombatStats(p);
    const hp = Math.max(28, Math.round((p.maxHp || 80) * 0.85));
    const atk = Math.max(8, Math.round((stats.atk || p.atk || 8) * 0.95));
    const def = Math.max(2, Math.round((stats.def || p.def || 3) * 0.9));
    return {
      tipo:'npc',
      id:npc.id,
      name:npc.nombre,
      hp,
      maxHp:hp,
      atk,
      def,
      nodeId:npc.nodeId,
      vivo:true,
      npc_ref:npc,
      tags:['cultista', npc.culto_id],
    };
  }

  function _emboscadaHostil(nodeId) {
    const s = _store();
    if(!s.cultoElegido) return;
    const getBattle = _svc('runtime.battle.current');
    if(typeof getBattle === 'function' && getBattle()) return;

    const p = _player();
    const stats = _playerCombatStats(p);
    const hostiles = _gsAllNPCs().filter(npc =>
      npc.nodeId === nodeId &&
      npc.estado !== 'muerto' &&
      npc.culto_id &&
      npc.culto_id !== s.cultoElegido
    );

    if(!hostiles.length) return;

    if(s.ultEmboscada.nodeId === nodeId && s.ultEmboscada.ciclo === _clockCycle()) return;
    s.ultEmboscada = { nodeId, ciclo: _clockCycle() };

    const allies = [{
      tipo:'player', id:p.id, name:p.name,
      hp:p.hp, maxHp:p.maxHp, atk:stats.atk, def:stats.def,
      nodeId, playerId:p.id, vivo:true,
    }];

    const enemies = hostiles.slice(0, 2).map(npc => _combatienteDesdeNPC(npc, p));
    _line('☠ Emboscada de cultistas hostiles: te atacan al verte.', 't-pel', true);
    const startBattle = _svc('runtime.battle.start');
    if(typeof startBattle === 'function') startBattle(nodeId, [...allies, ...enemies]);
    else _line('Servicio runtime.battle.start no disponible para emboscada de cultos.', 't-dim');
  }

  function _contarItemsCulto(cultoId) {
    return (_player().inventory || []).filter(it => it?.culto_id === cultoId).length;
  }

  function _statsDios(enfoque) {
    const p = _player();
    const stats = _playerCombatStats(p);
    const base = {
      hp: Math.max(60, Math.round((p.maxHp || 100) * 1.0)),
      atk: Math.max(10, Math.round((stats.atk || p.atk || 10) * 1.0)),
      def: Math.max(4, Math.round((stats.def || p.def || 4) * 1.0)),
    };
    base[enfoque] = Math.max(base[enfoque], Math.round(base[enfoque] * 2));
    return base;
  }

  function _invocarDiosCulto(cultoId, nodeId) {
    const s = _store();
    if(s.diosInvocado[cultoId]) return;

    const culto = CULTOS[cultoId];
    if(!culto) return;

    const n = _worldNode(nodeId);
    if(!n) return;

    const st = _statsDios(culto.dios.enfoque);
    n.enemies = n.enemies || [];
    n.enemies.push({
      id: `${culto.dios.id}_${U.uid().slice(0,6)}`,
      tipo: 'enemy',
      nombre: `${culto.dios.icono} ${culto.dios.nombre}`,
      hp: st.hp,
      hp_current: st.hp,
      maxHp: st.hp,
      atk: st.atk,
      def: st.def,
      tags: ['dios_culto', cultoId, culto.dios.estrategia],
      es_dios_culto: true,
      culto_id: cultoId,
      dios_def: { ...culto.dios },
      estrategia: culto.dios.estrategia,
    });

    s.diosInvocado[cultoId] = true;
    _sp();
    _line(`⚚ ${culto.dios.nombre} desciende al mundo.`, 't-cor', true);
    _line(`Estrategia: ${culto.dios.desc}`, 't-dim');
    _sp();
  }

  function _chequearInvocacionDios() {
    Object.keys(CULTOS).forEach(cultoId => {
      if(_contarItemsCulto(cultoId) >= 5) {
        _invocarDiosCulto(cultoId, _playerPos());
      }
    });
  }

  function _dmg(actor, target, battle, raw, color='t-cor') {
    const dmg = Math.max(1, Math.round(raw));
    target.hp = Math.max(0, target.hp - dmg);
    const p = _player();
    if(target.playerId === p.id) p.hp = target.hp;
    battleLog(battle, `${actor.name} → ${target.name}  −${dmg}HP  (${target.hp}/${target.maxHp})`, color);
    if(target.hp <= 0) { target.vivo = false; battleLog(battle, `${target.name} cae.`, 't-cor'); }
    return dmg;
  }

  function _resolverIADios(payload) {
    const actor = payload?.actor;
    const battle = payload?.battle;
    if(!actor?.es_dios_culto || !battle) return payload;

    const players = battle.cola.filter(c => c.vivo && c.tipo === 'player');
    if(!players.length) return payload;

    const objetivo = players.sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp))[0] || players[0];
    actor._dios = actor._dios || { fase:0, rareza:0 };
    actor._dios.fase++;

    const est = actor.estrategia;
    if(est === 'baluarte_luz') {
      if(actor._dios.fase % 3 === 0) {
        actor.def = Math.round(actor.def * 1.2);
        players.forEach(pj => _dmg(actor, pj, battle, actor.atk * 0.42, 't-sis'));
        battleLog(battle, `${actor.name} eleva un baluarte y contraataca en arco.`, 't-sis');
      } else {
        _dmg(actor, objetivo, battle, actor.atk * 0.95, 't-pel');
      }
    } else if(est === 'veneno_patron') {
      actor._dios.rareza = (actor._dios.rareza || 0) + 1;
      _dmg(actor, objetivo, battle, actor.atk * 0.75, 't-mag');
      objetivo._maldicion_turnos = Math.max(objetivo._maldicion_turnos || 0, 2);
      objetivo._maldicion_dmg = Math.max(objetivo._maldicion_dmg || 0, Math.round(actor.atk * 0.18));
      if(actor._dios.rareza >= 3) {
        _dmg(actor, objetivo, battle, actor.atk * 1.8, 't-cor');
        actor._dios.rareza = 0;
        battleLog(battle, `${actor.name} ejecuta el tercer patrón venenoso.`, 't-cor');
      }
    } else if(est === 'control_caotico') {
      const t = players[Math.floor(Math.random() * players.length)] || objetivo;
      if(actor._dios.fase % 2 === 0) {
        t.inmovil_turnos = Math.max(t.inmovil_turnos || 0, 2);
        _dmg(actor, t, battle, actor.atk * 0.6, 't-eco');
        battleLog(battle, `${actor.name} retuerce el espacio y te inmoviliza.`, 't-mag');
      } else {
        players.forEach(pj => _dmg(actor, pj, battle, actor.atk * 0.48, 't-pel'));
      }
    } else {
      _dmg(actor, objetivo, battle, actor.atk, 't-pel');
    }

    payload.handled = true;
    payload.action = 'habilidad_dios';
    payload.cancelled = true;
    return payload;
  }

  function _dropAccesorioDios(payload) {
    const enemy = payload?.enemy;
    if(!enemy?.es_dios_culto) return payload;

    const culto = CULTOS[enemy.culto_id];
    if(!culto) return payload;

    const acc = {
      id: U.uid(),
      blueprint: culto.accesorio.blueprint,
      nombre: culto.accesorio.nombre,
      tipo: 'accesorio',
      equip_slot: Math.random() < 0.5 ? 'accesorio_1' : 'accesorio_2',
      tags: ['accesorio', 'dios_culto', enemy.culto_id, 'único'],
      estado: 'mítico',
      raridad: 'mítico',
      efecto_unico: culto.accesorio.efecto,
      desc: `Trofeo exclusivo de ${enemy.name}. ${culto.accesorio.efecto}`,
      culto_id: enemy.culto_id,
      no_obtenible_fuera: true,
    };

    _playerAddItem(acc);
    _line(`✦ Botín exclusivo: ${acc.nombre}`, 't-cor', true);
    _line(`Efecto único: ${acc.efecto_unico}`, 't-mag');
    return payload;
  }

  return {
    id: PLUGIN_ID,
    nombre: 'Cultos Rivales',
    version: '1.0.0',
    descripcion: 'Cultos con misiones exclusivas, hostilidad cruzada y dioses invocados por reliquias.',

    hooks: {
      'world:request_npcs': { priority: 35, fn: (payload) => _spawnearNPCsEnSeccion(payload) },
      'narrative:npc_speak': { priority: 20, fn: (payload) => _onNPCSpeak(payload) },
      'world:tick': {
        fn(payload) {
          _procesarAceptaciones();
          _chequearInvocacionDios();
          return payload;
        }
      },
      'world:node_enter': {
        fn(payload) {
          _procesarAceptaciones();
          _chequearInvocacionDios();
          _emboscadaHostil(payload?.nodeId || _playerPos());
          return payload;
        }
      },
      'combat:resolve_ia': { priority: 5, fn: (payload) => _resolverIADios(payload) },
      'combat:enemy_defeat': { fn: (payload) => _dropAccesorioDios(payload) },
      'player:item_add': {
        fn(payload) {
          if(payload?.item?.culto_id) _chequearInvocacionDios();
          return payload;
        }
      },
    },
  };
})();
