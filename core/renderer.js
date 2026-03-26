// ════════════════════════════════════════════════════════════════
// RENDERER — Adaptador HTML
//
// Este archivo es el ÚNICO que conoce el DOM.
// Escucha todos los eventos output:* del IOBus y los materializa
// en el terminal HTML.
//
// Para cambiar la UI (React, canvas, terminal ANSI, headless):
//   — Eliminar este archivo
//   — Crear un nuevo adaptador que escuche los mismos eventos
//   — El motor no requiere ningún cambio
//
// Contrato de IDs HTML que este adaptador necesita:
//   #out        — área de texto del terminal
//   #sbar       — barra de status (contenedor)
//   #boot       — pantalla de boot (puede no existir)
//   #hmod       — versión en el header
//   s-{id}      — spans de cada slot de la status bar
// ════════════════════════════════════════════════════════════════

const Renderer = (() => {

  // ── Referencias al DOM ────────────────────────────────────────
  const _out = () => document.getElementById('out');

  // ── Helpers internos ──────────────────────────────────────────
  function _append(el) {
    const out = _out();
    if(!out) return;
    out.appendChild(el);
    out.scrollTop = out.scrollHeight;
  }

  function _mkLine(text, color = 't-out', bold = false) {
    const d = document.createElement('div');
    d.className = 'ln' + (bold ? ' bl' : '');
    const s = document.createElement('span');
    s.className = color;
    s.textContent = text;
    d.appendChild(s);
    return d;
  }

  // ── Escuchar eventos del IOBus ────────────────────────────────

  // output:line — línea de texto normal
  EventBus.on('output:line', ({ text, color = 't-out', bold = false }) => {
    _append(_mkLine(text, color, bold));
  }, 'renderer');

  // output:sep — separador ────────────────────────────────────
  EventBus.on('output:sep', ({ char = '─', len = 46 }) => {
    const d = document.createElement('div');
    d.className = 'ln sep';
    d.textContent = char.repeat(len);
    _append(d);
  }, 'renderer');

  // output:space — línea en blanco
  EventBus.on('output:space', () => {
    const d = document.createElement('div');
    d.className = 'ln sp';
    _append(d);
  }, 'renderer');

  // output:echo — comando tecleado por el jugador
  EventBus.on('output:echo', ({ raw }) => {
    const d = document.createElement('div');
    d.className = 'ln pecho';
    const prompt = document.createElement('span');
    prompt.className = 't-dim';
    prompt.textContent = '› ';
    const text = document.createElement('span');
    // Sanitizar para evitar XSS
    text.textContent = raw;
    d.appendChild(prompt);
    d.appendChild(text);
    _append(d);
  }, 'renderer');

  // output:typewriter — texto letra a letra
  EventBus.on('output:typewriter', ({ text, color = 't-out', delay = 18, _resolve }) => {
    const d = document.createElement('div');
    d.className = 'ln';
    const s = document.createElement('span');
    s.className = color;
    d.appendChild(s);
    _append(d);
    const out = _out();
    const clean = text.replace(/<[^>]+>/g, '');
    let i = 0;
    const step = () => {
      if(i < clean.length) {
        s.textContent += clean[i++];
        if(out) out.scrollTop = out.scrollHeight;
        setTimeout(step, delay);
      } else {
        if(_resolve) _resolve();
      }
    };
    step();
  }, 'renderer');

  // output:status — actualizar slots de la barra de estado
  EventBus.on('output:status', ({ slots }) => {
    for(const [id, val] of Object.entries(slots)) {
      const el = document.getElementById('s-' + id);
      if(!el) continue;
      if(typeof val === 'string') {
        el.textContent = val;
        el.className   = '';
      } else if(val && typeof val === 'object') {
        el.textContent = val.text ?? '—';
        el.className   = val.color ?? '';
      }
    }
    // Actualizar status bars de plugins registrados en PluginLoader
    PluginLoader.updateStatusBar();
  }, 'renderer');

  // output:clear — limpiar terminal
  EventBus.on('output:clear', () => {
    const out = _out();
    if(out) out.innerHTML = '';
  }, 'renderer');

  // output:boot — actualizar línea del boot screen
  EventBus.on('output:boot', ({ id, text, state = 'ok' }) => {
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = text;
    el.className   = 'bl ' + state;
  }, 'renderer');

  // ── API pública del adaptador ─────────────────────────────────
  // Solo se usa desde main.js para inicializar el header
  // y montar el adaptador de input. El motor no lo llama.

  function setHeader(text) {
    const el = document.getElementById('hmod');
    if(el) el.textContent = text;
  }

  function hideBoot() {
    const bootEl = document.getElementById('boot');
    if(!bootEl) return Promise.resolve();
    bootEl.style.opacity = '0';
    return new Promise(r => setTimeout(() => { bootEl.remove(); r(); }, 350));
  }

  return { setHeader, hideBoot };
})();

// ════════════════════════════════════════════════════════════════
// INPUT ADAPTER — HTML
//
// Este objeto es el ÚNICO que escucha eventos de teclado del DOM.
// Llama In.submit() cuando el jugador pulsa Enter.
// Gestiona historial y autocomplete a nivel de UI.
// El motor no sabe que existe un <input> HTML.
// ════════════════════════════════════════════════════════════════

const InputAdapter = (() => {

  // ── Historial de comandos ─────────────────────────────────────
  const Hist = {
    h: [], i: -1,
    push(cmd) { if(cmd) { this.h.unshift(cmd); this.i = -1; } },
    up()   { this.i = Math.min(this.i + 1, this.h.length - 1); return this.h[this.i] || ''; },
    down() { this.i = Math.max(this.i - 1, 0); return this.h[this.i] || ''; },
  };

  function mount() {
    const inp = document.getElementById('inp');
    if(!inp) return;

    // Registrar este adaptador en el bus de entrada
    In.register(InputAdapter);

    inp.addEventListener('input', () => {
      if(typeof AC !== 'undefined') AC.update?.();
    });

    inp.addEventListener('keydown', async e => {
      const acOpen = typeof AC !== 'undefined' && AC.isOpen?.();

      // Navegación autocomplete
      if(acOpen) {
        if(e.key === 'ArrowDown')  { AC.moveDown?.(); e.preventDefault(); return; }
        if(e.key === 'ArrowUp')    { if(!AC.moveUp?.()) AC.hide?.(); e.preventDefault(); return; }
        if(e.key === 'Tab' || e.key === 'ArrowRight') { if(AC.accept?.()) { e.preventDefault(); return; } }
        if(e.key === 'Escape')     { AC.hide?.(); e.preventDefault(); return; }
      } else {
        // Historial con flechas
        if(e.key === 'ArrowUp')   { inp.value = Hist.up();   if(typeof AC !== 'undefined') AC.hide?.(); e.preventDefault(); return; }
        if(e.key === 'ArrowDown') { inp.value = Hist.down(); if(typeof AC !== 'undefined') AC.hide?.(); e.preventDefault(); return; }
        if(e.key === 'Tab')       { e.preventDefault(); if(typeof AC !== 'undefined') AC.update?.(); return; }
      }

      if(e.key === 'Enter') {
        if(typeof AC !== 'undefined') AC.hide?.();
        const raw = inp.value.trim();
        if(!raw) return;
        Hist.push(raw);
        inp.value = '';
        // Delegar al motor — sin más lógica aquí
        await In.submit(raw);
      }
    });

    inp.addEventListener('blur',  () => setTimeout(() => { if(typeof AC !== 'undefined') AC.hide?.(); }, 150));
    inp.addEventListener('focus', () => { if(inp.value.trim() && typeof AC !== 'undefined') AC.update?.(); });

    // Click en el output también devuelve el foco al input
    const out = document.getElementById('out');
    if(out) out.addEventListener('click', () => inp.focus());

    // Foco inicial
    inp.focus();
  }

  return { mount, Hist };
})();
