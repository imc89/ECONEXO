import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

// Reutiliza una sola instancia de Chromium durante la vida del servidor.
// Cada extracción usa su propia pestaña, que se cierra al terminar.
const BLOCKED_RESOURCE_TYPES = new Set(
  (process.env.PUPPETEER_BLOCK_RESOURCES === undefined
    ? 'image,stylesheet,font,media'
    : process.env.PUPPETEER_BLOCK_RESOURCES)
    .split(',')
    .map((type) => type.trim().toLowerCase())
    .filter(Boolean)
);

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--no-first-run',
  '--window-size=1440,900',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-extensions',
  '--disable-component-update',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-sync',
  '--mute-audio',
  '--no-default-browser-check'
];

const AD_TRACKER_PATTERNS = [
  'google-analytics.com',
  'googletagmanager.com',
  'googlesyndication.com',
  'doubleclick.net',
  'adservice.google.',
  'adnxs.com',
  'amazon-adsystem.com',
  'criteo.com',
  'criteo.net',
  'taboola.com',
  'outbrain.com',
  'pubmatic.com',
  'rubiconproject.com',
  'scorecardresearch.com',
  'teads.tv',
  'smartadserver.com',
  'casalemedia.com',
  'moatads.com',
  'chartbeat.com',
  'hotjar.com',
  'facebook.net',
  'connect.facebook.net',
  'clarity.ms'
];

function isTrackerOrAd(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return AD_TRACKER_PATTERNS.some((p) => lower.includes(p));
}

let browserPromise = null;

async function getBrowser() {
  if (browserPromise) {
    try {
      const currentBrowser = await browserPromise;
      if (currentBrowser.isConnected()) return currentBrowser;
    } catch (_) {
      // Si el lanzamiento anterior falló, se intenta crear otra instancia.
    }
    browserPromise = null;
  }

  const launchPromise = puppeteer.launch({
    headless: true,
    executablePath: getChromeExecutable(),
    args: BROWSER_ARGS
  });
  browserPromise = launchPromise;

  try {
    const browser = await launchPromise;
    browser.once('disconnected', () => {
      if (browserPromise === launchPromise) browserPromise = null;
    });
    return browser;
  } catch (error) {
    if (browserPromise === launchPromise) browserPromise = null;
    throw error;
  }
}

export async function closeScraperBrowser() {
  const pendingBrowser = browserPromise;
  browserPromise = null;
  if (!pendingBrowser) return;

  try {
    const browser = await pendingBrowser;
    if (browser.isConnected()) await browser.close();
  } catch (_) {
    // Cerrar el servidor no debe fallar porque Chromium ya estuviera cerrado.
  }
}

async function createOptimizedPage(browser, { allowStylesheets = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
  );
  page.setDefaultNavigationTimeout(45000);
  page.setDefaultTimeout(8000);

  // Intercepción optimizada: bloqueamos trackers, analíticas pesadas y recursos innecesarios
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    if (isTrackerOrAd(url)) {
      request.abort().catch(() => {});
      return;
    }
    const blockedByType = BLOCKED_RESOURCE_TYPES.has(request.resourceType());
    const shouldBlock = blockedByType && !(allowStylesheets && request.resourceType() === 'stylesheet');
    const action = shouldBlock ? request.abort() : request.continue();
    action.catch(() => {});
  });
  return page;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFundQuote(page, timeout = 6500) {
  try {
    await page.waitForFunction(() => {
      const selectors = [
        '#last_last',
        '[data-test="instrument-price-last"]',
        '[class*="-last"]'
      ];
      return selectors.some((selector) => {
        const element = document.querySelector(selector);
        return Boolean(element && (element.textContent || '').trim());
      });
    }, { timeout });
    return true;
  } catch (_) {
    return false;
  }
}

async function waitForFundSearchResults(page, timeout = 5500) {
  try {
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('a[href*="/funds/"]')).some((a) => {
        const href = a.getAttribute('href') || '';
        return !href.endsWith('/funds/') &&
          !href.endsWith('/funds') &&
          !href.includes('world-funds') &&
          !href.includes('major-funds') &&
          !href.includes('/funds/etfs');
      });
    }, { timeout });
  } catch (_) {
    // El código de fallback posterior decide si hay resultados utilizables.
  }
}

async function waitForHistoricalTable(page, timeout = 7000) {
  try {
    await page.waitForFunction(() => {
      const table = document.querySelector('table[data-test="historical-data-table"]') ||
        document.querySelector('.historical-data-table') ||
        document.querySelector('table');
      return Boolean(table && table.querySelector('tr:nth-child(2) td'));
    }, { timeout });
  } catch (_) {
    // Se devuelve lo que haya en el DOM; el caller comprobará si tiene filas.
  }
}


// Locate Chrome/Chromium executable across macOS, Linux, and Docker environments
function getChromeExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const commonPaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

/**
 * Normalizes numbers from European format (44,60) or English format (44.60) to standard float
 */
function parseNumeric(val) {
  if (val === null || val === undefined) return 0;
  let str = String(val).trim().replace(/[^\d.,+\-]/g, '');
  if (!str) return 0;

  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    str = str.replace(',', '.');
  }
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Format timestamp (seconds or ms) to DD/MM/YYYY
 */
function formatTimestampToDate(ts) {
  const ms = ts > 1e11 ? ts : ts * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Normalize date string "29.09.2026" or "2026-09-29" to DD/MM/YYYY
 */
function normalizeDateStr(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.trim().split(/[.\-\/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
    } else {
      // DD-MM-YYYY
      return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
    }
  }
  return dateStr;
}


const CHART_RANGE_LABELS = {
  day: ['1 día', '1 dia', '1D', '1 d'],
  week: ['1 semana', '1W', '1 sem.'],
  month: ['1 mes', '1M'],
  '3months': ['3 meses', '3M'],
  '6months': ['6 meses', '6M'],
  year: ['1 año', '1 ano', '1Y', '1 año'],
  '5years': ['5 años', '5 anos', '5Y'],
  max: ['Máx.', 'Max.', 'Máx', 'Max']
};

async function selectInvestingChartRange(page, range) {
  const labels = CHART_RANGE_LABELS[range] || CHART_RANGE_LABELS['6months'];
  for (const frame of page.frames()) {
    try {
      const clicked = await frame.evaluate((wanted) => {
        const norm = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');
        const wantedNorm = wanted.map(norm);
        const all = Array.from(document.querySelectorAll('button,a,[role="button"],[data-name],[class*="range"],[class*="period"]'));
        const candidates = all.filter((el) => {
          if (!el.getClientRects().length) return false;
          const text = norm(el.innerText || el.getAttribute('aria-label') || el.getAttribute('title'));
          return wantedNorm.includes(text);
        }).sort((a,b) => (a.children?.length || 0) - (b.children?.length || 0));
        if (!candidates.length) return false;
        candidates[0].click();
        return true;
      }, labels);
      if (clicked) return true;
    } catch (_) {}
  }
  return false;
}


// Convierte series de los dos formatos que Investing puede entregar en su gráfico:
// TradingView UDF ({t,c,o,h,l}) y financialdata ({data:[[timestamp,close,open,high,low,...]]}).
const INVESTING_API_RANGE = {
  day:      { period: 'P1D', interval: 'PT5M', points: 300 },
  week:     { period: 'P1W', interval: 'PT30M', points: 300 },
  month:    { period: 'P1M', interval: 'P1D', points: 100 },
  '3months':{ period: 'P3M', interval: 'P1D', points: 120 },
  '6months':{ period: 'P6M', interval: 'P1D', points: 180 },
  year:     { period: 'P1Y', interval: 'P1W', points: 140 },
  '5years': { period: 'P5Y', interval: 'P1M', points: 120 },
  max:      { period: 'MAX', interval: 'P1M', points: 120 }
};

async function fetchInvestingFinancialHistory(instrumentId, range) {
  if (!instrumentId || !/^\d+$/.test(String(instrumentId))) return null;
  const config = INVESTING_API_RANGE[range] || INVESTING_API_RANGE['6months'];
  const url = new URL(`https://api.investing.com/api/financialdata/${instrumentId}/historical/chart/`);
  url.searchParams.set('period', config.period);
  url.searchParams.set('interval', config.interval);
  url.searchParams.set('pointscount', String(config.points));
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'domain-id': 'www',
        'Referer': 'https://www.investing.com/'
      },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) {
      console.warn(`[Investing history API] HTTP ${response.status} for instrument ${instrumentId}`);
      return null;
    }
    const payload = await response.json();
    const normalized = normalizeCapturedHistory(payload);
    if (normalized?.t?.length) {
      console.log(`[Investing history API] ${normalized.t.length} observaciones reales para instrument ${instrumentId} (${range}).`);
      return normalized;
    }
  } catch (error) {
    console.warn(`[Investing history API] Consulta directa no disponible para instrument ${instrumentId}: ${error.message}`);
  }
  return null;
}

function normalizeCapturedHistory(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload.t) && Array.isArray(payload.c) && payload.t.length && payload.c.length) {
    return payload;
  }
  const candidates = [payload.data, payload.data?.data, payload.series, payload.prices, payload.historicalData];
  const rows = candidates.find(value => Array.isArray(value) && value.length && (Array.isArray(value[0]) || (value[0] && typeof value[0] === 'object')));
  if (!rows) return null;
  const t = [], c = [], o = [], h = [], l = [];
  const toTimestamp = value => {
    if (typeof value === 'number' && Number.isFinite(value)) return value > 1e11 ? Math.floor(value / 1000) : Math.floor(value);
    const n = Number(value);
    if (value !== '' && value !== null && Number.isFinite(n)) return n > 1e11 ? Math.floor(n / 1000) : Math.floor(n);
    const text = String(value ?? '').trim();
    const dmy = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
    const ms = dmy ? new Date(Number(dmy[3]), Number(dmy[2])-1, Number(dmy[1])).getTime() : Date.parse(text);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN;
  };
  const numberOrNull = value => {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  for (const row of rows) {
    const isArray = Array.isArray(row);
    const ts = toTimestamp(isArray ? row[0] : (row.timestamp ?? row.time ?? row.date ?? row.t));
    // Investing's historical chart rows are timestamp, price/close, open, high, low, ...
    const close = numberOrNull(isArray ? row[1] : (row.close ?? row.price ?? row.value ?? row.c));
    if (!Number.isFinite(ts) || close === null) continue;
    t.push(ts); c.push(close);
    o.push(numberOrNull(isArray ? row[2] : (row.open ?? row.o)) ?? close);
    h.push(numberOrNull(isArray ? row[3] : (row.high ?? row.h)) ?? close);
    l.push(numberOrNull(isArray ? row[4] : (row.low ?? row.l)) ?? close);
  }
  if (t.length < 1) return null;
  const zipped = t.map((time, i) => ({ time, close: c[i], open: o[i], high: h[i], low: l[i] })).sort((a,b)=>a.time-b.time);
  const deduped = zipped.filter((point,i,all)=>i===0||point.time!==all[i-1].time);
  return { t: deduped.map(x=>x.time), c: deduped.map(x=>x.close), o: deduped.map(x=>x.open), h: deduped.map(x=>x.high), l: deduped.map(x=>x.low), s: 'ok' };
}

export async function scrapeInvestingFund(query, options = {}) {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('Debes proporcionar un ISIN, slug o URL de Investing.com');
  }

  const browser = await getBrowser();
  let page;

  try {
    page = await createOptimizedPage(browser, { allowStylesheets: true });

    // Collect intercepted timeseries data from TradingView history endpoints.
    let historyData = null;
    let historyResolution = null;
    let rangeCaptureMode = false;
    let quotesData = null;
    let resolveHistoryData;
    const historyDataReady = new Promise((resolve) => { resolveHistoryData = resolve; });

    page.on('response', async (response) => {
      const u = response.url();
      try {
        const isTradingViewHistory = /\/history\/?\?/i.test(u) && /(?:symbol|resolution)=/i.test(u);
        const isInvestingFinancialHistory = /api\.investing\.com\/api\/financialdata\/[^/]+\/historical\/chart/i.test(u);
        if (isTradingViewHistory || isInvestingFinancialHistory) {
          const json = await response.json();
          const normalized = normalizeCapturedHistory(json);
          if (normalized && normalized.t?.length) {
            // En cambio de rango, la nueva serie manda; al inicio conservamos la más completa.
            if (rangeCaptureMode || !historyData || normalized.t.length >= historyData.t.length) {
              historyData = normalized;
              const resolutionMatch = u.match(/[?&]resolution=([^&]+)/i);
              const intervalMatch = u.match(/[?&]interval=([^&]+)/i);
              historyResolution = resolutionMatch ? decodeURIComponent(resolutionMatch[1]) : intervalMatch ? decodeURIComponent(intervalMatch[1]) : historyResolution;
              resolveHistoryData();
            }
          }
        } else if (u.includes('/quotes?') && u.includes('symbols=')) {
          const json = await response.json();
          if (json && json.d && json.d[0] && json.d[0].v) {
            quotesData = json.d[0].v;
          }
        }
      } catch (_) {}
    });

    let targetUrl = '';

    // Case 1: Direct URL provided — use as-is, strip any -chart suffix
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      targetUrl = trimmed.replace(/-chart$/, '').replace(/\/$/, '');
    }
    // Case 2: ISIN or Search Term
    else {
      const isIsin = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(trimmed);

      // ── Step 1: Try Investing.com autocomplete API (most accurate for ISINs) ──
      let resolvedViaApi = false;
      try {
        // La API se consulta desde el origen de Investing (desde about:blank puede fallar por CORS).
        await page.goto('https://es.investing.com/', {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        });
        const apiResult = await page.evaluate(async (query) => {
          const res = await fetch('https://es.investing.com/search/service/searchTopBar', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: `search_text=${encodeURIComponent(query)}`
          });
          if (!res.ok) return null;
          return res.text();
        }, trimmed);

        if (apiResult) {
          const parsed = JSON.parse(apiResult);
          const allHits = [
            ...(parsed.quotes || []),
            ...(parsed.articles || []),
          ];
          const fundHit = allHits.find(h => {
            const url = h.link || h.url || '';
            return url.includes('/funds/') &&
                   !url.endsWith('/funds/') &&
                   !url.includes('world-funds') &&
                   !url.includes('major-funds');
          });
          if (fundHit) {
            const rawLink = fundHit.link || fundHit.url || '';
            const absolute = rawLink.startsWith('http') ? rawLink : `https://es.investing.com${rawLink}`;
            // Always strip any -chart suffix — use the clean fund URL
            targetUrl = absolute.replace(/-chart$/, '').replace(/\/$/, '');
            resolvedViaApi = true;
            console.log(`[Puppeteer] Resolved via autocomplete API: ${targetUrl}`);
          }
        }
      } catch (apiErr) {
        console.warn(`[Puppeteer] Autocomplete API failed, falling back to search page: ${apiErr.message}`);
      }

      // ── Step 2: Fallback — search page with strict ISIN matching ──
      if (!resolvedViaApi) {
        const searchUrl = `https://es.investing.com/search/?q=${encodeURIComponent(trimmed)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
        await waitForFundSearchResults(page, 5500);

        const isinUpper = trimmed.toUpperCase();
        const fundLink = await page.evaluate((isin, isIsinFlag) => {
          const links = Array.from(document.querySelectorAll('a[href*="/funds/"]'));
          const filtered = links.filter(a => {
            const h = a.getAttribute('href') || '';
            return !h.endsWith('/funds/') && !h.endsWith('/funds') &&
                   !h.includes('world-funds') && !h.includes('major-funds') &&
                   !h.includes('/funds/etfs');
          });
          if (isIsinFlag && filtered.length > 1) {
            const exact = filtered.find(a => {
              const row = a.closest('tr, li, .js-inner-all-results-quote-wrapper, [data-row-link]') || a.parentElement;
              return row && row.innerText && row.innerText.toUpperCase().includes(isin);
            });
            if (exact) return exact.href;
          }
          return filtered.length > 0 ? filtered[0].href : null;
        }, isinUpper, isIsin);

        if (fundLink) {
          // Use fund link as-is (no -chart)
          targetUrl = fundLink.replace(/-chart$/, '').replace(/\/$/, '');
          if (!targetUrl.startsWith('http')) targetUrl = `https://es.investing.com${targetUrl}`;
        } else {
          const cleanSlug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          targetUrl = `https://es.investing.com/funds/${cleanSlug}`;
        }
      }
    }

    // La serie real se solicita en la página oficial de gráfico del fondo, no en la URL
    // interna estática tvc-invdn... (que puede bloquearse al abrirla directamente).
    const baseFundUrl = targetUrl.replace(/-chart$/, '').replace(/\/$/, '');
    const officialChartUrl = `${baseFundUrl}-chart`;
    console.log(`[Puppeteer] Obteniendo datos reales del gráfico: ${officialChartUrl}`);
    try {
      await page.goto(officialChartUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (chartNavigationError) {
      console.warn(`[Puppeteer] No se pudo abrir la ruta de gráfico; se prueba la ficha del fondo: ${chartNavigationError.message}`);
      await page.goto(baseFundUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    }

    // Espera a la cotización y a la respuesta histórica de la propia página de Investing.
    await waitForFundQuote(page, 6500);
    if (!historyData) await Promise.race([historyDataReady, delay(3200)]);

    const requestedRange = CHART_RANGE_LABELS[options.range] ? options.range : '6months';
    if (requestedRange !== '6months') {
      const originalHistory = historyData;
      const originalResolution = historyResolution;
      historyData = null;
      rangeCaptureMode = true;
      const rangeControlClicked = await selectInvestingChartRange(page, requestedRange);
      if (rangeControlClicked) {
        // El periodo oficial dispara una nueva petición de histórico. Dejamos tiempo para
        // recibirla y después restauramos el último histórico válido si la página no responde.
        await delay(2200);
      }
      rangeCaptureMode = false;
      if (!historyData || !Array.isArray(historyData.t) || !historyData.t.length) {
        historyData = originalHistory;
        historyResolution = originalResolution;
      }
    }

    // Leer metadatos desde la cabecera real del fondo. La ruta -chart incluye la cotización;
    // si no lo hace en una versión regional de Investing, recurrimos a la ficha normal.
    const readDomInfo = () => page.evaluate(() => {
      const h1 = document.querySelector('h1')?.innerText?.trim() || '';
      
      // ── Extract Investing.com PID from any element on the page ──
      // Every price element has a class like "pid-1072234-last", "pid-1072234-pc" etc.
      // We use this PID to target the EXACT elements for this fund.
      const pidMatch = Array.from(document.querySelectorAll('[class*="pid-"]'))
        .map(el => el.className.match(/\bpid-(\d+)-/))
        .find(m => m);
      const pid = pidMatch ? pidMatch[1] : null;

      const mainContainer = document.querySelector('.main-current-data') || document;

      let lastEl, changeEl, changePcpEl;

      if (pid) {
        // PID-exact selectors — most reliable
        lastEl      = document.querySelector(`#last_last, .pid-${pid}-last`);
        changeEl    = document.querySelector(`.pid-${pid}-pc`);
        changePcpEl = document.querySelector(`.pid-${pid}-pcp`);
      }

      // Fallback: generic selectors within .main-current-data
      if (!lastEl) {
        lastEl = mainContainer.querySelector('#last_last') ||
                 mainContainer.querySelector('[class*="-last"]') ||
                 document.querySelector('#last_last') ||
                 document.querySelector('[data-test="instrument-price-last"]');
      }
      if (!changeEl) {
        // Exclude pcp variants (percentage), target only the points change
        changeEl = mainContainer.querySelector('span[class*="-pc"]:not([class*="-pcp"])') ||
                   document.querySelector('span[class*="-pc"]:not([class*="-pcp"])') ||
                   document.querySelector('[data-test="instrument-price-change"]');
      }
      if (!changePcpEl) {
        changePcpEl = mainContainer.querySelector('span[class*="-pcp"]') ||
                      document.querySelector('span[class*="-pcp"]') ||
                      document.querySelector('[data-test="instrument-price-change-percent"]');
      }

      const lastVal      = lastEl?.innerText?.trim() || '';
      const changeVal    = changeEl?.innerText?.trim() || '';
      const changePcpVal = changePcpEl?.innerText?.trim() || '';

      // Direction: prefer arrow class, then sign of values
      const hasUpArrow   = !!mainContainer.querySelector('.upArrow') || changeVal.startsWith('+') || changePcpVal.startsWith('+');
      const hasDownArrow = !!mainContainer.querySelector('.downArrow') || (changeVal.startsWith('-') && !changeVal.startsWith('+')); 
      const direction    = hasDownArrow && !hasUpArrow ? 'down' : 'up';
      const isGreen      = !!(changeEl?.className?.includes('greenFont') || changePcpEl?.className?.includes('greenFont') || direction === 'up');
      const isRed        = !!(changeEl?.className?.includes('redFont')   || changePcpEl?.className?.includes('redFont')   || direction === 'down');

      // Market status / time text
      let timeText = '';
      const timeEl = mainContainer.querySelector('.bottom.lighterGrayFont') ||
                     document.querySelector('.bottom.lighterGrayFont') ||
                     document.querySelector('[data-test="instrument-market-status"]');
      if (timeEl) timeText = timeEl.innerText.replace(/\n+/g, ' ').trim();

      // Currency
      const pageText = document.body.innerText || '';
      let currency = 'EUR';
      const currencyMatch = pageText.match(/\b(EUR|USD|GBP|JPY|CHF)\b/);
      if (currencyMatch) currency = currencyMatch[1];

      // ISIN
      const isinMatch = pageText.match(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/);

      return { h1, lastVal, changeVal, changePcpVal, direction, isGreen, isRed, timeText, currency, isin: isinMatch ? isinMatch[1] : '', pid };
    });
    let domInfo = await readDomInfo();
    if (!domInfo.lastVal && !quotesData?.lp) {
      try {
        await page.goto(baseFundUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
        await waitForFundQuote(page, 4500);
        domInfo = await readDomInfo();
      } catch (_) { /* Se conserva cualquier dato real ya recibido del gráfico. */ }
    }

    // Si la gráfica no ha emitido su endpoint interno, intenta la API de histórico de Investing
    // utilizando el ID de instrumento leído de la propia ficha. Si falla, se conserva el fallback
    // de la tabla histórica; nunca se crean precios sintéticos.
    if (!historyData?.t?.length && domInfo.pid) {
      const directHistory = await fetchInvestingFinancialHistory(domInfo.pid, requestedRange);
      if (directHistory?.t?.length) {
        historyData = directHistory;
        historyResolution = INVESTING_API_RANGE[requestedRange]?.interval || 'P1D';
      }
    }

    let fundTitle = domInfo.h1 || quotesData?.description || quotesData?.short_name || 'Fondo de Inversión';
    fundTitle = fundTitle.replace(/^Gráfico\s+/i, '').trim();

    // Fallbacks if quotesData had them from websocket/TradingView
    let lastPriceStr = domInfo.lastVal || (quotesData?.lp !== undefined && quotesData?.lp !== null && Number.isFinite(Number(quotesData.lp)) ? String(quotesData.lp).replace('.', ',') : '');
    let changeStr = domInfo.changeVal || (quotesData?.ch !== undefined && Number.isFinite(Number(quotesData.ch)) ? (Number(quotesData.ch) > 0 ? `+${quotesData.ch}` : String(quotesData.ch)) : '');
    let changePcpStr = domInfo.changePcpVal || (quotesData?.chp !== undefined && Number.isFinite(Number(quotesData.chp)) ? (Number(quotesData.chp) > 0 ? `+${quotesData.chp}%` : `${quotesData.chp}%`) : '');

    let currentNav = parseNumeric(lastPriceStr);
    let dailyChange = changeStr;
    let dailyChangePercent = changePcpStr;

    const liveQuote = {
      fundName: fundTitle,
      isin: domInfo.isin || (trimmed.length === 12 ? trimmed.toUpperCase() : ''),
      lastPrice: lastPriceStr,
      changeValue: changeStr,
      changePercent: changePcpStr,
      direction: domInfo.direction,
      color: domInfo.isRed ? 'red' : 'green',
      timeText: domInfo.timeText,
      currency: domInfo.currency,
      url: targetUrl,
      updatedAt: new Date().toISOString(),
      historyUpdatedAt: null,
      historyResolution: historyResolution || 'D',
      historySource: '',
      historyRange: requestedRange,
      history: []
    };

    let rows = [];

    // Approach A: Intercepted TradingView timeseries API
    if (historyData && historyData.t && historyData.t.length > 0) {
      console.log(`[Puppeteer] Timeseries intercepted: ${historyData.t.length} points.`);
      const t = historyData.t;
      const c = historyData.c || [];
      const h = historyData.h || [];
      const l = historyData.l || [];
      const o = historyData.o || [];

      for (let i = 0; i < t.length; i++) {
        rows.push({
          id: `r_${i + 1}`,
          timestamp: t[i],
          col_date: formatTimestampToDate(t[i]),
          col_nav: String(c[i] !== undefined ? c[i] : ''),
          col_high: String(h[i] !== undefined ? h[i] : ''),
          col_low: String(l[i] !== undefined ? l[i] : ''),
          col_open: String(o[i] !== undefined ? o[i] : '')
        });
      }
      // Sort chronologically ascending (oldest first, so charts display correctly left to right)
      rows.sort((a, b) => a.timestamp - b.timestamp);
    } 
    // Approach B: Fallback to historical data table page
    else {
      console.log('[Puppeteer] Intercepted timeseries empty, navigating to historical data page...');
      const histUrl = `${targetUrl}-historical-data`;
      await page.goto(histUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await waitForHistoricalTable(page, 7000);

      const scrapedTable = await page.evaluate(() => {
        const result = [];
        const table = document.querySelector('table[data-test="historical-data-table"]') ||
                      document.querySelector('.historical-data-table') ||
                      document.querySelector('table');
        if (table) {
          const trs = table.querySelectorAll('tr');
          trs.forEach(tr => {
            const cells = Array.from(tr.querySelectorAll('th, td')).map(c => c.innerText.trim());
            if (cells.length >= 2) result.push(cells);
          });
        }
        return result;
      });

      if (scrapedTable.length > 1) {
        // First row is header: ["Fecha", "Último", "Apertura", "Máximo", "Mínimo", "% var."]
        const dataRows = scrapedTable.slice(1);
        dataRows.forEach((row, i) => {
          const dateStr = normalizeDateStr(row[0]);
          const closeVal = row[1] || '';
          const openVal = row[2] || '';
          const highVal = row[3] || '';
          const lowVal = row[4] || '';

          if (dateStr && closeVal) {
            rows.push({
              id: `r_${i + 1}`,
              col_date: dateStr,
              col_nav: closeVal,
              col_open: openVal,
              col_high: highVal,
              col_low: lowVal
            });
          }
        });

        // Historical table on investing.com is newest first. Reverse to chronological order for charts:
        rows.reverse();
      }
    }

    // No se fabrica un punto con la fecha de hoy: si Investing no entrega histórico,
    // la API devuelve la cotización real pero la interfaz no dibuja una curva engañosa.

    liveQuote.history = rows.map(row => ({
      timestamp: row.timestamp || null,
      col_date: row.col_date || '',
      col_nav: row.col_nav ?? '',
      col_open: row.col_open ?? '',
      col_high: row.col_high ?? '',
      col_low: row.col_low ?? ''
    }));
    liveQuote.historyUpdatedAt = rows.length ? new Date().toISOString() : null;
    liveQuote.historyRange = requestedRange;
    liveQuote.historySource = rows.length ? 'investing-real-history' : '';

    if (rows.length === 0 && !domInfo.lastVal && !quotesData?.lp) {
      throw new Error(`No se pudieron extraer datos para "${query}". Comprueba que la URL de Investing.com sea válida y accesible.`);
    }

    const tableId = `tbl_fund_${Date.now()}`;
    const cleanColumns = [
      { id: 'col_date', name: 'Fecha', type: 'date' },
      { id: 'col_nav', name: `Valor Liquidativo (${domInfo.currency})`, type: 'number' },
      { id: 'col_high', name: `Máximo (${domInfo.currency})`, type: 'number' },
      { id: 'col_low', name: `Mínimo (${domInfo.currency})`, type: 'number' }
    ];

    return {
      success: true,
      liveQuote: liveQuote,
      fund: {
        title: fundTitle,
        isin: domInfo.isin || (trimmed.length === 12 ? trimmed.toUpperCase() : ''),
        url: targetUrl,
        price: currentNav,
        change: dailyChange,
        changePercent: dailyChangePercent,
        currency: domInfo.currency,
        totalPoints: rows.length
      },
      table: {
        id: tableId,
        name: fundTitle.length > 32 ? fundTitle.slice(0, 32) + '...' : fundTitle,
        columns: cleanColumns,
        rows: rows
      },
      suggestedChart: {
        id: `ch_fund_${Date.now()}`,
        title: `Evolución Liquidativa: ${fundTitle}`,
        tableId: tableId,
        type: 'area',
        xColId: 'col_date',
        yColId: 'col_nav',
        color: '#2563eb',
        showPoints: rows.length <= 40,
        height: 520
      }
    };

  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {});
  }
}

// Caché en memoria para evitar repetir búsquedas de ISIN a URL en el servidor
const ISIN_URL_CACHE = new Map();

/**
 * Fast quote-only scrape: resolves ISIN/URL → fund page → live DOM data.
 * Skips timeseries interception and historical data. ~2× faster.
 */
export async function scrapeInvestingQuoteOnly(query) {
  const trimmed = (query || '').trim();
  if (!trimmed) throw new Error('Query vacío');

  const browser = await getBrowser();
  let page;

  try {
    page = await createOptimizedPage(browser);

    let targetUrl = '';
    const upperQuery = trimmed.toUpperCase();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      // Use as-is, strip any -chart suffix
      targetUrl = trimmed.replace(/-chart$/, '').replace(/\/$/, '');
    } else if (ISIN_URL_CACHE.has(upperQuery)) {
      targetUrl = ISIN_URL_CACHE.get(upperQuery);
    } else {
      const isIsin = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(trimmed);
      let resolved = false;

      // Try autocomplete API first (fast, accurate for ISINs)
      try {
        await page.goto('https://es.investing.com', { waitUntil: 'domcontentloaded', timeout: 25000 });
        const apiResult = await page.evaluate(async (q) => {
          const res = await fetch('https://es.investing.com/search/service/searchTopBar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
            body: `search_text=${encodeURIComponent(q)}`
          });
          return res.ok ? res.text() : null;
        }, trimmed);

        if (apiResult) {
          const parsed = JSON.parse(apiResult);
          const hits = [...(parsed.quotes || []), ...(parsed.articles || [])];
          const hit = hits.find(h => {
            const u = h.link || h.url || '';
            return u.includes('/funds/') && !u.endsWith('/funds/') &&
                   !u.includes('world-funds') && !u.includes('major-funds');
          });
          if (hit) {
            const raw = hit.link || hit.url || '';
            const abs = raw.startsWith('http') ? raw : `https://es.investing.com${raw}`;
            targetUrl = abs.replace(/-chart$/, '').replace(/\/$/, '');
            ISIN_URL_CACHE.set(upperQuery, targetUrl);
            resolved = true;
          }
        }
      } catch (_) {}

      if (!resolved) {
        // Fallback: search page
        await page.goto(`https://es.investing.com/search/?q=${encodeURIComponent(trimmed)}`, { waitUntil: 'domcontentloaded', timeout: 35000 });
        await waitForFundSearchResults(page, 7000);
        const isinUpper = trimmed.toUpperCase();
        const link = await page.evaluate((isin, isIsinFlag) => {
          const all = Array.from(document.querySelectorAll('a[href*="/funds/"]')).filter(a => {
            const h = a.getAttribute('href') || '';
            return !h.endsWith('/funds/') && !h.endsWith('/funds') && !h.includes('world-funds') && !h.includes('major-funds');
          });
          if (isIsinFlag && all.length > 1) {
            const exact = all.find(a => {
              const row = a.closest('tr, li, .js-inner-all-results-quote-wrapper') || a.parentElement;
              return row && row.innerText && row.innerText.toUpperCase().includes(isin);
            });
            if (exact) return exact.href;
          }
          return all.length > 0 ? all[0].href : null;
        }, isinUpper, isIsin);
        if (link) {
          targetUrl = link.replace(/-chart$/, '').replace(/\/$/, '');
          if (!targetUrl.startsWith('http')) targetUrl = `https://es.investing.com${targetUrl}`;
          ISIN_URL_CACHE.set(upperQuery, targetUrl);
        } else {
          targetUrl = `https://es.investing.com/funds/${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        }
      }
    }

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForFundQuote(page, 12000);

    const domInfo = await page.evaluate(() => {
      const h1 = document.querySelector('h1')?.innerText?.trim() || '';
      const mainContainer = document.querySelector('.main-current-data') || document;

      // Extract PID if available
      const pidEl = document.querySelector('[data-pair-id]') ||
                    document.querySelector('[data-pid]') ||
                    mainContainer.querySelector('[data-pair-id]');
      const pid = pidEl ? (pidEl.getAttribute('data-pair-id') || pidEl.getAttribute('data-pid')) : null;

      let lastEl = pid ? (document.querySelector(`.pid-${pid}-last`) || document.querySelector(`#last_last`)) : null;
      let changeEl = pid ? document.querySelector(`.pid-${pid}-pc`) : null;
      let changePcpEl = pid ? document.querySelector(`.pid-${pid}-pcp`) : null;

      if (!lastEl) {
        lastEl = mainContainer.querySelector('[data-test="instrument-price-last"]') ||
                 document.querySelector('[data-test="instrument-price-last"]') ||
                 mainContainer.querySelector('#last_last') ||
                 mainContainer.querySelector('[class*="-last"]') ||
                 document.querySelector('#last_last');
      }
      if (!changeEl) {
        changeEl = mainContainer.querySelector('[data-test="instrument-price-change"]') ||
                   document.querySelector('[data-test="instrument-price-change"]') ||
                   mainContainer.querySelector('span[class*="-pc"]:not([class*="-pcp"])') ||
                   document.querySelector('span[class*="-pc"]:not([class*="-pcp"])');
      }
      if (!changePcpEl) {
        changePcpEl = mainContainer.querySelector('[data-test="instrument-price-change-percent"]') ||
                      document.querySelector('[data-test="instrument-price-change-percent"]') ||
                      mainContainer.querySelector('span[class*="-pcp"]') ||
                      document.querySelector('span[class*="-pcp"]');
      }

      const lastVal = lastEl?.innerText?.trim() || '';
      const changeVal = changeEl?.innerText?.trim() || '';
      const changePcpVal = changePcpEl?.innerText?.trim() || '';

      const hasUp = changeVal.startsWith('+') || changePcpVal.startsWith('+');
      const direction = hasUp ? 'up' : 'down';
      const isGreen = !!(changeEl?.className?.includes('greenFont') || changePcpEl?.className?.includes('greenFont') || direction === 'up');

      const pageText = document.body.innerText || '';
      let currency = 'EUR';
      const currencyMatch = pageText.match(/\b(EUR|USD|GBP|JPY|CHF)\b/);
      if (currencyMatch) currency = currencyMatch[1];
      const isinMatch = pageText.match(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/);

      return { h1, lastVal, changeVal, changePcpVal, direction, isGreen, currency, isin: isinMatch ? isinMatch[1] : '' };
    });

    let fundTitle = domInfo.h1 || 'Fondo de Inversión';
    fundTitle = fundTitle.replace(/^Gráfico\s+/i, '').trim();

    // Guardar URL en caché si pudimos resolverla con éxito
    if (domInfo.isin) {
      ISIN_URL_CACHE.set(domInfo.isin.toUpperCase(), targetUrl);
    }

    return {
      success: true,
      liveQuote: {
        fundName: fundTitle,
        isin: domInfo.isin || (trimmed.length === 12 ? trimmed.toUpperCase() : ''),
        lastPrice: domInfo.lastVal || '—',
        changeValue: domInfo.changeVal || '—',
        changePercent: domInfo.changePcpVal || '—',
        direction: domInfo.direction,
        color: domInfo.isGreen ? 'green' : 'red',
        currency: domInfo.currency,
        url: targetUrl,
        updatedAt: new Date().toISOString()
      }
    };
  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {});
  }
}
