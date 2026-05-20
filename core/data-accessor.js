// ════════════════════════════════════════════════════════════════
// CORE / D — DataAccessor (M1 del audit: split de core.js)
//
// Interfaz tipada al ModuleLoader. Cada getter mapea una ruta de
// `data/module.json` a un nombre estable que el resto del runtime
// puede usar sin conocer la estructura del bundle.
// El motor nunca llama ModuleLoader.get() directamente fuera de aqui.
// ════════════════════════════════════════════════════════════════
'use strict';

const D = {
  get world()      { return ModuleLoader.get('world'); },
  get mats()       { return ModuleLoader.get('materiales')||{}; },
  get tagAff()     { return ModuleLoader.get('tag_afinidades')||{}; },
  get tagOpp()     { return ModuleLoader.get('tag_opuestos')||[]; },
  get archetypes() { return ModuleLoader.get('arquetipos_forja')||{}; },
  get habPool()    { return ModuleLoader.get('habilidades_pool')||[]; },
  get magPool()    { return ModuleLoader.get('magias_pool')||[]; },
  get enemyHabPools(){ return ModuleLoader.get('habilidades_enemigo_pool')||{}; },
  get enemyMagPools(){ return ModuleLoader.get('magias_enemigo_pool')||{}; },
  get aiProfiles() { return ModuleLoader.get('ia_perfiles_v2')||{}; },
  get effects()    { return ModuleLoader.get('efectos')||{}; },
  get enemies()    { return ModuleLoader.get('enemigos')||[]; },
  get creatures()  { return ModuleLoader.get('criaturas')||{}; },
  get creNames()   { return ModuleLoader.get('criatura_nombres')||{}; },
  get npcs()       { return ModuleLoader.get('npcs')||{}; },
  get missions()   { return ModuleLoader.get('misiones')||{}; },
  get twistDefs()  { return ModuleLoader.get('plot_twists')||[]; },
  get narrative()  { return ModuleLoader.get('narrativa')||{}; },
  get playerDef()  { return ModuleLoader.get('player')||{}; },
  get phases()     { return ModuleLoader.get('fases')||[]; },
  get itemsInicio(){ return ModuleLoader.get('items_inicio')||[]; },

  mat(id)     { return this.mats[id]||null; },
  matTags(id) { return this.mats[id]?.tags||[]; },
};

globalThis.D = D;
