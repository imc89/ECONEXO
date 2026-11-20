// Core state model and initial in-memory application state.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 86-109) ---
    const CLEAN_EMPTY_STATE = {
      bancaTables: [],      // Array of { id, name, hasInterest: boolean, rows: [...] }
      fondosList: [],       // Individual funds: { id, name, isin, invested, currentValue }
      myinvestor: [],       // Chronological monthly fund records
      archivedPortfolioFunds: [], // Fondos retirados del monitor que conservan histórico en cartera
      matricesAnuales: {},  // Matrices of year -> { enero, febrero... }
      mensual: []           // Monthly income & expenses
    };

    // Estado persistente de la aplicación y estados temporales de la interfaz.
    let state = JSON.parse(JSON.stringify(CLEAN_EMPTY_STATE));
    let liveQuotes = [];
    // La vista en tarjetas es el modo inicial; el usuario puede elegir listado.
    let liveQuotesViewMode = 'cards';
    let currentSection = 'banca'; // Default section is BANCA!
    let pendingConfirm = null;
    const charts = {};
    const chartModes = {}; // chartId -> 'line-curve' | 'area' | 'bar'

    // Table editing is transient UI state. Every table starts locked after reload.
    const tableEditModes = Object.create(null);

    const PALETTE = ['#7c3aed', '#0080ff', '#00c853', '#f59e0b', '#ec4899', '#06b6d4', '#10b981', '#6366f1'];

