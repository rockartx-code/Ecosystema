// ════════════════════════════════════════════════════════════════
// ENTITY — Clase base + Registro de fábricas
//
// El core solo conoce este contrato. Creature, NPC y Enemy son
// implementaciones que los plugins registran en EntityRegistry.
// El motor crea entidades llamando EntityRegistry.create(tipo, data)
// y las trata siempre como Entity, sin saber nada más.
// ════════════════════════════════════════════════════════════════

class Entity {
  constructor(data = {}) {
    // ── Identidad (siempre presente en el core) ──────────────────
    this.id     = data.id     || U.uid();
    this.nombre = data.nombre || '?';
    this.tipo   = data.tipo   || 'entity';  // 'creature' | 'npc' | 'enemy'
    this.nodeId = data.nodeId || null;
    this.estado = data.estado || 'activo';

    // ── Stats base ───────────────────────────────────────────────
    this.hp    = data.hp    || 10;
    this.maxHp = data.maxHp || this.hp;
    this.atk   = data.atk   || 0;
    this.def   = data.def   || 0;
    this.tags  = data.tags  || [];

    // ── Extensiones de dominio ───────────────────────────────────
    // Los plugins escriben aquí sus datos específicos sin contaminar
    // la estructura base. Ejemplo: { voluntad:40, afinidad:0, linaje:{} }
    this._ext = data._ext || {};
  }

  // ── Contrato de ciclo de vida ────────────────────────────────
  // El motor llama estos métodos en los momentos apropiados.
  // Las implementaciones de plugins los sobreescriben.

  /** Llamado por EntityRegistry.tickAll() en cada Clock.tick() */
  onTick(clock) {}

  /** Llamado por World.visit() cuando el jugador entra al nodo */
  onNodeEnter(nodeId) {}

  /** Llamado al inicio de un combate que involucra esta entidad */
  onCombatStart(battle) {}

  /** Llamado al recibir daño, antes de aplicarlo */
  onDamage(amount, source) { return amount; }

  /** Llamado al morir */
  onDeath(killer) {}

  // ── Serialización ────────────────────────────────────────────
  serialize() {
    return {
      id:     this.id,
      nombre: this.nombre,
      tipo:   this.tipo,
      nodeId: this.nodeId,
      estado: this.estado,
      hp:     this.hp,
      maxHp:  this.maxHp,
      atk:    this.atk,
      def:    this.def,
      tags:   this.tags,
      _ext:   this._ext,
    };
  }

  static deserialize(data) {
    return EntityRegistry.create(data.tipo, data);
  }
}

// ── EntityRegistry ────────────────────────────────────────────────
// Mapa de tipo → función fábrica. Los plugins llaman
// EntityRegistry.register('creature', fn) en su onLoad.
// El mundo llama EntityRegistry.create('creature', data, ctx).
const EntityRegistry = {
  _factories: {},   // tipo → (data, ctx) => Entity

  /**
   * Registra una fábrica para un tipo de entidad.
   * El plugin que implementa Creatures llama:
   *   EntityRegistry.register('creature', (data, ctx) => new CreatureImpl(data, ctx))
   */
  register(tipo, factoryFn) {
    this._factories[tipo] = factoryFn;
    EventBus.emit('entity:factory_registered', { tipo });
  },

  /**
   * Crea una entidad del tipo indicado.
   * Si no hay fábrica registrada, devuelve una Entity base funcional
   * para que el motor no explote si un plugin no está cargado.
   */
  create(tipo, data = {}, context = {}) {
    const factory = this._factories[tipo];
    if(factory) {
      try { return factory(data, context); }
      catch(e) { console.warn(`[EntityRegistry] Error en fábrica de "${tipo}":`, e); }
    }
    // Fallback: entidad genérica funcional sin comportamiento especial
    console.warn(`[EntityRegistry] Sin fábrica para "${tipo}". Usando Entity base.`);
    return new Entity({ ...data, tipo });
  },

  has(tipo) { return !!this._factories[tipo]; },

  // ── Tick global: Clock llama esto ───────────────────────────
  // Itera todas las entidades vivas del mundo + NPCs en GS
  // y llama onTick(clock) en cada una.
  tickAll(clock) {
    // Entidades en nodos (enemies + creatures)
    Object.values(World.all()).forEach(nodo => {
      for(const e of (nodo.enemies   || [])) if(typeof e.onTick==='function') e.onTick(clock);
      for(const c of (nodo.creatures || [])) if(typeof c.onTick==='function') c.onTick(clock);
    });

    // NPCs viven en GS separados de los nodos
    GS.aliveNPCs().forEach(npc => {
      if(typeof npc.onTick==='function') npc.onTick(clock);
    });

    // Permitir que plugins reaccionen al tick de entidades también
    // (útil para sistemas de estado globales)
    EventBus.emit('entity:tick_all', { clock });
  },
};
