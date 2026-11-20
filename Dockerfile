# Production Dockerfile for ECONEXO backend with Puppeteer & Chromium
FROM node:20-slim

# Install Chromium and OS dependencies required for headless scraping
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

# Point Puppeteer to system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy project files
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
