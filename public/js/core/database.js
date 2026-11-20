// Core database: IndexedDB lifecycle and low-level record operations.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 1-85) ---

    'use strict';

    // Claves independientes de persistencia: datos principales, cotizaciones y tema.
    const STORAGE_KEY = 'financial_view_state_multibank_v6';
    const QUOTES_KEY = 'financial_view_livequotes_v6';
    const BACKUP_HISTORY_KEY = STORAGE_KEY + '_monthly_backup_history_v1';
    const THEME_KEY = 'financial_view_theme_multibank';
    const LIVE_QUOTES_VIEW_MODE_KEY = STORAGE_KEY + '_live_quotes_view_mode_v1';
    // Migración de preferencias: aplicar una sola vez la curva como modo inicial de todas las gráficas.
    const CHART_MODE_DEFAULTS_VERSION_KEY = STORAGE_KEY + '_chart_modes_line_curve_default_v1';
    const FUND_HISTORY_AUTO_SYNC_KEY = STORAGE_KEY + '_fund_history_auto_sync_v1';

    // Almacenamiento escalable: IndexedDB admite históricos mayores que localStorage.
    // localStorage se mantiene como vía de migración/compatibilidad para datos antiguos.
    const ECONEXO_DB_NAME = 'econexo_persistence_v1';
    const ECONEXO_DB_VERSION = 1;
    const ECONEXO_DB_STORE = 'records';
    const LOCAL_STORAGE_SHADOW_MAX_CHARS = 850000;
    let econexoDbPromise = null;
    let stateSaveTimer = null;
    let stateWriteChain = Promise.resolve();
    let hasIndexedDbState = false;

    function openEconexoDb() {
      if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB no disponible en este navegador.'));
      if (econexoDbPromise) return econexoDbPromise;
      econexoDbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(ECONEXO_DB_NAME, ECONEXO_DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(ECONEXO_DB_STORE)) db.createObjectStore(ECONEXO_DB_STORE, { keyPath: 'key' });
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); econexoDbPromise = null; };
          resolve(db);
        };
        request.onerror = () => reject(request.error || new Error('No se pudo abrir la base de datos local.'));
        request.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña de ECONEXO.'));
      }).catch(error => {
        econexoDbPromise = null;
        throw error;
      });
      return econexoDbPromise;
    }

    async function idbGetValue(key) {
      const db = await openEconexoDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(ECONEXO_DB_STORE, 'readonly');
        const request = tx.objectStore(ECONEXO_DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result ? request.result.value : null);
        request.onerror = () => reject(request.error || new Error('No se pudo leer el almacenamiento local.'));
      });
    }

    async function idbSetValue(key, value) {
      const db = await openEconexoDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(ECONEXO_DB_STORE, 'readwrite');
        tx.objectStore(ECONEXO_DB_STORE).put({ key, value });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error('No se pudo guardar la información local.'));
        tx.onabort = () => reject(tx.error || new Error('Se canceló el guardado local.'));
      });
    }

    async function idbDeleteKey(key) {
      const db = await openEconexoDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(ECONEXO_DB_STORE, 'readwrite');
        tx.objectStore(ECONEXO_DB_STORE).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error('No se pudo eliminar el registro local.'));
      });
    }

    function cloneForPersistence(value) {
      try { return structuredClone(value); }
      catch (_) { return JSON.parse(JSON.stringify(value)); }
    }

    // CLEAN BLANK STATE: Multi-bank dynamic tables!
    // Esquema inicial vacío. loadState() completa o migra esta estructura al arrancar.
