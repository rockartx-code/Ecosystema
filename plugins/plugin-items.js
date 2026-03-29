// ════════════════════════════════════════════════════════════════
// PLUGIN: Items v2.0
// Catalogo y uso tactico de items desacoplados a plugin.
// ════════════════════════════════════════════════════════════════

(function initItemsPlugin(global) {
  function _svc(name) {
    return (typeof ServiceRegistry !== 'undefined' && typeof ServiceRegistry.get === 'function')
      ? ServiceRegistry.get(name)
      : null;
  }
  function _elementColor(element) {
    const fn = _svc('runtime.tactics.element_color');
    return typeof fn === 'function' ? (fn(element) || 't-cra') : 't-cra';
  }
  function _woundMeta(key) {
    const fn = _svc('runtime.tactics.wound_meta');
    return typeof fn === 'function' ? fn(key) : null;
  }
  function _player() {
    const fn = _svc('runtime.player.current');
    return typeof fn === 'function' ? fn() : null;
  }
  function _playerRemoveItem(itemId) {
    const fn = _svc('runtime.player.remove_item');
    return typeof fn === 'function' ? !!fn(itemId) : false;
  }
  function _line(text, color='t-out', bold=false) {
    const fn = _svc('runtime.output.line');
    if(typeof fn === 'function') fn(text, color, bold);
  }
  function _refreshStatus() {
    const fn = _svc('runtime.status.refresh');
    if(typeof fn === 'function') fn();
  }

  function createItemsApi() {
    const CATALOGO = {
      venda_burda:{ nombre:'Venda Burda', tipo:'medicina', efecto:'curar_herida', herida:'HEMORRAGIA', hp:5, desc:'Para hemorragias.', tags:['medicina','vendaje'] },
      tintura_amarga:{ nombre:'Tintura Amarga', tipo:'medicina', efecto:'curar_herida', herida:'ENVENENAMIENTO', hp:0, desc:'Limpia venenos.', tags:['medicina','alquimia'] },
      ungüento_hueso:{ nombre:'Ungüento de Hueso', tipo:'medicina', efecto:'curar_herida', herida:'FRACTURA', hp:8, desc:'Acelera consolidación.', tags:['medicina','hueso'] },
      agua_claridad:{ nombre:'Agua de Claridad', tipo:'medicina', efecto:'curar_herida', herida:'CONMOCION', hp:3, desc:'Disipa desorientación.', tags:['medicina','mental'] },
      bálsamo_piel:{ nombre:'Bálsamo de Piel', tipo:'medicina', efecto:'curar_herida', herida:'QUEMADURA', hp:6, desc:'Regenera piel dañada.', tags:['medicina','fuego'] },
      medicina_mayor:{ nombre:'Medicina Mayor', tipo:'medicina', efecto:'curar_todas', hp:15, desc:'Trata todas las heridas.', tags:['medicina','reliquia'] },
      suero_quimera:{ nombre:'Suero de Quimera', tipo:'medicina', efecto:'curar_todas', hp:22, desc:'Sella heridas complejas y regenera tejido.', tags:['medicina','quimera','élite'] },
      polvo_vitalidad:{ nombre:'Polvo de Vitalidad', tipo:'consumible', efecto:'stamina', valor:40, desc:'Recupera stamina rápido.', tags:['energía','polvo'] },
      esencia_mente:{ nombre:'Esencia de Mente', tipo:'consumible', efecto:'mana', valor:25, desc:'Restaura concentración mágica.', tags:['energía','mental'] },
      raíz_resistente:{ nombre:'Raíz Resistente', tipo:'consumible', efecto:'stamina_max', valor:20, desc:'Aumenta stamina máxima temporalmente.', tags:['energía','natural'] },
      cristal_maná:{ nombre:'Cristal de Maná', tipo:'consumible', efecto:'mana_max', valor:15, desc:'Expande capacidad mental.', tags:['energía','cristal'] },
      fragmento_cura:{ nombre:'Fragmento de Cura', tipo:'consumible', efecto:'hp', valor:15, desc:'Cura básica instantánea.', tags:['curación','fragmento'] },
      néctar_antiguo:{ nombre:'Néctar Antiguo', tipo:'consumible', efecto:'hp', valor:30, desc:'Restauración profunda.', tags:['curación','antiguo'] },
      brebaje_meteorico:{ nombre:'Brebaje Meteórico', tipo:'consumible', efecto:'stamina', valor:55, desc:'Impulso explosivo de energía corporal.', tags:['energía','élite'] },
      foco_lucido:{ nombre:'Foco Lúcido', tipo:'consumible', efecto:'mana', valor:35, desc:'Claridad mental prolongada.', tags:['mental','foco'] },
      aceite_llama:{ nombre:'Aceite de Llama', tipo:'consumible', efecto:'elemento_arma', elemento:'ARDIENDO', dur:3, desc:'Unta el arma con fuego.', tags:['fuego','aceite'] },
      polvo_hielo:{ nombre:'Polvo de Hielo', tipo:'consumible', efecto:'elemento_arma', elemento:'CONGELADO', dur:3, desc:'Cristales que congelan.', tags:['hielo','polvo'] },
      resina_rayo:{ nombre:'Resina de Rayo', tipo:'consumible', efecto:'elemento_arma', elemento:'ELECTRIZADO', dur:3, desc:'Conduce electricidad.', tags:['rayo','resina'] },
      esencia_vacío:{ nombre:'Esencia de Vacío', tipo:'consumible', efecto:'elemento_arma', elemento:'VACÍO', dur:2, desc:'Ignora parte de la defensa.', tags:['vacío','esencia'] },
      agua_eco:{ nombre:'Agua de Eco', tipo:'consumible', efecto:'elemento_arma', elemento:'MOJADO', dur:4, desc:'Facilita reacciones.', tags:['agua','eco'] },
      tinta_abisal:{ nombre:'Tinta Abisal', tipo:'consumible', efecto:'elemento_arma', elemento:'VACÍO', dur:4, desc:'Sello umbral sobre el filo.', tags:['vacío','abismo'] },
      ceniza_fulgor:{ nombre:'Ceniza de Fulgor', tipo:'consumible', efecto:'elemento_arma', elemento:'ARDIENDO', dur:5, desc:'Ignición de alta persistencia.', tags:['fuego','élite'] },
      kit_reparacion:{ nombre:'Kit de Reparación', tipo:'reparacion', efecto:'reparar', valor:40, desc:'Restaura 40% durabilidad.', tags:['herramienta','metal'] },
      kit_maestro:{ nombre:'Kit Maestro', tipo:'reparacion', efecto:'reparar_total', valor:100, desc:'Restaura 100% + mejora.', tags:['herramienta','maestra'] },
      lima_afilado:{ nombre:'Lima de Afilado', tipo:'reparacion', efecto:'afilar', valor:10, desc:'ATK del arma +2 permanente.', tags:['herramienta','filo'] },
      piedra_calibrada:{ nombre:'Piedra Calibrada', tipo:'reparacion', efecto:'afilar', valor:14, desc:'Rebalancea el arma para golpes críticos.', tags:['herramienta','precisión'] },
      piedra_poise:{ nombre:'Piedra de Poise', tipo:'potenciador', efecto:'poise_shield', valor:30, desc:'El próximo golpe no rompe postura.', tags:['defensa','poise'] },
      talismán_reac:{ nombre:'Talismán Reactivo', tipo:'potenciador', efecto:'reaccion_boost', valor:1.5, desc:'Próxima reacción elemental ×1.5.', tags:['elemental','talismán'] },
      polvo_humo:{ nombre:'Polvo de Humo', tipo:'potenciador', efecto:'niebla_personal', desc:'40% fallo en ataques contra ti, 2 turnos.', tags:['evasión','polvo'] },
      cristal_poise:{ nombre:'Cristal de Poise', tipo:'potenciador', efecto:'romper_poise', desc:'Rompe postura del enemigo más cercano.', tags:['poise','cristal'] },
      runa_filo:{ nombre:'Runa de Filo', tipo:'potenciador', efecto:'afilar', valor:12, desc:'Encantamiento físico: ATK del arma +2.', tags:['encantamiento','metal'] },
      runa_escama:{ nombre:'Runa de Escama', tipo:'potenciador', efecto:'poise_shield', valor:40, desc:'Encantamiento defensivo de postura.', tags:['encantamiento','defensa'] },
      esfera_resonante:{ nombre:'Esfera Resonante', tipo:'potenciador', efecto:'reaccion_boost', valor:1.8, desc:'Amplifica reacciones elementales.', tags:['resonante','encantamiento'] },
      sello_umbral:{ nombre:'Sello de Umbral', tipo:'potenciador', efecto:'niebla_personal', desc:'Niebla de desvío para evasión temporal.', tags:['vacío','umbral'] },
      espejo_de_fase:{ nombre:'Espejo de Fase', tipo:'potenciador', efecto:'niebla_personal', desc:'Distorsiona presencia y postura.', tags:['fase','evasión'] },
      talisman_enfoque:{ nombre:'Talismán de Enfoque', tipo:'potenciador', efecto:'concentracion_boost', valor:0.14, conc:8, desc:'Aumenta concentración y estabiliza cadenas por 1 combate.', tags:['concentración','mental'] },
      incienso_calma:{ nombre:'Incienso de Calma', tipo:'potenciador', efecto:'concentracion_boost', valor:0.08, conc:4, desc:'Reduce la inestabilidad de combinaciones complejas.', tags:['concentración','ritual'] },
      núcleo_lucidez:{ nombre:'Núcleo de Lucidez', tipo:'potenciador', efecto:'concentracion_boost', valor:0.20, conc:12, desc:'Foco extremo para ejecutar cadenas largas.', tags:['concentración','élite'] },
      ampolla_fenix:{ nombre:'Ampolla Fénix', tipo:'consumible', efecto:'hp', valor:50, desc:'Curación extrema de emergencia.', tags:['legendario','curación'] },
      polvo_astrolito:{ nombre:'Polvo Astrolito', tipo:'consumible', efecto:'mana', valor:45, desc:'Inyección de maná cristalino.', tags:['legendario','mental'] },
      prisma_dual:{ nombre:'Prisma Dual', tipo:'consumible', efecto:'elemento_arma', elemento:'RESONANTE', dur:5, desc:'Infusión resonante prolongada.', tags:['legendario','resonante'] },
    };

    function _inferirEfecto(item) {
      const tags = item.tags || [];
      if(tags.includes('medicina')) return { efecto:'curar_todas', hp:10 };
      if(item.hp) return { efecto:'hp', valor:item.hp };
      if(item.stamina) return { efecto:'stamina', valor:item.stamina };
      if(tags.includes('consumible')) return { efecto:'hp', valor:5 };
      return null;
    }

    function aplicar(item, battle) {
      const p = _player();
      if(!p) return false;
      const def = CATALOGO[item.blueprint] || _inferirEfecto(item);
      if(!def) { _line(`"${item.nombre || item.blueprint}" sin efecto táctico conocido.`, 't-dim'); return false; }
      const efecto = def.efecto || item.efecto;

      switch(efecto) {
        case 'curar_herida': {
          const h = def.herida;
          if(!(p.heridas || []).includes(h)) { _line(`No tienes ${h}.`, 't-dim'); return false; }
          p.heridas = p.heridas.filter(x => x !== h);
          if(def.hp) p.hp = Math.min(p.maxHp, p.hp + def.hp);
          _line(`✓ ${h} curada.${def.hp ? ` +${def.hp}HP` : ''}`, 't-mem');
          break;
        }
        case 'curar_todas': {
          const n = (p.heridas || []).length;
          p.heridas = [];
          if(def.hp) p.hp = Math.min(p.maxHp, p.hp + def.hp);
          _line(`✓ ${n} herida${n !== 1 ? 's' : ''} curada${n !== 1 ? 's' : ''}. +${def.hp || 0}HP`, 't-mem');
          break;
        }
        case 'stamina': p.stamina = Math.min(p.maxStamina || 100, (p.stamina || 0) + def.valor); _line(`+${def.valor} Stamina  (${p.stamina}/${p.maxStamina || 100})`, 't-cra'); break;
        case 'mana': p.mana = Math.min(p.maxMana || 60, (p.mana || 0) + def.valor); _line(`+${def.valor} Maná  (${p.mana}/${p.maxMana || 60})`, 't-mag'); break;
        case 'stamina_max': p.maxStamina = (p.maxStamina || 100) + def.valor; p.stamina = Math.min(p.maxStamina, p.stamina || 0); _line(`Stamina máxima +${def.valor} → ${p.maxStamina}`, 't-cra'); break;
        case 'mana_max': p.maxMana = (p.maxMana || 60) + def.valor; p.mana = Math.min(p.maxMana, p.mana || 0); _line(`Maná máximo +${def.valor} → ${p.maxMana}`, 't-mag'); break;
        case 'hp': p.hp = Math.min(p.maxHp, p.hp + def.valor); _line(`+${def.valor}HP  (${p.hp}/${p.maxHp})`, 't-cra'); break;
        case 'elemento_arma': {
          const arma = p.equipped?.arma;
          if(!arma) { _line('No tienes arma equipada.', 't-dim'); return false; }
          arma._elemento_temporal = def.elemento;
          arma._elemento_dur = def.dur || 3;
          arma.tags = arma.tags || [];
          if(!arma.tags.includes(def.elemento.toLowerCase())) arma.tags.push(def.elemento.toLowerCase());
          _line(`${arma.nombre || arma.blueprint} infundida con ${def.elemento} (${def.dur} ataques).`, _elementColor(def.elemento));
          break;
        }
        case 'reparar': {
          const arma = p.equipped?.arma || p.inventory.find(i => i.tipo === 'arma');
          if(!arma) { _line('No hay arma que reparar.', 't-dim'); return false; }
          const antes = arma.durabilidad || 0;
          arma.durabilidad = Math.min(100, (arma.durabilidad || 0) + def.valor);
          arma.mellada = arma.durabilidad > 0 ? false : arma.mellada;
          _line(`${arma.nombre || arma.blueprint}: durabilidad ${antes}% → ${arma.durabilidad}%`, 't-cra');
          break;
        }
        case 'reparar_total': {
          const arma = p.equipped?.arma || p.inventory.find(i => i.tipo === 'arma');
          if(!arma) { _line('No hay arma que reparar.', 't-dim'); return false; }
          arma.durabilidad = 100; arma.mellada = false; arma.atk = (arma.atk || 0) + 1;
          _line(`${arma.nombre || arma.blueprint}: restaurada 100% · ATK +1`, 't-cra');
          break;
        }
        case 'afilar': {
          const arma = p.equipped?.arma || p.inventory.find(i => i.tipo === 'arma');
          if(!arma) { _line('No hay arma que afilar.', 't-dim'); return false; }
          arma.atk = (arma.atk || 0) + 2;
          _line(`${arma.nombre || arma.blueprint}: ATK +2 permanente`, 't-cra');
          break;
        }
        case 'poise_shield': p._poise_shield = true; _line('Escudo de postura activo: el próximo golpe no romperá tu postura.', 't-sis'); break;
        case 'reaccion_boost': p._reaccion_boost = def.valor || 1.5; _line(`Próxima reacción elemental ×${def.valor || 1.5}.`, 't-cor'); break;
        case 'niebla_personal': p._niebla_turnos = 2; _line('Niebla personal: 40% fallo en ataques contra ti (2 turnos).', 't-dim'); break;
        case 'romper_poise': {
          if(!battle) { _line('Solo funciona en batalla.', 't-dim'); return false; }
          const target = battle.cola.find(c => c.vivo && c.tipo !== 'player');
          if(!target) { _line('Sin objetivo.', 't-dim'); return false; }
          target.poise = 0; target.poise_roto = true; target.poise_turnos = 2;
          battleLog(battle, `⚡ ${target.name} POSTURA ROTA por ${item.nombre || item.blueprint}!`, 't-cor');
          break;
        }
        case 'concentracion_boost': {
          p.ext = p.ext || {};
          const cmax = p.ext.concentracion_max || 100;
          const bonusConc = def.conc || 5;
          const before = p.ext.concentracion || 0;
          p.ext.concentracion = Math.min(cmax, before + bonusConc);
          p._concentracion_focus = Math.max(p._concentracion_focus || 0, def.valor || 0.1);
          _line(`Concentración +${p.ext.concentracion - before} (${p.ext.concentracion}/${cmax}) · enfoque táctico activo.`, 't-acc');
          break;
        }
        default:
          if(def.hp || item.hp) { const v = def.hp || item.hp; p.hp = Math.min(p.maxHp, p.hp + v); _line(`+${v}HP`, 't-cra'); }
          else _line(`Usas ${item.nombre || item.blueprint}.`, 't-dim');
      }

      _playerRemoveItem(item.id);
      _refreshStatus();
      return true;
    }

    function genLootTactico(nodeType, rng) {
      const pools = {
        hub:['fragmento_cura','polvo_vitalidad','kit_reparacion','foco_lucido','incienso_calma'],
        ruina:['kit_reparacion','lima_afilado','piedra_poise','agua_eco','piedra_calibrada','talisman_enfoque'],
        bosque:['venda_burda','raíz_resistente','aceite_llama','agua_eco','runa_filo','brebaje_meteorico','incienso_calma'],
        caverna:['tintura_amarga','polvo_hielo','piedra_poise','kit_reparacion','runa_escama','suero_quimera','talisman_enfoque'],
        abismo:['esencia_vacío','talismán_reac','medicina_mayor','cristal_poise','sello_umbral','tinta_abisal','núcleo_lucidez'],
        pantano:['tintura_amarga','venda_burda','esencia_mente','polvo_humo','incienso_calma'],
        yermo:['bálsamo_piel','aceite_llama','resina_rayo','polvo_vitalidad','esfera_resonante','talisman_enfoque'],
        templo:['agua_claridad','talismán_reac','cristal_maná','medicina_mayor','polvo_astrolito','núcleo_lucidez'],
        umbral:['esencia_vacío','néctar_antiguo','cristal_poise','medicina_mayor','ampolla_fenix','prisma_dual','espejo_de_fase','ceniza_fulgor','núcleo_lucidez'],
      };
      const pool = pools[nodeType] || pools.hub;
      const id = U.pick(pool, rng);
      const def = CATALOGO[id];
      if(!def) return null;
      return { id:U.uid(), blueprint:id, nombre:def.nombre, tipo:def.tipo, tags:def.tags || [], efecto:def.efecto, desc:def.desc, herida:def.herida, valor:def.valor, elemento:def.elemento, dur:def.dur, estado:'nativo' };
    }

    function crear(blueprintId) {
      const def = CATALOGO[blueprintId];
      if(!def) return null;
      return { id:U.uid(), blueprint:blueprintId, nombre:def.nombre, tipo:def.tipo, tags:def.tags || [], efecto:def.efecto, desc:def.desc, herida:def.herida, valor:def.valor, elemento:def.elemento, dur:def.dur, estado:'nativo' };
    }

    function cmdItems() {
      const sp = _svc('runtime.output.sp');
      if(typeof sp === 'function') sp();
      _line('— ÍTEMS TÁCTICOS —', 't-acc');
      const p = _player();
      if(!p) return false;
      const tacticos = p.inventory.filter(i => CATALOGO[i.blueprint]);
      if(!tacticos.length) { _line('Sin ítems tácticos. Busca en nodos o forja.', 't-dim'); if(typeof sp === 'function') sp(); return true; }
      const porTipo = {};
      tacticos.forEach(i => { const t = (CATALOGO[i.blueprint]?.tipo || i.tipo); if(!porTipo[t]) porTipo[t] = []; porTipo[t].push(i); });
      Object.entries(porTipo).forEach(([tipo, lista]) => {
        _line(`${tipo.toUpperCase()}:`, 't-acc');
        lista.forEach(i => {
          const def = CATALOGO[i.blueprint];
          const col = tipo === 'medicina' ? 't-mem' : tipo === 'reparacion' ? 't-cra' : tipo === 'potenciador' ? 't-cor' : 't-out';
          _line(`  usar ${i.blueprint}  — ${def.nombre}  ${def.desc || ''}`, col);
        });
      });
      const arma = p.equipped?.arma;
      if(arma) {
        const dur = arma.durabilidad != null ? arma.durabilidad : 100;
        _line(`Arma: ${arma.nombre || arma.blueprint}  Dur:${dur}%${arma.mellada ? ' [MELLADA]' : ''}${arma._elemento_temporal ? ' [' + arma._elemento_temporal + ']' : ''}`, dur < 30 ? 't-pel' : 't-cra');
      }
      if((p.heridas || []).length) {
        if(typeof sp === 'function') sp(); _line('Heridas activas:', 't-pel');
        p.heridas.forEach(h => {
          const hi = _woundMeta(h);
          _line(`  ${hi?.icon || '⚠'} ${h}: ${hi?.desc || ''}`, 't-pel');
        });
      }
      if(typeof sp === 'function') sp();
      return true;
    }

    return { aplicar, genLootTactico, crear, cmdItems, CATALOGO };
  }

  function api() {
    if(!global.__itemsPluginApi) global.__itemsPluginApi = createItemsApi();
    return global.__itemsPluginApi;
  }

  global.pluginItems = {
    id: 'plugin:items',
    nombre: 'Sistema de Items',
    version: '2.0.0',
    descripcion: 'Catalogo tactico y aplicacion de items como plugin.',
    onLoad() { api(); },
    services: {
      'runtime.items.api': () => api(),
      'runtime.items.create': (blueprintId) => api().crear(blueprintId),
      'runtime.items.apply': (item, battle=null) => api().aplicar(item, battle),
      'runtime.items.show': () => api().cmdItems(),
      'runtime.items.catalog': () => api().CATALOGO || {},
    },
  };
})(globalThis);
