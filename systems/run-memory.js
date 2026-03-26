// ════════════════════════════════════════════════════════════════
// RUN MEMORY — Memoria persistente entre runs
// Guarda ecos de runs anteriores en localStorage.
// Los ecos aparecen en el mundo como NPCs/entidades fantasma.
// ════════════════════════════════════════════════════════════════
const RunMem = {
  KEY:  'eco_v12_runs',
  data: { runs:[], ecos:[] },

  load() {
    try {
      const r = localStorage.getItem(this.KEY);
      if(r) this.data = JSON.parse(r);
    } catch{}
  },

  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch{}
  },

  registrar(player, npcs, misiones, wseed) {
    let run = {
      id:          U.uid(),
      player_name: player.name,
      player_id:   player.id,
      seed:        wseed,
      ciclos:      Clock.cycle,
      muerte: {
        causa:  player.causa_muerte || '?',
        ciclo:  Clock.cycle,
        phase:  Clock.get().name,
      },
      mis_ok:   misiones.filter(m=>m.completada).map(m=>m.titulo),
      mis_fail: misiones.filter(m=>m.fallida).map(m=>m.titulo),
      legados:  [],
      modulos:  ModuleLoader.list(),
      plugins:  PluginLoader.order,
      ts:       Date.now(),
    };

    if(misiones.some(m=>!m.completada&&!m.fallida))
      run.legados.push({ tipo:'mision_inconclusa', desc:`${player.name} dejó misiones sin resolver.` });

    npcs.filter(n=>n.lealtad>60).forEach(n=>
      run.legados.push({ tipo:'vinculo', desc:`${n.nombre} recordará a ${player.name}.` })
    );

    GS.allArcs?.().filter(a=>a.epitafio).forEach(a=>
      run.legados.push({ tipo:'arc', desc:`${a.titulo}: ${a.epitafio}`, resultado:a.resultado, tema:a.tema })
    );

    const result = EventBus.emit('memory:run_end', { run, player, npcs, misiones });
    if(result?.run) run = result.run;

    this.data.runs.push(run);
    this.data.ecos = this.data.runs.slice(-3).map(r => ({
      run_id:   r.id,
      nombre:   r.player_name,
      ciclos:   r.ciclos,
      muerte:   r.muerte,
      legados:  r.legados,
    }));
    this.save();
  },

  ecos()  { return this.data.ecos  || []; },
  runs()  { return this.data.runs  || []; },
  count() { return this.data.runs.length; },
};
