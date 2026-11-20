// Startup quote checks and automatic historical synchronisation.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 5292-5420) ---
    async function checkStartupFundsUnchanged() {
      startStartupElapsedClock();
      if (!liveQuotes.length) return { unchanged: false, checked: 0, failed: 0, noQuotes: true };

      // Para fondos de inversión, una cotización consultada en la última media hora
      // suele ser suficientemente reciente para el arranque. El botón de actualizar
      // sigue forzando siempre una consulta nueva.
      const MAX_AUTO_REFRESH_AGE_MS = 30 * 60 * 1000;
      const now = Date.now();
      const cachedDataIsRecent = liveQuotes.every(quote => {
        const timestamp = Date.parse(quote?.updatedAt || '');
        const hasPrice = Boolean(String(quote?.lastPrice ?? '').trim()) && String(quote.lastPrice).trim() !== '—';
        const hasQuery = Boolean(quote?.url || quote?.isin);
        return hasPrice && hasQuery && Number.isFinite(timestamp) && timestamp <= now + 5 * 60 * 1000 &&
          (now - timestamp) <= MAX_AUTO_REFRESH_AGE_MS;
      });

      if (cachedDataIsRecent) {
        setStartupSplashProgress(liveQuotes.length, liveQuotes.length, '✓ Cotizaciones guardadas recientes', false, {
          activity: 'No se repiten consultas recientes a Investing.com', active: 0
        });
        return { unchanged: true, checked: 0, failed: 0, cachedDataIsRecent: true, skippedBecauseFresh: true };
      }

      setStartupSplashProgress(0, liveQuotes.length, 'Preparando actualización…', false, {
        activity: 'Los datos guardados necesitan actualizarse', active: 0
      });
      return { unchanged: false, checked: 0, failed: 0, cachedDataIsRecent: false, skippedBecauseFresh: false };
    }

    /** Actualiza las cotizaciones al iniciar con concurrencia limitada y seguimiento de progreso. */
    async function refreshFundsOnStartup() {
      startStartupElapsedClock();
      const total = liveQuotes.length;
      const startedAt = startupElapsedStartedAt || performance.now();
      const queries = liveQuotes.map(q => q?.url || q?.isin).filter(Boolean);

      setStartupSplashProgress(0, total, total ? 'Preparando lote…' : 'No hay fondos configurados', false, {
        activity: total ? 'Enviando una única petición por lotes al servidor' : 'Sin fondos que actualizar', active: 0
      });
      setStartupSplashMessage(
        'Actualizando fondos',
        total ? `Preparando ${total} cotizaciones. El servidor limitará la concurrencia de Chromium y agrupará consultas duplicadas.` : 'No hay fondos configurados en el monitor.'
      );

      if (total === 0 || queries.length === 0) {
        stopStartupElapsedClock();
        setStartupSplashProgress(0, 0, 'Sin fondos que actualizar', false, { activity: 'Monitor listo', active: 0 });
        setStartupSplashMessage('Fondos listos', 'Puedes añadir fondos desde el monitor.');
        setTimeout(hideStartupSplash, 220);
        return;
      }

      let data = null;
      let updated = 0;
      let failed = 0;
      const updateProgress = (progress) => {
        const processed = Number(progress?.processed) || 0;
        const active = progress?.status === 'running' ? Math.max(0, total - processed) : 0;
        const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1).replace('.', ',');
        const runtimeEl = document.getElementById('appStartupElapsed');
        if (runtimeEl) runtimeEl.textContent = `${elapsed} s`;
        const queryLabel = progress?.currentQuery || 'Comprobando cotizaciones…';
        const activity = progress?.status === 'queued'
          ? 'En cola del servidor · sin abrir navegadores adicionales'
          : `${processed}/${total} procesadas · ${Number(progress?.updated) || 0} correctas · ${Number(progress?.failed) || 0} con incidencias`;
        setStartupSplashProgress(processed, total, queryLabel, Number(progress?.failed) > 0, { activity, active });
      };

      try {
        data = await requestQuoteRefresh(queries, { forceRefresh: false, pollIntervalMs: 850, onProgress: updateProgress });
        for (const r of (data.results || [])) {
          if (r?.success && r.liveQuote) {
            addOrUpdateLiveQuote(r.liveQuote, { persist: false, render: false });
            updated++;
          }
        }
        // Diferencia entre fondos configurados y consultas únicas: los duplicados se refrescan una sola vez.
        failed = Math.max(0, total - updated);
      } catch (error) {
        failed = total;
        console.warn('[Startup] Lote de cotizaciones no completado:', error);
      }

      stopStartupElapsedClock();
      const finalSeconds = ((performance.now() - startedAt) / 1000).toFixed(1).replace('.', ',');
      const elapsedEl = document.getElementById('appStartupElapsed');
      if (elapsedEl) elapsedEl.textContent = `${finalSeconds} s`;

      if (updated > 0) {
        saveLiveQuotes();
        renderLiveQuotes();
        if (currentSection === 'fondos') renderMyInvestorTable();
      }

      if (failed === 0 && updated > 0) {
        setStartupSplashProgress(total, total, 'Todos los fondos actualizados ✓', false, { activity: `Actualización completada en ${finalSeconds} s`, active: 0 });
        setStartupSplashMessage('Fondos actualizados', `${updated} de ${total} consultas actualizadas correctamente.`);
      } else if (updated > 0) {
        setStartupSplashProgress(total, total, `${updated} actualizados · ${failed} con incidencia`, true, { activity: `Finalizado en ${finalSeconds} s`, active: 0 });
        setStartupSplashMessage('Actualización parcial', `${updated} de ${total} cotizaciones actualizadas. ${failed} no respondieron o se omitieron por datos inválidos.`, true);
      } else {
        setStartupSplashProgress(total, total, 'No se pudo actualizar ningún fondo', true, { activity: `Sin respuestas válidas · ${finalSeconds} s`, active: 0 });
        setStartupSplashMessage('Actualización no disponible', 'La aplicación seguirá disponible; puedes reintentar desde “Actualizar”.', true);
      }
      setTimeout(hideStartupSplash, 500);
    }

    // Actualización histórica automática: se ejecuta en segundo plano, una vez al día,
    // y solo después de que la interfaz haya terminado de arrancar. No bloquea el splash.
    async function autoSyncFundHistories() {
      if (!liveQuotes.length || document.visibilityState === 'hidden') return;
      let lastRun = 0;
      try { lastRun = Number(localStorage.getItem(FUND_HISTORY_AUTO_SYNC_KEY) || 0); } catch (_) {}
      if (Date.now() - lastRun < 24 * 3600000) return;
      try { localStorage.setItem(FUND_HISTORY_AUTO_SYNC_KEY, String(Date.now())); } catch (_) {}
      for (const quote of [...liveQuotes]) {
        if (document.visibilityState === 'hidden') break;
        try {
          const age = quote.historyUpdatedAt ? Date.now() - new Date(quote.historyUpdatedAt).getTime() : Infinity;
          if (age >= 24 * 3600000) {
            await loadFundHistory(quote.isin || quote.url || quote.fundName, true);
            await new Promise(resolve => setTimeout(resolve, 1200));
          }
        } catch (error) { console.warn('[Fondos] Actualización histórica automática fallida:', quote.isin || quote.fundName, error); }
      }
      renderLiveQuotes();
    }

