# ECONEXO 📊

> **Dashboard financiero integral y privado**: gestión de cuentas bancarias dinámicas, fondos indexados con seguimiento y cotizaciones automáticas, cálculo de ahorro y copias de seguridad cifradas.

ECONEXO es una aplicación web local orientada a la privacidad para la gestión del patrimonio personal. Combina el control de depósitos y cuentas con y sin interés, el seguimiento en tiempo real de fondos indexados mediante web scraping autónomo (Investing.com / Puppeteer), análisis gráfico interactivo, simulación de ahorro y un sistema robusto de copias de seguridad cifradas con AES-256-GCM.

---

## 🚀 Características principales

- **🏦 Cuentas y Banca Dinámica**: Control de saldos, cuentas corrientes, remuneradas y depósitos con y sin interés, con cálculo automático de rendimientos netos y brutos.
- **📈 Fondos Indexados con Cotizaciones en Vivo**:
  - Monitor de fondos compacto adaptable a escritorio y móvil.
  - Sincronización y actualización de cotizaciones mediante scraper backend con Puppeteer (Investing.com).
  - Gráficas interactivas con series históricas reales (1D, 1S, 1M, 6M, 1A, 5A, Máx) adaptadas al tema claro y oscuro.
- **💰 Metas y Ahorro**: Planificación y visualización de la evolución patrimonial.
- **🔒 Privacidad y Copias de Seguridad**:
  - Los datos residen en el navegador del usuario (almacenamiento local / IndexedDB).
  - Exportación en JSON estándar o backup cifrado de alta seguridad (**AES-256-GCM**) protegido por contraseña.
  - Exportación de datos a formatos CSV y Excel (XLSX).
- **📱 PWA & Acceso Directo (Móvil y Escritorio)**:
  - Compatible con instalación y "Añadir a pantalla de inicio" en iOS (Safari) y Android (Chrome).
  - Icono oficial optimizado (`apple-touch-icon.png` 180×180, `favicon-96x96.png`, SVG vectorial) y manifiesto web (`manifest.json`).
- **🌓 Interfaz Moderna & Skeuomorphic**:
  - Soporte fluido para modo oscuro y modo claro con detección automática o manual.
  - Diseño responsive y optimizado con Tailwind CSS.

---

## 📁 Estructura del Proyecto

```text
ECONEXO/
├── package.json               # Configuración y dependencias del proyecto
├── server/
│   ├── server.js              # Servidor API Express (endpoints de cotizaciones y estáticos)
│   └── services/
│       └── investingScraper.js# Motor de scraping headless con Puppeteer Stealth
└── public/
    ├── index.html             # Shell SPA principal con metadatos y temas
    ├── manifest.json          # Web App Manifest para instalación y accesos directos
    ├── apple-touch-icon.png   # Icono para accesos directos en iOS/Safari
    ├── favicon.svg            # Favicon vectorial
    ├── css/
    │   ├── app.css            # Estilos personalizados y utilidades de interfaz
    │   └── skeuomorphism.css  # Componentes con diseño visual táctil / skeuomórfico
    ├── img/
    │   ├── app_favicon/       # Conjunto de iconos (apple-touch-icon, favicon-96x96, etc.)
    │   └── logo.png           # Logotipos e identidades gráficas
    └── js/
        ├── app.js             # Inicialización y orquestación del ciclo de vida
        ├── core/              # Estado reactivo, base de datos local y utilidades
        ├── fondos/            # Cotizaciones, histórico, analítica y gráficas de fondos
        ├── banca/             # Lógica de cuentas, balances e intereses
        ├── ahorro/            # Módulo de previsiones y metas de ahorro
        ├── charts/            # Motor de gráficas con Chart.js
        ├── backup/            # Exportación cifrada (AES-256-GCM), JSON, CSV y XLSX
        └── ui/                # Modales accesibles, notificaciones toast y control de tema
```

---

## 🛠️ Requisitos e Instalación

### Requisitos previos
- **Node.js** 20.0.0 o superior.
- **Google Chrome / Chromium** (descargado automáticamente por Puppeteer para el scraping).

### Instalación y arranque

1. Clona el repositorio e instala las dependencias:
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd "ECONEXO 2 FINAL"
   npm install
   ```

2. Inicia la aplicación:
   ```bash
   npm start
   ```

3. Abre en tu navegador la URL indicada en la consola:
   ```text
   http://localhost:3000
   ```

> [!TIP]
> Puedes verificar el estado del servidor y la versión activa en cualquier momento accediendo a `http://localhost:3000/api/health`.

### Verificación de sintaxis y despliegue
- Verificar la integridad de todos los módulos sin iniciar el servidor:
  ```bash
  npm run check
  ```
- Publicar / desplegar la versión estática en GitHub Pages:
  ```bash
  npm run deploy
  ```

---

## 💻 Aplicación de Escritorio Nativa (macOS y Windows) con Electron

ECONEXO incluye soporte para ejecutarse como una **aplicación de escritorio local completa** con ventana nativa, icono propio y Puppeteer integrado ejecutándose directamente en tu procesador.

### ⚡ Ventajas de la App Local frente a la Web
- **Velocidad máxima (2–3 segundos)**: Las cotizaciones se actualizan inmediatamente usando los núcleos reales de tu equipo en lugar de servidores compartidos en la nube.
- **Cero arranques en frío (*Cold Starts*)**: No hay esperas de 40–50 segundos para que arranque ningún contenedor.
- **Sin bloqueos de IP**: Tu conexión residencial no es bloqueada por Cloudflare ni sistemas anti-bot de Investing.com.
- **Totalmente autónoma**: Al abrir la app, el backend se inicia y se apaga automáticamente de forma transparente.

---

### 🚀 Comandos de la Aplicación de Escritorio

1. **Iniciar la aplicación en modo desarrollo / local**:
   ```bash
   npm run electron
   ```
   Abre inmediatamente la ventana de ECONEXO con su backend local conectado.

2. **Generar instalador para macOS (`.dmg`)**:
   ```bash
   npm run electron:build:mac
   ```
   Genera el archivo instalable **`.dmg`** en la carpeta `dist-electron/` (compatible con Apple Silicon `arm64` e Intel `x64`), listo para arrastrar a `/Applications`.

3. **Generar instalador para Windows (`.exe`)**:
   ```bash
   npm run electron:build:win
   ```
   Genera el instalador **`.exe` (NSIS)** en la carpeta `dist-electron/` con accesos directos al Escritorio y menú Inicio.

4. **Generar ambos instaladores**:
   ```bash
   npm run electron:build
   ```

---

## 📱 Acceso Directo / App Móvil (PWA)

ECONEXO está preparado para instalarse como una aplicación nativa o acceso directo en tu dispositivo móvil:

- **En iPhone / iPad (Safari)**:
  1. Abre la aplicación en Safari.
  2. Pulsa el botón **Compartir** (icono de cuadrado con flecha hacia arriba).
  3. Selecciona **Añadir a pantalla de inicio**.
  4. Se creará un acceso directo con el icono de la aplicación (`apple-touch-icon.png`) y funcionará en pantalla completa.

- **En Android (Chrome)**:
  1. Abre la aplicación en Chrome.
  2. Pulsa el menú de opciones (tres puntos verticales) y elige **Añadir a pantalla de inicio** o **Instalar aplicación**.

---

## 🔐 Seguridad y Copias de Seguridad

- **JSON sin cifrar**: Copia de seguridad estándar y legible para migraciones rápidas.
- **Backup Cifrado**: Los datos se cifran en el cliente con el estándar **AES-256-GCM** mediante derivación de clave con contraseña. Si se activa, la contraseña es obligatoria para restaurar la copia.
- **Sin servidores externos de terceros**: Las bases de datos nunca salen de tu entorno local; el servidor Express se encarga exclusivamente de servir la aplicación y consultar las cotizaciones requeridas.

---

## 📝 Versión Actual

- **Versión actual**: `1.0.0`
- **Build**: `1.0.0`
