// Fund portfolio history table and monthly position calculations.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 2997-3492) ---
    // ── TABLA DE FONDOS DINÁMICA SEGÚN EL MONITOR ───────────────────────────────
    // Cada fondo añadido al MONITOR DE FONDOS genera automáticamente dos columnas:
    // MOVIMIENTO + TOTAL. El orden coincide con el orden actual de liveQuotes.
    //
    // El nombre visible en SEGUIMIENTO MENSUAL se obtiene del nombre del
    // MONITOR DE FONDOS, se recorta justo antes de "Index" y se muestra
    // siempre en MAYÚSCULAS.
    //
    // Ejemplo:
    // Fidelity S&P 500 Index Fund EUR P Acc (0P0001CLDM)
    //              ↓
    // FIDELITY S&P 500
    //              ↓
    // MOVIMIENTO FIDELITY S&P 500 / TOTAL FIDELITY S&P 500
    // ── SEGUIMIENTO MENSUAL Y TABLA DE CARTERA ────────────────────────────────────
    /** Normaliza el nombre que se muestra para un fondo en las tablas mensuales. */
    function getMonthlyFundDisplayName(name, fallback = 'FONDO') {
      const raw = String(name || fallback).trim();
      // Prioridad: cortar antes de "Index"; si no existe, cortar antes de "Funds".
      const indexPos = raw.search(/\bIndex\b/i);
      const fundsPos = raw.search(/\bFunds\b/i);
      let cutPos = -1;

      if (indexPos >= 0) {
        cutPos = indexPos;
      } else if (fundsPos >= 0) {
        cutPos = fundsPos;
      }

      const display = (cutPos >= 0 ? raw.slice(0, cutPos) : raw).trim();
      return (display || fallback).toUpperCase();
    }

    /** Devuelve los fondos del monitor y los retirados que aún tienen datos históricos. */
    function getMonitorFunds() {
      const active = liveQuotes.map((quote, index) => {
        const sourceName = quote.fundName || quote.isin || quote.url || `Fondo ${index + 1}`;
        return {
          key: quote.isin || quote.url || quote.fundName || `monitor_fund_${index}`,
          name: getMonthlyFundDisplayName(sourceName, `FONDO ${index + 1}`),
          archived: false
        };
      });
      const activeKeys = new Set(active.map(fund => fund.key));
      const archivedByKey = new Map();
      (Array.isArray(state.archivedPortfolioFunds) ? state.archivedPortfolioFunds : []).forEach(item => {
        const key = item?.key;
        if (!key || activeKeys.has(key) || archivedByKey.has(key)) return;
        const hasHistory = (state.myinvestor || []).some(row => {
          const values = row?.fondos?.[key];
          return values && (hasUserValue(values.movimiento) || hasUserValue(values.total));
        });
        if (!hasHistory) return;
        archivedByKey.set(key, {
          key,
          name: getMonthlyFundDisplayName(item.name || item.isin || key, 'FONDO HISTÓRICO'),
          archived: true
        });
      });
      return [...active, ...archivedByKey.values()];
    }

    /** Asegura que una fila tenga las claves necesarias para los fondos de la cartera. */
    function ensurePortfolioFunds(row) {
      if (!row.fondos || typeof row.fondos !== 'object' || Array.isArray(row.fondos)) {
        row.fondos = {};
      }

      const funds = getMonitorFunds();
      funds.forEach(fund => {
        const existing = row.fondos[fund.key];
        if (!existing || typeof existing !== 'object') {
          row.fondos[fund.key] = { movimiento: '', total: '' };
        } else {
          existing.movimiento = hasUserValue(existing.movimiento) ? parseNum(existing.movimiento) : '';
          existing.total = hasUserValue(existing.total) ? parseNum(existing.total) : '';
        }
      });

      return row.fondos;
    }

    /** Indica si una fila de fondos ya contiene al menos un valor introducido. */
    function hasPortfolioRowValues(row) {
      return getMonitorFunds().some(fund => {
        const values = row?.fondos?.[fund.key];
        return hasUserValue(values?.movimiento) || hasUserValue(values?.total);
      });
    }

    /** Indica si al menos un fondo de la fila tiene valor total introducido. */
    function hasPortfolioRowTotals(row) {
      return getMonitorFunds().some(fund => hasUserValue(row?.fondos?.[fund.key]?.total));
    }

    /** Suma los movimientos o aportaciones de una fila de cartera. */
    function getPortfolioMovementTotal(row) {
      const funds = getMonitorFunds();
      ensurePortfolioFunds(row);
      return funds.reduce((sum, fund) => sum + parseNum(row.fondos[fund.key]?.movimiento), 0);
    }

    /** Calcula el total de cartera a partir de los valores individuales de los fondos. */
    function getPortfolioTotalFromFunds(row) {
      const funds = getMonitorFunds();
      ensurePortfolioFunds(row);
      return funds.reduce((sum, fund) => sum + parseNum(row.fondos[fund.key]?.total), 0);
    }

    /** Obtiene el total comparable; prioriza la suma de los TOTAL individuales de cada fondo. */
    function getComparableRowTotal(row) {
      if (!row) return 0;
      if (hasPortfolioRowTotals(row)) return getPortfolioTotalFromFunds(row);
      if (hasUserValue(row.totalCartera)) return parseNum(row.totalCartera);
      return 0;
    }

    /** Construye las cabeceras dinámicas de la tabla de seguimiento de fondos. */
    function renderMyInvestorTableHeader() {
      const thead = document.getElementById('myinvestorTableHead');
      if (!thead) return;

      const funds = getMonitorFunds();
      const fundHeaders = funds.map(fund => `
        <th class="py-2.5 px-3 text-center align-middle min-w-[145px] text-blue-600 dark:text-blue-400 whitespace-normal leading-tight">
          <div class="flex flex-col items-center justify-center text-center">
            <span>MOVIMIENTO · ENTRA / SALE</span>
            <span class="text-[10px]">${esc(fund.name)}</span>
            ${fund.archived ? '<span class="mt-1 inline-flex rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[8px] font-bold text-slate-500 dark:text-slate-400">HISTÓRICO · SIN COTIZACIÓN</span>' : ''}
          </div>
        </th>
        <th class="py-2.5 px-3 text-center align-middle min-w-[145px] font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20 whitespace-normal leading-tight">
          <div class="flex flex-col items-center justify-center text-center">
            <span>TOTAL · VALOR</span>
            <span class="text-[10px]">${esc(fund.name)}</span>
            ${fund.archived ? '<span class="mt-1 inline-flex rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[8px] font-bold text-slate-500 dark:text-slate-400">HISTÓRICO</span>' : ''}
          </div>
        </th>`).join('');

      thead.innerHTML = `
        <tr class="table-sticky-header border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold text-[10px]">
          <th class="py-2.5 px-3 text-left min-w-[110px] w-[110px]">FECHA</th>
          ${fundHeaders}
          <th class="py-2.5 px-3 text-right min-w-[135px] font-extrabold text-slate-800 dark:text-slate-100 bg-slate-100/80 dark:bg-slate-800/70">TOTAL<br>CARTERA</th>
          <th class="py-2.5 px-3 text-right min-w-[125px] font-extrabold text-emerald-600 dark:text-emerald-400">PLUSVALÍA<br>COMERCIAL</th>
          <th class="py-2.5 px-2 w-8"></th>
        </tr>`;
    }

    /** Completa y normaliza los campos de una fila mensual de cartera. */
    function normalizePortfolioRow(row, ri = 0) {
      const normalized = row && typeof row === 'object' ? row : {};
      normalized.fecha = normalized.fecha || '';
      ensurePortfolioFunds(normalized);

      // Una fila recién creada, con solo fecha, no se trata como una cartera de 0 €.
      if (!hasPortfolioRowValues(normalized)) {
        normalized.totalCartera = '';
        normalized.cantidadGanada = '';
        normalized.cantidadGanadaImportada = false;
        return normalized;
      }

      // Si solo se ha rellenado MOVIMIENTO pero aún no hay ningún TOTAL,
      // no mostrar un valor de cartera ni una plusvalía calculada artificialmente.
      if (!hasPortfolioRowTotals(normalized)) {
        normalized.totalCartera = '';
        const importedGain = normalized.cantidadGanadaImportada === true || normalized.plusvaliaComercialImportada === true;
        if (importedGain && hasUserValue(normalized.cantidadGanada)) {
          normalized.cantidadGanada = parseNum(normalized.cantidadGanada);
        } else {
          normalized.cantidadGanada = '';
        }
        return normalized;
      }

      // TOTAL CARTERA se calcula SIEMPRE como la suma de las columnas
      // TOTAL de todos los fondos de esta misma fila.
      // No se utiliza un TOTAL CARTERA importado, porque podría quedar
      // desincronizado de los totales individuales.
      normalized.totalCartera = getPortfolioTotalFromFunds(normalized);

      // CANTIDAD GANADA puede venir de la rentabilidad comercial de la plataforma.
      // Si está importada, se conserva y NO se recalcula a partir de MOVIMIENTOS.
      // Esto evita contar como capital aportado las compras originadas por traspasos.
      const importedGain = normalized.cantidadGanadaImportada === true || normalized.plusvaliaComercialImportada === true;
      if (importedGain) {
        normalized.cantidadGanada = parseNum(normalized.cantidadGanada);
      } else {
        const currentMovementTotal = getPortfolioMovementTotal(normalized);
        if (ri > 0) {
          const previous = state.myinvestor[ri - 1];
          const previousTotal = getComparableRowTotal(previous);
          normalized.cantidadGanada = Number(
            (normalized.totalCartera - previousTotal - currentMovementTotal).toFixed(2)
          );
        } else {
          normalized.cantidadGanada = Number(
            (normalized.totalCartera - currentMovementTotal).toFixed(2)
          );
        }
        normalized.cantidadGanadaImportada = false;
      }
      return normalized;
    }

    /** Pinta la tabla de seguimiento mensual de fondos indexados. */
    function renderMyInvestorTable() {
      const tbody = document.getElementById('myinvestorTableBody');
      const empty = document.getElementById('myinvestorEmptyState');
      if (!tbody) return;

      renderMyInvestorTableHeader();
      tbody.innerHTML = '';

      const funds = getMonitorFunds();
      const countLabel = document.getElementById('fondosRowCountLabel');
      if (countLabel) countLabel.textContent = `${state.myinvestor.length} registros`;

      if (state.myinvestor.length === 0) {
        if (empty) {
          empty.classList.remove('hidden');
          empty.textContent = funds.length
            ? 'Sin registros en fondos. Pulsa "+ Añadir Fila" para crear una nueva fila.'
            : 'Añade fondos en MONITOR DE FONDOS para crear automáticamente sus columnas aquí.';
        }
        const vEl = document.getElementById('statFondosTableValor');
        if (vEl) vEl.textContent = '—';
        const gEl = document.getElementById('statFondosTableGanancia');
        if (gEl) gEl.textContent = '—';
        const roiTableEl = document.getElementById('statFondosTableRoi');
        if (roiTableEl) roiTableEl.textContent = '—';
        updateTableEditUi('myinvestor', document.querySelector('[data-table-key="myinvestor"]'));
        return;
      }

      if (empty) empty.classList.add('hidden');

      const movementTotals = Object.fromEntries(funds.map(f => [f.key, 0]));
      const latestTotals = Object.fromEntries(funds.map(f => [f.key, 0]));
      let totalGain = 0;

      let prevYear = null;
      const fragment = document.createDocumentFragment();
      state.myinvestor.forEach((rawRow, ri) => {
        const row = normalizePortfolioRow(rawRow, ri);
        state.myinvestor[ri] = row;
        // Normaliza fechas almacenadas sin padding (ej: "12/3/2025" → "12/03/2025").
        if (row.fecha) row.fecha = normalizeFecha(row.fecha);

        const totalCartera = row.totalCartera;
        const gain = row.cantidadGanada;
        totalGain += gain;

        funds.forEach(fund => {
          movementTotals[fund.key] += parseNum(row.fondos[fund.key]?.movimiento);
          latestTotals[fund.key] = parseNum(row.fondos[fund.key]?.total);
        });

        const movementClass = value => value > 0
          ? 'text-blue-600 dark:text-blue-400'
          : value < 0 ? 'redFont' : 'text-slate-500 dark:text-slate-400';
        const gainClass = gain >= 0 ? 'greenFont' : 'redFont';

        const fundCells = funds.map(fund => {
          const encodedKey = encodeURIComponent(fund.key);
          const movement = parseNum(row.fondos[fund.key]?.movimiento);
          const total = parseNum(row.fondos[fund.key]?.total);
          return `
            <td class="py-1.5 px-3 text-right ${movementClass(movement)}">
              <input type="text"
                class="cell-input text-right font-medium" data-edit-input
                value="${movement !== 0 ? fmt(movement) : ''}"
                placeholder="-"
                title="Dato editable: movimiento del fondo"
                onchange="updateMyInvestorFundCell(${ri}, '${encodedKey}', 'movimiento', this.value)">
            </td>
            <td class="py-1.5 px-3 text-right font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20">
              <input type="text"
                class="cell-input text-right font-bold text-emerald-600 dark:text-emerald-400" data-edit-input
                value="${total !== 0 ? fmt(total) : ''}"
                placeholder="-"
                title="Dato editable: total del fondo"
                onchange="updateMyInvestorFundCell(${ri}, '${encodedKey}', 'total', this.value)">
            </td>`;
        }).join('');

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group';
        const currentYear = getTableYear(row.fecha);
        if (prevYear && currentYear && prevYear !== currentYear) tr.classList.add('year-separator-tr');
        if (currentYear) prevYear = currentYear;
        const rowHasValues = hasPortfolioRowTotals(row);
        const totalCarteraCell = `<td class="py-1.5 px-3 text-right font-extrabold text-slate-800 dark:text-slate-100 bg-slate-100/70 dark:bg-slate-800/60 table-calculated-cell" title="Calculado automáticamente: suma de TOTAL de todos los fondos de esta fila">
              ${rowHasValues ? fmtEur(totalCartera) : ''}
              <span data-calculated-indicator class="table-calculated-badge hidden"><i class="ph ph-lock-key text-[8px]"></i>Calculado</span>
            </td>`;

        const cantidadGanadaCell = `<td class="py-1.5 px-3 text-right font-extrabold ${gainClass} table-calculated-cell" title="Plusvalía comercial de la fuente; no cuenta como aportación las suscripciones derivadas de traspasos internos">
              ${rowHasValues && hasUserValue(gain) ? `${gain > 0 ? '+' : ''}${fmtEur(gain)}` : ''}
              <span data-calculated-indicator class="table-calculated-badge hidden"><i class="ph ph-lock-key text-[8px]"></i>Calculado</span>
            </td>`;

        tr.innerHTML = `
          <td class="py-1.5 px-3 min-w-[110px] w-[110px]">
            <input type="text" class="cell-input cell-fecha font-mono" data-edit-input value="${esc(row.fecha)}" placeholder="DD/MM/YYYY"
              onchange="updateMyInvestorCell(${ri}, 'fecha', this.value)">
          </td>
          ${fundCells}
          ${totalCarteraCell}
          ${cantidadGanadaCell}
          <td class="py-1.5 px-2 text-center">
            <button onclick="removeMyInvestorRow(${ri})" data-edit-delete class="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 p-1 rounded transition" title="Eliminar fila">
              <i class="ph ph-trash text-xs"></i>
            </button>
          </td>
        `;
        fragment.appendChild(tr);
      });
      tbody.appendChild(fragment);

      const lastRow = getLatestFundRow();
      const lastVal = lastRow ? parseNum(lastRow.totalCartera) : 0;
      const metrics = computeFondosMetrics();
      const cumulativeGain = metrics.gain;
      const vEl = document.getElementById('statFondosTableValor');
      if (vEl) vEl.textContent = lastRow ? fmtEur(lastVal, 2) : '—';
      const gEl = document.getElementById('statFondosTableGanancia');
      if (gEl) {
        gEl.textContent = lastRow ? `${cumulativeGain >= 0 ? '+' : ''}${fmtEur(cumulativeGain, 2)}` : '—';
        gEl.className = `font-bold font-mono-num ${cumulativeGain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;
      }

      // Rentabilidad comercial = Plusvalía ÷ Capital neto comercial × 100.
      // Capital neto comercial = Valor actual − Plusvalía acumulada.
      const roiTableEl = document.getElementById('statFondosTableRoi');
      if (roiTableEl) {
        const positive = metrics.gain >= 0;
        roiTableEl.textContent = metrics.roi !== null
          ? `${positive ? '+' : ''}${fmt(metrics.roi, 2)}%`
          : '—';
        roiTableEl.className = `font-bold font-mono-num ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;
      }

      const searchInp = document.getElementById('searchFecha_fondos');
      const drp = window.dateRangePickers && window.dateRangePickers['fondos'];
      if ((searchInp && searchInp.value) || (drp && drp.getRange().start)) {
        filterFondosTableRows(searchInp ? searchInp.value : '');
      } else {
        const cnt = document.getElementById('searchCount_fondos');
        if (cnt) cnt.textContent = `${state.myinvestor.length} registros`;
      }

      updateTableEditUi('myinvestor', document.querySelector('[data-table-key="myinvestor"]'));
      saveState();
    }

    /** Actualiza una celda general de la tabla de seguimiento mensual. */
    function updateMyInvestorCell(ri, col, val) {
      if (!requireTableEdit('myinvestor')) return;
      const row = state.myinvestor[ri];
      if (!row) return;

      if (col === 'fecha') {
        row.fecha = normalizeFecha(val.trim());
      } else if (col === 'totalCartera') {
        // TOTAL CARTERA es calculado: suma de TOTAL de cada fondo.
        return;
      } else if (col === 'cantidadGanada') {
        return;
      } else {
        return;
      }

      saveState();
      renderFondosSection();
    }

    /** Actualiza una celda concreta asociada a un fondo de la cartera. */
    function updateMyInvestorFundCell(ri, encodedKey, field, val) {
      if (!requireTableEdit('myinvestor')) return;
      if (field !== 'movimiento' && field !== 'total') return;
      const row = state.myinvestor[ri];
      if (!row) return;
      const key = decodeURIComponent(encodedKey);
      ensurePortfolioFunds(row);
      if (!row.fondos[key]) row.fondos[key] = { movimiento: '', total: '' };
      row.fondos[key][field] = hasUserValue(val) ? parseNum(val) : '';
      saveState();
      renderFondosSection();
    }

    /** Añade un periodo a la tabla de seguimiento mensual de fondos. */
    function addMyInvestorRow() {
      if (!requireTableEdit('myinvestor')) return false;
      const hoy = new Date();
      const fechaStr = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;
      const row = { fecha: fechaStr, fondos: {}, totalCartera: '', cantidadGanada: '' };

      getMonitorFunds().forEach(fund => {
        row.fondos[fund.key] = { movimiento: '', total: '' };
      });
      row.totalCarteraImportado = false;
      row.cantidadGanadaImportada = false;
      row.plusvaliaComercialImportada = false;

      state.myinvestor.push(row);
      saveState();
      renderFondosSection();
      return true;
    }

    /** Elimina un periodo del histórico de fondos. */
    function removeMyInvestorRow(ri) {
      if (!requireTableEdit('myinvestor')) return;
      state.myinvestor.splice(ri, 1);
      saveState();
      renderFondosSection();
    }

    /** Dibuja la evolución temporal de la cartera de fondos. */
    function renderFondosChart() {
      // Una valoración por fecha: si hay duplicados del mismo día, conservamos el registro cronológicamente último.
      const chartRowsByDate = new Map();
      getChronologicalRows(state.myinvestor || []).forEach(({ row }) => {
        if (row?.fecha && hasPortfolioRowTotals(row)) chartRowsByDate.set(row.fecha, row);
      });
      const chartRows = Array.from(chartRowsByDate.entries())
        .sort(([dateA], [dateB]) => {
          const a = parseFinancialDate(dateA)?.getTime() ?? 0;
          const b = parseFinancialDate(dateB)?.getTime() ?? 0;
          return a - b;
        })
        .map(([, row]) => row);
      const dates = chartRows.map(row => row.fecha);
      const vals = chartRows.map(row => getComparableRowTotal(row));
      const gains = chartRows.map(row => hasUserValue(row.cantidadGanada) ? parseNum(row.cantidadGanada) : null);

      if (dates.length === 0) {
        if (charts.chartFondosEvolucion) {
          try { charts.chartFondosEvolucion.destroy(); } catch (_) { }
          delete charts.chartFondosEvolucion;
        }
        return;
      }

      const chartId = 'chartFondosEvolucion';
      const toolbarId = 'chartFondosToolbar';
      const mode = getChartMode(chartId, 'line-curve');
      const type = resolveChartType(mode);
      const tension = resolveChartTension(mode);
      const isLine = type === 'line';

      buildChart(chartId, {
        type,
        data: {
          labels: dates,
          datasets: [
            {
              label: 'Total Cartera (€)',
              data: vals,
              borderColor: '#059669',
              backgroundColor: hexRgba('#059669', isLine ? (mode === 'area' ? 0.18 : 0) : 0.8),
              fill: resolveChartFill(mode),
              tension,
              stepped: resolveChartStepped(mode),
              pointRadius: isLine ? 4 : 0,
              borderWidth: 2.5,
              borderRadius: isLine ? 0 : 4,
              yAxisID: 'y'
            },
            {
              label: 'Cantidad Ganada (€)',
              data: gains,
              borderColor: '#0284c7',
              backgroundColor: hexRgba('#0284c7', isLine ? (mode === 'area' ? 0.09 : 0) : 0.6),
              fill: resolveChartFill(mode),
              tension,
              stepped: resolveChartStepped(mode),
              pointRadius: isLine ? 3.5 : 0,
              borderWidth: 2,
              borderRadius: isLine ? 0 : 4,
              yAxisID: 'y'
            }
          ]
        },
        options: {
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 10 } } },
            tooltip: { callbacks: { label: i => `${i.dataset.label}: ${fmtEur(i.raw)}` } }
          },
          scales: {
            y: { ticks: { callback: v => `${fmt(v)} €` } }
          }
        }
      });

      addChartModeToolbar(toolbarId, chartId, renderFondosChart, ['line-curve', 'area', 'bar']);
    }

