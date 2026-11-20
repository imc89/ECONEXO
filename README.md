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

## ☁️ Despliegue del Backend de Puppeteer en la Nube (Render / Docker)

Como **GitHub Pages solo aloja archivos estáticos** (HTML, CSS y JS), las funciones de scraping en tiempo real de fondos de inversión (Puppeteer / Investing.com) requieren un backend Node.js en ejecución.

El repositorio incluye soporte de primera clase para desplegar el backend mediante **Docker** y **Render.com**.

---

### 🐳 ¿Qué hace el `Dockerfile` y cómo está estructurado?

El archivo [`Dockerfile`](file:///Users/inigo/Desktop/PROYECTOS/ECONEXO%202%20FINAL/Dockerfile) empaqueta el servidor Express y el scraper en una imagen de Linux ligera y reproducible.

#### Anatomía paso a paso:
1. **Imagen base (`node:20-slim`)**: Utiliza una distribución mínima de Debian con Node.js 20 oficial para mantener la imagen ligera.
2. **Instalación de Chromium y dependencias nativas**:
   - Puppeteer requiere Chromium y librerías gráficas/multimedia del sistema operativo (`libnss3`, `libatk-bridge`, `libgbm1`, fuentes tipográficas `fonts-liberation`, etc.) para renderizar páginas sin entorno de escritorio (*headless*).
   - Se instalan a nivel de sistema (`apt-get`) y se limpian las listas de paquetes temporales para reducir el tamaño final de la imagen.
3. **Variables de entorno (`ENV`)**:
   - `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`: Evita que `npm install` descargue un binario de Chrome redundante (~300 MB), ahorrando tiempo y almacenamiento.
   - `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`: Le indica a Puppeteer la ruta exacta del Chromium del sistema operativo.
   - `NODE_ENV=production` y `PORT=3000`: Optimiza Express y define el puerto de escucha.
4. **Capa de dependencias en caché**: Se copian primero los archivos `package*.json` y se ejecuta `npm ci --omit=dev`. Esto permite que Docker reutilice la caché de dependencias si solo se edita el código fuente.
5. **Copia del código y arranque**: Se copian los archivos del proyecto y se ejecuta `npm start` (`node server/server.js`), exponiendo el puerto `3000`.

---

### 💻 Cómo usar el `Dockerfile` en local

Si tienes Docker instalado en tu ordenador (Docker Desktop o CLI), puedes construir y ejecutar el contenedor localmente:

1. **Construir la imagen de Docker**:
   ```bash
   docker build -t econexo-backend .
   ```

2. **Ejecutar el contenedor**:
   ```bash
   docker run -d --name econexo -p 3000:3000 --restart unless-stopped econexo-backend
   ```

3. **Verificar que el backend está funcionando**:
   Abre en tu navegador o ejecuta en la terminal:
   ```bash
   curl http://localhost:3000/api/health
   ```
   Respuesta esperada: `{"status":"ok","uptime":...,"version":"2.2.1"}`

4. **Ver registros (logs) del contenedor**:
   ```bash
   docker logs -f econexo
   ```

5. **Detener el contenedor**:
   ```bash
   docker stop econexo && docker rm econexo
   ```

---

### 🚀 Despliegue gratuito en Render.com con `render.yaml`

El repositorio incluye un archivo [`render.yaml`](file:///Users/inigo/Desktop/PROYECTOS/ECONEXO%202%20FINAL/render.yaml) que define la infraestructura como código (*Blueprint*).

#### Pasos para desplegar en Render:
1. Inicia sesión en **[Render.com](https://render.com)** con tu cuenta de GitHub.
2. Haz clic en **New +** y selecciona **Blueprint** (o **Web Service**).
3. Selecciona tu repositorio `ECONEXO`.
4. Render detectará automáticamente el archivo `render.yaml` y el `Dockerfile`:
   - **Entorno**: Docker
   - **Plan**: Free (Gratuito)
   - **Health Check**: `/api/health`
5. Pulsa en **Apply** (o **Create Web Service**). En unos 2-3 minutos el servicio estará activo y Render te proporcionará una URL pública segura (ejemplo: `https://econexo-backend.onrender.com`).
6. **Conectar con tu web de GitHub Pages**:
   - Abre tu aplicación en GitHub Pages (`https://<tu-usuario>.github.io/ECONEXO/`).
   - Haz clic en el **icono de estado de conexión** en la cabecera superior.
   - Pega tu URL de Render (ej. `https://econexo-backend.onrender.com`) y pulsa **Guardar y Probar**.
   - ¡Listo! Tu frontend estático en GitHub Pages ahora consultará cotizaciones en tiempo real mediante tu backend en Render.

---

### ❓ ¿Por qué Render / Docker y no plataformas Serverless como Vercel?

A menudo se plantea usar **Vercel** o **AWS Lambda** para el backend; sin embargo, para este tipo de aplicación presentan limitaciones técnicas importantes:

| Característica | Render / Docker | Vercel (Serverless) |
| :--- | :--- | :--- |
| **Tiempo límite de ejecución** | Ilimitado (ideal para scraping de varios fondos) | **10 segundos** en plan gratuito (da error *504 Gateway Timeout*) |
| **Tamaño del binario Chromium** | Sin límite (Chromium completo del sistema) | Máximo 50 MB (Chrome supera los 250 MB) |
| **Procesos en segundo plano** | ✅ Soporta colas asíncronas (`jobId`) y scraping en segundo plano | ❌ La función se apaga inmediatamente tras la respuesta |
| **Detección anti-bot (Stealth)** | ✅ Soporta `puppeteer-extra-plugin-stealth` completo | ⚠️ Muy propenso a bloqueos por IPs compartidas de AWS Lambda |

> [!TIP]
> Si deseas usar **Vercel**, la mejor estrategia es alojar allí el **frontend** (apuntando al directorio `public/`) por su alta velocidad de CDN, y mantener el **backend de Puppeteer en Render** mediante Docker.

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

- **Versión actual**: `2.2.1`
- **Build**: `2.2.0` / `2.2.1`
