# ==============================================================================
# Dockerfile para el Backend de ECONEXO (Node.js + Puppeteer + Chromium)
# ==============================================================================
# Este Dockerfile empaqueta el backend Express y el servicio de scraping con Puppeteer.
# Configura un entorno Linux optimizado con Chromium y todas sus librerías del sistema,
# permitiendo ejecutar tareas de scraping headless de Investing.com en segundo plano.
# ==============================================================================

# 1. Imagen base oficial ligera de Node.js 20 basada en Debian Slim
FROM node:20-slim

# 2. Instalación de Chromium y dependencias nativas del sistema operativo
# Puppeteer necesita librerías gráficas, de fuentes y de renderizado (X11, NSS, Cairo, etc.)
# para ejecutar el navegador en modo headless sin entorno de escritorio.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 3. Variables de entorno de producción
# - PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: Evita que npm descargue otro Chromium duplicado (ahorra ~300MB).
# - PUPPETEER_EXECUTABLE_PATH: Le indica a Puppeteer dónde encontrar el binario de Chromium instalado en Linux.
# - NODE_ENV: Optimiza Node.js y Express para producción.
# - PORT: Puerto por defecto donde escucha el servidor HTTP (3000).
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=3000

# 4. Directorio de trabajo dentro del contenedor
WORKDIR /app

# 5. Copia de manifiestos e instalación de dependencias de producción
# Se copian primero package.json y package-lock.json para aprovechar la caché de capas de Docker.
COPY package*.json ./
RUN npm ci --omit=dev

# 6. Copia del código fuente del proyecto al contenedor
COPY . .

# 7. Puerto de red expuesto por el contenedor
EXPOSE 3000

# 8. Comando de arranque del servidor backend
# Inicia Express (server/server.js) escuchando peticiones en /api/...
CMD ["npm", "start"]
