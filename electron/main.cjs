'use strict';

const { app, BrowserWindow, shell, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const net = require('net');
const http = require('http');

// ─── Mantener una sola instancia de la app ───────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// ─── Rutas y estado global ───────────────────────────────────────────────────
const isDev = !app.isPackaged;
const PORT = 3399; // Puerto fijo para la app de escritorio

let mainWindow = null;
let tray = null;

// ─── Ruta del icono según plataforma ────────────────────────────────────────
function getIconPath() {
  const assetsDir = isDev
    ? path.join(__dirname, 'assets')
    : path.join(process.resourcesPath, 'app', 'electron', 'assets');
  if (process.platform === 'darwin') return path.join(assetsDir, 'icon-512.png');
  if (process.platform === 'win32') return path.join(assetsDir, 'icon.ico');
  return path.join(assetsDir, 'icon-256.png');
}

// ─── Comprobar si el puerto ya está en uso ───────────────────────────────────
function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => { srv.close(); resolve(true); });
    srv.listen(port, '127.0.0.1');
  });
}

// ─── Lanzar el servidor Express + Puppeteer directamente en el proceso ───────
async function startBackendServer() {
  const free = await isPortFree(PORT);
  if (!free) {
    console.log(`[Electron] Puerto ${PORT} ya en uso; reutilizando servidor existente.`);
    return;
  }

  process.env.PORT = String(PORT);
  process.env.NODE_ENV = 'production';
  process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'false';

  const serverPath = path.join(__dirname, '..', 'server', 'server.js');
  console.log('[Electron] Iniciando servidor Express desde:', serverPath);

  try {
    await import(pathToFileURL(serverPath).href);
    console.log(`[Electron] Servidor Express iniciado con éxito en puerto ${PORT}`);
  } catch (err) {
    console.error('[Electron] Error crítico iniciando servidor Express:', err);
  }
}

// ─── Esperar a que el servidor esté listo ────────────────────────────────────
function waitForServer(url, maxWaitMs = 15000, intervalMs = 150) {
  const start = Date.now();

  return new Promise((resolve) => {
    const check = () => {
      const req = http.get(url, (res) => {
        if (res.statusCode < 500) return resolve(true);
        scheduleNext();
      });
      req.on('error', scheduleNext);
      req.setTimeout(1000, () => { req.destroy(); scheduleNext(); });
    };
    const scheduleNext = () => {
      if (Date.now() - start > maxWaitMs) {
        console.warn('[Electron] waitForServer agotado, continuando...');
        return resolve(false);
      }
      setTimeout(check, intervalMs);
    };
    check();
  });
}

// ─── Crear la ventana principal ───────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'ECONEXO',
    icon: getIconPath(),
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  // Manejo de errores de carga con reintento automático
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron] Error al cargar ${validatedURL}: (${errorCode}) ${errorDescription}`);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
      }
    }, 500);
  });

  // Abrir enlaces externos en el navegador del sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, navUrl) => {
    if (!navUrl.startsWith(`http://127.0.0.1:${PORT}`)) {
      event.preventDefault();
      shell.openExternal(navUrl);
    }
  });

  // Cargar URL del servidor local
  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // En macOS, cerrar la ventana oculta la app pero la mantiene en el Dock
  mainWindow.on('close', (e) => {
    if (process.platform === 'darwin' && !app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ─── Menú nativo de la aplicación ────────────────────────────────────────────
function buildAppMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: 'ECONEXO',
      submenu: [
        { role: 'about', label: 'Acerca de ECONEXO' },
        { type: 'separator' },
        { role: 'hide', label: 'Ocultar ECONEXO' },
        { role: 'hideOthers', label: 'Ocultar otros' },
        { role: 'unhide', label: 'Mostrar todo' },
        { type: 'separator' },
        { label: 'Salir de ECONEXO', accelerator: 'Cmd+Q', click: () => { app.isQuitting = true; app.quit(); } }
      ]
    }] : []),
    {
      label: 'Edición',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'forceReload', label: 'Forzar recarga' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamaño original' },
        { role: 'zoomIn', label: 'Ampliar' },
        { role: 'zoomOut', label: 'Reducir' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' }
      ]
    },
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        ...(process.platform === 'darwin' ? [{ role: 'zoom', label: 'Zoom' }] : []),
        { type: 'separator' },
        { label: 'ECONEXO', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Ciclo de vida de la app ──────────────────────────────────────────────────
app.whenReady().then(async () => {
  buildAppMenu();

  try {
    await startBackendServer();
    await waitForServer(`http://127.0.0.1:${PORT}/api/health`, 10000, 150);
  } catch (err) {
    console.error('[Electron] Error al arrancar el backend:', err);
  }

  createMainWindow();

  if (process.platform === 'win32') {
    const icon = nativeImage.createFromPath(getIconPath());
    tray = new Tray(icon);
    tray.setToolTip('ECONEXO - Dashboard Financiero');
    tray.on('double-click', () => {
      if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
      else createMainWindow();
    });
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  } else if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});
