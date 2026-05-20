// ════════════════════════════════════════════════════════════════
// PLUGIN-HELPERS — Helpers compartidos por plugins
//
// Cada plugin reimplementaba localmente _svc, _player, _line, etc.
// (~30 lineas x 20 plugins = ~600 lineas duplicadas). Esto centraliza
// la familia de wrappers sobre ServiceRegistry. Los plugins pueden
// seguir definiendo helpers locales si necesitan variantes.
//
// IMPORTANTE: este archivo se carga ANTES de los plugins en index.html.
// Las funciones quedan en scope global y son consultadas desde dentro
// de los IIFE de cada plugin como variables libres.
// ════════════════════════════════════════════════════════════════
'use strict';

function _svc(name) {
  return (typeof ServiceRegistry !== 'undefined' && typeof ServiceRegistry.get === 'function')
    ? ServiceRegistry.get(name)
    : null;
}

// ── Player ────────────────────────────────────────────────────────
function _player() {
  const fn = _svc('runtime.player.current');
  return typeof fn === 'function' ? fn() : null;
}
function _playerPos() {
  const fn = _svc('runtime.player.position');
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
function _playerRemoveItem(itemId) {
  const fn = _svc('runtime.player.remove_item');
  return typeof fn === 'function' ? !!fn(itemId) : false;
}
function _playerGetSlot(tipo) {
  const fn = _svc('runtime.player.get_slot');
  return typeof fn === 'function' ? fn(tipo) : 0;
}
function _playerAddToSlot(tipo, item) {
  const fn = _svc('runtime.player.add_to_slot');
  return typeof fn === 'function' ? !!fn(tipo, item) : false;
}
function _playerRemoveFromSlot(tipo, itemId) {
  const fn = _svc('runtime.player.remove_from_slot');
  return typeof fn === 'function' ? !!fn(tipo, itemId) : false;
}
function _playerFindInSlot(tipo, query='') {
  const fn = _svc('runtime.player.find_in_slot');
  return typeof fn === 'function' ? fn(tipo, query) : null;
}
function _playerFindItem(query='') {
  const fn = _svc('runtime.player.find_item');
  return typeof fn === 'function' ? fn(query) : null;
}
function _playerRecalcResonances() {
  const fn = _svc('runtime.player.recalc_resonances');
  if(typeof fn === 'function') fn();
}
function _playerDamage(amount=0, source=null) {
  const fn = _svc('runtime.player.damage');
  return typeof fn === 'function' ? (Number(fn(amount, source)) || 0) : 0;
}
function _playerAddHab(hab) {
  const fn = _svc('runtime.player.add_hab');
  return typeof fn === 'function' ? !!fn(hab) : false;
}
function _playerAddMag(mag) {
  const fn = _svc('runtime.player.add_mag');
  return typeof fn === 'function' ? !!fn(mag) : false;
}
function _playerRemoveHab(id) {
  const fn = _svc('runtime.player.remove_hab');
  return typeof fn === 'function' ? !!fn(id) : false;
}
function _playerRemoveMag(id) {
  const fn = _svc('runtime.player.remove_mag');
  return typeof fn === 'function' ? !!fn(id) : false;
}
function _playerFindHab(q='') {
  const fn = _svc('runtime.player.find_hab');
  return typeof fn === 'function' ? fn(q) : null;
}
function _playerFindMag(q='') {
  const fn = _svc('runtime.player.find_mag');
  return typeof fn === 'function' ? fn(q) : null;
}

// ── World ─────────────────────────────────────────────────────────
function _worldAll() {
  const fn = _svc('runtime.world.all');
  return typeof fn === 'function' ? (fn() || {}) : {};
}
function _worldNode(nodeId) {
  const fn = _svc('runtime.world.node');
  return typeof fn === 'function' ? fn(nodeId) : null;
}
function _worldExits(nodeId) {
  const fn = _svc('runtime.world.exits');
  return typeof fn === 'function' ? (fn(nodeId) || {}) : {};
}
function _worldVisit(nodeId) {
  const fn = _svc('runtime.world.visit');
  if(typeof fn === 'function') fn(nodeId);
}
function _worldExpandSection(fromNodeId, dir) {
  const fn = _svc('runtime.world.expand_section');
  return typeof fn === 'function' ? fn(fromNodeId, dir) : null;
}
function _worldIsBorder(nodeId) {
  const fn = _svc('runtime.world.is_border');
  return typeof fn === 'function' ? !!fn(nodeId) : false;
}
function _worldRead() {
  const fn = _svc('runtime.world.read');
  return typeof fn === 'function' ? (fn() || {}) : {};
}
function _worldCalcDifficulty() {
  const fn = _svc('runtime.world.calc_difficulty');
  return typeof fn === 'function' ? Number(fn()) || 1.0 : 1.0;
}
function _worldRemoveEnemy(nodeId, enemyId) {
  const fn = _svc('runtime.world.remove_enemy');
  return typeof fn === 'function' ? !!fn(nodeId, enemyId) : false;
}
function _gameDie(causa='desconocida') {
  const fn = _svc('runtime.game.die');
  if(typeof fn === 'function') fn(causa);
}

// ── Clock ─────────────────────────────────────────────────────────
function _clockCurrent() {
  const fn = _svc('runtime.clock.current');
  return typeof fn === 'function' ? (fn() || {}) : {};
}
function _clockTick(delta=1) {
  const fn = _svc('runtime.clock.tick');
  return typeof fn === 'function' ? !!fn(delta) : false;
}

// ── GS — game state (NPCs, misiones, arcs, twists) ────────────────
function _gsAddNPC(npc) {
  const fn = _svc('runtime.gs.add_npc');
  return typeof fn === 'function' ? !!fn(npc) : false;
}
function _gsAllNPCs() {
  const fn = _svc('runtime.gs.all_npcs');
  return typeof fn === 'function' ? (fn() || []) : [];
}
function _gsAliveNPCs() {
  const fn = _svc('runtime.gs.alive_npcs');
  return typeof fn === 'function' ? (fn() || []) : [];
}
function _gsNpc(npcId) {
  const fn = _svc('runtime.gs.npc');
  return typeof fn === 'function' ? fn(npcId) : null;
}
function _gsNPCEnNodo(nodeId) {
  const fn = _svc('runtime.gs.npcs_in_node');
  return typeof fn === 'function' ? (fn(nodeId) || []) : [];
}
function _gsAddMision(mision) {
  const fn = _svc('runtime.gs.add_mision');
  return typeof fn === 'function' ? !!fn(mision) : false;
}
function _gsMision(misionId) {
  const fn = _svc('runtime.gs.mision');
  return typeof fn === 'function' ? fn(misionId) : null;
}
function _gsAllMisiones() {
  const fn = _svc('runtime.gs.all_misiones');
  return typeof fn === 'function' ? (fn() || []) : [];
}
function _gsAddArc(arc) {
  const fn = _svc('runtime.gs.add_arc');
  return typeof fn === 'function' ? !!fn(arc) : false;
}
function _gsArc(arcId) {
  const fn = _svc('runtime.gs.arc');
  return typeof fn === 'function' ? fn(arcId) : null;
}
function _gsAllArcs() {
  const fn = _svc('runtime.gs.all_arcs');
  return typeof fn === 'function' ? (fn() || []) : [];
}
function _gsActiveArcs() {
  const fn = _svc('runtime.gs.active_arcs');
  return typeof fn === 'function' ? (fn() || []) : [];
}
function _gsAddTwist(twist) {
  const fn = _svc('runtime.gs.add_twist');
  return typeof fn === 'function' ? !!fn(twist) : false;
}

// ── Output ────────────────────────────────────────────────────────
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

// ── Status / Save ─────────────────────────────────────────────────
function _refreshStatus() {
  const fn = _svc('runtime.status.refresh');
  if(typeof fn === 'function') fn();
}
function _saveGame() {
  const fn = _svc('runtime.game.save');
  if(typeof fn === 'function') fn();
}

// ── XP ────────────────────────────────────────────────────────────
function _xpApi() {
  const fn = _svc('runtime.xp.api');
  return typeof fn === 'function' ? fn() : null;
}
function _xpGanar(attr, amount, reason) {
  // Acepta dos formas registradas: runtime.xp.gain (directa) y
  // runtime.xp.api.ganar() (envuelta). La primera tiene prioridad.
  const gain = _svc('runtime.xp.gain');
  if(typeof gain === 'function') return !!gain(attr, amount, reason);
  const api = _xpApi();
  if(api && typeof api.ganar === 'function') { api.ganar(attr, amount, reason); return true; }
  return false;
}
function _xpRead() {
  const fn = _svc('runtime.xp.read');
  return typeof fn === 'function' ? (fn() || { ser:null, atributos:{} }) : { ser:null, atributos:{} };
}
