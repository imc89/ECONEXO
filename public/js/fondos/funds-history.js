// Fund-history parsing, normalisation, retrieval and refresh.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 4963-5015) ---
    function parseFundDate(value) {
      if (!value) return null;
      if (typeof value === 'number') return new Date(value > 1e11 ? value : value * 1000);
      const s = String(value).trim();
      const m = s.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);
      if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    function normalizeFundHistoryRows(rows = []) {
      return rows.map((row, index) => {
        const date = parseFundDate(row.timestamp ?? row.col_date ?? row.date);
        const closeRaw = row.col_nav ?? row.close ?? row.c ?? row.value;
        const close = typeof closeRaw === 'number' ? closeRaw : parseNumericForChart(closeRaw);
        const high = typeof row.col_high === 'number' ? row.col_high : parseNumericForChart(row.col_high);
        const low = typeof row.col_low === 'number' ? row.col_low : parseNumericForChart(row.col_low);
        return { index, date, close, high, low, timestamp: date?.getTime() || 0 };
      }).filter(x => x.date && Number.isFinite(x.close))
        .sort((a, b) => a.timestamp - b.timestamp)
        .filter((x, i, arr) => i === 0 || x.timestamp !== arr[i - 1].timestamp);
    }

    function parseNumericForChart(value) {
      if (value === null || value === undefined || value === '') return NaN;
      let str = String(value).trim().replace(/[^\d.,+\-]/g, '');
      if (!str) return NaN;
      const comma = str.lastIndexOf(','), dot = str.lastIndexOf('.');
      if (comma !== -1 && dot !== -1) str = comma > dot ? str.replace(/\./g, '').replace(',', '.') : str.replace(/,/g, '');
      else if (comma !== -1) str = str.replace(',', '.');
      const n = Number.parseFloat(str);
      return Number.isFinite(n) ? n : NaN;
    }

    function getFundHistory(quote) {
      if (!quote) return [];
      if (Array.isArray(quote.history) && quote.history.length) return normalizeFundHistoryRows(quote.history);
      return [];
    }


// --- Extracted responsibility (legacy source lines 5059-5088) ---
    const fundHistoryRangeCache = new Map();
    let fundHistoryRequestSequence = 0;
    const FUND_HISTORY_RANGES = new Set(['day', 'week', 'month', '3months', '6months', 'year', '5years', 'max']);

    async function loadFundHistory(key, force = false, range = (typeof fundChartRange === 'string' ? fundChartRange : '6months')) {
      const quote = liveQuotes.find(q => q.isin === key || q.url === key || q.fundName === key);
      if (!quote) throw new Error('No se encuentra el fondo seleccionado.');
      const requestedRange = FUND_HISTORY_RANGES.has(range) ? range : '6months';
      fundChartActiveKey = key;
      fundChartRange = requestedRange;
      const requestId = ++fundHistoryRequestSequence;
      const cacheKey = `${String(key)}::${requestedRange}`;
      let cached = fundHistoryRangeCache.get(cacheKey);
      if (!cached && quote.historyRange === requestedRange && Array.isArray(quote.history) && quote.history.length >= 2) {
        cached = { history: quote.history, updatedAt: quote.historyUpdatedAt || null, source: quote.historySource || '' };
        fundHistoryRangeCache.set(cacheKey, cached);
      }

      // Change periods instantly when the data has already been retrieved during this session.
      // The refresh button still passes force=true to request fresh market data.
      if (!force && cached && Array.isArray(cached.history) && cached.history.length >= 2) {
        quote.history = cached.history;
        quote.historyRange = requestedRange;
        quote.historyUpdatedAt = cached.updatedAt || quote.historyUpdatedAt;
        quote.historySource = cached.source || quote.historySource;
        const loading = document.getElementById('fundChartLoading');
        const icon = document.getElementById('fundChartRefreshIcon');
        const refreshBtn = document.getElementById('fundChartRefresh');
        if (loading) loading.classList.add('hidden');
        if (icon) icon.classList.remove('animate-spin');
        if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.removeAttribute('aria-busy'); }
        renderFundChart();
        return quote.history;
      }

      const loading = document.getElementById('fundChartLoading');
      const loadingText = document.getElementById('fundChartLoadingText');
      const icon = document.getElementById('fundChartRefreshIcon');
      const refreshBtn = document.getElementById('fundChartRefresh');
      const rangeNames = { day: '1 día', week: '1 semana', month: '1 mes', '3months': '3 meses', '6months': '6 meses', year: '1 año', '5years': '5 años', max: 'todo el histórico' };
      if (loading) loading.classList.remove('hidden');
      if (loadingText) loadingText.textContent = `Obteniendo histórico · ${rangeNames[requestedRange] || 'periodo seleccionado'}…`;
      if (icon) icon.classList.add('animate-spin');
      if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.setAttribute('aria-busy', 'true'); }
      try {
        const res = await fetch(getApiEndpoint('/api/scrape-fund'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: quote.url || quote.isin, range: requestedRange })
        });
        const data = await res.json();
        if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
        if (requestId !== fundHistoryRequestSequence || String(fundChartActiveKey) !== String(key)) return;

        const incoming = data.liveQuote || {};
        Object.assign(quote, incoming);
        const fetchedHistory = Array.isArray(incoming.history) && incoming.history.length
          ? incoming.history
          : (Array.isArray(data.table?.rows) && data.table.rows.length ? data.table.rows : []);

        if (fetchedHistory.length >= 2) {
          quote.history = fetchedHistory;
          quote.historyRange = requestedRange;
          quote.historyUpdatedAt = incoming.historyUpdatedAt || new Date().toISOString();
          quote.historyPoints = fetchedHistory.length;
          quote.historySource = incoming.historySource || 'investing-real-history';
          fundHistoryRangeCache.set(cacheKey, {
            history: fetchedHistory,
            updatedAt: quote.historyUpdatedAt,
            source: quote.historySource
          });
          try { await persistLiveQuotesNow(); }
          catch (storageError) { console.warn('[ECONEXO] No se pudo persistir el histórico recién consultado:', storageError); }
          if (requestId !== fundHistoryRequestSequence || String(fundChartActiveKey) !== String(key)) return;
          renderFundChart();
          return fetchedHistory;
        }

        // Preserve usable cached data if the provider returns an empty/single-point response.
        if (cached && Array.isArray(cached.history) && cached.history.length >= 2) {
          quote.history = cached.history;
          quote.historyRange = requestedRange;
          quote.historyUpdatedAt = cached.updatedAt || quote.historyUpdatedAt;
          quote.historySource = cached.source || quote.historySource;
          renderFundChart();
          const subtitle = document.getElementById('fundChartSubtitle');
          if (subtitle) {
            subtitle.textContent += ' · La última actualización no devolvió una serie nueva; se conserva la serie guardada.';
            subtitle.classList.add('is-warning');
          }
          return cached.history;
        }

        quote.history = fetchedHistory;
        quote.historyRange = requestedRange;
        quote.historyUpdatedAt = fetchedHistory.length ? (incoming.historyUpdatedAt || new Date().toISOString()) : null;
        quote.historyPoints = fetchedHistory.length;
        quote.historySource = fetchedHistory.length ? (incoming.historySource || 'investing-real-history') : '';
        renderFundChart();
        return fetchedHistory;
      } catch (error) {
        if (requestId !== fundHistoryRequestSequence || String(fundChartActiveKey) !== String(key)) return;
        // Keep an already available real series visible if a refresh fails; explain that the data is stale.
        if (cached && Array.isArray(cached.history) && cached.history.length >= 2) {
          quote.history = cached.history;
          quote.historyRange = requestedRange;
          quote.historyUpdatedAt = cached.updatedAt || quote.historyUpdatedAt;
          quote.historySource = cached.source || quote.historySource;
          renderFundChart();
          const subtitle = document.getElementById('fundChartSubtitle');
          if (subtitle) {
            subtitle.textContent += ` · No se pudo actualizar: ${error?.message || 'error de conexión'}. Se conserva el histórico guardado.`;
            subtitle.classList.add('is-warning');
          }
          return cached.history;
        }
        throw error;
      } finally {
        if (requestId === fundHistoryRequestSequence) {
          if (loading) loading.classList.add('hidden');
          if (icon) icon.classList.remove('animate-spin');
          if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.removeAttribute('aria-busy'); }
        }
      }
    }

