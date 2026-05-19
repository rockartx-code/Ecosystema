// ════════════════════════════════════════════════════════════════
// EVENTS — Contrato versionado de eventos del runtime
//
// Define los specs (kind, phase, validateIn, validateOut) que el
// EventBus usa para validar payloads. Llamado desde core/main.js
// como parte del bootstrap, antes de registrar plugins.
// ════════════════════════════════════════════════════════════════
'use strict';

const _ev_isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const _ev_isStr = (v) => typeof v === 'string';
const _ev_isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function defineRuntimeEvents(bus) {
  const _isObj = _ev_isObj;
  const _isStr = _ev_isStr;
  const _isNum = _ev_isNum;

  bus.defineEvents({
    // ── UI / Output ──────────────────────────────────────────────
    'output:line': {
      kind:'ui', phase:'observe',
      validateIn: (p)=>_isObj(p) && _isStr(p.text),
    },
    'output:status': {
      kind:'ui', phase:'observe',
      validateIn: (p)=>_isObj(p) && _isObj(p.slots),
    },
    'output:echo':       { kind:'ui', phase:'observe', validateIn: (p)=>_isObj(p) },
    'output:boot':       { kind:'ui', phase:'observe', validateIn: (p)=>_isObj(p) },
    'output:sep':        { kind:'ui', phase:'observe', validateIn: (p)=>_isObj(p) },
    'output:space':      { kind:'ui', phase:'observe', validateIn: (p)=>_isObj(p) || p == null },
    'output:typewriter': { kind:'ui', phase:'observe', validateIn: (p)=>_isObj(p) && _isStr(p.text || '') },
    'output:clear':      { kind:'ui', phase:'observe', validateIn: (p)=>_isObj(p) || p == null },
    'output:collect_status': { kind:'query', phase:'pre', validateIn: (p)=>_isObj(p) },
    'render:node_extra': { kind:'ui', phase:'observe', validateIn: (p)=>_isObj(p) },

    // ── Input / Comandos ─────────────────────────────────────────
    'input:command': {
      kind:'command', phase:'pre',
      validateIn: (p)=>_isObj(p) && _isStr(p.verb) && Array.isArray(p.args),
    },
    'input:raw':       { kind:'command', phase:'pre',  validateIn: (p)=>_isObj(p) },
    'command:before':  { kind:'command', phase:'pre',  validateIn: (p)=>_isObj(p) },
    'command:after':   { kind:'command', phase:'post', validateIn: (p)=>_isObj(p) },
    'command:unknown': { kind:'command', phase:'post', validateIn: (p)=>_isObj(p) && _isStr(p.verb || '') },

    // ── Audio ────────────────────────────────────────────────────
    'audio:sfx.play': {
      kind:'command', phase:'post',
      validateIn: (p)=>_isObj(p) && _isStr(p.cue || p.type || ''),
    },
    'audio:music.play': {
      kind:'command', phase:'post',
      validateIn: (p)=>_isObj(p) && _isStr(p.track || p.theme || ''),
    },
    'audio:sfx.played': {
      kind:'domain', phase:'observe',
      validateIn: (p)=>_isObj(p) && (_isStr(p.cue || '') || p.cue == null),
    },
    'audio:music.changed': {
      kind:'domain', phase:'observe',
      validateIn: (p)=>_isObj(p) && (_isStr(p.track || '') || p.track == null),
    },
    'audio:error': {
      kind:'domain', phase:'observe',
      validateIn: (p)=>_isObj(p),
    },

    // ── Control ──────────────────────────────────────────────────
    'control:action': {
      kind:'command', phase:'pre',
      validateIn: (p)=>_isObj(p) && _isStr(p.verb || ''),
    },
    'control:binding.request': {
      kind:'query', phase:'pre',
      validateIn: (p)=>_isObj(p),
      validateOut: (p)=>_isObj(p) || p == null,
    },
    'control:binding.changed': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p),
    },

    // ── Module / Plugin lifecycle ────────────────────────────────
    'module:loaded': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && (_isObj(p.meta || {}) || p.meta == null),
    },
    'module:bundle_loaded': { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },
    'plugin:loaded': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && _isStr(p.id || ''),
    },
    'plugin:unloaded': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && _isStr(p.id || ''),
    },
    'plugin:error': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && _isStr(p.id || '') && Array.isArray(p.errors),
    },
    'entity:factory_registered': { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) && _isStr(p.tipo || '') },
    'entity:tick_all':           { kind:'domain', phase:'observe', validateIn: (p)=>_isObj(p) },

    // ── World ────────────────────────────────────────────────────
    'world:before_gen': { kind:'domain', phase:'pre',  validateIn: (p)=>_isObj(p) },
    'world:after_gen': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && _isObj(p.nodes || {}) && _isObj(p.edges || {}) && _isStr(p.seed || ''),
    },
    'world:node_enter': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && _isStr(p.nodeId || '') && (_isObj(p.node || {}) || p.node == null) && (_isObj(p.player || {}) || p.player == null),
    },
    'world:section_expand': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && Array.isArray(p.nodeIds) && _isStr(p.fromNodeId || '') && _isStr(p.dir || ''),
    },
    'world:tick': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && (_isNum(p.cycle) || p.cycle == null),
    },
    'world:request_enemies':   { kind:'query', phase:'main', validateIn: (p)=>_isObj(p) && Array.isArray(p.enemies) },
    'world:request_creatures': { kind:'query', phase:'main', validateIn: (p)=>_isObj(p) },
    'world:calc_difficulty':   { kind:'query', phase:'main', validateIn: (p)=>_isObj(p) },

    // ── Boss / Combat ────────────────────────────────────────────
    'boss:defeated': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && (_isObj(p.boss || {}) || p.boss == null) && (Array.isArray(p.loot) || p.loot == null) && (_isNum(p.xp) || p.xp == null),
    },
    'boss:spawn': { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },
    'combat:resolve_magia': {
      kind:'query', phase:'main',
      validateIn: (p)=>_isObj(p) && _isObj(p.actor || {}),
      validateOut: (p)=>_isObj(p) && typeof p.handled === 'boolean',
    },
    'combat:resolve_habilidad': {
      kind:'query', phase:'main',
      validateIn: (p)=>_isObj(p) && _isObj(p.actor || {}),
      validateOut: (p)=>_isObj(p) && typeof p.handled === 'boolean',
    },
    'combat:resolve_ia': {
      kind:'query', phase:'main',
      validateIn: (p)=>_isObj(p) && _isObj(p.actor || {}) && _isObj(p.battle || {}),
      validateOut: (p)=>_isObj(p) && (p.action == null || _isStr(p.action)),
    },
    'combat:resolve_damage': { kind:'query',  phase:'main', validateIn: (p)=>_isObj(p) },
    'combat:apply_states':   { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },
    'combat:side_effects':   { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },
    'combat:post_resolve':   { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },
    'combat:player_action':  { kind:'domain', phase:'main', validateIn: (p)=>_isObj(p) },
    'combat:enemy_turn_announce': { kind:'domain', phase:'observe', validateIn: (p)=>_isObj(p) },
    'combat:enemy_used_habilidad': { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },
    'combat:start': {
      kind:'domain', phase:'main',
      validateIn: (p)=>_isObj(p) && _isObj(p.battle || {}) && (_isObj(p.enemy || {}) || p.enemy == null),
    },
    'combat:before_attack': {
      kind:'query', phase:'pre',
      validateIn: (p)=>_isObj(p) && _isObj(p.attacker || {}),
      validateOut: (p)=>_isObj(p),
    },
    'combat:before_damage_apply': {
      kind:'query', phase:'pre',
      validateIn: (p)=>_isObj(p) && (_isNum(p.dmg) || p.dmg == null),
      validateOut: (p)=>_isObj(p) && (_isNum(p.dmg) || p.dmg == null),
    },
    'combat:after_attack': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && _isObj(p.attacker || {}),
    },
    'combat:after_damage_apply': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && (_isObj(p.actor || {}) || _isObj(p.target || {})),
    },
    'combat:enemy_used_magia': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && (_isObj(p.actor || {}) || p.actor == null),
    },
    'combat:player_hit': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && (_isNum(p.damage) || p.damage == null),
    },
    'combat:enemy_defeat': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && (_isObj(p.enemy || {}) || p.enemy == null),
    },
    'combat:loot': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && (Array.isArray(p.items) || p.items == null),
    },

    // ── Narrative ────────────────────────────────────────────────
    'narrative:npc_gen': {
      kind:'domain', phase:'main',
      validateIn: (p)=>_isObj(p) && (_isObj(p.npc || {}) || p.npc == null),
    },
    'narrative:npc_speak': {
      kind:'domain', phase:'main',
      validateIn: (p)=>_isObj(p) && (_isStr(p.text || '') || p.text == null),
    },
    'narrative:npc_interact': {
      kind:'domain', phase:'main',
      validateIn: (p)=>_isObj(p) && (_isObj(p.npc || {}) || p.npc == null),
    },
    'narrative:npc_death': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && (_isObj(p.npc || {}) || p.npc == null),
    },
    'narrative:npc_twist': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && (_isObj(p.twist || {}) || p.twist == null),
    },
    'narrative:mission_gen': {
      kind:'domain', phase:'main',
      validateIn: (p)=>_isObj(p) && (_isObj(p.mision || {}) || p.mision == null),
    },
    'narrative:mission_complete': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && (_isObj(p.mision || {}) || p.mision == null),
    },
    'narrative:mission_fail': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && (_isObj(p.mision || {}) || p.mision == null),
    },

    // ── Arcs / Faction ───────────────────────────────────────────
    'arc:start':    { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },
    'arc:advance':  { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },
    'arc:complete': { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },
    'faction:init': { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },

    // ── Forge / Items ────────────────────────────────────────────
    'forge:after':        { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },
    'forge:collapse':     { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },
    'forge:imprint_gen':  { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },
    'forge:resolve_type': { kind:'query',  phase:'main', validateIn: (p)=>_isObj(p) },

    // ── Creatures ────────────────────────────────────────────────
    'creature:bound':         { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },
    'creature:breed_result':  { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },
    'creature:combat_start':  { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },
    'creature:escaped':       { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },

    // ── Player ───────────────────────────────────────────────────
    'player:stat_change': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && (_isStr(p.stat || '') || p.stat == null),
    },
    'player:create': {
      kind:'domain', phase:'main',
      validateIn: (p)=>_isObj(p) && (_isObj(p.player || {}) || p.player == null),
    },
    'player:item_add': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && (_isObj(p.item || {}) || p.item == null),
    },
    'player:item_remove': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && (_isObj(p.item || {}) || p.item == null),
    },
    'player:equip': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && (_isObj(p.item || {}) || p.item == null),
    },
    'player:tick': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p) && (_isObj(p.player || {}) || p.player == null),
    },
    'player:die': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p),
    },
    'player:calc_stat':   { kind:'query', phase:'main', validateIn: (p)=>_isObj(p) },
    'player:calc_slot':   { kind:'query', phase:'main', validateIn: (p)=>_isObj(p) },
    'player:slot_add':    { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },
    'player:slot_remove': { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },

    // ── Memory ───────────────────────────────────────────────────
    'memory:run_start': {
      kind:'domain', phase:'main',
      validateIn: (p)=>_isObj(p),
    },
    'memory:run_end': {
      kind:'domain', phase:'post',
      validateIn: (p)=>_isObj(p),
    },

    // ── Game lifecycle ───────────────────────────────────────────
    'game:new_world': { kind:'domain', phase:'main', validateIn: (p)=>_isObj(p) || p == null },

    // ── Net ──────────────────────────────────────────────────────
    'net:patch': { kind:'domain', phase:'post', validateIn: (p)=>_isObj(p) },
  });
}
