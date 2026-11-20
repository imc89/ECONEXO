// Savings calendar, monthly matrices and summaries.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 3591-4362) ---
    // ── AHORRO: PERIODOS, MATRICES ANUALES Y RESÚMENES ────────────────────────────
    /** Ordena cronológicamente los años de la sección de ahorro. */
    function sortAhorroYears() {
      return Object.keys(state.matricesAnuales).sort((a, b) => Number(a) - Number(b));
    }

    /** Interpreta el valor de un periodo mensual de ahorro. */
    function parseAhorroMonthValue(value) {
      const text = String(value || '').trim().toLowerCase();
      if (!text) return null;
      let m = text.match(/^(\d{4})[-\/]([01]?\d)$/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1);
      m = text.match(/^(\d{1,2})[\/-](\d{4})$/);
      if (m) return new Date(Number(m[2]), Number(m[1]) - 1, 1);
      const idx = NOMBRES_MES_AHORRO.findIndex(n => text.startsWith(n.toLowerCase()));
      const year = text.match(/(19|20|21)\d{2}/);
      if (idx !== -1 && year) return new Date(Number(year[0]), idx, 1);
      return null;
    }

    /** Convierte un periodo de ahorro al formato utilizado por un campo de entrada. */
    function formatAhorroMonthInput(periodo) {
      const d = parseAhorroMonthValue(periodo);
      if (!d || isNaN(d)) return '';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    /** Genera la etiqueta legible de un periodo mensual de ahorro. */
    function formatAhorroMonthLabel(periodo) {
      const d = parseAhorroMonthValue(periodo);
      return d && !isNaN(d) ? `${NOMBRES_MES_AHORRO[d.getMonth()]} ${d.getFullYear()}` : String(periodo || 'Mes');
    }

    /** Devuelve los registros mensuales de ahorro ordenados por fecha. */
    function getAhorroMonthlyRowsSorted() {
      return state.mensual
        .map((row, index) => ({ row, index, date: parseAhorroMonthValue(row.periodo) }))
        .sort((a, b) => {
          if (a.date && b.date) return a.date - b.date;
          if (a.date) return -1;
          if (b.date) return 1;
          return a.index - b.index;
        });
    }

    /** Indica si un mes contiene una cifra introducida; el cero también es una cifra válida. */
    function hasAhorroMonthValue(data, month) {
      const raw = data?.[month];
      return raw !== undefined && raw !== null && /\d/.test(String(raw).trim());
    }

    /** Calcula las métricas agregadas de ahorro de un año. */
    function getAhorroYearStats(year) {
      const d = state.matricesAnuales[year] || {};
      const values = MESES.map(m => ({ month: m, value: parseNum(d[m]) }))
        .filter(x => hasAhorroMonthValue(d, x.month));
      const allValues = values.map(x => x.value);
      const firstItem = values.length ? values[0] : null;
      const lastItem = values.length ? values[values.length - 1] : null;
      const start = firstItem ? firstItem.value : 0;
      const end = lastItem ? lastItem.value : 0;
      const diff = end - start;
      const maxItem = allValues.length ? values.reduce((a, b) => b.value > a.value ? b : a) : null;
      const minItem = allValues.length ? values.reduce((a, b) => b.value < a.value ? b : a) : null;
      return {
        start,
        end,
        diff,
        startMonth: firstItem?.month || null,
        endMonth: lastItem?.month || null,
        count: values.length,
        max: maxItem,
        min: minItem
      };
    }

    /** Obtiene el año actual a partir de los registros mensuales. */
    function getCurrentAhorroYearFromMensual() {
      const rows = getAhorroMonthlyRowsSorted().filter(x => x.date);
      return rows.length ? rows[rows.length - 1].date.getFullYear() : null;
    }

    /** Interpreta una fecha financiera para operaciones cronológicas. */
    function parseFinancialDate(value) {
      const text = String(value || '').trim();
      const m = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
      if (!m) return null;
      const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      return Number.isNaN(d.getTime()) ? null : d;
    }

    /** Devuelve las filas acompañadas de su orden cronológico. */
    function getChronologicalRows(rows) {
      return (rows || [])
        .map((row, index) => ({ row, index, date: parseFinancialDate(row?.fecha) }))
        .sort((a, b) => {
          if (a.date && b.date) {
            const diff = a.date - b.date;
            return diff || a.index - b.index;
          }
          if (a.date) return -1;
          if (b.date) return 1;
          return a.index - b.index;
        });
    }

    /** Encuentra el registro más reciente de una cuenta bancaria. */
    function getLatestBankRow(bt) {
      const ordered = getChronologicalRows(bt?.rows || []);
      const populated = ordered.filter(({ row }) => hasUserValue(row?.cantidadTotal) || hasUserValue(row?.vl));
      return populated.length ? populated[populated.length - 1].row : null;
    }

    /** Encuentra el último registro de la tabla de fondos. */
    function getLatestFundRow() {
      const ordered = getChronologicalRows(state.myinvestor || []);
      const populated = ordered.filter(item => hasPortfolioRowTotals(item.row));
      return populated.length ? populated[populated.length - 1].row : null;
    }

    /** Obtiene la ganancia periódica asociada a una fila bancaria. */
    function getBankRowPeriodicGain(bt, orderedIndex) {
      const ordered = getChronologicalRows(bt?.rows || []);
      if (orderedIndex < 0 || orderedIndex >= ordered.length) return 0;
      const current = ordered[orderedIndex].row;
      if (!hasUserValue(current?.cantidadTotal) && !hasUserValue(current?.vl)) return 0;

      // Sin un saldo anterior registrado no es posible inferir intereses:
      // el saldo inicial podría ser capital aportado, no ganancia.
      let previousRow = null;
      for (let i = orderedIndex - 1; i >= 0; i--) {
        const candidate = ordered[i].row;
        if (hasUserValue(candidate?.cantidadTotal) || hasUserValue(candidate?.vl)) {
          previousRow = candidate;
          break;
        }
      }
      if (!previousRow) return 0;

      const currentTotal = parseNum(current.cantidadTotal || current.vl);
      const previousTotal = parseNum(previousRow.cantidadTotal || previousRow.vl);
      const transfer = bt?.hasInterest ? parseNum(current?.transferencia) : 0;
      return Number((currentTotal - previousTotal - transfer).toFixed(2));
    }

    /** Obtiene el valor de ganancia utilizado para una fila bancaria. */
    function getBankRowGainValue(bt, orderedIndex) {
      const ordered = getChronologicalRows(bt?.rows || []);
      if (orderedIndex < 0 || orderedIndex >= ordered.length) return 0;

      const row = ordered[orderedIndex].row;
      const hasSavedGain = row?.cantidadGanada !== undefined && row?.cantidadGanada !== null && row?.cantidadGanada !== '';
      const savedGain = hasSavedGain ? parseNum(row.cantidadGanada) : 0;

      // Los datos antiguos guardaban 0 en filas nuevas aunque la celda se calculaba.
      // Se conserva ese cálculo como respaldo, salvo que el usuario haya editado la celda
      // o que exista un valor importado distinto de cero.
      if (row?.cantidadGanadaManual === true || (hasSavedGain && savedGain !== 0)) {
        return savedGain;
      }
      return getBankRowPeriodicGain(bt, orderedIndex);
    }

    /** Calcula la ganancia del periodo más reciente de una cuenta. */
    function getBankLatestPeriodicGain(bt) {
      if (!bt?.hasInterest) return 0;
      const ordered = getChronologicalRows(bt.rows || []);
      let latestPopulatedIndex = -1;
      ordered.forEach((item, index) => {
        if (hasUserValue(item.row?.cantidadTotal) || hasUserValue(item.row?.cantidadGanada)) {
          latestPopulatedIndex = index;
        }
      });
      return latestPopulatedIndex >= 0 ? getBankRowGainValue(bt, latestPopulatedIndex) : 0;
    }

    /** Suma los saldos más recientes de las cuentas bancarias. */
    function getLatestBancaSaldo() {
      return state.bancaTables.reduce((sum, bt) => {
        const last = getLatestBankRow(bt);
        return sum + (last ? parseNum(last.cantidadTotal || last.vl) : 0);
      }, 0);
    }

    /** Obtiene el valor actual agregado de los fondos indexados. */
    function getLatestFondosValue() {
      const latest = getLatestFundRow();
      if (latest) return getComparableRowTotal(latest);
      return state.fondosList.reduce((sum, f) => sum + parseNum(f.currentValue), 0);
    }

    /**
     * Construye el saldo bancario agregado a cada fecha usando, para cada entidad,
     * el último saldo conocido hasta esa fecha. Así una cuenta sin movimiento ese
     * día no desaparece del patrimonio histórico.
     */
    function buildBankBalanceHistoryByDate(dates) {
      const orderedDates = Array.from(new Set(dates || []))
        .map(date => ({ date, time: parseFinancialDate(date)?.getTime() }))
        .filter(item => Number.isFinite(item.time))
        .sort((a, b) => a.time - b.time);

      const sources = state.bancaTables.map(table => {
        const chronological = getChronologicalRows(table.rows || []);
        const populatedRows = chronological
          .map((item, orderedIndex) => ({ ...item, orderedIndex }))
          .filter(({ row, date }) =>
            date && (hasUserValue(row?.cantidadTotal) || hasUserValue(row?.vl) || (table.hasInterest && hasUserValue(row?.cantidadGanada)))
          );
        return {
          table,
          rows: populatedRows,
          cursor: 0,
          balance: null
        };
      });
      const result = {};

      orderedDates.forEach(({ date, time }) => {
        let total = 0;
        sources.forEach(source => {
          while (source.cursor < source.rows.length) {
            const item = source.rows[source.cursor];
            if (!item.date || item.date.getTime() > time) break;
            const principal = parseNum(item.row.cantidadTotal || item.row.vl);
            const gain = source.table.hasInterest ? getBankRowGainValue(source.table, item.orderedIndex) : 0;
            source.balance = principal + gain;
            source.cursor += 1;
          }
          if (source.balance !== null) total += source.balance;
        });
        result[date] = total;
      });
      return result;
    }

    /** Calcula los intereses acumulados de las cuentas remuneradas. */
    function getAccumulatedBancaInterest() {
      return state.bancaTables.reduce((sum, bt) => sum + getBankLatestPeriodicGain(bt), 0);
    }

    /** Calcula el total financiero bancario conforme a los datos disponibles. */
    function getLatestBancaFinancialTotal() {
      // Suma la última casilla de CANTIDAD TOTAL de las cuentas de banca más la CANTIDAD GANADA de las cuentas remuneradas.
      return getLatestBancaSaldo() + getAccumulatedBancaInterest();
    }

    /**
     * Calcula los totales de final de mes agregando los saldos de banca, ganancias
     * de cuentas remuneradas y el valor de cartera de fondos para cada fecha registrada.
     */
    function getCalculatedMonthlyTotals() {
      const parseFecha = s => {
        const p = String(s || '').split('/');
        return new Date(Number(p[2]), (Number(p[1]) || 1) - 1, Number(p[0]) || 1);
      };

      const allDates = Array.from(new Set([
        ...state.bancaTables.flatMap(bt => (bt.rows || []).filter(r => r?.fecha && (hasUserValue(r.cantidadTotal) || hasUserValue(r.vl) || (bt.hasInterest && hasUserValue(r.cantidadGanada)))).map(r => r.fecha)),
        ...state.myinvestor.filter(r => r?.fecha && hasPortfolioRowTotals(r)).map(r => r.fecha)
      ])).sort((a, b) => parseFecha(a) - parseFecha(b));

      if (!allDates.length) return {};

      const bankByDate = buildBankBalanceHistoryByDate(allDates);

      const fundByDate = {};
      getChronologicalRows(state.myinvestor || []).forEach(({ row }) => {
        if (!row?.fecha || !hasPortfolioRowTotals(row)) return;
        fundByDate[row.fecha] = getComparableRowTotal(row);
      });

      const hasMyInvestorRecords = state.myinvestor && state.myinvestor.some(r => r?.fecha && hasPortfolioRowTotals(r));
      const fallbackFondosVal = (!hasMyInvestorRecords && state.fondosList.length)
        ? state.fondosList.reduce((sum, f) => sum + parseNum(f.currentValue), 0)
        : 0;

      let lastBank = 0;
      let lastFund = 0;
      const monthlyTotals = {}; // year -> { [mes]: number }

      allDates.forEach(d => {
        if (bankByDate[d] !== undefined) lastBank = bankByDate[d];
        if (fundByDate[d] !== undefined) lastFund = fundByDate[d];
        const currentFund = (lastFund || fallbackFondosVal);
        const total = Number((lastBank + currentFund).toFixed(2));

        const dateObj = parseFinancialDate(d);
        if (!dateObj || Number.isNaN(dateObj.getTime())) return;

        const year = String(dateObj.getFullYear());
        const monthIndex = dateObj.getMonth();
        if (monthIndex < 0 || monthIndex >= MESES.length) return;
        const monthName = MESES[monthIndex];

        if (!monthlyTotals[year]) monthlyTotals[year] = {};
        // Al estar allDates ordenado cronológicamente, la última fecha del mes
        // sobreescribe las anteriores, quedando exactamente el total de mes final.
        monthlyTotals[year][monthName] = total;
      });

      return monthlyTotals;
    }

    /**
     * Autocompleta las tablas de Histórico de ahorro por años con las cifras calculadas
     * de total de mes final desde Banca y Fondos.
     */
    function syncMatricesFromFinancialData(force = false) {
      const calculated = getCalculatedMonthlyTotals();
      const calculatedYears = Object.keys(calculated);
      if (!calculatedYears.length) {
        if (force) showToast('No hay registros de Banca ni Fondos con fecha para calcular totales.', 'info');
        return false;
      }

      let changed = false;

      calculatedYears.forEach(year => {
        if (!state.matricesAnuales[year]) {
          if (!force && Array.isArray(state._deletedMatrixYears) && state._deletedMatrixYears.includes(year)) {
            return;
          }
          state.matricesAnuales[year] = { _createdManually: false };
          MESES.forEach(m => { state.matricesAnuales[year][m] = ''; });
          changed = true;
        }

        const yearObj = state.matricesAnuales[year];
        const deletedMonths = Array.isArray(yearObj._deletedMonths) ? yearObj._deletedMonths : [];
        const manualMonths = yearObj._manualMonths || {};

        MESES.forEach(m => {
          if (calculated[year][m] !== undefined) {
            const calcVal = calculated[year][m];
            const isDeleted = !force && deletedMonths.includes(m);
            const isManual = !force && manualMonths[m];

            if (!isDeleted && !isManual) {
              if (yearObj[m] !== calcVal) {
                yearObj[m] = calcVal;
                changed = true;
              }
            } else if (force) {
              yearObj[m] = calcVal;
              changed = true;
            }
          }
        });

        if (force) {
          yearObj._deletedMonths = [];
          yearObj._manualMonths = {};
        }
      });

      if (force) {
        saveState();
        renderMatricesAnuales();
        renderDiferenciasAnuales();
        renderAhorroFromData();
        showToast('Tablas de ahorro autocompletadas con las cifras de total de mes final.', 'success');
      }

      return changed;
    }
    window.syncMatricesFromFinancialData = syncMatricesFromFinancialData;

    // ── RENDERIZADO Y EDICIÓN DE LA SECCIÓN AHORRO ────────────────────────────────
    /** Actualiza la sección de ahorro y sus controles. */
    function renderAhorroSection() {
      initAhorroControls();
      const changed = syncMatricesFromFinancialData(false);
      if (changed) saveState();
      const calculated = getCalculatedMonthlyTotals();
      renderAhorroFromData(calculated);
      renderMatricesAnuales(calculated);
      renderDiferenciasAnuales();
    }

    /** Inicializa los controles interactivos de la sección de ahorro. */
    function initAhorroControls() {
      const yearInput = document.getElementById('ahorroNewYearInput');
      if (yearInput && !yearInput.value) yearInput.value = String(new Date().getFullYear());
      const monthInput = document.getElementById('ahorroNewMonthInput');
      if (monthInput && !monthInput.value) {
        const now = new Date();
        monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      }
    }

    /** Lleva el foco al control para crear un año de ahorro. */
    function focusAhorroYearCreator() {
      const input = document.getElementById('ahorroNewYearInput');
      if (!input) return;
      input.focus();
      input.select();
    }

    /** Pinta las matrices de ahorro a partir de los datos guardados. */
    function renderAhorroFromData(calculated) {
      // Solo sincroniza si se llama directamente (sin calculated precalculado).
      if (!calculated) syncMatricesFromFinancialData(false);
      const sourceCountBadge = document.getElementById('ahorroDataSourcesCountBadge');
      if (sourceCountBadge) {
        // Cada tabla bancaria cuenta como una fuente (normal o remunerada);
        // la tabla consolidada de fondos cuenta una sola vez, no por fondo/fila.
        const sourceCount = (Array.isArray(state.bancaTables) ? state.bancaTables.length : 0) + 1;
        sourceCountBadge.textContent = `${sourceCount} fuente${sourceCount === 1 ? '' : 's'} de datos`;
      }

      const kpiContainer = document.getElementById('ahorroAutoKpis');
      if (!kpiContainer) return;

      const saldoBanca = getLatestBancaSaldo();
      const fondosVal = getLatestFondosValue();
      const patrimonioTotal = getLatestBancaFinancialTotal() + fondosVal;
      const years = sortAhorroYears();
      const currentYear = years.length ? years[years.length - 1] : null;
      const currentYearStats = currentYear ? getAhorroYearStats(currentYear) : null;

      const autoBadge = '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/50">Automático</span>';
      const card = (label, value, sub, border, color = '', badge = '') => `
        <div class="stat-card border-l-4 ${border}">
          <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">${label}</p>
          <p class="text-2xl font-extrabold font-mono-num ${color || 'text-slate-900 dark:text-white'}">${value}</p>
          <div class="mt-1 flex items-center gap-1.5 flex-wrap">
            <span class="text-[11px] text-slate-400">${sub}</span>${badge}
          </div>
        </div>`;

      kpiContainer.innerHTML =
        card('Patrimonio actual · Banca', saldoBanca > 0 ? fmtEur(saldoBanca) : '—', `${state.bancaTables.length} entidad${state.bancaTables.length === 1 ? '' : 'es'}`, 'border-l-purple-500', 'text-purple-600 dark:text-purple-400', autoBadge) +
        card('Patrimonio actual · Fondos', fondosVal > 0 ? fmtEur(fondosVal) : '—', state.myinvestor.length ? 'Última fila del histórico' : 'Desde cartera de fondos', 'border-l-emerald-500', 'text-emerald-600 dark:text-emerald-400', state.myinvestor.length ? autoBadge : '') +
        card('Patrimonio financiero total', patrimonioTotal > 0 ? fmtEur(patrimonioTotal) : '—', 'Saldos bancarios + fondos', 'border-l-blue-500', 'text-slate-900 dark:text-white', autoBadge) +
        card('Cambio del saldo anual', currentYearStats ? `${currentYearStats.diff >= 0 ? '+' : ''}${fmtEur(currentYearStats.diff)}` : '—', currentYear && currentYearStats ? `${currentYear}: ${currentYearStats.endMonth || 'último'} − ${currentYearStats.startMonth || 'primer'} · cambio de saldo registrado, no rentabilidad` : 'Crea un año', 'border-l-cyan-500', currentYearStats && currentYearStats.diff < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-cyan-600 dark:text-cyan-400');

      const patrimonioCard = document.getElementById('ahorroEvolucionPatrimonioCard');
      if (!patrimonioCard) return;

      const parseFecha = s => {
        const p = String(s || '').split('/');
        return new Date(Number(p[2]), (Number(p[1]) || 1) - 1, Number(p[0]) || 1);
      };

      // Fechas con valoración disponible. Las filas vacías no deben reiniciar la serie a cero.
      const allDates = Array.from(new Set([
        ...state.bancaTables.flatMap(bt => (bt.rows || []).filter(r => r?.fecha && (hasUserValue(r.cantidadTotal) || hasUserValue(r.vl) || (bt.hasInterest && hasUserValue(r.cantidadGanada)))).map(r => r.fecha)),
        ...state.myinvestor.filter(r => r?.fecha && hasPortfolioRowTotals(r)).map(r => r.fecha)
      ])).sort((a, b) => parseFecha(a) - parseFecha(b));

      if (!allDates.length) {
        patrimonioCard.classList.add('hidden');
        return;
      }
      patrimonioCard.classList.remove('hidden');

      // Saldo bancario agregado por fecha, con arrastre del último saldo conocido de cada cuenta.
      const bankByDate = buildBankBalanceHistoryByDate(allDates);

      const fundByDate = {};
      getChronologicalRows(state.myinvestor || []).forEach(({ row }) => {
        if (!row?.fecha || !hasPortfolioRowTotals(row)) return;
        fundByDate[row.fecha] = getComparableRowTotal(row);
      });

      let lastBank = 0;
      let lastFund = 0;
      const bankSeries = [];
      const fundSeries = [];
      const totalSeries = [];

      allDates.forEach(d => {
        if (bankByDate[d] !== undefined) lastBank = bankByDate[d];
        if (fundByDate[d] !== undefined) lastFund = fundByDate[d];
        bankSeries.push(lastBank);
        fundSeries.push(lastFund);
        totalSeries.push(lastBank + lastFund);
      });

      const mode = getChartMode('chartAhorroEvolucionPatrimonio', 'line-curve');
      const type = resolveChartType(mode);
      const tension = resolveChartTension(mode);
      const isLine = type === 'line';

      const datasets = [
        {
          label: 'Patrimonio total (€)',
          data: totalSeries,
          borderColor: '#d97706',
          backgroundColor: hexRgba('#d97706', isLine ? (mode === 'area' ? 0.18 : 0) : 0.72),
          fill: resolveChartFill(mode),
          borderWidth: 3.5,
          tension,
          stepped: resolveChartStepped(mode),
          pointRadius: 3,
          borderRadius: type === 'bar' ? 4 : undefined,
          order: 0
        },
        {
          label: 'Banca (€)',
          data: bankSeries,
          borderColor: '#7c3aed',
          backgroundColor: hexRgba('#7c3aed', isLine ? 0.05 : 0.45),
          fill: false,
          borderWidth: 2.2,
          tension,
          stepped: resolveChartStepped(mode),
          pointRadius: 2.5,
          borderRadius: type === 'bar' ? 4 : undefined,
          order: 1
        },
        {
          label: 'Fondos (€)',
          data: fundSeries,
          borderColor: '#059669',
          backgroundColor: hexRgba('#059669', isLine ? 0.05 : 0.45),
          fill: false,
          borderWidth: 2.2,
          tension,
          stepped: resolveChartStepped(mode),
          pointRadius: 2.5,
          borderRadius: type === 'bar' ? 4 : undefined,
          order: 1
        }
      ];

      buildChart('chartAhorroEvolucionPatrimonio', {
        type,
        data: { labels: allDates, datasets },
        options: {
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
            tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtEur(ctx.parsed.y, 2)}` } }
          },
          scales: { y: { ticks: { callback: v => `${fmt(v)} €` } } }
        }
      });
      addChartModeToolbar('chartAhorroEvolucionPatrimonioHeader', 'chartAhorroEvolucionPatrimonio', renderAhorroFromData, ['line-curve', 'area', 'bar']);
    }

    /** Renderiza las matrices anuales de ahorro y sus celdas. */
    function renderMatricesAnuales(calculated) {
      const container = document.getElementById('matricesAnualesContainer');
      const empty = document.getElementById('matricesEmptyState');
      const badge = document.getElementById('ahorroYearsCountBadge');
      if (!container) return;
      container.innerHTML = '';

      // Reutiliza el objeto calculado si ya viene del caller; evita repetir el loop.
      if (!calculated) calculated = getCalculatedMonthlyTotals();
      const years = sortAhorroYears();
      if (badge) badge.textContent = `${years.length} año${years.length === 1 ? '' : 's'}`;
      if (!years.length) {
        empty?.classList.remove('hidden');
        return;
      }
      empty?.classList.add('hidden');

      const yearFragment = document.createDocumentFragment();
      years.forEach(year => {
        const data = state.matricesAnuales[year] || {};
        const stats = getAhorroYearStats(year);
        const card = document.createElement('div');
        card.className = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden table-readonly';
        card.dataset.tableKey = `matriz_${year}`;
        const isPos = stats.diff >= 0;
        const monthsWithData = MESES.filter(m => hasAhorroMonthValue(data, m)).length;
        const hasAutoData = MESES.some(m => calculated[year]?.[m] !== undefined && hasAhorroMonthValue(data, m) && Math.abs(parseNum(data[m]) - parseNum(calculated[year][m])) < 0.001);

        const rowsHtml = MESES.map(m => {
          const hasValue = hasAhorroMonthValue(data, m);
          const val = hasValue ? parseNum(data[m]) : 0;
          const isCalculated = calculated[year]?.[m] !== undefined && hasValue && Math.abs(parseNum(calculated[year][m]) - val) < 0.001;
          return `
            <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 group">
              <td class="py-1.5 px-3 capitalize text-[11px] font-sans font-medium text-slate-500 dark:text-slate-400">
                <div class="flex items-center justify-between">
                  <span>${m}</span>
                  ${isCalculated ? '<span class="text-[8px] font-bold text-emerald-600 dark:text-emerald-400 opacity-75 uppercase" title="Autocompletado desde total de mes final (Banca + Fondos)">Auto</span>' : ''}
                </div>
              </td>
              <td class="py-1.5 px-2 text-right">
                <input type="text" class="cell-input text-right font-mono-num font-semibold" data-edit-input value="${hasValue ? fmt(val) : ''}" placeholder="—" onchange="updateMatrizCell('${year}', '${m}', this.value)">
              </td>
            </tr>`;
        }).join('');

        card.innerHTML = `
          <div class="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <i class="ph-bold ph-calendar-blank text-amber-500"></i>
                  <h4 class="text-sm font-extrabold text-slate-900 dark:text-white font-mono">${year}</h4>
                  <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">${monthsWithData}/12 meses</span>
                  ${hasAutoData ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/50" title="Valores autocompletados con el total de mes final de Banca y Fondos">Automático</span>' : ''}
                </div>
                <p class="text-[10px] text-slate-400 mt-1">Saldo ahorrado por mes · total de mes final</p>
              </div>
              <div class="flex items-center gap-1">
                <button type="button" data-edit-toggle class="table-edit-toggle inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition" onclick="toggleTableEditMode('matriz_${year}', this)" aria-pressed="false" title="Editar año"><i class="ph-bold ph-pencil-simple edit-toggle-icon" aria-hidden="true"></i><span class="edit-toggle-label">Editar</span></button>
                <button type="button" onclick="removeMatrizYear('${year}')" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition" title="Eliminar año"><i class="ph ph-trash text-sm"></i></button>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-2 mt-3">
              <div class="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1.5">
                <span class="block text-[9px] text-slate-400 uppercase">Inicio</span><strong class="text-[11px] font-mono-num text-slate-700 dark:text-slate-200">${fmtEur(stats.start)}</strong>
              </div>
              <div class="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1.5">
                <span class="block text-[9px] text-slate-400 uppercase">Cierre</span><strong class="text-[11px] font-mono-num text-slate-700 dark:text-slate-200">${fmtEur(stats.end)}</strong>
              </div>
              <div class="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1.5">
                <span class="block text-[9px] text-slate-400 uppercase">Variación</span><strong class="text-[11px] font-mono-num ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${isPos ? '+' : ''}${fmtEur(stats.diff)}</strong>
              </div>
            </div>
          </div>

          <div class="matriz-tabla-scroll" role="region" aria-label="Histórico mensual de ${year}" tabindex="0">
            <table class="w-full text-xs border-collapse">
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono-num">${rowsHtml}</tbody>
            </table>
          </div>

          <div class="p-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 text-[10px] text-slate-400 flex items-center justify-between gap-2">
            <span>${stats.min ? `Mín ${stats.min.month}: ${fmtEur(stats.min.value)}` : 'Sin datos aún'}</span>
            <span>${stats.max ? `Máx ${stats.max.month}: ${fmtEur(stats.max.value)}` : ''}</span>
          </div>
        `;
        yearFragment.appendChild(card);
        updateTableEditUi(`matriz_${year}`, card);
      });
      container.appendChild(yearFragment);
    }

    /** Actualiza el valor de una celda de la matriz anual. */
    function updateMatrizCell(year, mes, val) {
      if (!requireTableEdit(`matriz_${year}`)) return;
      if (!state.matricesAnuales[year]) return;
      const rawValue = String(val ?? '').trim();
      if (!state.matricesAnuales[year]._manualMonths) {
        state.matricesAnuales[year]._manualMonths = {};
      }
      if (!Array.isArray(state.matricesAnuales[year]._deletedMonths)) {
        state.matricesAnuales[year]._deletedMonths = [];
      }

      if (rawValue === '' || !/\d/.test(rawValue)) {
        state.matricesAnuales[year][mes] = '';
        state.matricesAnuales[year]._manualMonths[mes] = false;
        if (!state.matricesAnuales[year]._deletedMonths.includes(mes)) {
          state.matricesAnuales[year]._deletedMonths.push(mes);
        }
      } else {
        state.matricesAnuales[year][mes] = parseNum(rawValue);
        state.matricesAnuales[year]._manualMonths[mes] = true;
        state.matricesAnuales[year]._deletedMonths = state.matricesAnuales[year]._deletedMonths.filter(m => m !== mes);
      }

      saveState();
      renderMatricesAnuales();
      renderDiferenciasAnuales();
      renderAhorroFromData();
    }

    /** Crea una nueva matriz para el año elegido. */
    function addNewYearMatrix(yearValue = null) {
      const input = document.getElementById('ahorroNewYearInput');
      let raw = yearValue ?? input?.value;
      if (raw === null || raw === undefined || String(raw).trim() === '') raw = new Date().getFullYear();
      const year = Number(raw);
      if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        showToast('Introduce un año válido entre 1900 y 2100.', 'error');
        return;
      }
      const key = String(year);
      if (state.matricesAnuales[key]) {
        showToast(`El año ${key} ya existe.`, 'info');
        return;
      }
      if (Array.isArray(state._deletedMatrixYears)) {
        state._deletedMatrixYears = state._deletedMatrixYears.filter(y => y !== key);
      }
      const data = { _createdManually: true };
      MESES.forEach(m => { data[m] = ''; });
      state.matricesAnuales[key] = data;
      syncMatricesFromFinancialData(true);
      if (input) input.value = key;
      saveState();
      renderMatricesAnuales();
      renderDiferenciasAnuales();
      showToast(`Año ${key} creado.`, 'success');
    }

    /** Elimina la matriz anual indicada. */
    function removeMatrizYear(year) {
      if (!state.matricesAnuales[year]) return;
      showConfirm({
        title: `¿Eliminar el año ${year}?`,
        msg: `Se eliminará la tabla completa de ${year} y sus 12 meses. Esta acción no afecta a Banca ni a Fondos Indexados.`,
        onOk: () => {
          delete state.matricesAnuales[year];
          delete tableEditModes[`matriz_${year}`];
          if (!Array.isArray(state._deletedMatrixYears)) {
            state._deletedMatrixYears = [];
          }
          if (!state._deletedMatrixYears.includes(year)) {
            state._deletedMatrixYears.push(year);
          }
          saveState();
          renderAhorroSection();
          showToast(`Año ${year} eliminado.`, 'info');
        }
      });
    }

    /** Pinta el resumen anual y señala los años que no tienen cifras en los 12 meses. */
    function renderDiferenciasAnuales() {
      const tbody = document.getElementById('resumenDiferenciasTableBody');
      const empty = document.getElementById('resumenDiferenciasEmpty');
      if (!tbody) return;
      tbody.innerHTML = '';

      const years = sortAhorroYears();
      if (!years.length) {
        empty?.classList.remove('hidden');
        buildChart('chartDiferenciaAnual', { type: 'line', data: { labels: [], datasets: [] } });
        return;
      }
      empty?.classList.add('hidden');

      // Calcula las estadísticas una sola vez y las reutiliza en la tabla y el gráfico.
      const annualStats = years.map(year => {
        const stats = getAhorroYearStats(year);
        return { year, stats, complete: stats.count === MESES.length };
      });

      const diffs = annualStats.map(item => item.stats.diff);
      const chartLabels = annualStats.map(item => item.complete ? String(item.year) : `${item.year} *`);

      annualStats.forEach(({ year, stats, complete }) => {
        const tr = document.createElement('tr');
        const incompleteBadge = complete ? '' : `
          <span class="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-[9px] font-bold whitespace-nowrap" title="Faltan ${MESES.length - stats.count} meses con cifras">Incompleto · ${stats.count}/12</span>`;
        tr.innerHTML = `
          <td class="py-2 px-2 font-bold text-slate-900 dark:text-white">
            <div class="flex items-center gap-1.5 flex-wrap"><span>${year}</span>${incompleteBadge}</div>
          </td>
          <td class="py-2 px-2 text-right text-slate-500 whitespace-nowrap">${fmtEur(stats.start)}</td>
          <td class="py-2 px-2 text-right text-slate-500 whitespace-nowrap">${fmtEur(stats.end)}</td>
          <td class="py-2 px-2 text-right font-extrabold whitespace-nowrap ${stats.diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'redFont'}">${stats.diff >= 0 ? '+' : ''}${fmtEur(stats.diff)}</td>`;
        tbody.appendChild(tr);
      });

      const modeDif = getChartMode('chartDiferenciaAnual', 'line-curve');
      const typeDif = resolveChartType(modeDif);
      const tensionDif = resolveChartTension(modeDif);
      buildChart('chartDiferenciaAnual', {
        type: typeDif,
        data: {
          labels: chartLabels,
          datasets: [{
            label: 'Variación anual (€)',
            data: diffs,
            borderColor: '#d97706',
            borderWidth: 2.5,
            fill: resolveChartFill(modeDif),
            tension: tensionDif,
            stepped: resolveChartStepped(modeDif),
            pointRadius: annualStats.map(item => item.complete ? 4 : 5),
            pointBackgroundColor: annualStats.map(item => item.complete ? '#d97706' : '#f59e0b'),
            pointBorderColor: annualStats.map(item => item.complete ? '#d97706' : '#b45309'),
            borderRadius: typeDif === 'bar' ? 5 : undefined,
            backgroundColor: typeDif === 'bar'
              ? annualStats.map(item => item.complete ? 'rgba(217,119,6,0.72)' : 'rgba(245,158,11,0.88)')
              : hexRgba('#d97706', modeDif === 'area' ? 0.18 : 0)
          }]
        },
        options: {
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: items => {
                  const index = items?.[0]?.dataIndex;
                  const item = annualStats[index];
                  if (!item) return '';
                  return item.complete
                    ? `${item.year} · Completo (12/12 meses)`
                    : `${item.year} · INCOMPLETO (${item.stats.count}/12 meses con cifras)`;
                },
                label: ctx => ` Variación: ${fmtEur(ctx.parsed.y, 2)}`
              }
            }
          },
          scales: { y: { ticks: { callback: v => `${fmt(v)} €` } } }
        }
      });
      addChartModeToolbar('chartDiferenciaAnualHeader', 'chartDiferenciaAnual', renderDiferenciasAnuales, ['line-curve', 'area', 'bar']);
    }

    /** Renderiza la tabla mensual de ingresos y gastos. */
    function renderMensualTable() {
      const tbody = document.getElementById('mensualTableBody');
      const empty = document.getElementById('mensualEmptyState');
      if (!tbody) return;
      tbody.innerHTML = '';

      const rows = getAhorroMonthlyRowsSorted();
      if (!rows.length) {
        empty?.classList.remove('hidden');
        const count = document.getElementById('searchCount_mensual');
        if (count) count.textContent = '';
        updateTableEditUi('mensual', document.querySelector('[data-table-key="mensual"]'));
        return;
      }
      empty?.classList.add('hidden');

      let prevYear = null;
      rows.forEach(item => {
        const { row, index: ri } = item;
        const ing = parseNum(row.ingresos);
        const gas = parseNum(row.gastos);
        const aho = ing - gas;
        const tasa = ing > 0 ? (aho / ing * 100) : 0;
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40 group';
        const d = parseAhorroMonthValue(row.periodo);
        const currentYear = d ? String(d.getFullYear()) : getTableYear(row.periodo);
        if (prevYear && currentYear && prevYear !== currentYear) tr.classList.add('year-separator-tr');
        if (currentYear) prevYear = currentYear;
        tr.innerHTML = `
          <td class="py-1.5 px-3"><input type="text" class="cell-input" data-edit-input value="${esc(row.periodo)}" placeholder="Enero 2026" onchange="updateMensualCell(${ri}, 'periodo', this.value)"></td>
          <td class="py-1.5 px-3 text-right"><input type="text" class="cell-input text-right font-semibold" data-edit-input value="${fmt(ing)}" placeholder="0,00" onchange="updateMensualCell(${ri}, 'ingresos', this.value)"></td>
          <td class="py-1.5 px-3 text-right"><input type="text" class="cell-input text-right" data-edit-input value="${fmt(gas)}" placeholder="0,00" onchange="updateMensualCell(${ri}, 'gastos', this.value)"></td>
          <td class="py-1.5 px-3 text-right font-extrabold ${aho >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'redFont'} table-calculated-cell" title="Calculado automáticamente: ingresos menos gastos">${fmtEur(aho)} <span data-calculated-indicator class="table-calculated-badge hidden"><i class="ph ph-lock-key text-[8px]"></i>Calculado</span></td>
          <td class="py-1.5 px-3 text-right font-bold ${tasa >= 0 ? 'text-blue-600 dark:text-blue-400' : 'redFont'} table-calculated-cell" title="Calculado automáticamente: ahorro neto dividido entre ingresos">${fmt(tasa)}% <span data-calculated-indicator class="table-calculated-badge hidden"><i class="ph ph-lock-key text-[8px]"></i>Calculado</span></td>
          <td class="py-1.5 px-3"><input type="text" class="cell-input font-sans" data-edit-input value="${esc(row.notas)}" placeholder="Notas" onchange="updateMensualCell(${ri}, 'notas', this.value)"></td>
          <td class="py-1.5 px-2 text-center"><button onclick="removeMensualRow(${ri})" data-edit-delete class="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 p-1 rounded transition" title="Eliminar mes"><i class="ph ph-trash text-xs"></i></button></td>`;
        tbody.appendChild(tr);
      });
      const searchInp = document.getElementById('searchFecha_mensual');
      if (searchInp && searchInp.value) filterMensualTableRows(searchInp.value);
      else {
        const cnt = document.getElementById('searchCount_mensual');
        if (cnt) cnt.textContent = `${rows.length} registros`;
      }
      updateTableEditUi('mensual', document.querySelector('[data-table-key="mensual"]'));
    }

    /** Actualiza un campo de un registro mensual. */
    function updateMensualCell(ri, col, val) {
      if (!requireTableEdit('mensual')) return;
      if (!state.mensual[ri]) return;
      if (col === 'ingresos' || col === 'gastos') state.mensual[ri][col] = parseNum(val);
      else state.mensual[ri][col] = val.trim();
      saveState();
      renderMensualTable();
      renderMensualCharts();
      renderAhorroFromData();
    }

    /** Añade una fila mensual de ingresos y gastos. */
    function addMensualRow(periodoValue = null) {
      const input = document.getElementById('ahorroNewMonthInput');
      const raw = periodoValue ?? input?.value;
      let d = raw ? parseAhorroMonthValue(raw) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      if (!d || isNaN(d)) {
        showToast('Selecciona un mes válido.', 'error');
        return;
      }
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const exists = state.mensual.some(r => formatAhorroMonthInput(r.periodo) === key);
      if (exists) {
        showToast(`${NOMBRES_MES_AHORRO[d.getMonth()]} ${d.getFullYear()} ya existe.`, 'info');
        return;
      }
      state.mensual.push({ periodo: `${NOMBRES_MES_AHORRO[d.getMonth()]} ${d.getFullYear()}`, ingresos: 0, gastos: 0, notas: '' });
      saveState();
      renderMensualTable();
      renderMensualCharts();
      renderAhorroFromData();
      if (input) input.value = key;
      showToast(`${NOMBRES_MES_AHORRO[d.getMonth()]} ${d.getFullYear()} añadido.`, 'success');
    }

    /** Elimina un registro de la tabla mensual. */
    function removeMensualRow(ri) {
      if (!requireTableEdit('mensual')) return;
      if (!state.mensual[ri]) return;
      const label = formatAhorroMonthLabel(state.mensual[ri].periodo);
      state.mensual.splice(ri, 1);
      saveState();
      renderMensualTable();
      renderMensualCharts();
      renderAhorroFromData();
      showToast(`${label} eliminado.`, 'info');
    }

    /** Actualiza las gráficas asociadas a los ingresos y gastos mensuales. */
    function renderMensualCharts() {
      const rows = getAhorroMonthlyRowsSorted();
      const labels = rows.map(x => formatAhorroMonthLabel(x.row.periodo));
      const ingresos = rows.map(x => parseNum(x.row.ingresos));
      const gastos = rows.map(x => parseNum(x.row.gastos));
      const ahorros = rows.map(x => parseNum(x.row.ingresos) - parseNum(x.row.gastos));

      const modeBars = getChartMode('chartMensualBars', 'line-curve');
      const typeBars = resolveChartType(modeBars);
      const tensionBars = resolveChartTension(modeBars);
      const isLineBars = typeBars === 'line';
      const makeDs = (label, data, color) => isLineBars ? {
        label, data, borderColor: color, backgroundColor: hexRgba(color, modeBars === 'area' ? 0.14 : 0), fill: resolveChartFill(modeBars), tension: tensionBars, stepped: resolveChartStepped(modeBars), pointRadius: 3, borderWidth: 2
      } : {
        label, data, backgroundColor: hexRgba(color, 0.8), borderRadius: 4
      };

      buildChart('chartMensualBars', {
        type: typeBars,
        data: { labels, datasets: [makeDs('Ingresos', ingresos, '#059669'), makeDs('Gastos', gastos, '#e11d48'), makeDs('Ahorro neto', ahorros, '#d97706')] },
        options: { plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 8, padding: 8, font: { size: 10 } } } }, scales: { y: { ticks: { callback: v => `${fmt(v)} €` } } } }
      });
      addChartModeToolbar('chartMensualBarsHeader', 'chartMensualBars', renderMensualCharts, ['line-curve', 'area', 'bar']);

      let acum = 0;
      const acumData = ahorros.map(v => (acum += v));
      const modeAcum = getChartMode('chartMensualAcum', 'line-curve');
      const typeAcum = resolveChartType(modeAcum);
      const tensionAcum = resolveChartTension(modeAcum);
      buildChart('chartMensualAcum', {
        type: typeAcum,
        data: { labels, datasets: [{ label: 'Ahorro neto acumulado', data: acumData, borderColor: '#059669', backgroundColor: hexRgba('#059669', typeAcum === 'line' ? (modeAcum === 'area' ? 0.18 : 0) : 0.75), fill: resolveChartFill(modeAcum), tension: tensionAcum, stepped: resolveChartStepped(modeAcum), borderWidth: 2.5, pointRadius: 3, borderRadius: typeAcum === 'bar' ? 4 : undefined }] },
        options: { plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => `${fmt(v)} €` } } } }
      });
      addChartModeToolbar('chartMensualAcumHeader', 'chartMensualAcum', renderMensualCharts, ['line-curve', 'area', 'bar']);
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 4. DASHBOARD (ÚLTIMA PESTAÑA)
    // ════════════════════════════════════════════════════════════════════════════
