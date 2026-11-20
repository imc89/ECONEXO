// Live fund quotes, monitor rendering, sorting and quote refresh API.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 2412-2996) ---
    // ── MONITOR DE COTIZACIONES EN VIVO ──────────────────────────────────────────
    // Las cotizaciones pueden crecer mucho; IndexedDB es su fuente principal. Se
    // mantiene localStorage solo como copia de compatibilidad cuando el tamaño cabe.
    const LIVE_QUOTES_IDB_KEY = 'liveQuotes';
    let liveQuotesSaveTimer = null;
    let liveQuotesWriteChain = Promise.resolve();

    /** Recupera primero IndexedDB y migra automáticamente desde localStorage si hace falta. */
    async function loadLiveQuotes() {
      let savedQuotes = null;
      let loadedFromIndexedDb = false;
      try {
        const saved = await idbGetValue(LIVE_QUOTES_IDB_KEY);
        if (Array.isArray(saved)) {
          savedQuotes = saved;
          loadedFromIndexedDb = true;
        }
      } catch (error) {
        console.warn('IndexedDB de cotizaciones no disponible; se intentará localStorage.', error);
      }

      if (!savedQuotes) {
        try {
          const parsed = JSON.parse(localStorage.getItem(QUOTES_KEY) || 'null');
          if (Array.isArray(parsed)) savedQuotes = parsed;
        } catch (_) { /* Se conserva la lista vacía si la copia antigua no puede leerse. */ }
      }

      if (savedQuotes) liveQuotes = savedQuotes;
      // IndexedDB ya es la fuente principal: no se vuelve a escribir todo el array
      // en cada arranque. Solo se hace el trabajo costoso al migrar la copia antigua.
      if (loadedFromIndexedDb) return;
      try {
        await idbSetValue(LIVE_QUOTES_IDB_KEY, cloneForPersistence(liveQuotes));
        const serialized = JSON.stringify(liveQuotes);
        if (serialized.length <= LOCAL_STORAGE_SHADOW_MAX_CHARS) localStorage.setItem(QUOTES_KEY, serialized);
        else localStorage.removeItem(QUOTES_KEY);
      } catch (_) { /* La app puede seguir trabajando en memoria/localStorage. */ }
    }

    async function persistLiveQuotesNow() {
      const snapshot = cloneForPersistence(liveQuotes);
      liveQuotesWriteChain = liveQuotesWriteChain.catch(() => {}).then(async () => {
        try {
          await idbSetValue(LIVE_QUOTES_IDB_KEY, snapshot);
          const serialized = JSON.stringify(snapshot);
          if (serialized.length <= LOCAL_STORAGE_SHADOW_MAX_CHARS) localStorage.setItem(QUOTES_KEY, serialized);
          else localStorage.removeItem(QUOTES_KEY); // No dejar una copia vieja engañosa.
        } catch (idbError) {
          console.warn('No se pudieron guardar las cotizaciones en IndexedDB; se usará localStorage.', idbError);
          try {
            const serialized = JSON.stringify(snapshot);
            if (serialized.length > LOCAL_STORAGE_SHADOW_MAX_CHARS) {
              throw new Error('La lista de cotizaciones excede el límite seguro de localStorage.');
            }
            localStorage.setItem(QUOTES_KEY, serialized);
          } catch (storageError) {
            console.error('No se pudieron persistir las cotizaciones; exporta una copia de seguridad.', storageError);
            showToast('No se pudieron guardar las cotizaciones. Exporta una copia de seguridad.', 'error');
          }
        }
      });
      return liveQuotesWriteChain;
    }

    /** Agrupa una ráfaga de actualizaciones en una sola escritura del array completo. */
    function saveLiveQuotes() {
      clearTimeout(liveQuotesSaveTimer);
      liveQuotesSaveTimer = setTimeout(() => {
        liveQuotesSaveTimer = null;
        persistLiveQuotesNow().catch(error => console.error('Error guardando cotizaciones:', error));
      }, 220);
      queueMonthlyBackup();
    }

    // ── formatRelativeTime: returns «ahora mismo», «hace X min», etc. ─────────────
    /** Convierte una fecha ISO en una indicación de tiempo relativo. */
    function formatRelativeTime(isoString) {
      if (!isoString) return '';
      const d = new Date(isoString);
      if (isNaN(d)) return '';
      const diff = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
      if (diff < 60) return 'consulta ahora';
      if (diff < 3600) return `consulta hace ${Math.floor(diff / 60)} min`;
      if (diff < 86400) return `consulta hace ${Math.floor(diff / 3600)} h`;
      return `consulta hace ${Math.floor(diff / 86400)} d`;
    }

    // ── updateFundsLastUpdateBadge: muestra la última actualización real ───────
    /** Actualiza el indicador de cuándo se actualizaron las cotizaciones. */
    function updateFundsLastUpdateBadge() {
      const el = document.getElementById('fundsLastUpdateText');
      if (!el) return;

      const timestamps = liveQuotes
        .map(q => q?.updatedAt)
        .filter(Boolean)
        .map(value => new Date(value))
        .filter(date => !isNaN(date.getTime()));

      if (!timestamps.length) {
        el.textContent = 'Sin actualizar';
        return;
      }

      const latest = new Date(Math.max(...timestamps.map(date => date.getTime())));
      const time = latest.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const today = new Date();
      const sameDay = latest.toDateString() === today.toDateString();

      el.textContent = sameDay
        ? `Última consulta ${time}`
        : `Última consulta ${latest.toLocaleDateString('es-ES')} ${time}`;
      el.title = 'Hora en que la aplicación consultó Investing.com. No garantiza que el valor liquidativo del fondo se haya actualizado a esa hora.';
    }

    // ── renderPortfolioSummary: renders the 4 KPI summary cards above the grid ────
    /** Actualiza las métricas resumidas del monitor de fondos. */
    function renderPortfolioSummary() {
      const bar = document.getElementById('portfolioSummaryBar');
      const empty = document.getElementById('emptyLiveQuotesState');
      if (!bar) return;

      if (liveQuotes.length === 0) {
        bar.classList.add('hidden');
        bar.style.display = '';
        if (empty) empty.style.display = '';
        return;
      }

      // Show summary bar, hide empty state
      bar.classList.remove('hidden');
      bar.style.display = 'grid';
      if (empty) empty.style.display = 'none';

      // Parse all change percents
      const withPct = liveQuotes.map(q => {
        const raw = String(q.changePercent || '').replace(/[()%]/g, '').trim();
        const n = parseFloat(raw.replace(',', '.'));
        return { name: q.fundName || q.isin, pct: isNaN(n) ? null : n };
      }).filter(x => x.pct !== null);

      const avgPct = withPct.length ? (withPct.reduce((s, x) => s + x.pct, 0) / withPct.length) : null;
      const best = withPct.length ? withPct.reduce((a, b) => a.pct > b.pct ? a : b) : null;
      const worst = withPct.length ? withPct.reduce((a, b) => a.pct < b.pct ? a : b) : null;

      const pctFmt = v => v !== null ? (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%' : '—';
      const colorCls = v => v === null ? 'text-slate-500' : v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';

      bar.innerHTML = `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
      <p class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">FONDOS SEGUIDOS</p>
      <p class="text-xl font-bold text-slate-900 dark:text-white">${liveQuotes.length}</p>
    </div>
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
      <p class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">VARIACIÓN MEDIA SIMPLE</p>
      <p class="text-xl font-bold font-mono-num ${colorCls(avgPct)}">${pctFmt(avgPct)}</p>
      <p class="text-[10px] text-slate-400 mt-0.5">Media aritmética; no ponderada por tu inversión.</p>
    </div>
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
      <p class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">MEJOR VARIACIÓN</p>
      ${best ? `<p class="text-sm font-bold ${colorCls(best.pct)} font-mono-num">${pctFmt(best.pct)}</p><p class="text-[10px] text-slate-400 truncate mt-0.5">${esc(best.name)}</p>` : '<p class="text-sm text-slate-400">—</p>'}
    </div>
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
      <p class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">PEOR VARIACIÓN</p>
      ${worst ? `<p class="text-sm font-bold ${colorCls(worst.pct)} font-mono-num">${pctFmt(worst.pct)}</p><p class="text-[10px] text-slate-400 truncate mt-0.5">${esc(worst.name)}</p>` : '<p class="text-sm text-slate-400">—</p>'}
    </div>
  `;
    }

    /** Aplica el modo de vista del monitor sin modificar el orden ni los datos de los fondos. */
    function setLiveQuotesViewMode(mode, options = {}) {
      const nextMode = mode === 'list' ? 'list' : 'cards';
      liveQuotesViewMode = nextMode;

      const grid = document.getElementById('liveQuotesGrid');
      if (grid) {
        grid.classList.toggle('live-monitor-list-view', nextMode === 'list');
        grid.dataset.viewMode = nextMode;
      }

      const cardsBtn = document.getElementById('liveQuotesCardsModeBtn');
      const listBtn = document.getElementById('liveQuotesListModeBtn');
      if (cardsBtn) {
        const active = nextMode === 'cards';
        cardsBtn.classList.toggle('active', active);
        cardsBtn.setAttribute('aria-pressed', String(active));
      }
      if (listBtn) {
        const active = nextMode === 'list';
        listBtn.classList.toggle('active', active);
        listBtn.setAttribute('aria-pressed', String(active));
      }

      if (options.persist !== false) {
        try { localStorage.setItem(LIVE_QUOTES_VIEW_MODE_KEY, nextMode); } catch (_) { }
      }
    }

    /** Recupera la preferencia de vista; si no existe, usa tarjetas por defecto. */
    function loadLiveQuotesViewMode() {
      let savedMode = 'cards';
      try {
        const saved = localStorage.getItem(LIVE_QUOTES_VIEW_MODE_KEY);
        if (saved === 'list' || saved === 'cards') savedMode = saved;
      } catch (_) { }
      setLiveQuotesViewMode(savedMode, { persist: false });
    }

    // ── renderLiveQuotes: builds the full draggable quote card grid ───────────────
    /** Renderiza las tarjetas o las filas del listado con las cotizaciones actuales. */
    function renderLiveQuotes() {
      const grid = document.getElementById('liveQuotesGrid');
      const empty = document.getElementById('emptyLiveQuotesState');
      if (!grid) return;
      grid.innerHTML = '';
      // Mantiene visibles los cinco primeros fondos sin scroll interno; el área
      // solo se vuelve desplazable cuando existen más de cinco.
      const hasMoreThanFive = liveQuotes.length > 5;
      grid.classList.toggle('has-more-than-five', hasMoreThanFive);
      grid.dataset.fundCount = String(liveQuotes.length);

      if (liveQuotes.length === 0) {
        if (empty) empty.style.display = '';
        renderPortfolioSummary();
        return;
      }
      if (empty) empty.style.display = 'none';
      renderPortfolioSummary();
      updateFundsLastUpdateBadge();

      liveQuotes.forEach(quote => {
        const isUp = quote.direction === 'up' || (quote.changeValue && String(quote.changeValue).startsWith('+'));
        const quoteKey = quote.isin || quote.url || quote.fundName;
        const domSafeId = encodeURIComponent(quoteKey).replace(/[^a-zA-Z0-9_-]/g, '_');

        // Stale check: if data is older than 24h mark it
        let isStale = false;
        if (quote.updatedAt) {
          const d = new Date(quote.updatedAt);
          if (!isNaN(d)) isStale = (Date.now() - d.getTime()) > 24 * 60 * 60 * 1000;
        }

        const relTime = quote.updatedAt ? formatRelativeTime(quote.updatedAt) : '';
        const lastPriceDisplay = esc(fmtMaybeNumber(quote.lastPrice, 2));
        const changeDisplay = esc(fmtMaybeNumber(quote.changeValue, 2));
        const changePcpDisplay = esc(fmtMaybeNumber(String(quote.changePercent || '—').replace(/[()]/g, ''), 2));
        const fundPageUrl = (quote.url || '#').replace(/-chart$/, '');

        const card = document.createElement('div');
        card.id = `quote_card_${domSafeId}`;
        card.dataset.quoteKey = quoteKey;
        card.draggable = true;
        card.className = [
          'quote-card-draggable relative rounded-2xl p-4 shadow-sm',
          'transition-all duration-200 flex flex-col justify-between space-y-3 group',
          'bg-slate-50/70 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800',
          isStale
            ? 'border border-amber-300 dark:border-amber-700'
            : 'border border-slate-200/80 dark:border-slate-700/80 hover:border-emerald-500/50 dark:hover:border-emerald-500/50'
        ].join(' ');

        card.innerHTML = `
      <!-- Drag handle row: handle + fund name + ISIN + action buttons -->
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 mb-0.5">
            <span class="drag-handle text-slate-300 dark:text-slate-600 hover:text-slate-400 dark:hover:text-slate-400 transition" title="Arrastra para reordenar">
              <i class="ph-bold ph-dots-six-vertical text-sm"></i>
            </span>
            <a href="${esc(fundPageUrl)}" target="_blank" rel="noopener"
               class="text-xs font-bold text-slate-900 dark:text-white truncate hover:text-emerald-600 dark:hover:text-emerald-400 transition block max-w-[220px]"
               title="${esc(quote.fundName)}" onclick="event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); window.open(this.href, '_blank', 'noopener,noreferrer');">
              ${esc(quote.fundName)}
            </a>
          </div>
          <div class="flex items-center flex-wrap gap-1.5 ml-5">
            <span class="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
              ${esc(quote.isin || 'FONDO')}
            </span>
            <span class="text-[10px] text-slate-400 font-medium">${esc(quote.currency || 'EUR')}</span>
            ${isStale ? '<span class="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">⚠ Desactualizado</span>' : ''}
          </div>
        </div>
        <div class="flex items-center space-x-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
          <button onclick="refreshSingleLiveQuote('${esc(quoteKey)}')" class="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 transition" title="Actualizar cotización">
            <i id="quote_icon_${domSafeId}" class="ph-bold ph-arrows-clockwise text-xs"></i>
          </button>
          <button onclick="removeLiveQuote('${esc(quoteKey)}')" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition" title="Quitar del monitor">
            <i class="ph-bold ph-x text-xs"></i>
          </button>
        </div>
      </div>

      <!-- Price box: last price + arrow badge + percent change -->
      <div class="main-current-data bg-white dark:bg-slate-900/90 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
        <div class="flex items-end justify-between">
          <div>
            <span class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-0.5">ÚLTIMO PRECIO</span>
            <span class="arial_26 text-[1.4rem] sm:text-[1.6rem] font-bold tracking-tight text-slate-900 dark:text-white font-mono-num" id="last_last_${domSafeId}">${lastPriceDisplay}</span>
            <span class="text-xs text-slate-400 font-medium ml-1">${esc(quote.currency || 'EUR')}</span>
          </div>
          <div class="flex flex-col items-end gap-0.5">
            <div class="flex items-center gap-1">
              <span class="inline-flex items-center justify-center w-5 h-5 rounded-md ${isUp ? 'bg-emerald-500/10' : 'bg-rose-500/10'}">
                <i class="ph-bold ${isUp ? 'ph-arrow-up text-emerald-500' : 'ph-arrow-down text-rose-500'} text-xs"></i>
              </span>
              <span class="arial_20 text-sm font-bold font-mono-num ${isUp ? 'greenFont' : 'redFont'}">${changeDisplay}</span>
            </div>
            <span class="arial_20 text-xs font-semibold font-mono-num px-2 py-0.5 rounded-md ${isUp ? 'greenFont bg-emerald-500/10' : 'redFont bg-rose-500/10'} parentheses">${changePcpDisplay}</span>
          </div>
        </div>
      </div>

      <!-- Footer: relative time + add to table button -->
      <div class="flex items-center justify-between text-[11px] pt-0.5">
        <span class="text-slate-400 flex items-center gap-1 truncate max-w-[55%]">
          <i class="ph ph-clock text-[10px]"></i>
          ${relTime ? esc(relTime) : (quote.timeText ? esc(quote.timeText) : 'Sin datos')}
        </span>
        <button onclick="openFundChart('${esc(quoteKey)}')" class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition" title="Ver gráfica del fondo">
          <i class="ph-bold ph-chart-line text-xs"></i><span>VER GRÁFICA</span>
        </button>
      </div>
    `;

        grid.appendChild(card);
      });

      setupDragAndDrop();
    }

    // ── removeLiveQuote: removes a quote by key ───────────────────────────────────
    /** Quita una cotización del monitor sin borrar el histórico financiero de ese fondo. */
    function removeLiveQuote(key) {
      const removedQuote = liveQuotes.find(q => q.isin === key || q.url === key || q.fundName === key);
      let historyPreserved = false;
      if (removedQuote) {
        const portfolioKey = removedQuote.isin || removedQuote.url || removedQuote.fundName;
        const hasHistory = (state.myinvestor || []).some(row => {
          const values = row?.fondos?.[portfolioKey];
          return values && (hasUserValue(values.movimiento) || hasUserValue(values.total));
        });
        if (hasHistory && portfolioKey) {
          if (!Array.isArray(state.archivedPortfolioFunds)) state.archivedPortfolioFunds = [];
          state.archivedPortfolioFunds = state.archivedPortfolioFunds.filter(f => f?.key !== portfolioKey);
          state.archivedPortfolioFunds.push({
            key: portfolioKey,
            name: removedQuote.fundName || removedQuote.isin || removedQuote.url || portfolioKey,
            isin: removedQuote.isin || ''
          });
          saveState();
          historyPreserved = true;
        }
      }
      liveQuotes = liveQuotes.filter(q => q.isin !== key && q.url !== key && q.fundName !== key);
      saveLiveQuotes();
      renderLiveQuotes();
      if (currentSection === 'fondos') renderFondosSection();
      showToast(historyPreserved
        ? 'Cotización retirada; el histórico de cartera se conserva.'
        : 'Fondo retirado del monitor.', 'info');
    }

    // ── addOrUpdateLiveQuote: upsert helper ─────────────────────────────────────
    /** Añade una cotización al monitor o actualiza la existente. */
    function addOrUpdateLiveQuote(quote, options = {}) {
      if (!quote) return;
      const { persist = true, render = true } = options;
      const idx = liveQuotes.findIndex(q =>
        (quote.isin && q.isin && q.isin === quote.isin) ||
        (quote.url && q.url && q.url === quote.url) ||
        (quote.fundName && q.fundName && q.fundName === quote.fundName)
      );
      if (idx !== -1) {
        liveQuotes[idx] = { ...liveQuotes[idx], ...quote };
      } else {
        liveQuotes.unshift(quote);
      }
      if (persist) saveLiveQuotes();
      if (render) {
        renderLiveQuotes();
        if (currentSection === 'fondos') renderMyInvestorTable();
      }
    }

    // ── API DE ACTUALIZACIÓN POR LOTES ───────────────────────────────────────────
    // Para lotes grandes, el servidor devuelve un jobId; el navegador consulta su
    // progreso sin mantener una única petición HTTP abierta durante varios minutos.
    const quoteRefreshDelay = ms => new Promise(resolve => setTimeout(resolve, ms));

    async function requestQuoteRefresh(queries, options = {}) {
      const uniqueQueries = [...new Set((queries || []).filter(Boolean).map(q => String(q).trim()).filter(Boolean))];
      if (!uniqueQueries.length) return { success: true, results: [], total: 0, async: false };

      let initialResponse;
      try {
        initialResponse = await fetch(getApiEndpoint('/api/refresh-quotes'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queries: uniqueQueries, forceRefresh: options.forceRefresh === true }),
          signal: options.signal
        });
      } catch (netErr) {
        throw new Error('No se pudo conectar con el servidor de scraping (Puppeteer). Comprueba que esté en ejecución o configura la URL en Ajustes de Backend.');
      }
      let data;
      try { data = await initialResponse.json(); }
      catch (_) {
        if (initialResponse.status === 404) {
          throw new Error('Servidor de scraping no encontrado (404). Si estás en GitHub Pages, conecta la URL de tu backend en el icono de la barra superior.');
        }
        throw new Error(`Respuesta no válida del servidor (HTTP ${initialResponse.status}).`);
      }
      if (!initialResponse.ok) throw new Error(data?.error || `HTTP ${initialResponse.status}`);

      const asyncJobId = data?.async && data.jobId ? data.jobId : null;
      while (data?.async && data.jobId && (data.status === 'queued' || data.status === 'running')) {
        options.onProgress?.(data);
        await quoteRefreshDelay(options.pollIntervalMs || 900);
        const pollResponse = await fetch(getApiEndpoint(`/api/refresh-quotes/jobs/${encodeURIComponent(data.jobId)}`), {
          method: 'GET',
          cache: 'no-store',
          signal: options.signal
        });
        try { data = await pollResponse.json(); }
        catch (_) { throw new Error('No se pudo leer el progreso del lote de cotizaciones.'); }
        if (!pollResponse.ok) throw new Error(data?.error || `Error consultando el lote (HTTP ${pollResponse.status}).`);
      }

      options.onProgress?.(data);
      // Tras analizar el cuerpo, confirma recepción para que el servidor libere
      // pronto los resultados en memoria. La variable `data` ya conserva el array.
      if (asyncJobId) {
        fetch(getApiEndpoint(`/api/refresh-quotes/jobs/${encodeURIComponent(asyncJobId)}/ack`), {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', keepalive: true
        }).catch(() => {});
      }
      if (data?.status === 'failed') throw new Error(data.error || 'El lote de cotizaciones ha fallado.');
      if (!Array.isArray(data?.results)) throw new Error(data?.error || 'El servidor no devolvió los resultados del lote.');
      return data;
    }

    // ── refreshSingleLiveQuote: refresh one card ─────────────────────────────────
    window.refreshSingleLiveQuote = async function (key) {
      const quote = liveQuotes.find(q => q.isin === key || q.url === key || q.fundName === key);
      if (!quote) return;
      const domSafeId = encodeURIComponent(key).replace(/[^a-zA-Z0-9_-]/g, '_');
      const icon = document.getElementById(`quote_icon_${domSafeId}`);
      if (icon) icon.classList.add('animate-spin');
      try {
        const data = await requestQuoteRefresh([quote.url || quote.isin], { forceRefresh: true });
        const r = data?.results?.[0];
        if (r?.success && r.liveQuote) {
          addOrUpdateLiveQuote(r.liveQuote);
          showToast(`"${r.liveQuote.fundName}" actualizado.`, 'success');
          const card = document.getElementById(`quote_card_${domSafeId}`);
          if (card) { card.classList.add('quote-card-flash'); setTimeout(() => card.classList.remove('quote-card-flash'), 1200); }
        } else {
          showToast(r?.error || 'No se pudo actualizar.', 'error');
        }
      } catch (err) {
        showToast(err?.message || 'Error al conectar con el scraper.', 'error');
      } finally {
        if (icon) icon.classList.remove('animate-spin');
      }
    };

    // ── handleQuickAdd: handle the quick-add form in the monitor ─────────────────
    /** Procesa el formulario rápido para incorporar un fondo al monitor. */
    async function handleQuickAdd(e) {
      e.preventDefault();
      const input = document.getElementById('quickIsinInput');
      const val = input ? input.value.trim() : '';
      if (!val) return;

      // Validate: must be an Investing.com URL or a valid ISIN (12 uppercase alphanumeric)
      const isInvestingUrl = val.includes('investing.com');
      const isISIN = /^[A-Z]{2}[A-Z0-9]{10}$/.test(val.toUpperCase());
      if (!isInvestingUrl && !isISIN) {
        showToast('Introduce una URL de es.investing.com o un ISIN válido (ej. IE00B03HD191).', 'error');
        return;
      }

      const btn = document.getElementById('quickAddIsinBtn');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph-bold ph-circle-notch animate-spin text-xs"></i>'; }

      try {
        const res = await fetch(getApiEndpoint('/api/scrape-fund'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: val })
        });
        const data = await res.json();
        if (data.success && data.liveQuote) {
          addOrUpdateLiveQuote(data.liveQuote);
          if (input) input.value = '';
          showToast(`"${data.liveQuote.fundName}" añadido al monitor.`, 'success');
        } else {
          showToast(data.error || 'No se pudo obtener la cotización.', 'error');
        }
      } catch (err) {
        showToast('Error de conexión con el scraper.', 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph-bold ph-plus text-xs"></i><span>Añadir</span>'; }
      }
    }

    // ── refreshAllQuotes: refresh all cards in the monitor ───────────────────────
    /** Solicita la actualización de las cotizaciones del monitor. */
    async function refreshAllQuotes(options = {}) {
      const startup = options.startup === true;
      if (liveQuotes.length === 0) {
        if (!startup) showToast('No hay fondos en el monitor.', 'info');
        return { total: 0, updated: 0, failed: 0, success: true, error: null };
      }

      const icon = document.getElementById('refreshAllIcon');
      const btn = document.getElementById('refreshAllQuotesBtn');
      if (icon) icon.classList.add('animate-spin');
      if (btn) btn.disabled = true;

      try {
        const queries = liveQuotes.map(q => q.url || q.isin).filter(Boolean);
        const data = await requestQuoteRefresh(queries, { forceRefresh: true });
        let updated = 0;
        for (const r of (data?.results || [])) {
          if (r?.success && r.liveQuote) {
            addOrUpdateLiveQuote(r.liveQuote, { persist: false, render: false });
            updated++;
          }
        }
        const failed = Math.max(0, liveQuotes.length - updated);
        if (updated > 0) {
          saveLiveQuotes();
          renderLiveQuotes();
          if (currentSection === 'fondos') renderMyInvestorTable();
        }
        if (!startup) {
          showToast(`${updated} de ${liveQuotes.length} cotizaciones actualizadas.`, updated > 0 ? 'success' : 'error');
        }
        return { total: liveQuotes.length, updated, failed, success: updated > 0, error: null };
      } catch (err) {
        if (!startup) showToast(err?.message || 'Error al actualizar cotizaciones.', 'error');
        return { total: liveQuotes.length, updated: 0, failed: liveQuotes.length, success: false, error: err };
      } finally {
        if (icon) icon.classList.remove('animate-spin');
        if (btn) btn.disabled = false;
      }
    }

    // ── setupDragAndDrop: drag-and-drop reordering of quote cards ─────────────────
    /** Conecta los eventos de arrastre para ordenar las tarjetas de cotización. */
    function setupDragAndDrop() {
      const grid = document.getElementById('liveQuotesGrid');
      if (!grid) return;
      const cards = grid.querySelectorAll('[data-quote-key]');
      let dragSrcKey = null;

      cards.forEach(card => {
        card.addEventListener('dragstart', e => {
          dragSrcKey = card.dataset.quoteKey;
          card.classList.add('quote-card-dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', dragSrcKey);
        });
        card.addEventListener('dragend', () => {
          card.classList.remove('quote-card-dragging');
          cards.forEach(c => c.classList.remove('quote-card-drag-over'));
        });
        card.addEventListener('dragover', e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (card.dataset.quoteKey !== dragSrcKey) {
            cards.forEach(c => c.classList.remove('quote-card-drag-over'));
            card.classList.add('quote-card-drag-over');
          }
        });
        card.addEventListener('dragleave', () => card.classList.remove('quote-card-drag-over'));
        card.addEventListener('drop', e => {
          e.preventDefault();
          card.classList.remove('quote-card-drag-over');
          const targetKey = card.dataset.quoteKey;
          if (!dragSrcKey || dragSrcKey === targetKey) return;
          const srcIdx = liveQuotes.findIndex(q => (q.isin || q.url || q.fundName) === dragSrcKey);
          const tgtIdx = liveQuotes.findIndex(q => (q.isin || q.url || q.fundName) === targetKey);
          if (srcIdx === -1 || tgtIdx === -1) return;
          const [moved] = liveQuotes.splice(srcIdx, 1);
          liveQuotes.splice(tgtIdx, 0, moved);
          saveLiveQuotes();
          renderLiveQuotes();
          if (currentSection === 'fondos') renderMyInvestorTable();
          dragSrcKey = null;
        });
      });
    }

