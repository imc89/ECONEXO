// Bank table rendering, editing, ordering and account charts.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 885-999) ---
    // ── CANTIDAD GANADA CHART (cuentas remuneradas) ───────────────────────────────
    /** Genera la gráfica de ganancias periódicas de una cuenta bancaria. */
    function renderGanadaChart(bt) {
      const chartId = `chartGanada_${bt.id}`;
      const toolbarId = `chartGanadaToolbar_${bt.id}`;
      const rows = bt.rows || [];
      if (!rows.length) return;

      const mode = getChartMode(chartId, 'line-curve'); // default: line-curve
      const type = resolveChartType(mode);
      const tension = resolveChartTension(mode);
      const isLine = type === 'line';

      const labels = rows.map(r => r.fecha || '');
      const orderedRows = getChronologicalRows(rows);
      const data = rows.map((r, rowIndex) => {
        const orderedIndex = orderedRows.findIndex(x => x.index === rowIndex);
        if (!hasUserValue(r.cantidadGanada) && !hasUserValue(r.cantidadTotal)) return null;
        return orderedIndex >= 0 ? getBankRowGainValue(bt, orderedIndex) : null;
      });

      const dataset = isLine ? {
        label: 'Cantidad Ganada (€)',
        data,
        borderColor: '#10b981',
        backgroundColor: mode === 'area' ? 'rgba(16,185,129,0.20)' : 'rgba(16,185,129,0)',
        fill: resolveChartFill(mode),
        tension,
        stepped: resolveChartStepped(mode),
        pointRadius: 3,
        borderWidth: 2
      } : {
        label: 'Cantidad Ganada (€)',
        data,
        backgroundColor: data.map(v => v >= 0 ? 'rgba(16,185,129,0.75)' : 'rgba(239,68,68,0.75)'),
        borderColor: data.map(v => v >= 0 ? 'rgba(16,185,129,1)' : 'rgba(239,68,68,1)'),
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false,
      };

      buildChart(chartId, {
        type,
        data: { labels, datasets: [dataset] },
        options: {
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ' ' + fmtEur(ctx.parsed.y, 2) } }
          },
          scales: {
            x: { ticks: { font: { size: 10 }, maxRotation: 45 } },
            y: { ticks: { font: { size: 10 }, callback: v => fmtEur(v) } }
          }
        }
      });

      // Orden: curva (predeterminada), diagrama de área, barras
      addChartModeToolbar(toolbarId, chartId, () => renderGanadaChart(bt), ['line-curve', 'area', 'bar']);
    }

    // ── CANTIDAD TOTAL CHART (cuentas estándar) ───────────────────────────────────
    /** Genera la gráfica de evolución del saldo total de una cuenta bancaria. */
    function renderTotalChart(bt) {
      const chartId = `chartGanada_${bt.id}`;
      const toolbarId = `chartGanadaToolbar_${bt.id}`;
      const rows = (bt.rows || []).filter(r => parseNum(r.cantidadTotal || r.vl) !== 0);
      if (!rows.length) return;

      const mode = getChartMode(chartId, 'line-curve'); // default: line-curve
      const type = resolveChartType(mode);
      const tension = resolveChartTension(mode);
      const isLine = type === 'line';

      const labels = rows.map(r => r.fecha || '');
      const data = rows.map(r => parseNum(r.cantidadTotal || r.vl));

      const dataset = isLine ? {
        label: 'Cantidad Total (€)',
        data,
        borderColor: '#7c3aed',
        backgroundColor: mode === 'area' ? 'rgba(124,58,237,0.18)' : 'rgba(124,58,237,0)',
        fill: resolveChartFill(mode),
        tension,
        stepped: resolveChartStepped(mode),
        pointRadius: 3,
        borderWidth: 2
      } : {
        label: 'Cantidad Total (€)',
        data,
        backgroundColor: 'rgba(124,58,237,0.70)',
        borderColor: 'rgba(124,58,237,1)',
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false,
      };

      buildChart(chartId, {
        type,
        data: { labels, datasets: [dataset] },
        options: {
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ' ' + fmtEur(ctx.parsed.y, 2) } }
          },
          scales: {
            x: { ticks: { font: { size: 10 }, maxRotation: 45 } },
            y: { ticks: { font: { size: 10 }, callback: v => fmtEur(v) } }
          }
        }
      });

      // Orden: curva (predeterminada), diagrama de área, barras
      addChartModeToolbar(toolbarId, chartId, () => renderTotalChart(bt), ['line-curve', 'area', 'bar']);
    }


// --- Extracted responsibility (legacy source lines 1049-1644) ---
    // ── BANCA: ORDENACIÓN, RENDERIZADO Y EDICIÓN DE CUENTAS ──────────────────────
    /** Mueve una cuenta bancaria a una nueva posición conservando el orden global. */
    function reorderBancaTables(sourceId, targetId) {
      if (!sourceId || !targetId || sourceId === targetId) return false;
      const fromIdx = state.bancaTables.findIndex(t => t.id === sourceId);
      const toIdx = state.bancaTables.findIndex(t => t.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return false;

      const [moved] = state.bancaTables.splice(fromIdx, 1);
      state.bancaTables.splice(toIdx, 0, moved);
      saveState();
      renderBancaSection();
      showToast('Orden de cuentas actualizado.', 'info');
      return true;
    }

    /** Pinta las pestañas de cuentas bancarias que permiten navegar y reordenar. */
    function renderBancaAccountTabs() {
      const wrap = document.getElementById('bancaAccountTabs');
      const list = document.getElementById('bancaAccountTabsList');
      if (!wrap || !list) return;

      list.innerHTML = '';
      if (!state.bancaTables.length) {
        wrap.classList.add('hidden');
        return;
      }
      wrap.classList.remove('hidden');

      state.bancaTables.forEach((bt, index) => {
        const rows = getChronologicalRows(bt.rows || []);
        const lastEntry = rows.length ? rows[rows.length - 1] : null;
        const lastRow = lastEntry ? lastEntry.row : null;
        const saldo = lastRow ? parseNum(lastRow.cantidadTotal || lastRow.vl) : 0;

        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'banca-account-tab';
        tab.draggable = true;
        tab.dataset.bankId = bt.id;
        tab.title = 'Arrastra para cambiar el orden · Pulsa para ir a la cuenta';
        tab.setAttribute('aria-label', `Cuenta ${index + 1}: ${bt.name}. Arrastra para reordenar.`);
        tab.innerHTML = `
          <i class="ph-bold ph-dots-six-vertical banca-account-tab-grip" aria-hidden="true"></i>
          <span class="banca-account-tab-dot" style="background:${bt.hasInterest ? '#10b981' : '#7c3aed'}"></span>
          <span>${esc(bt.name)}</span>
          <span class="banca-account-tab-balance">${fmtEur(saldo)}</span>
        `;

        tab.addEventListener('click', (e) => {
          if (tab.dataset.justDropped === '1') {
            delete tab.dataset.justDropped;
            return;
          }
          document.querySelector(`#bancaTablesContainer [data-bank-id="${CSS.escape(bt.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        tab.addEventListener('dragstart', (e) => {
          draggedBancaTabId = bt.id;
          tab.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', bt.id);
        });

        tab.addEventListener('dragend', () => {
          tab.classList.remove('dragging');
          list.querySelectorAll('.banca-account-tab').forEach(t => t.classList.remove('drag-over'));
          draggedBancaTabId = null;
        });

        tab.addEventListener('dragover', (e) => {
          if (!draggedBancaTabId || draggedBancaTabId === bt.id) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          tab.classList.add('drag-over');
        });

        tab.addEventListener('dragleave', () => tab.classList.remove('drag-over'));

        tab.addEventListener('drop', (e) => {
          e.preventDefault();
          tab.classList.remove('drag-over');
          const sourceId = draggedBancaTabId || e.dataTransfer.getData('text/plain');
          if (sourceId && sourceId !== bt.id) {
            tab.dataset.justDropped = '1';
            reorderBancaTables(sourceId, bt.id);
          }
        });

        list.appendChild(tab);
      });
    }

    /** Renderiza la sección bancaria y sus tarjetas de cuentas dinámicas. */
    function renderBancaSection() {
      const container = document.getElementById('bancaTablesContainer');
      const empty = document.getElementById('bancaEmptyState');
      if (!container) return;
      container.innerHTML = '';

      let totalGlobal = 0;
      let standardTotalGlobal = 0;
      let interestTotalGlobal = 0;
      let totalGanado = 0;
      let bestInterest = 0;

      if (state.bancaTables.length === 0) {
        const tabsList = document.getElementById('bancaAccountTabsList');
        if (tabsList) tabsList.innerHTML = '';
        const tabsWrap = document.getElementById('bancaAccountTabs');
        if (tabsWrap) tabsWrap.classList.add('hidden');
        if (empty) empty.classList.remove('hidden');
        document.getElementById('statBancaTotalGlobal').textContent = '—';
        document.getElementById('statBancaTotalGanado').textContent = '—';
        document.getElementById('statBancaCount').textContent = '0';
        document.getElementById('statBancaBestInterest').textContent = '—';
        return;
      }
      if (empty) empty.classList.add('hidden');

      renderBancaAccountTabs();

      document.getElementById('statBancaCount').textContent = `${state.bancaTables.length}`;

      state.bancaTables.forEach((bt, bIndex) => {
        const tableId = `bancaTable_${bt.id}`;
        const chartId = `chartBanca_${bt.id}`;

        // Compute bank metrics using the latest dated row, not blindly the last
        // physical row of the array.
        const rows = bt.rows || [];
        const orderedRows = getChronologicalRows(rows);
        const lastEntry = orderedRows.length ? orderedRows[orderedRows.length - 1] : null;
        const lastRow = lastEntry ? lastEntry.row : null;
        const lastCantidadTotal = lastRow ? parseNum(lastRow.cantidadTotal || lastRow.vl) : 0;
        const lastCantidadGanada = bt.hasInterest && lastEntry ? getBankRowGainValue(bt, orderedRows.length - 1) : 0;
        const lastInterest = bt.hasInterest && lastRow ? parseNum(lastRow.interes) : null;
        const saldoActual = lastCantidadTotal;

        // TOTAL EN TODOS LOS BANCOS = suma de los saldos actuales.
        // Nunca se vuelve a sumar CANTIDAD GANADA sobre CANTIDAD TOTAL.
        if (bt.hasInterest) {
          interestTotalGlobal += lastCantidadTotal;
        } else {
          standardTotalGlobal += lastCantidadTotal;
        }
        totalGlobal = standardTotalGlobal + interestTotalGlobal;

        // Ganancia actual = interés/ganancia generado en la última fila.
        const gananciaActual = lastCantidadGanada;

        // Total ganado = suma histórica de las ganancias por periodo de las cuentas remuneradas.
        if (bt.hasInterest) {
          totalGanado += getBankLatestPeriodicGain(bt);
          if (lastInterest !== null && lastInterest > bestInterest) bestInterest = lastInterest;
        }

        // Card for this bank table
        const card = document.createElement('div');
        card.className = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden space-y-4 transition-all table-readonly';
        card.setAttribute('draggable', 'true');
        card.dataset.bankId = bt.id;
        card.dataset.tableKey = `banca_${bt.id}`;

        // Header of the bank card
        card.innerHTML = `
      <div class="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30">
        <div class="flex items-center gap-3">
          <div class="cursor-grab active:cursor-grabbing text-slate-400 hover:text-purple-600 transition p-1" title="Arrastra para reordenar esta cuenta bancaria">
            <i class="ph-bold ph-dots-six-vertical text-xl"></i>
          </div>
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs ${bt.hasInterest ? 'bg-gradient-to-tr from-emerald-600 to-teal-600' : 'bg-gradient-to-tr from-purple-600 to-indigo-600'}">
            <i class="ph-bold ${bt.hasInterest ? 'ph-percent' : 'ph-bank'} text-xl"></i>
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="text-base font-extrabold text-slate-900 dark:text-white uppercase tracking-wider" id="title_${bt.id}">${esc(bt.name)}</h3>
              <button onclick="editBankName('${bt.id}')" data-edit-rename class="text-slate-400 hover:text-purple-600 p-0.5" title="Editar nombre">
                <i class="ph ph-pencil-simple text-xs"></i>
              </button>
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${bt.hasInterest ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}">
                ${bt.hasInterest
            ? `🟢 ${lastInterest !== null ? new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(lastInterest) + '%' : 'Remunerada'} de Interés`
            : '⚪ Cuenta Estándar'}
              </span>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">
              Saldo actual: <span class="font-bold font-mono-num text-slate-900 dark:text-white">${fmtEur(saldoActual)}</span>
              ${bt.hasInterest ? ` &middot; Ganancia actual: <span class="font-bold font-mono-num text-emerald-600 dark:text-emerald-400">+${fmtEur(gananciaActual)}</span>` : ''}
              &middot; ${rows.length} registros
            </p>
          </div>
        </div>

        <div class="flex items-center gap-1.5 flex-wrap">
          <button type="button" data-edit-toggle class="table-edit-toggle inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition" onclick="toggleTableEditMode('banca_${bt.id}', this)" aria-pressed="false" title="Activar edición">
            <i class="ph-bold ph-pencil-simple edit-toggle-icon" aria-hidden="true"></i><span class="edit-toggle-label">Editar</span>
          </button>
          <button onclick="addBankTableRow('${bt.id}')" data-edit-add-row disabled aria-disabled="true" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 shadow-sm transition flex items-center gap-1">
            <i class="ph-bold ph-plus text-xs"></i><span>Añadir Fila</span>
          </button>
          <button onclick="openPasteModalForBankTable('${bt.id}')" data-edit-action class="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center gap-1" title="Pegar desde Excel directamente en esta tabla">
            <i class="ph-bold ph-clipboard text-xs text-purple-500"></i><span>Pegar Excel</span>
          </button>
          <button onclick="copyTableToClipboard('${tableId}')" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center gap-1">
            <i class="ph ph-copy text-xs text-slate-400"></i><span>Copiar</span>
          </button>
          <button onclick="deleteBankTable('${bt.id}')" data-edit-action class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition" title="Eliminar toda la tabla">
            <i class="ph ph-trash text-sm"></i>
          </button>
        </div>
      </div>

      <!-- BARRA DE BÚSQUEDA POR FECHA -->
      <div class="px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 flex-1 max-w-sm sm:max-w-md">
          <div class="relative flex-1">
            <i class="ph ph-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input type="text" id="searchFecha_${bt.id}" placeholder="Buscar por fecha (ej. 2025, 01/2025)..."
              class="w-full pl-8 pr-3 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 transition"
              oninput="filterBankTableRows('${bt.id}', this.value)">
          </div>
          <div id="drp_bank_${bt.id}_container"></div>
        </div>
        <span class="text-[11px] text-slate-400 font-mono" id="searchCount_${bt.id}">${rows.length} registros</span>
      </div>

      <!-- SPREADSHEET TABLE FOR THIS BANK -->
      <div class="overflow-x-auto max-h-[460px] px-1">
        <table id="${tableId}" class="excel-table w-full text-xs border-collapse">
          <thead>
            ${bt.hasInterest ? `
              <!-- TABLE WITH INTEREST % (IDENTICAL TO USER NORWEGIAN SCREENSHOT) -->
              <tr class="table-sticky-header border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold text-[11px]">
                <th class="py-2.5 px-3 text-left min-w-[110px] w-[110px]">FECHA</th>
                <th class="py-2.5 px-3 text-right min-w-[120px]">TRANSFERENCIA</th>
                <th class="py-2.5 px-3 text-right min-w-[140px] font-extrabold text-slate-900 dark:text-white">CANTIDAD TOTAL</th>
                <th class="py-2.5 px-3 text-right min-w-[110px] font-extrabold">INTERÉS</th>
                <th class="py-2.5 px-3 text-right min-w-[130px] font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20">CANTIDAD GANADA<br><span class="text-[9px] font-normal">por periodo</span></th>
                <th class="py-2.5 px-2 w-8"></th>
              </tr>
            ` : `
              <!-- STANDARD OPERATIVE TABLE WITHOUT INTEREST (BBVA STYLE) -->
              <tr class="table-sticky-header border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold text-[11px]">
                <th class="py-2.5 px-3 text-left min-w-[110px] w-[110px]">FECHA</th>
                <th class="py-2.5 px-3 text-right min-w-[120px]">TRANSFERENCIAS</th>
                <th class="py-2.5 px-3 text-right min-w-[130px]">VALOR LIQUIDATIVO</th>
                <th class="py-2.5 px-3 text-right min-w-[130px] font-extrabold text-purple-700 dark:text-purple-300 bg-purple-50/50 dark:bg-purple-950/20">CANTIDAD TOTAL</th>
                <th class="py-2.5 px-3 text-right min-w-[110px] text-blue-600 dark:text-blue-400">DIF. MENSUAL</th>
                <th class="py-2.5 px-2 w-8"></th>
              </tr>
            `}
          </thead>
          <tbody id="tbody_${bt.id}" class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono-num text-[11.5px]"></tbody>
        </table>
      </div>

      <div id="empty_${bt.id}" class="${rows.length > 0 ? 'hidden' : ''} text-center py-6 text-slate-400 text-xs">
        Sin filas registradas. Pulsa "+ Añadir Fila" o "Pegar Excel" para comenzar.
      </div>

      <!-- FOOTER -->
      <div class="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span class="text-[11px] text-slate-400">Copia y pega celdas con Ctrl+V</span>
        <button onclick="addBankTableRow('${bt.id}')" data-edit-add-row disabled aria-disabled="true" class="text-purple-600 dark:text-purple-400 hover:underline font-semibold text-xs flex items-center gap-1">
          <i class="ph-bold ph-plus text-xs"></i> Añadir fila a ${esc(bt.name)}
        </button>
      </div>

      <!-- CHART (all tables: CANTIDAD GANADA for interest, CANTIDAD TOTAL for standard) -->
      <div class="px-4 pb-4">
        <div class="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-xl p-3 space-y-2">
          <div class="flex items-center justify-between" id="chartGanadaToolbar_${bt.id}">
            <div class="flex items-center gap-1.5">
              <i class="ph-bold ph-trend-up ${bt.hasInterest ? 'text-emerald-500' : 'text-purple-500'} text-xs"></i>
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">${bt.hasInterest ? 'CANTIDAD GANADA por periodo · editable' : 'CANTIDAD TOTAL por periodo'}</span>
            </div>
          </div>
          <div class="relative" style="height: 130px;">
            <canvas id="chartGanada_${bt.id}"></canvas>
          </div>
        </div>
      </div>
    `;

        // Card drag & drop handlers for reordering
        card.addEventListener('dragstart', (e) => {
          if (e.target.closest('input, textarea, select, button, .excel-table')) {
            e.preventDefault();
            return;
          }
          window.__draggedBankId = bt.id;
          card.classList.add('opacity-40');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', bt.id);
        });
        card.addEventListener('dragend', () => {
          card.classList.remove('opacity-40');
          container.querySelectorAll('[data-bank-id]').forEach(c => c.classList.remove('ring-2', 'ring-purple-500'));
          window.__draggedBankId = null;
        });
        card.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (window.__draggedBankId && window.__draggedBankId !== bt.id) {
            card.classList.add('ring-2', 'ring-purple-500');
          }
        });
        card.addEventListener('dragleave', () => {
          card.classList.remove('ring-2', 'ring-purple-500');
        });
        card.addEventListener('drop', (e) => {
          e.preventDefault();
          card.classList.remove('ring-2', 'ring-purple-500');
          const sourceId = window.__draggedBankId;
          if (!sourceId || sourceId === bt.id) return;
          const fromIdx = state.bancaTables.findIndex(t => t.id === sourceId);
          const toIdx = state.bancaTables.findIndex(t => t.id === bt.id);
          if (fromIdx !== -1 && toIdx !== -1) {
            reorderBancaTables(sourceId, bt.id);
          }
        });

        container.appendChild(card);

        // Render rows
        renderBankTableRows(bt);
        updateTableEditUi(`banca_${bt.id}`, card);

        // Render chart for every table
        if (rows.length > 0) {
          if (bt.hasInterest) {
            renderGanadaChart(bt);
          } else {
            renderTotalChart(bt);
          }
        }
      });

      document.getElementById('statBancaTotalGlobal').textContent = totalGlobal > 0 ? fmtEur(totalGlobal) : '—';
      document.getElementById('statBancaTotalGanado').textContent = totalGanado > 0 ? `+${fmtEur(totalGanado, 2)}` : '—';
      document.getElementById('statBancaBestInterest').textContent = bestInterest > 0 ? `${fmt(bestInterest, 2)}%` : '—';
    }

    /** Construye las filas editables de la tabla bancaria seleccionada. */
    function renderBankTableRows(bt) {
      const tbody = document.getElementById(`tbody_${bt.id}`);
      if (!tbody) return;
      tbody.innerHTML = '';

      let prevTotal = 0;
      let prevInterest = null;
      let prevYear = null;
      // Se calcula una sola vez: antes se recalculaba y recorría toda la tabla
      // en cada fila de bancos remunerados. El resultado es idéntico.
      const orderedRows = bt.hasInterest ? getChronologicalRows(bt.rows) : null;
      const fragment = document.createDocumentFragment();

      bt.rows.forEach((row, ri) => {
        // Normaliza fechas almacenadas sin padding (ej: "5/1/2025" → "05/01/2025").
        if (row.fecha) row.fecha = normalizeFecha(row.fecha);

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group';

        // Check year transition (like red line in Norwegian screenshot between 2024 and 2025)
        const currentYear = getTableYear(row.fecha);
        if (prevYear && currentYear && prevYear !== currentYear) {
          tr.classList.add('year-separator-tr');
        }
        if (currentYear) prevYear = currentYear;

        if (bt.hasInterest) {
          // ── RENDERING FOR REMUNERATED BANK (NORWEGIAN STYLE) ──
          const transf = parseNum(row.transferencia);
          const total = parseNum(row.cantidadTotal);
          const intNum = parseNum(row.interes);
          const orderedIndex = orderedRows.findIndex(x => x.index === ri);
          const ganada = orderedIndex >= 0 ? getBankRowGainValue(bt, orderedIndex) : 0;

          // Color coding for interest changes (matching screenshot: red when it drops, green when it goes up!)
          let intColorClass = 'text-slate-800 dark:text-slate-200';
          let intBgClass = '';
          const hasInterestValue = hasUserValue(row.interes);
          if (hasInterestValue && prevInterest !== null && ri > 0) {
            if (intNum < prevInterest) {
              intColorClass = 'text-rose-700 dark:text-rose-300 font-extrabold';
              intBgClass = 'bg-rose-100/80 dark:bg-[rgb(255_0_0_/_65%)] rounded px-1.5 py-0.5';
            } else if (intNum > prevInterest) {
              intColorClass = 'text-emerald-700 dark:text-emerald-300 font-extrabold';
              intBgClass = 'bg-emerald-100/80 dark:bg-[rgb(12_173_41_/_65%)] rounded px-1.5 py-0.5';
            }
          }
          if (hasInterestValue) prevInterest = intNum;

          tr.innerHTML = `
        <td class="py-1.5 px-3">
          <input type="text" class="cell-input" data-edit-input value="${esc(row.fecha || '')}" placeholder="DD/MM/YYYY" onchange="updateBankRowCell('${bt.id}', ${ri}, 'fecha', this.value)">
        </td>
        <td class="py-1.5 px-3 text-right">
          <input type="text" class="cell-input text-right" data-edit-input value="${hasUserValue(row.transferencia) ? fmt(transf) : ''}" placeholder="—" onchange="updateBankRowCell('${bt.id}', ${ri}, 'transferencia', this.value)">
        </td>
        <td class="py-1.5 px-3 text-right font-bold">
          <input type="text" class="cell-input text-right font-bold text-slate-900 dark:text-white" data-edit-input value="${hasUserValue(row.cantidadTotal) ? fmt(total) : ''}" placeholder="—" onchange="updateBankRowCell('${bt.id}', ${ri}, 'cantidadTotal', this.value)">
        </td>
        <td class="py-1.5 px-3 text-right font-bold">
          <span class="${intBgClass}">
            <input type="text" class="w-16 text-right font-mono-num font-bold cell-input p-0.5 ${intColorClass}" data-edit-input value="${hasInterestValue ? fmt(intNum, 2) + ' %' : ''}" placeholder="—" onchange="updateBankRowCell('${bt.id}', ${ri}, 'interes', this.value)">
          </span>
        </td>
        <td class="py-1.5 px-3 text-right font-extrabold bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300" title="Cantidad ganada de este periodo; editable con el modo Editar activado">
          <input type="text" class="cell-input text-right font-extrabold ${ganada >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'redFont'}" data-edit-input value="${hasUserValue(row.cantidadGanada) ? fmt(ganada) : ''}" placeholder="—" onchange="updateBankRowCell('${bt.id}', ${ri}, 'cantidadGanada', this.value)">
        </td>
        <td class="py-1.5 px-2 text-center">
          <button onclick="removeBankRow('${bt.id}', ${ri})" data-edit-delete class="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 p-1 rounded transition" title="Eliminar fila">
            <i class="ph ph-trash text-xs"></i>
          </button>
        </td>
      `;
        } else {
          // ── RENDERING FOR STANDARD BANK (BBVA STYLE) ──
          const transf = parseNum(row.transferencias);
          const vl = parseNum(row.vl);
          const totalSource = hasUserValue(row.cantidadTotal) ? row.cantidadTotal : row.vl;
          const total = parseNum(totalSource);
          const hasTotalValue = hasUserValue(row.cantidadTotal) || hasUserValue(row.vl);
          const diff = hasTotalValue
            ? (ri > 0 ? (total - prevTotal) : parseNum(row.diffMensual || 0))
            : null;
          if (hasTotalValue) {
            prevTotal = total;
            bt.rows[ri].diffMensual = diff;
          } else {
            delete bt.rows[ri].diffMensual;
          }

          tr.innerHTML = `
        <td class="py-1.5 px-3">
          <input type="text" class="cell-input" data-edit-input value="${esc(row.fecha || '')}" placeholder="DD/MM/YYYY" onchange="updateBankRowCell('${bt.id}', ${ri}, 'fecha', this.value)">
        </td>
        <td class="py-1.5 px-3 text-right">
          <input type="text" class="cell-input text-right" data-edit-input value="${hasUserValue(row.transferencias) ? fmt(transf) : ''}" placeholder="—" onchange="updateBankRowCell('${bt.id}', ${ri}, 'transferencias', this.value)">
        </td>
        <td class="py-1.5 px-3 text-right">
          <input type="text" class="cell-input text-right" data-edit-input value="${hasUserValue(row.vl) ? fmt(vl) : ''}" placeholder="—" onchange="updateBankRowCell('${bt.id}', ${ri}, 'vl', this.value)">
        </td>
        <td class="py-1.5 px-3 text-right font-extrabold bg-purple-50/30 dark:bg-purple-950/20 text-purple-700 dark:text-purple-300">
          <input type="text" class="cell-input text-right font-bold text-purple-600 dark:text-purple-400" data-edit-input value="${hasUserValue(row.cantidadTotal) ? fmt(parseNum(row.cantidadTotal)) : ''}" placeholder="—" onchange="updateBankRowCell('${bt.id}', ${ri}, 'cantidadTotal', this.value)">
        </td>
        <td class="py-1.5 px-3 text-right font-semibold ${diff === null ? 'text-slate-400' : diff >= 0 ? 'text-blue-600 dark:text-blue-400' : 'redFont'} table-calculated-cell" title="Calculado automáticamente: variación respecto a la fila anterior">
          ${diff === null ? '' : `${diff >= 0 ? '+' : ''}${fmtEur(diff)}`} <span data-calculated-indicator class="table-calculated-badge hidden"><i class="ph ph-lock-key text-[8px]"></i>Calculado</span>
        </td>
        <td class="py-1.5 px-2 text-center">
          <button onclick="removeBankRow('${bt.id}', ${ri})" data-edit-delete class="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 p-1 rounded transition" title="Eliminar fila">
            <i class="ph ph-trash text-xs"></i>
          </button>
        </td>
      `;
        }

        fragment.appendChild(tr);
      });
      tbody.appendChild(fragment);

      if (typeof initDateRangePicker === 'function') {
        initDateRangePicker({
          id: `bank_${bt.id}`,
          containerId: `drp_bank_${bt.id}_container`,
          onApply: () => filterBankTableRows(bt.id),
          onClear: () => filterBankTableRows(bt.id)
        });
        const searchBankInp = document.getElementById(`searchFecha_${bt.id}`);
        const drp = window.dateRangePickers && window.dateRangePickers[`bank_${bt.id}`];
        if ((searchBankInp && searchBankInp.value) || (drp && drp.getRange().start)) {
          filterBankTableRows(bt.id);
        }
      }
    }

    /** Valida y actualiza una celda de una fila bancaria. */
    function updateBankRowCell(btId, ri, col, val) {
      if (!requireTableEdit(`banca_${btId}`)) return;
      const bt = state.bancaTables.find(t => t.id === btId);
      if (!bt || !bt.rows[ri]) return;

      if (col === 'fecha') {
        bt.rows[ri][col] = normalizeFecha(val.trim());
      } else {
        bt.rows[ri][col] = hasUserValue(val) ? parseNum(val) : '';
        if (col === 'cantidadGanada') bt.rows[ri].cantidadGanadaManual = true;
      }
      saveState();
      renderBancaSection();
    }

    /** Añade una nueva fila al histórico de la cuenta bancaria. */
    function addBankTableRow(btId) {
      if (!requireTableEdit(`banca_${btId}`)) return;
      const bt = state.bancaTables.find(t => t.id === btId);
      if (!bt) return;

      const hoy = new Date();
      const fechaStr = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;

      if (bt.hasInterest) {
        bt.rows.push({
          fecha: fechaStr,
          transferencia: '',
          cantidadTotal: '',
          interes: '',
          cantidadGanada: ''
        });
      } else {
        bt.rows.push({
          fecha: fechaStr,
          transferencias: '',
          vl: '',
          cantidadTotal: '',
          diffMensual: ''
        });
      }

      saveState();
      renderBancaSection();
    }

    /** Elimina una fila bancaria tras aplicar las reglas de la tabla. */
    function removeBankRow(btId, ri) {
      if (!requireTableEdit(`banca_${btId}`)) return;
      const bt = state.bancaTables.find(t => t.id === btId);
      if (!bt) return;
      bt.rows.splice(ri, 1);
      saveState();
      renderBancaSection();
    }

    /** Permite modificar el nombre visible de una entidad bancaria. */
    function editBankName(btId) {
      if (!requireTableEdit(`banca_${btId}`)) return;
      const bt = state.bancaTables.find(t => t.id === btId);
      if (!bt) return;
      const nuevoNombre = prompt('Introduce el nuevo nombre para esta entidad bancaria:', bt.name);
      if (nuevoNombre && nuevoNombre.trim()) {
        bt.name = nuevoNombre.trim();
        saveState();
        renderBancaSection();
        showToast(`Nombre actualizado a "${bt.name}".`, 'success');
      }
    }

    /** Elimina una cuenta bancaria y sus datos asociados tras confirmación. */
    function deleteBankTable(btId) {
      const bt = state.bancaTables.find(t => t.id === btId);
      if (!bt) return;
      showConfirm({
        title: `¿Eliminar tabla de ${bt.name}?`,
        msg: `Se eliminará toda la tabla bancaria de "${bt.name}" y sus ${bt.rows.length} registros.`,
        onOk: () => {
          if (window.dateRangePickers && window.dateRangePickers[`bank_${btId}`]) {
            delete window.dateRangePickers[`bank_${btId}`];
          }
          state.bancaTables = state.bancaTables.filter(t => t.id !== btId);
          saveState();
          renderBancaSection();
          showToast(`Tabla de ${bt.name} eliminada.`, 'info');
        }
      });
    }

    // ── MODAL: CREAR NUEVA TABLA BANCARIA ────────────────────────────────────────
    /** Abre el formulario para crear una cuenta bancaria. */
    function openCreateBankTableModal() {
      const m = document.getElementById('modalCreateBankTable');
      m.classList.remove('hidden');
      m.style.display = 'flex';
      const input = document.getElementById('bankTableNameInput');
      input.value = '';
      setTimeout(() => input.focus(), 60);
    }

    /** Cierra el formulario de creación de cuenta bancaria. */
    function closeCreateBankTableModal() {
      const m = document.getElementById('modalCreateBankTable');
      m.classList.add('hidden');
      m.style.display = 'none';
    }

    document.getElementById('formCreateBankTable')?.addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('bankTableNameInput').value.trim();
      const hasInterest = document.querySelector('input[name="bankInterestOption"]:checked')?.value === 'true';

      if (!name) return;

      const newTable = {
        id: uid('bt'),
        name,
        hasInterest,
        rows: []
      };

      state.bancaTables.push(newTable);
      saveState();
      closeCreateBankTableModal();
      renderBancaSection();
      showToast(`Cuenta "${name}" creada con éxito.`, 'success');
    });

    // ════════════════════════════════════════════════════════════════════════════
    // 2. FONDOS INDEXADOS (MONITOR DE MERCADO & SEGUIMIENTO MENSUAL SIMPLE)
    // ════════════════════════════════════════════════════════════════════════════
    // Referencia comercial facilitada por la cuenta real, usada como migración
    // puntual para el histórico antiguo cuando todavía no existe una plusvalía
    // comercial importada en las filas.
    const COMMERCIAL_REFERENCE_SNAPSHOT = {
      value: 20353.22,
      invested: 19528.80,
      gain: 824.42,
      roi: 4.22
    };

