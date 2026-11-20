// Workspace persistence, migration and lifecycle flushing.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 556-658) ---
    // ── PERSISTENCE ──────────────────────────────────────────────────────────────
    /** Guarda estado y preferencias en IndexedDB con debounce para agrupar cambios rápidos. */
    async function persistStateNow() {
      const snapshot = {
        state: cloneForPersistence(state),
        chartModes: cloneForPersistence(chartModes),
        savedAt: new Date().toISOString()
      };
      stateWriteChain = stateWriteChain.catch(() => {}).then(async () => {
        try {
          await idbSetValue('appState', snapshot);
          hasIndexedDbState = true;
          // Sombra legada para recuperar los datos con navegadores/versiones anteriores si cabe.
          try {
            const legacyJson = JSON.stringify(snapshot.state);
            if (legacyJson.length <= LOCAL_STORAGE_SHADOW_MAX_CHARS) localStorage.setItem(STORAGE_KEY, legacyJson);
            localStorage.setItem(STORAGE_KEY + '_chart_modes', JSON.stringify(snapshot.chartModes));
          } catch (_) { /* La copia IndexedDB es la persistencia principal. */ }
        } catch (idbError) {
          console.warn('IndexedDB no disponible; usando almacenamiento local como alternativa.', idbError);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot.state));
            localStorage.setItem(STORAGE_KEY + '_chart_modes', JSON.stringify(snapshot.chartModes));
          } catch (storageError) {
            console.error('No se pudo persistir el estado. Exporta una copia de seguridad.', storageError);
            showToast('El almacenamiento está lleno o bloqueado. Exporta una copia de seguridad.', 'error');
          }
        }
      });
      return stateWriteChain;
    }

    function saveState(options = {}) {
      clearTimeout(stateSaveTimer);
      stateSaveTimer = setTimeout(() => {
        stateSaveTimer = null;
        persistStateNow().catch(error => console.error('Error guardando ECONEXO:', error));
      }, 220);
      if (!options.skipBackup) queueMonthlyBackup();
    }

    /** Carga primero IndexedDB; si es la primera ejecución, migra el localStorage anterior. */
    async function loadState() {
      let snapshot = null;
      try {
        snapshot = await idbGetValue('appState');
        if (snapshot?.state && typeof snapshot.state === 'object') hasIndexedDbState = true;
      } catch (error) {
        console.warn('No se pudo abrir IndexedDB; se intentará migración desde localStorage.', error);
      }

      let saved = snapshot?.state || null;
      if (!saved) {
        try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
        catch (_) { saved = null; }
      }

      // Migración de preferencias: aplicar una sola vez la curva como modo inicial de las gráficas.
      const resetChartModes = localStorage.getItem(CHART_MODE_DEFAULTS_VERSION_KEY) !== '1';
      if (resetChartModes) {
        localStorage.removeItem(STORAGE_KEY + '_chart_modes');
        Object.keys(chartModes).forEach(chartId => delete chartModes[chartId]);
        localStorage.setItem(CHART_MODE_DEFAULTS_VERSION_KEY, '1');
      }

      let savedChartModes = snapshot?.chartModes || null;
      if (!savedChartModes && !resetChartModes) {
        try { savedChartModes = JSON.parse(localStorage.getItem(STORAGE_KEY + '_chart_modes') || 'null'); }
        catch (_) { savedChartModes = null; }
      }
      if (savedChartModes && typeof savedChartModes === 'object' && !resetChartModes) Object.assign(chartModes, savedChartModes);

      if (saved && typeof saved === 'object') {
        if (Array.isArray(saved.bancaTables)) state.bancaTables = saved.bancaTables;
        if (Array.isArray(saved.fondosList)) state.fondosList = saved.fondosList;
        if (Array.isArray(saved.myinvestor)) state.myinvestor = saved.myinvestor.map(r => (r && typeof r === 'object' ? r : {}));
        if (Array.isArray(saved.archivedPortfolioFunds)) state.archivedPortfolioFunds = saved.archivedPortfolioFunds;
        if (saved.matricesAnuales && typeof saved.matricesAnuales === 'object') state.matricesAnuales = saved.matricesAnuales;
        if (Array.isArray(saved.mensual)) state.mensual = saved.mensual;
      }

      // Persistir en IndexedDB si es primera migración o si cambió la preferencia de gráficas.
      if (!snapshot || resetChartModes) await persistStateNow();
    }

    // Intenta vaciar el debounce al salir o cambiar de pestaña.
    function flushPendingStateSave() {
      if (stateSaveTimer) {
        clearTimeout(stateSaveTimer);
        stateSaveTimer = null;
      }
      if (liveQuotesSaveTimer) {
        clearTimeout(liveQuotesSaveTimer);
        liveQuotesSaveTimer = null;
      }
      persistStateNow().catch(error => console.warn('No se pudo completar el guardado final:', error));
      persistLiveQuotesNow().catch(error => console.warn('No se pudieron guardar las cotizaciones antes de salir:', error));
    }
    window.addEventListener('pagehide', flushPendingStateSave);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && stateSaveTimer) flushPendingStateSave();
    });

