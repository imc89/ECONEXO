// Shared formatting, date, numeric and table-filter utilities.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 110-153) ---
    // ── HELPERS ──────────────────────────────────────────────────────────────────
    // Mapas reutilizables: evitan crear objetos auxiliares durante cada renderizado.
    const HTML_ESCAPE_MAP = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' });
    const numberFormatters = new Map(); // Caché por precisión decimal solicitada.

    // ── UTILIDADES COMUNES: IDs, escape HTML, formato numérico y fechas ────────────
    /** Genera un identificador local para entidades dinámicas. */
    function uid(p = 'id') { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }
    /** Escapa caracteres HTML especiales antes de insertar texto en plantillas HTML. */
    function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => HTML_ESCAPE_MAP[c]); }
    /** Formatea números con la configuración regional española y precisión fija. */
    function fmt(n, d = 2) {
      let formatter = numberFormatters.get(d);
      if (!formatter) {
        formatter = new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: true });
        numberFormatters.set(d, formatter);
      }
      return formatter.format(Number(n) || 0);
    }
    /** Formatea un importe y añade el símbolo del euro. */
    function fmtEur(n, d = 2) { return `${fmt(n, d)} €`; }

    /** Indica si un valor tiene contenido; el cero explícito sí cuenta como dato. */
    function hasUserValue(value) {
      return value !== undefined && value !== null && String(value).trim() !== '';
    }
    /** Formatea valores numéricos conservando textos vacíos o marcadores no numéricos. */
    function fmtMaybeNumber(value, d = 2) {
      const raw = String(value ?? '').trim();
      if (!raw || raw === '—') return raw || '—';
      const token = raw.replace(/[()%€]/g, '').trim();
      if (!/^[+\-]?\d[\d.,\s]*$/.test(token)) return raw;
      const sign = token.startsWith('+') ? '+' : '';
      return `${sign}${fmt(parseNum(token.replace(/\s/g, '')), d)}`;
    }

    /** Extrae un año de cuatro cifras de un valor de tabla. */
    function getTableYear(value) {
      const text = String(value || '').trim();
      if (!text) return null;
      const yearMatch = text.match(/\b(19\d{2}|20\d{2}|21\d{2})\b/);
      return yearMatch ? yearMatch[1] : null;
    }

    const DEFAULT_REMOTE_API = 'https://econexo-backend-9yjv.onrender.com';

    /**
     * Resuelve la URL completa para llamadas a endpoints de la API (/api/...).
     * Permite conectar un backend remoto (Render, Railway o localhost) cuando
     * la aplicación se ejecuta en entornos estáticos como GitHub Pages.
     */
    function getApiEndpoint(endpoint) {
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      let custom = '';
      try { custom = (localStorage.getItem('econexo_api_url') || '').trim(); } catch (_) {}
      if (custom) {
        return `${custom.replace(/\/+$/, '')}${cleanEndpoint}`;
      }
      if (typeof window !== 'undefined' && window.location && window.location.hostname && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        return `${DEFAULT_REMOTE_API}${cleanEndpoint}`;
      }
      return cleanEndpoint;
    }

    /**
     * Normaliza una fecha a DD/MM/YYYY con día y mes siempre de dos dígitos.
     * Acepta separadores / - . y soporta D/M/YYYY → DD/MM/YYYY.
     * Devuelve la cadena original si no reconoce el patrón.
     */
    function normalizeFecha(value) {
      const text = String(value || '').trim();
      if (!text) return text;
      const m = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
      if (!m) return text;
      const dd = m[1].padStart(2, '0');
      const mm = m[2].padStart(2, '0');
      return `${dd}/${mm}/${m[3]}`;
    }


// --- Extracted responsibility (legacy source lines 253-269) ---
    function parseNum(val) {
      if (val === null || val === undefined || val === '') return 0;
      let s = String(val).trim().replace(/[^\d.,+\-]/g, '');
      if (!s) return 0;
      const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
      if (lc !== -1 && ld !== -1) {
        s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
      } else if (lc !== -1) {
        const dec = s.length - lc - 1;
        s = (dec >= 1 && dec <= 3) ? s.replace(',', '.') : s.replace(/,/g, '');
      } else if ((s.match(/\./g) || []).length > 1) {
        const last = s.lastIndexOf('.');
        s = s.slice(0, last).replace(/\./g, '') + s.slice(last);
      }
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    }

// --- Extracted responsibility (legacy source lines 3493-3590) ---
    // ── FILTROS, FECHAS Y CÁLCULOS FINANCIEROS COMPARTIDOS ────────────────────────
    /** Parsea una cadena de fecha a un objeto Date con hora normalizada a medianoche. */
    function parseDateFlexible(val) {
      if (!val) return null;
      if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
      const text = String(val).trim();
      if (!text || text === '—') return null;

      // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
      let m = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
      if (m) {
        const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 0, 0, 0);
        return isNaN(d.getTime()) ? null : d;
      }
      // YYYY-MM-DD
      m = text.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
      if (m) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0);
        return isNaN(d.getTime()) ? null : d;
      }
      // MM/YYYY
      m = text.match(/^(\d{1,2})[\/\-.](\d{4})$/);
      if (m) {
        const d = new Date(Number(m[2]), Number(m[1]) - 1, 1, 0, 0, 0);
        return isNaN(d.getTime()) ? null : d;
      }
      // YYYY
      m = text.match(/^(\d{4})$/);
      if (m) {
        const d = new Date(Number(m[1]), 0, 1, 0, 0, 0);
        return isNaN(d.getTime()) ? null : d;
      }
      const t = Date.parse(text);
      if (!isNaN(t)) {
        const d = new Date(t);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      }
      return null;
    }

    /** Comprueba si una fecha cae dentro del rango especificado (inclusivo). */
    function isDateInRange(dateObj, range) {
      if (!range || (!range.start && !range.end)) return true;
      if (!dateObj) return false;
      const t = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 0, 0, 0, 0).getTime();
      if (range.start) {
        const s = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate(), 0, 0, 0, 0).getTime();
        if (t < s) return false;
      }
      if (range.end) {
        const e = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate(), 23, 59, 59, 999).getTime();
        if (t > e) return false;
      }
      return true;
    }

    window.parseDateFlexible = parseDateFlexible;
    window.isDateInRange = isDateInRange;

    /** Filtra las filas de fondos por texto y rango de fechas. */
    function filterFondosTableRows(q) {
      const tbody = document.getElementById('myinvestorTableBody');
      if (!tbody) return;
      const searchInp = document.getElementById('searchFecha_fondos');
      const term = (q !== undefined ? q : (searchInp ? searchInp.value : '')).trim().toLowerCase();
      const drp = window.dateRangePickers && window.dateRangePickers['fondos'];
      const range = drp ? drp.getRange() : null;
      const hasRange = Boolean(range && (range.start || range.end));

      const trs = tbody.querySelectorAll('tr');
      let visible = 0;
      trs.forEach(tr => {
        const inp = tr.querySelector('.cell-fecha');
        const val = inp ? (inp.value || '').toLowerCase() : '';
        const matchesTerm = !term || val.includes(term);
        let matchesDate = true;
        if (hasRange) {
          const d = parseDateFlexible(inp ? inp.value : '');
          matchesDate = isDateInRange(d, range);
        }
        if (matchesTerm && matchesDate) {
          tr.style.display = '';
          visible++;
        } else {
          tr.style.display = 'none';
        }
      });
      const cnt = document.getElementById('searchCount_fondos');
      if (cnt) {
        cnt.textContent = (term || hasRange) ? `${visible} de ${trs.length} visibles` : `${trs.length} registros`;
      }
    }

    /** Filtra las filas de una cuenta bancaria por texto y rango de fechas. */
    function filterBankTableRows(btId, q) {
      const tbody = document.getElementById(`tbody_${btId}`);
      if (!tbody) return;
      const searchInp = document.getElementById(`searchFecha_${btId}`);
      const term = (q !== undefined ? q : (searchInp ? searchInp.value : '')).trim().toLowerCase();
      const drp = window.dateRangePickers && window.dateRangePickers[`bank_${btId}`];
      const range = drp ? drp.getRange() : null;
      const hasRange = Boolean(range && (range.start || range.end));

      const trs = tbody.querySelectorAll('tr');
      let visible = 0;
      trs.forEach(tr => {
        const inp = tr.querySelector('input');
        const val = inp ? (inp.value || '').toLowerCase() : '';
        const matchesTerm = !term || val.includes(term);
        let matchesDate = true;
        if (hasRange) {
          const d = parseDateFlexible(inp ? inp.value : '');
          matchesDate = isDateInRange(d, range);
        }
        if (matchesTerm && matchesDate) {
          tr.style.display = '';
          visible++;
        } else {
          tr.style.display = 'none';
        }
      });
      const cnt = document.getElementById(`searchCount_${btId}`);
      if (cnt) {
        cnt.textContent = (term || hasRange) ? `${visible} de ${trs.length} visibles` : `${trs.length} registros`;
      }
    }

    /** Filtra los registros de la tabla mensual de ingresos y gastos. */
    function filterMensualTableRows(q) {
      const tbody = document.getElementById('mensualTableBody');
      if (!tbody) return;
      const searchInp = document.getElementById('searchFecha_mensual');
      const term = (q !== undefined ? q : (searchInp ? searchInp.value : '')).trim().toLowerCase();
      const drp = window.dateRangePickers && window.dateRangePickers['mensual'];
      const range = drp ? drp.getRange() : null;
      const hasRange = Boolean(range && (range.start || range.end));

      const trs = tbody.querySelectorAll('tr');
      let visible = 0;
      trs.forEach(tr => {
        const inp = tr.querySelector('input');
        const val = inp ? (inp.value || '').toLowerCase() : '';
        const matchesTerm = !term || val.includes(term);
        let matchesDate = true;
        if (hasRange) {
          const d = parseDateFlexible(inp ? inp.value : '');
          matchesDate = isDateInRange(d, range);
        }
        if (matchesTerm && matchesDate) {
          tr.style.display = '';
          visible++;
        } else {
          tr.style.display = 'none';
        }
      });
      const cnt = document.getElementById('searchCount_mensual');
      if (cnt) {
        cnt.textContent = (term || hasRange) ? `${visible} de ${trs.length} visibles` : `${trs.length} registros`;
      }
    }

    /** Filtra las filas bancarias mostradas en el dashboard. */
    function filterDashBancaRows(q) {
      const tbody = document.getElementById('dashBancaBreakdownBody');
      if (!tbody) return;
      const searchInp = document.getElementById('searchFecha_dashBanca');
      const term = (q !== undefined ? q : (searchInp ? searchInp.value : '')).trim().toLowerCase();
      const drp = window.dateRangePickers && window.dateRangePickers['dashBanca'];
      const range = drp ? drp.getRange() : null;
      const hasRange = Boolean(range && (range.start || range.end));

      const trs = tbody.querySelectorAll('tr');
      let visible = 0;
      trs.forEach(tr => {
        const txt = tr.textContent.toLowerCase();
        const matchesTerm = !term || txt.includes(term);
        let matchesDate = true;
        if (hasRange) {
          const dateCell = tr.querySelectorAll('td')[3];
          const d = parseDateFlexible(dateCell ? dateCell.textContent : '');
          matchesDate = isDateInRange(d, range);
        }
        if (matchesTerm && matchesDate) {
          tr.style.display = '';
          visible++;
        } else {
          tr.style.display = 'none';
        }
      });
      const cnt = document.getElementById('searchCount_dashBanca');
      if (cnt) {
        cnt.textContent = (term || hasRange) ? `${visible} de ${trs.length} visibles` : `${trs.length} entidades`;
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 3. AHORRO — RESUMEN REAL + HISTÓRICO ANUAL + INGRESOS/GASTOS
    // ════════════════════════════════════════════════════════════════════════════
    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const NOMBRES_MES_AHORRO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

