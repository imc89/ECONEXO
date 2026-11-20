// Adaptador CommonJS para lanzar el servidor ESM desde Electron (fork).
// electron/main.js lo usa con fork() porque Electron sólo soporta CJS directamente.
// Este archivo usa import() dinámico, que sí funciona desde CJS en Node >=14.

(async () => {
  try {
    // Importar el servidor principal (ES module)
    await import('../server/server.js');
  } catch (err) {
    console.error('[server-bridge] Error al arrancar el servidor:', err);
    process.exit(1);
  }
})();
