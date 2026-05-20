// ════════════════════════════════════════════════════════════════
// TEST HELPER — Carga de core para sandboxes vm
//
// Tras M1 (split de core.js en 7 archivos) los tests que ejecutan
// codigo de core en un vm.runInContext necesitan concatenar los
// fragmentos en orden de dependencias y exponer los namespaces a
// globalThis (los `const` top-level de scripts clasicos no se
// enganchan al global object automaticamente).
//
// Uso:
//   const { readCoreSource } = require('./helpers/load-core');
//   const src = readCoreSource() + extraExports;
//   vm.runInContext(src, sandbox, { filename:'core/*' });
// ════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');

// Orden topologico de carga. Cada fichero declara `const X` y al final
// hace `globalThis.X = X` para que sea visible cross-script.
const CORE_FILES = [
  'utils',
  'event-bus',
  'service-registry',
  'module-loader',
  'command-registry',
  'plugin-loader',
  'data-accessor',
];

function readCoreSource() {
  return CORE_FILES
    .map((name) => fs.readFileSync(path.join('core', `${name}.js`), 'utf8'))
    .join('\n;');
}

module.exports = { readCoreSource, CORE_FILES };
