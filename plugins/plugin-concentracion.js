// ════════════════════════════════════════════════════════════════
// PLUGIN: Concentración v1.0
// Añade stat entrenable, cadenas de acciones en batalla y variantes.
// ════════════════════════════════════════════════════════════════

const ConcentracionSystem = (() => {
  const VARIANTES = {
    base:      { etiqueta:'[base]',      riesgo:-0.02 },
    precisa:   { etiqueta:'[precisa]',   riesgo: 0.10 },
    agresiva:  { etiqueta:'[agresiva]',  riesgo: 0.16 },
    rapida:    { etiqueta:'[rápida]',    riesgo: 0.22 },
    segura:    { etiqueta:'[segura]',    riesgo:-0.12 },
    resonante: { etiqueta:'[resonante]', riesgo: 0.06 },
    vacio:     { etiqueta:'[vacío]',     riesgo: 0.12 },
  };

  // Tabla de vinculación oculta (no se muestra al jugador).
  const VINCULOS_OCULTOS = {
    'precisa>segura':   -0.12,
    'segura>precisa':   -0.08,
    'agresiva>rapida':   0.12,
    'rapida>agresiva':   0.10,
    'resonante>precisa':-0.05,
    'vacio>rapida':      0.09,
    'base>segura':      -0.04,
    'segura>base':      -0.03,
  };

  const VERBOS_COMBO = new Set(['atacar','defender','magia','habilidad','interiorizar','transformar','usar','copiar','canalizar']);

  function _norm(txt='') {
    return String(txt).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
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
  function _clockTick(delta=1) {
    const fn = _svc('runtime.clock.tick');
    return typeof fn === 'function' ? !!fn(delta) : false;
  }
  function _line(text, color='t-out', bold=false) {
    const fn = _svc('runtime.output.line');
    if(typeof fn === 'function') fn(text, color, bold);
  }
  function _refreshStatus() {
    const fn = _svc('runtime.status.refresh');
    if(typeof fn === 'function') fn();
  }
  function _saveGame() {
    const fn = _svc('runtime.game.save');
    if(typeof fn === 'function') fn();
  }

  function parseVariantArg(rawArg) {
    const txt = String(rawArg || '').trim();
    const m = txt.match(/^\[([^\]]+)\]\s*(.*)$/);
    if(!m) return { raw:txt, variant:'base', variantRaw:'', variantLabel:'' };
    const v = _norm(m[1]);
    const variant = VARIANTES[v] ? v : 'base';
    return {
      raw: String(m[2]||'').trim(),
      variant,
      variantRaw: `[${variant}]`,
      variantLabel: VARIANTES[variant].etiqueta,
    };
  }

  function _parseStep(rawStep='') {
    const cleaned = String(rawStep||'').trim();
    if(!cleaned) return null;
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const verb = _norm(parts.shift());
    const parsed = parseVariantArg(parts.join(' '));
    return {
      verb,
      arg: parsed.raw,
      variant: parsed.variant,
      variantRaw: parsed.variantRaw,
      variantLabel: parsed.variantLabel,
      raw: cleaned,
    };
  }

  function buildPlan(raw, actor, battle) {
    const pieces = String(raw||'').split('|').map(s=>s.trim()).filter(Boolean);
    if(!pieces.length) {
      return { ok:false, error:'Uso: concentración atacar [variante] objetivo | magia [variante] nombre' };
    }

    const actions = pieces.map(_parseStep).filter(Boolean);
    if(!actions.length) return { ok:false, error:'No hay acciones válidas en la cadena.' };

    const invalid = actions.find(a => !VERBOS_COMBO.has(a.verb));
    if(invalid) return { ok:false, error:`${invalid.verb} no se puede encadenar con concentración.` };

    const p = _player();
    const conc = Number(p.ext?.concentracion || 0);
    const focusBuff = Number(p._concentracion_focus || 0);

    let waitChance = 0.16 + Math.max(0, actions.length-1) * 0.11;
    waitChance += actions.reduce((s,a)=>s+(VARIANTES[a.variant]?.riesgo||0),0);

    for(let i=1;i<actions.length;i++) {
      const key = `${actions[i-1].variant}>${actions[i].variant}`;
      waitChance += VINCULOS_OCULTOS[key] || 0;
    }

    waitChance -= conc * 0.0035;
    waitChance -= focusBuff;

    waitChance = Math.max(0.05, Math.min(0.92, waitChance));
    const successChance = 1 - waitChance;
    if(focusBuff > 0) p._concentracion_focus = Math.max(0, focusBuff - 0.05);

    return {
      ok:true,
      actions,
      variantChain: actions.map(a=>a.variant),
      waitChance,
      successChance,
    };
  }

  function entrenar() {
    const p = _player();
    p.ext = p.ext || {};
    p.ext.concentracion_max = p.ext.concentracion_max || 100;
    p.ext.concentracion = p.ext.concentracion || 10;

    const gain = U.rand(2,5);
    const prev = p.ext.concentracion;
    p.ext.concentracion = Math.min(p.ext.concentracion_max, p.ext.concentracion + gain);
    const real = p.ext.concentracion - prev;

    p.stamina = Math.max(0, (p.stamina||0) - 8);
    _clockTick(1);

    _line(`Entrenas enfoque mental: Concentración +${real} (${p.ext.concentracion}/${p.ext.concentracion_max})`, 't-acc');
    if(real===0) _line('Ya estás en el máximo de concentración actual.', 't-dim');
    _refreshStatus();
    _saveGame();
  }

  function cmdConcentracion(args) {
    const getBattle = _svc('runtime.battle.current');
    const battle = typeof getBattle === 'function' ? getBattle() : null;
    const inBattle = battle && battle.estado === 'activo';
    const txt = String(args||'').trim();

    if(inBattle && txt) {
      const combatAction = _svc('runtime.battle.action');
      if(typeof combatAction === 'function') combatAction(battle.id, _player().id, 'concentracion', txt);
      else _line('Servicio runtime.battle.action no disponible para concentración en batalla.', 't-dim');
      return;
    }

    if(inBattle && !txt) {
      _line('En batalla: concentración atacar [variante] objetivo | magia [variante] hechizo', 't-acc');
      return;
    }

    entrenar();
  }

  return { buildPlan, parseVariantArg, cmdConcentracion, VARIANTES };
})();

const pluginConcentracion = {
  id: 'plugin:concentracion',
  nombre: 'Sistema de Concentración',
  version: '1.0.0',
  descripcion: 'Stat entrenable de concentración y cadenas de acciones en batalla.',

  hooks: {
    'player:create': {
      fn(payload) {
        payload.player.ext = payload.player.ext || {};
        payload.player.ext.concentracion = payload.player.ext.concentracion ?? 12;
        payload.player.ext.concentracion_max = payload.player.ext.concentracion_max ?? 100;
        return payload;
      }
    },
  },

  comandos: {
    'concentracion': {
      fn: (args)=>ConcentracionSystem.cmdConcentracion(args.join(' ')),
      meta: {
        titulo:'concentracion', color:'t-acc',
        desc:'Fuera de batalla: entrena la stat. En batalla: encadena acciones con |',
        uso:[
          'concentracion',
          'concentracion atacar [precisa] eco | habilidad [segura] rugido',
          'concentracion magia [rápida] astilla | atacar [agresiva] #A1B2C3',
        ],
      },
    },
    'concentración': {
      fn: (args)=>ConcentracionSystem.cmdConcentracion(args.join(' ')),
      meta: { titulo:'concentración', color:'t-acc', desc:'Alias acentuado.' },
    },
  },
};
