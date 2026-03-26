// ════════════════════════════════════════════════════════════════
// IO BUS — Contratos de entrada y salida
//
// El motor nunca llama R.w() ni document.* directamente.
// Emite eventos a través de Out y recibe comandos a través de In.
// El adaptador (HTML, headless, test) decide cómo renderizar.
//
// ── SALIDA (Out) ─────────────────────────────────────────────────
//
//   Out.line(text, color, bold)    → 'output:line'
//   Out.sep(char, len)             → 'output:sep'
//   Out.sp()                       → 'output:space'
//   Out.echo(raw)                  → 'output:echo'
//   Out.tw(text, color, delay)     → 'output:typewriter'   (Promise)
//   Out.status(slots)              → 'output:status'
//   Out.clear()                    → 'output:clear'
//   Out.boot(id, text, state)      → 'output:boot'
//
// Eventos emitidos — contratos que cualquier adaptador debe escuchar:
//
//   output:line        { text, color, bold }
//   output:sep         { char, len }
//   output:space       {}
//   output:echo        { raw }
//   output:typewriter  { text, color, delay, _resolve }
//   output:status      { slots: { id → value|{text,color} } }
//   output:clear       {}
//   output:boot        { id, text, state }  state: 'pending'|'ok'|'warn'|'plug'
//
// ── ENTRADA (In) ─────────────────────────────────────────────────
//
//   In.submit(raw)     → parsea y despacha el comando
//   In.register(adapter) → registra el adaptador de input activo
//
// Eventos emitidos:
//
//   input:command      { verb, args, raw }   — ya parseado
//   input:raw          { raw }               — antes de parsear
// ════════════════════════════════════════════════════════════════

// ── OUT — API de salida del motor ────────────────────────────────
// Todos los sistemas del juego usan Out.*
// Nunca usan document.*, R.*, ni console.log para output visible.

const Out = {

  // Línea normal de texto con color semántico
  line(text, color = 't-out', bold = false) {
    EventBus.emit('output:line', { text: String(text), color, bold });
  },

  // Separador visual (─────)
  sep(char = '─', len = 46) {
    EventBus.emit('output:sep', { char, len });
  },

  // Línea en blanco / espacio
  sp() {
    EventBus.emit('output:space', {});
  },

  // Eco del comando tecleado por el jugador
  echo(raw) {
    EventBus.emit('output:echo', { raw: String(raw) });
  },

  // Texto letra a letra (typewriter) — retorna Promise
  tw(text, color = 't-out', delay = 18) {
    return new Promise(resolve => {
      EventBus.emit('output:typewriter', { text: String(text), color, delay, _resolve: resolve });
    });
  },

  // Actualizar la status bar con slots declarativos
  // slots: { 'hp': '45/50', 'loc': { text:'Nodo X', color:'t-sis' }, ... }
  status(slots = {}) {
    EventBus.emit('output:status', { slots });
  },

  // Limpiar el output (comando "limpiar")
  clear() {
    EventBus.emit('output:clear', {});
  },

  // Actualizar una línea del boot screen
  boot(id, text, state = 'ok') {
    EventBus.emit('output:boot', { id, text, state });
  },
};

// ── IN — API de entrada del motor ────────────────────────────────
// El adaptador llama In.submit(rawText) cuando el usuario envía un comando.
// El motor nunca escucha eventos DOM directamente.

const In = {
  _adapter: null,

  // El adaptador de input se registra aquí (HTML, test, headless…)
  register(adapter) {
    this._adapter = adapter;
  },

  // Parsear y despachar un comando crudo
  async submit(raw) {
    const trimmed = raw.trim();
    if(!trimmed) return;

    // Emitir el raw antes de parsear (para historial, logging, etc.)
    EventBus.emit('input:raw', { raw: trimmed });

    Out.echo(trimmed);

    const cmd = _parse(trimmed);
    EventBus.emit('input:command', cmd);

    // Despachar al motor
    await dispatch(cmd);

    // Solicitar refresco de status tras cada comando
    _refreshStatus();
  },
};

// ── Parser — función pura, sin DOM ───────────────────────────────
function _parse(raw) {
  const trimmed = raw.trim().replace(/\s+/, ' ');
  const parts   = trimmed.split(' ');
  return { verb: parts[0].toLowerCase(), args: parts.slice(1), raw: trimmed };
}

// ── Refresco de status — reemplaza R.upd() ───────────────────────
// Recoge los slots de la status bar vía EventBus y los emite como
// 'output:status'. Los plugins declaran sus propios slots.
// El motor solo conoce los slots base; el resto los añaden los plugins.

function _refreshStatus() {
  const p     = Player.get();
  const c     = Clock.get();
  const n     = World.node(p.position);

  // Slots base — el motor los conoce porque son intrínsecos al juego
  const slots = {
    'hp':   { text:`${p.hp}/${p.maxHp}`,
              color: p.hp < 15 ? 't-pel' : p.hp < 30 ? 't-mem' : 't-cra' },
    'hun':  { text: p.hunger > 60 ? 'bien' : p.hunger > 30 ? 'hambre' : 'crítico',
              color: p.hunger > 60 ? 't-cra' : p.hunger > 30 ? 't-mem' : 't-pel' },
    'sta':  { text: `${p.stamina ?? p.maxStamina ?? 100}`,
              color: (p.stamina ?? 100) < 20 ? 't-pel' : (p.stamina ?? 100) < 50 ? 't-mem' : 't-out' },
    'mna':  { text: `${p.mana ?? p.maxMana ?? 60}`,
              color: (p.mana ?? 60) < 15 ? 't-pel' : 't-mag' },
    'loc':  { text: n ? n.name.slice(0, 16) : '—', color: 't-sis' },
    'cyc':  { text: `${c.cycle}·${c.name}`,        color: 't-mem' },
    'inv':  { text: `${p.inventory.length}` },
    'npc':  { text: `${GS.npcEnNodo(p.position).length}/${GS.aliveNPCs().length}`,
              color: 't-npc' },
    'mis':  { text: `${GS.activas().length}`, color: 't-mis' },
    'mod':  { text: ModuleLoader.list().join('+') },
  };

  // Los slots de habilidades/magias/compañeros los declaran los plugins
  // via 'output:collect_status' — el motor NO hardcodea estos campos
  const collectPayload = EventBus.emit('output:collect_status', {
    player: p, clock: c, node: n,
    slots,   // plugins pueden añadir o modificar slots
  });

  Out.status(collectPayload?.slots ?? slots);
}

// Exponer _refreshStatus en CTX para que los comandos lo usen
// (reemplaza todos los R.upd() esparcidos)
const refreshStatus = _refreshStatus;
