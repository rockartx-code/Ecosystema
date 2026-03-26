// ════════════════════════════════════════════════════════════════
// SAVE / LOAD / DIE — Persistencia y muerte permanente
// ════════════════════════════════════════════════════════════════

function save() {
  localStorage.setItem('eco_v12', JSON.stringify({
    ver:'1.2',
    world:  World.ser(),
    player: Player.ser(),
    gs:     GS.ser(),
    clock:  Clock.ser(),
    plugins:PluginLoader.ser(),
    xp:     typeof XP     !== 'undefined' ? XP.ser()     : null,
  }));
  if(typeof Net !== 'undefined' && Net.isHost()) {
    EventBus.emit('net:patch', {
      type:'WORLD_PATCH',
      world:World.ser(), gs:GS.ser(), clock:Clock.ser(),
      xp: typeof XP !== 'undefined' ? XP.ser() : null,
      players: Net.getPlayers(),
    });
  }
}

function loadSave() {
  const raw = localStorage.getItem('eco_v12');
  if(!raw) return false;
  try {
    const d = JSON.parse(raw);
    World.load(d.world);
    Player.load(d.player);
    GS.load(d.gs);
    Clock.load(d.clock);
    if(d.plugins) PluginLoader.load(d.plugins);
    if(d.xp && typeof XP !== 'undefined') XP.load(d.xp);
    return true;
  } catch { return false; }
}

function die(causa = 'desconocida') {
  Player.get().causa_muerte = causa;
  EventBus.emit('player:die', { player:Player.get(), causa });
  if(typeof RunMem !== 'undefined') RunMem.registrar(Player.get(), GS.aliveNPCs(), GS.allMisiones(), World.seed);
  localStorage.removeItem('eco_v12');

  Out.sp(); Out.sep('═');
  Out.line(`EPITAFIO — ${Player.get().name}`, 't-cor', true);
  Out.line(`Ciclos: ${Clock.cycle}  ·  Causa: ${causa}`, 't-dim');
  Out.line(`Misiones: ${GS.allMisiones().filter(m=>m.completada).length} completadas  ·  Kills: ${Player.get().stats?.kills||0}`, 't-dim');
  if(GS.twists?.length) Out.line(`Verdades: ${GS.twists.map(t=>t.titulo).join(', ')}`, 't-twi');

  const arcsCompletos = GS.allArcs?.().filter(a=>a.estado!=='latente'&&a.epitafio) || [];
  if(arcsCompletos.length) {
    Out.sep('─'); Out.line('Arcos narrativos:', 't-acc');
    arcsCompletos.forEach(a => {
      const col = a.resultado==='victoria'?'t-cra':a.resultado==='tragedia'?'t-pel':'t-mem';
      Out.line(`  ${typeof ArcEngine !== 'undefined' ? ArcEngine.TEMAS[a.tema]?.icon||'◈' : '◈'} "${a.titulo}" — ${a.epitafio}`, col);
    });
  }

  if(PluginLoader.order.length) Out.line(`Plugins activos: ${PluginLoader.order.join(', ')}`, 't-eco');
  Out.sep('─');
  if(typeof RunMem !== 'undefined') Out.line(`Run ${RunMem.count()} registrada.`, 't-eco');
  Out.line('Escribe "nuevo" para continuar.', 't-dim');
  Out.sep('═');
}

// ── Exportar partida como archivo .ecohex ─────────────────────
function exportarPartida() {
  try {
    const json  = JSON.stringify({ ver:'1.4', ts:Date.now(), world:World.ser(), player:Player.ser(), gs:GS.ser(), clock:Clock.ser(), plugins:PluginLoader.ser(), xp:typeof XP!=='undefined'?XP.ser():null });
    const bytes = new TextEncoder().encode(json);
    let hex = '45434f14';  // ECO + v1.4
    const len = bytes.length;
    hex += [(len>>>24)&0xff,(len>>>16)&0xff,(len>>>8)&0xff,len&0xff].map(b=>b.toString(16).padStart(2,'0')).join('');
    for(let i=0;i<bytes.length;i++) hex += bytes[i].toString(16).padStart(2,'0');
    let crc=0; for(let i=0;i<bytes.length;i++) crc=(crc+bytes[i])>>>0;
    hex += crc.toString(16).padStart(8,'0');
    const blob = new Blob([hex],{type:'application/octet-stream'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const fname= `ECO_${Player.get().name.replace(/\s+/g,'_')}_C${Clock.cycle}_${Date.now().toString(36)}.ecohex`;
    a.href=url; a.download=fname;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),2000);
    Out.sp();
    Out.line(`✓ Partida exportada: ${fname}`, 't-cra', true);
    Out.line(`Jugador: ${Player.get().name}  Ciclo: ${Clock.cycle}  ${(hex.length/2/1024).toFixed(1)}KB`, 't-dim');
    Out.sp();
  } catch(e) { Out.line(`Error al exportar: ${e.message}`, 't-pel'); }
}

// ── Importar partida desde archivo .ecohex ────────────────────
function importarPartida() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.ecohex,.hex,.bin,.txt'; input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = async () => {
    const file = input.files?.[0];
    document.body.removeChild(input);
    if(!file) { Out.line('Importación cancelada.','t-dim'); return; }
    try {
      Out.line(`Leyendo ${file.name}...`,'t-mem');
      const hex = (await file.text()).trim().replace(/\s/g,'').toLowerCase();
      if(!hex.startsWith('45434f')) { Out.line('Archivo inválido.','t-pel'); return; }
      const len = (parseInt(hex.slice(8,10),16)<<24)|(parseInt(hex.slice(10,12),16)<<16)|(parseInt(hex.slice(12,14),16)<<8)|parseInt(hex.slice(14,16),16);
      const dataHex = hex.slice(16, 16+len*2);
      const bytes = new Uint8Array(len);
      for(let i=0;i<len;i++) bytes[i] = parseInt(dataHex.slice(i*2,i*2+2),16);
      const d = JSON.parse(new TextDecoder().decode(bytes));
      World.load(d.world); Player.load(d.player); GS.load(d.gs); Clock.load(d.clock);
      if(d.plugins) PluginLoader.load(d.plugins);
      if(d.xp && typeof XP !== 'undefined') XP.load(d.xp);
      localStorage.setItem('eco_v12', JSON.stringify(d));
      Out.sp(); Out.sep('═');
      Out.line('✓ PARTIDA IMPORTADA', 't-cra', true);
      Out.line(`Jugador: ${Player.get().name}  Ciclo: ${Clock.cycle}`, 't-dim');
      Out.sep('═'); Out.sp();
      if(typeof cmdMirar === 'function') cmdMirar();
      refreshStatus();
    } catch(e) { Out.line(`Error al importar: ${e.message}`,'t-pel'); }
  };
  input.click();
}
