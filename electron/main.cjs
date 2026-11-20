'use strict';

const { app, BrowserWindow, shell, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const { createServer } = require('http');
const { fork } = require('child_process');
const net = require('net');

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
let serverProcess = null;
let tray = null;

// ─── Ruta del icono según plataforma ────────────────────────────────────────
function getIconPath() {
  const assetsDir = isDev
    ? path.join(__dirname, 'assets')
    : path.join(process.resourcesPath, 'assets');
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

// ─── Lanzar el servidor Express + Puppeteer en un proceso separado ───────────
async function startBackendServer() {
  const free = await isPortFree(PORT);
  if (!free) {
    console.log(`[Electron] Puerto ${PORT} ya en uso; reutilizando servidor existente.`);
    return;
  }

  // Usamos el bridge CJS que hace dynamic import() del server ESM
  const serverScript = isDev
    ? path.join(__dirname, 'server-bridge.cjs')
    : path.join(process.resourcesPath, 'app', 'electron', 'server-bridge.cjs');

  serverProcess = fork(serverScript, [], {
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'production',
      // En la app empaquetada, apuntar al Chromium local de Puppeteer
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'false',
    },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    execArgv: [] // sin flags de Node que puedan interferir
  });

  serverProcess.stdout?.on('data', (d) => console.log('[Server]', d.toString().trim()));
  serverProcess.stderr?.on('data', (d) => console.error('[Server ERR]', d.toString().trim()));

  serverProcess.on('exit', (code) => {
    console.log(`[Electron] Servidor salió con código ${code}`);
    serverProcess = null;
  });
}

// ─── Esperar a que el servidor esté listo ────────────────────────────────────
function waitForServer(url, maxWaitMs = 30000, intervalMs = 300) {
  const http = require('http');
  const https = require('https');
  const lib = url.startsWith('https') ? https : http;
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      lib.get(url, (res) => {
        if (res.statusCode < 500) return resolve();
        scheduleNext();
      }).on('error', scheduleNext);
    };
    const scheduleNext = () => {
      if (Date.now() - start > maxWaitMs) return reject(new Error('Tiempo de espera del servidor agotado'));
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
    show: false, // se muestra cuando esté lista
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // Permite que la app cargue HTTP en localhost sin bloqueos de CSP
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  // Abrir enlaces externos en el navegador del sistema, no dentro de la app
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

  // Esperar a que el servidor esté listo antes de cargar la URL
  waitForServer(`http://127.0.0.1:${PORT}/api/health`)
    .then(() => {
      mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
    })
    .catch(() => {
      // Fallback: cargar directamente aunque el health check falle
      mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
    });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // En macOS, cerrar la ventana no cierra la app (comportamiento estándar de macOS)
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
  } catch (err) {
    console.error('[Electron] Error al arrancar el backend:', err);
  }

  createMainWindow();

  // Icono en la bandeja del sistema (opcional, especialmente útil en Windows)
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

// Reabrir la ventana al hacer clic en el icono del Dock (macOS)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  } else if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

// Cerrar el servidor cuando se cierre la app
app.on('before-quit', () => {
  app.isQuitting = true;
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
});

// En Windows y Linux, salir cuando se cierren todas las ventanas
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Segunda instancia: enfocar la ventana existente
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});
