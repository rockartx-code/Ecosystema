// ════════════════════════════════════════════════════════════════
// PLUGIN: Invocaciones Djinn
// Djinn únicos de alta dificultad, invocación en combate y transmutación.
// ════════════════════════════════════════════════════════════════

const DjinnInvocaciones = (() => {
  const DURATION_TURNS = 3;
  const COOLDOWN_BATTLES = 5;
  const TRANS_FAIL_CHANCE = 0.28;
  const ESTADOS_ALTERADOS = ['ARDIENDO', 'MOJADO', 'ELECTRIZADO', 'CONGELADO', 'RESONANTE', 'VACÍO'];

  const DJINN_DEFS = [
    { id:'djinn_zenit_fractal',   nombre:'Djinn Zénit Fractal',   foco5x:'atk', estilo:'fractal',    desc:'Divide rutas de daño y prioriza remates de alta varianza.' },
    { id:'djinn_isobar_nulo',     nombre:'Djinn Isóbaro Nulo',    foco5x:'def', estilo:'isobaro',    desc:'Convierte presión recibida en contraataques de inercia acumulada.' },
    { id:'djinn_loto_inverso',    nombre:'Djinn Loto Inverso',    foco5x:'hp',  estilo:'loto',       desc:'Oscila entre fases de absorción y estallido geométrico.' },
    { id:'djinn_cifra_abisal',    nombre:'Djinn Cifra Abisal',    foco5x:'atk', estilo:'cifra',      desc:'Marca secuencias y ejecuta detonaciones al tercer patrón.' },
    { id:'djinn_umbra_vectorial', nombre:'Djinn Umbra Vectorial', foco5x:'def', estilo:'vector',     desc:'Rota defensas angulares y castiga habilidades repetidas.' },
    { id:'djinn_boreal_delta',    nombre:'Djinn Boreal Delta',    foco5x:'hp',  estilo:'delta',      desc:'Escala por ronda y colapsa al objetivo con pulsos de fase.' },
    { id:'djinn_palindromo',      nombre:'Djinn Palíndromo',      foco5x:'atk', estilo:'palindromo', desc:'Imita la última acción enemiga de forma invertida y potenciada.' },
    { id:'djinn_marea_singular',  nombre:'Djinn Marea Singular',  foco5x:'hp',  estilo:'marea',      desc:'Acumula mareas; en marea alta transforma control en daño real.' },
    { id:'djinn_ancla_torcida',   nombre:'Djinn Ancla Torcida',   foco5x:'def', estilo:'ancla',      desc:'Fija al rival en anclas temporales y erosiona su postura.' },
    { id:'djinn_orbita_hueso',    nombre:'Djinn Órbita de Hueso', foco5x:'atk', estilo:'orbita',     desc:'Gira en órbitas excéntricas: más daño cuanto menor HP objetivo.' },
    { id:'djinn_prisma_ruina',    nombre:'Djinn Prisma de Ruina', foco5x:'def', estilo:'prisma',     desc:'Refracta daño elemental y lo devuelve como ráfaga compuesta.' },
    { id:'djinn_velo_entropico',  nombre:'Djinn Velo Entrópico',  foco5x:'hp',  estilo:'entropia',   desc:'Aumenta entropía de batalla y niega defensas en ventana crítica.' },
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
  function _worldNode(nodeId) {
    const fn = _svc('runtime.world.node');
    return typeof fn === 'function' ? fn(nodeId) : null;
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
  function _refreshStatus() {
    const fn = _svc('runtime.status.refresh');
    if(typeof fn === 'function') fn();
  }

  function _state() {
    const p = _player();
    p.ext = p.ext || {};
    p.ext.invocaciones = p.ext.invocaciones || {
      cooldownBatallas: 0,
      usadoEnBatallaId: null,
      seccionesConDjinn: {},
      invocacionesRealizadas: 0,
      transmutaciones: 0,
      transmutacionesFallidas: 0,
    };
    return p.ext.invocaciones;
  }

  function _cofre() {
    const getData = _svc('runtime.memory.data.get');
    const chest = typeof getData === 'function' ? getData()?.refugio_cofre : null;
    return Array.isArray(chest) ? chest : [];
  }

  function _inventoryInvocations() {
    return (_player()?.inventory || []).filter(it => it?.tipo === 'invocacion_djinn');
  }

  function _todosItemsInvocacion() {
    return [..._inventoryInvocations(), ..._cofre()]
      .filter(it => it?.tipo === 'invocacion_djinn' || String(it?.blueprint || '').startsWith('invocacion_'));
  }

  function _tieneInvocacionDjinn(djinnId) {
    return _todosItemsInvocacion().some(it => it.djinnId === djinnId || it.blueprint === `invocacion_${djinnId}`);
  }

  function _faltantes() {
    return DJINN_DEFS.filter(d => !_tieneInvocacionDjinn(d.id));
  }

  function _pickDjinnParaSeccion(seed) {
    const disponibles = _faltantes();
    if(!disponibles.length) return null;
    return U.pick(disponibles, U.rng(seed));
  }

  function _statsDesdeJugador(def) {
    const p = _player();
    const stats = _playerCombatStats();
    const base = {
      hp: Math.max(20, Math.round((p.maxHp || 50) * 1.2)),
      atk: Math.max(5, Math.round((stats.atk || p.atk || 6) * 1.2)),
      def: Math.max(1, Math.round((stats.def || p.def || 2) * 1.2)),
    };
    base[def.foco5x] = Math.max(base[def.foco5x], Math.round(base[def.foco5x] * 5));
    return base;
  }

  function _crearDjinnEnemigo(def, nodeId, seccion, dificultad) {
    const s = _statsDesdeJugador(def);
    return {
      id: U.uid(),
      tipo: 'enemy',
      name: def.nombre,
      nombre: def.nombre,
      hp: s.hp,
      hp_current: s.hp,
      maxHp: s.hp,
      atk: s.atk,
      def: s.def,
      vivo: true,
      nodeId,
      tags: ['djinn', 'invocacion', def.estilo],
      es_djinn_archon: true,
      djinn_def: { ...def },
      djinn_meta: { seccion, dificultad, foco5x: def.foco5x },
      color: 't-mag',
    };
  }

  function _lineaPresentacion(djinn) {
    const d = djinn?.djinn_def || {};
    return `✶ ${d.nombre} [${(d.estilo || 'djinn').toUpperCase()}] — 5x en ${String(d.foco5x || '').toUpperCase()}`;
  }

  function _trySpawnEnSeccion(payload) {
    const dif = payload?.difficulty ?? payload?.dificultad ?? 1;
    const seccion = payload?.seccion;
    if(!seccion || dif < 3) return payload;

    const st = _state();
    if(st.seccionesConDjinn?.[seccion]) return payload;

    const def = _pickDjinnParaSeccion(`${payload.nodeId}:${seccion}:${dif}`);
    if(!def) return payload;

    payload.enemies = payload.enemies || [];
    payload.enemies.push(_crearDjinnEnemigo(def, payload.nodeId, seccion, dif));
    st.seccionesConDjinn[seccion] = true;
    return payload;
  }

  function _crearLootInvocacion(enemy) {
    const d = enemy?.djinn_def;
    if(!d) return null;
    return {
      id: U.uid(),
      blueprint: `invocacion_${d.id}`,
      nombre: `Invocación: ${d.nombre}`,
      tipo: 'invocacion_djinn',
      djinnId: d.id,
      tags: ['invocacion', 'djinn', d.estilo],
      estado: 'ligado',
      desc: `Permite invocar a ${d.nombre} durante ${DURATION_TURNS} turnos (1 uso en batalla).`,
      summonSnapshot: {
        id: d.id,
        nombre: d.nombre,
        estilo: d.estilo,
        estilos: [d.estilo],
        foco5x: d.foco5x,
        hp: enemy.maxHp || enemy.hp || 30,
        atk: enemy.atk || 10,
        def: enemy.def || 2,
      },
    };
  }

  function _onDjinnDefeat(payload) {
    const enemy = payload?.enemy;
    if(!enemy?.es_djinn_archon) return payload;

    const dId = enemy?.djinn_def?.id;
    if(dId && _tieneInvocacionDjinn(dId)) {
      _line(`El núcleo de ${enemy.name} ya está ligado a tu cofre/inventario.`, 't-dim');
      return payload;
    }

    const item = _crearLootInvocacion(enemy);
    if(!item) return payload;
    _playerAddItem(item);
    _line(`🜂 Obtienes ${item.nombre}.`, 't-cra', true);
    return payload;
  }

  function _targets(actor, battle) {
    const esAliadoJugador = actor?.team === 'player';
    if(esAliadoJugador) return battle.cola.filter(c => c.vivo && c.tipo !== 'player' && c.team !== 'player');
    return battle.cola.filter(c => c.vivo && c.tipo === 'player');
  }

  function _aplicarDanio(actor, target, amount, battle, label='t-pel') {
    if(!target) return 0;
    const dmg = Math.max(1, Math.round(amount));
    target.hp = Math.max(0, target.hp - dmg);
    const player = _player();
    if(target.playerId === player?.id) player.hp = target.hp;
    battleLog(battle, `${actor.name} → ${target.name}  −${dmg}HP  (${target.hp}/${target.maxHp})`, label);
    if(target.hp <= 0) { target.vivo = false; battleLog(battle, `${target.name} cae.`, 't-cor'); }
    return dmg;
  }

  function _execEstilo(estilo, actor, battle, targets, weak, scale) {
    switch(estilo) {
      case 'fractal': {
        actor._dj.cargas++;
        const golpes = actor._dj.cargas >= 3 ? 3 : 2;
        for(let i=0; i<golpes; i++) {
          const t = targets[i % targets.length] || weak;
          _aplicarDanio(actor, t, actor.atk * (0.33 + i*0.1) * scale, battle, 't-mag');
        }
        if(actor._dj.cargas >= 3) actor._dj.cargas = 0;
        break;
      }
      case 'isobaro': {
        const escudo = Math.round(actor.def * 0.4);
        actor._dj.bufferDef = (actor._dj.bufferDef || 0) + escudo;
        _aplicarDanio(actor, weak, (actor.atk * 0.55 + actor._dj.bufferDef * 0.12) * scale, battle, 't-sis');
        break;
      }
      case 'loto': {
        if(actor._dj.fase === 'acumular') {
          actor.hp = Math.min(actor.maxHp, actor.hp + Math.round(actor.maxHp * 0.12));
          actor._dj.fase = 'estallar';
        } else {
          _aplicarDanio(actor, weak, actor.atk * 1.45 * scale, battle, 't-cor');
          actor._dj.fase = 'acumular';
        }
        break;
      }
      case 'cifra': {
        actor._dj.marcas = (actor._dj.marcas || 0) + 1;
        _aplicarDanio(actor, weak, actor.atk * 0.7 * scale, battle, 't-mag');
        if(actor._dj.marcas >= 3) { _aplicarDanio(actor, weak, actor.atk * 1.8 * scale, battle, 't-cor'); actor._dj.marcas = 0; }
        break;
      }
      case 'vector': {
        weak.def = Math.max(0, (weak.def || 0) - Math.max(1, Math.floor(actor.atk * 0.08)));
        _aplicarDanio(actor, weak, actor.atk * 0.85 * scale, battle, 't-pel');
        break;
      }
      case 'delta':
        _aplicarDanio(actor, weak, actor.atk * (1 + (battle.ronda || 1) * 0.12) * scale, battle, 't-eco');
        break;
      case 'palindromo': {
        const last = weak._ultima_habilidad?.power || weak._ultima_magia?.power || 0;
        _aplicarDanio(actor, weak, actor.atk * (last ? 0.6 : 1.1) * scale, battle, 't-mag');
        break;
      }
      case 'marea': {
        actor._dj.cargas = (actor._dj.cargas || 0) + 1;
        const burst = actor._dj.cargas >= 2;
        _aplicarDanio(actor, weak, actor.atk * (burst ? 1.7 : 0.6) * scale, battle, burst ? 't-cor' : 't-sis');
        if(burst) actor._dj.cargas = 0;
        break;
      }
      case 'ancla':
        weak.poise = Math.max(0, (weak.poise || 50) - Math.round(actor.atk * 0.5));
        _aplicarDanio(actor, weak, actor.atk * 0.75 * scale, battle, 't-pel');
        break;
      case 'orbita':
        _aplicarDanio(actor, weak, actor.atk * (0.75 + (1 - weak.hp / Math.max(1, weak.maxHp))) * scale, battle, 't-cor');
        break;
      case 'prisma':
        _aplicarDanio(actor, weak, (actor.atk * 0.5 + Math.max(1, Math.round(actor.def * 0.6))) * scale, battle, 't-eco');
        break;
      case 'entropia':
      default: {
        const spike = (battle.ronda || 1) % 2 === 0;
        if(spike) weak.def = Math.max(0, (weak.def || 0) - 3);
        _aplicarDanio(actor, weak, actor.atk * (spike ? 1.35 : 0.8) * scale, battle, spike ? 't-cor' : 't-mag');
      }
    }
  }

  function _estrategia(actor, battle) {
    const estilos = actor?.invocacion?.estilos?.length
      ? actor.invocacion.estilos
      : [actor?.djinn_def?.estilo || actor?.invocacion?.estilo || 'entropia'];

    actor._dj = actor._dj || { turnos: 0, cargas: 0, marcas: 0, fase: 'acumular' };
    actor._dj.turnos++;

    const targets = _targets(actor, battle);
    if(!targets.length) return;
    const weak = targets.reduce((a, b) => (a.hp / Math.max(1, a.maxHp)) <= (b.hp / Math.max(1, b.maxHp)) ? a : b);

    const fusionScale = estilos.length > 1 ? (0.75 + (0.25 / estilos.length)) : 1;
    estilos.forEach(estilo => _execEstilo(estilo, actor, battle, targets, weak, fusionScale));

    battleLog(battle, `⟡ ${actor.name} ejecuta patrón ${estilos.join(' + ')}.`, 't-mag');
  }

  function _controlDuracionInvocado(actor, battle) {
    if(!actor?.es_djinn_invocado) return;
    actor.turnos_invocado_restantes = (actor.turnos_invocado_restantes ?? DURATION_TURNS) - 1;
    if(actor.turnos_invocado_restantes <= 0) {
      actor.vivo = false;
      battleLog(battle, `✧ ${actor.name} retorna al sello tras ${DURATION_TURNS} turnos.`, 't-dim');
    }
  }

  function _onResolveIA(payload) {
    const actor = payload?.actor;
    const battle = payload?.battle;
    if(!actor?.es_djinn_archon && !actor?.es_djinn_invocado) return payload;

    _estrategia(actor, battle);
    _controlDuracionInvocado(actor, battle);
    payload.handled = true;
    payload.cancelled = true;
    return payload;
  }

  function _inBattle() {
    const battleSvc = _svc('runtime.battle.current');
    const b = battleSvc ? battleSvc() : null;
    return b && b.estado === 'activo' ? b : null;
  }

  function _findSummonItem(query) {
    const inv = _inventoryInvocations();
    if(!inv.length) return null;
    if(!query) return inv[0];
    const q = String(query).toLowerCase().trim();
    return inv.find(it =>
      String(it.nombre || '').toLowerCase().includes(q) ||
      String(it.blueprint || '').toLowerCase().includes(q) ||
      String(it.djinnId || '').toLowerCase().includes(q)
    ) || null;
  }

  function _canUseSummonInBattle(battle, st) {
    if(!battle) return { ok:false, reason:'No estás en batalla.' };
    if(st.usadoEnBatallaId === battle.id) return { ok:false, reason:'Ya usaste una invocación en esta batalla.' };
    if((st.cooldownBatallas || 0) > 0) return { ok:false, reason:`Invocación bloqueada por ${st.cooldownBatallas} batalla(s).` };
    return { ok:true };
  }

  function _summonToBattle(item, battle) {
    const snap = item?.summonSnapshot;
    if(!snap) return false;

    battle.cola.push({
      tipo: 'npc',
      id: U.uid(),
      name: `${snap.nombre} (Invocado)`,
      hp: snap.hp,
      maxHp: snap.hp,
      atk: snap.atk,
      def: snap.def,
      vivo: true,
      team: 'player',
      es_djinn_invocado: true,
      invocacion: { ...snap, estilos: snap.estilos || [snap.estilo].filter(Boolean) },
      djinn_def: { estilo: snap.estilo },
      turnos_invocado_restantes: DURATION_TURNS,
      nodeId: battle.nodeId,
      poise: 45,
      poise_max: 45,
    });

    const st = _state();
    st.usadoEnBatallaId = battle.id;
    st.cooldownBatallas = COOLDOWN_BATTLES;
    st.invocacionesRealizadas = (st.invocacionesRealizadas || 0) + 1;

    battleLog(battle, `🜂 Invocas a ${snap.nombre} durante ${DURATION_TURNS} turnos.`, 't-cra');
    battleLog(battle, `Enfriamiento global: ${COOLDOWN_BATTLES} batallas tras esta.`, 't-dim');
    return true;
  }

  function _findInvocationByQuery(query, pool) {
    const q = String(query || '').toLowerCase().trim();
    if(!q) return null;
    return (pool || []).find(it =>
      it.id === query ||
      String(it.nombre || '').toLowerCase().includes(q) ||
      String(it.blueprint || '').toLowerCase().includes(q) ||
      String(it.djinnId || '').toLowerCase().includes(q)
    ) || null;
  }

  function _pickTransmutationItems(args) {
    const inv = _inventoryInvocations();
    if(inv.length < 2) return { error:'Necesitas al menos 2 objetos de invocación.' };

    const raw = (args || []).join(' ').trim();
    let a = null, b = null;

    if(raw.includes('|')) {
      const [left, right] = raw.split('|').map(x => x.trim()).filter(Boolean);
      a = _findInvocationByQuery(left, inv);
      b = _findInvocationByQuery(right, inv.filter(i => i.id !== a?.id));
    } else if(args?.length >= 2) {
      a = _findInvocationByQuery(args[0], inv);
      b = _findInvocationByQuery(args.slice(1).join(' '), inv.filter(i => i.id !== a?.id));
    } else {
      [a, b] = inv.slice(0, 2);
    }

    if(!a || !b) return { error:'No pude identificar dos invocaciones válidas. Usa: transmutar <invA> | <invB>.' };
    if(a.id === b.id) return { error:'Debes elegir dos invocaciones distintas.' };
    return { a, b };
  }

  function _mergeSnapshot(a, b) {
    const sa = a?.summonSnapshot || {};
    const sb = b?.summonSnapshot || {};
    const estilos = [...new Set([...(sa.estilos || [sa.estilo]), ...(sb.estilos || [sb.estilo])].filter(Boolean))];
    return {
      id: `fusion_${U.uid().toLowerCase()}`,
      nombre: `${sa.nombre || a.nombre} + ${sb.nombre || b.nombre}`,
      estilo: estilos[0] || 'entropia',
      estilos,
      hp: (sa.hp || 0) + (sb.hp || 0),
      atk: (sa.atk || 0) + (sb.atk || 0),
      def: (sa.def || 0) + (sb.def || 0),
      fusionDe: [a.djinnId || sa.id, b.djinnId || sb.id].filter(Boolean),
    };
  }

  function _createFusionItem(a, b) {
    const snap = _mergeSnapshot(a, b);
    return {
      id: U.uid(),
      blueprint: `invocacion_fusion_${U.uid().toLowerCase()}`,
      nombre: `Invocación Fusión: ${snap.nombre}`,
      tipo: 'invocacion_djinn',
      djinnId: snap.id,
      tags: ['invocacion', 'djinn', 'fusion', ...snap.estilos],
      estado: 'fusionado',
      desc: 'Invocación transmutada: suma stats y combina habilidades/estrategias de los dos Djinn fuente.',
      summonSnapshot: snap,
    };
  }

  function _applyTransmutationFail(a, b) {
    const p = _player();
    const dmg = Math.max(8, Math.round(((a?.summonSnapshot?.atk || 10) + (b?.summonSnapshot?.atk || 10)) * 0.35));
    p.hp = Math.max(1, p.hp - dmg);

    const e1 = U.pick(ESTADOS_ALTERADOS, U.rng(`${Date.now()}:${p.id}:1`));
    const e2 = U.pick(ESTADOS_ALTERADOS, U.rng(`${Date.now()}:${p.id}:2`));
    p.elemento_estado = e1;
    p.flags = p.flags || [];
    p.flags.push({ tipo:'transmutacion_inestable', ciclos:3, estado:e2 });

    const st = _state();
    st.transmutacionesFallidas = (st.transmutacionesFallidas || 0) + 1;

    _line(`✖ La transmutación colapsa: recibes ${dmg} de daño.`, 't-cor', true);
    _line(`Estados alterados aplicados: ${e1} + ${e2}.`, 't-pel');
    _refreshStatus();
  }

  function cmdTransmutar(args = []) {
    const selected = _pickTransmutationItems(args);
    if(selected.error) { _line(selected.error, 't-dim'); return; }
    const { a, b } = selected;

    const p = _player();
    p.inventory = (p.inventory || []).filter(it => it.id !== a.id && it.id !== b.id);
    EventBus.emit('player:item_remove', { item:a, player:p });
    EventBus.emit('player:item_remove', { item:b, player:p });

    if(U.chance(TRANS_FAIL_CHANCE)) {
      _applyTransmutationFail(a, b);
      return;
    }

    const fusion = _createFusionItem(a, b);
    _playerAddItem(fusion);

    const st = _state();
    st.transmutaciones = (st.transmutaciones || 0) + 1;

    _sp();
    _line('🜁 TRANSMUTACIÓN EXITOSA', 't-cra', true);
    _line(`${a.nombre} + ${b.nombre}`, 't-dim');
    _line(`→ ${fusion.nombre}`, 't-mag');
    _line(`Stats fusionadas: HP ${fusion.summonSnapshot.hp} · ATK ${fusion.summonSnapshot.atk} · DEF ${fusion.summonSnapshot.def}`, 't-cra');
    _line(`Estrategias combinadas: ${fusion.summonSnapshot.estilos.join(' + ')}`, 't-dim');
    _sp();
  }

  function _onCommandBefore(payload) {
    const verb = String(payload?.verb || '').toLowerCase();
    if(!['invocacion', 'invocación', 'summon'].includes(verb)) return payload;

    const battle = _inBattle();
    if(!battle) {
      _line('Invocación solo puede usarse durante una batalla activa.', 't-dim');
      payload.cancelled = true;
      return payload;
    }

    const st = _state();
    const gate = _canUseSummonInBattle(battle, st);
    if(!gate.ok) {
      _line(gate.reason, 't-dim');
      payload.cancelled = true;
      return payload;
    }

    const query = (payload?.args || []).join(' ').trim();
    const item = _findSummonItem(query);
    if(!item) {
      _line('No tienes objetos de invocación Djinn en inventario.', 't-dim');
      payload.cancelled = true;
      return payload;
    }

    _summonToBattle(item, battle);
    payload.cancelled = true;
    return payload;
  }

  function _onBattleStart(payload) {
    _state().usadoEnBatallaId = null;
    return payload;
  }

  function _onPostResolve(payload) {
    const st = _state();
    if((st.cooldownBatallas || 0) > 0) st.cooldownBatallas--;
    return payload;
  }

  function _onNodeEnter(payload) {
    const node = _worldNode(payload?.nodeId);
    const djinn = (node?.enemies || []).find(e => e?.es_djinn_archon);
    if(!djinn) return payload;

    _sp();
    _sep('═');
    _line('⚚ RESONANCIA DE INVOCACIÓN DETECTADA', 't-mag', true);
    _line(_lineaPresentacion(djinn), 't-mag');
    _line(djinn?.djinn_def?.desc || 'Djinn de patrón complejo detectado.', 't-dim');
    _sep('═');
    return payload;
  }

  function cmdInvocaciones() {
    const st = _state();
    const inv = _inventoryInvocations();

    _sp(); _sep('─');
    _line('INVOCACIONES DJINN', 't-mag', true);
    _line(`Cooldown restante: ${st.cooldownBatallas || 0} batalla(s).`, 't-dim');
    _line(`Invocaciones usadas: ${st.invocacionesRealizadas || 0}.`, 't-dim');
    _line(`Transmutaciones: ${st.transmutaciones || 0} (fallidas: ${st.transmutacionesFallidas || 0}).`, 't-dim');
    if(!inv.length) {
      _line('No tienes objetos de invocación en inventario.', 't-dim');
    } else {
      inv.forEach(it => {
        const s = it.summonSnapshot || {};
        const estr = (s.estilos || [s.estilo]).filter(Boolean).join(' + ');
        _line(`  ▸ ${it.nombre}  HP:${s.hp||'?'} ATK:${s.atk||'?'} DEF:${s.def||'?'} [${estr}]`, 't-cra');
      });
    }
    _line('En batalla: invocacion [nombre].', 't-dim');
    _line('Fuera de batalla: transmutar <invA> | <invB>.', 't-dim');
    _sep('─'); _sp();
  }

  return {
    trySpawnEnSeccion: _trySpawnEnSeccion,
    onDjinnDefeat: _onDjinnDefeat,
    onResolveIA: _onResolveIA,
    onCommandBefore: _onCommandBefore,
    onBattleStart: _onBattleStart,
    onPostResolve: _onPostResolve,
    onNodeEnter: _onNodeEnter,
    cmdInvocaciones,
    cmdTransmutar,
  };
})();

const pluginInvocaciones = {
  id: 'plugin:invocaciones',
  nombre: 'Invocaciones Djinn',
  version: '1.1.0',
  descripcion: 'Djinn raros con IA compleja, invocación en combate y transmutación de sellos.',

  hooks: {
    'player:create': {
      fn(payload) {
        payload.player.ext = payload.player.ext || {};
        payload.player.ext.invocaciones = payload.player.ext.invocaciones || {
          cooldownBatallas: 0,
          usadoEnBatallaId: null,
          seccionesConDjinn: {},
          invocacionesRealizadas: 0,
          transmutaciones: 0,
          transmutacionesFallidas: 0,
        };
        return payload;
      }
    },
    'world:request_enemies': { priority: 70, fn: (payload) => DjinnInvocaciones.trySpawnEnSeccion(payload) },
    'world:node_enter':      { fn: (payload) => DjinnInvocaciones.onNodeEnter(payload) },
    'combat:enemy_defeat':   { fn: (payload) => DjinnInvocaciones.onDjinnDefeat(payload) },
    'combat:resolve_ia':     { priority: 5, fn: (payload) => DjinnInvocaciones.onResolveIA(payload) },
    'command:before':        { priority: 5, fn: (payload) => DjinnInvocaciones.onCommandBefore(payload) },
    'combat:start':          { fn: (payload) => DjinnInvocaciones.onBattleStart(payload) },
    'combat:post_resolve':   { fn: (payload) => DjinnInvocaciones.onPostResolve(payload) },
  },

  comandos: {
    invocaciones: {
      fn: () => DjinnInvocaciones.cmdInvocaciones(),
      meta: {
        titulo: 'invocaciones',
        color: 't-mag',
        desc: 'Lista invocaciones Djinn, cooldown y estadísticas.',
      },
    },
    transmutar: {
      fn: (args) => DjinnInvocaciones.cmdTransmutar(args),
      meta: {
        titulo: 'transmutar <invA> | <invB>',
        color: 't-cor',
        desc: 'Fusiona dos invocaciones; si falla, daña y aplica estados alterados al azar.',
      },
    },
  },
};
