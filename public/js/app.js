// Application entry point, navigation, unchanged Dashboard rendering and initialization.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 1000-1048) ---
    // ── NAVIGATION (ORDER: BANCA -> FONDOS -> AHORRO -> DASHBOARD) ───────────────
    // ── NAVEGACIÓN ENTRE SECCIONES ────────────────────────────────────────────────
    /** Activa la sección principal y cierra la edición de la sección anterior. */
    function switchSection(section) {
      if (section !== currentSection) disableAllTableEditModes();
      currentSection = section;
      document.querySelectorAll('.section-page').forEach(el => el.classList.remove('active'));
      const target = document.getElementById('page-' + section);
      if (target) target.classList.add('active');

      const tabColors = { banca: '#7c3aed', fondos: '#059669', ahorro: '#d97706', dashboard: '#2563eb' };

      document.querySelectorAll('.section-tab').forEach(btn => {
        const active = btn.dataset.section === section;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-current', active ? 'page' : 'false');
      });
      document.querySelectorAll('.mobile-tab').forEach(btn => {
        const active = btn.dataset.section === section;
        btn.style.color = active ? (tabColors[section] || '#7c3aed') : '#94a3b8';
        btn.setAttribute('aria-current', active ? 'page' : 'false');
      });

      onPageEnter(section);
    }

    /** Ejecuta las tareas de actualización necesarias al entrar en una sección. */
    function onPageEnter(section) {
      switch (section) {
        case 'banca':
          renderBancaSection();
          break;
        case 'fondos':
          renderFondosSection();
          break;
        case 'ahorro':
          renderAhorroSection();
          break;
        case 'dashboard':
          renderDashboardSection();
          break;
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 1. BANCA MULTITABLAS (BBVA, NORWEGIAN, CUALQUIER BANCO, CON/SIN % INTERÉS)
    // ════════════════════════════════════════════════════════════════════════════
    let draggedBancaTabId = null;


// --- Extracted responsibility (legacy source lines 4363-4652) ---
    // ── DASHBOARD: INDICADORES CONSOLIDADOS E HISTÓRICO ───────────────────────────
    /** Actualiza los indicadores consolidados y gráficas del dashboard. */
    function renderDashboardSection() {
      // ── 1. Compute Fondos metrics from fondosList / myinvestor ───────────────
      const fm = computeFondosMetrics();
      const fondosVal = fm.val;
      const fondosInv = fm.inv;
      const fondosGain = fm.gain;
      const fondosRoi = fm.roi;

      // ── 2. Compute Banca metrics from bancaTables ────────────────────────────
      const bancaTotal = getLatestBancaSaldo();
      const bancaIntereses = getAccumulatedBancaInterest();
      const bancaFinanciero = getLatestBancaFinancialTotal();

      const netWorth = bancaFinanciero + fondosVal;

      // ── 3. KPIs ───────────────────────────────────────────────────────────────
      document.getElementById('kpiNetWorth').textContent = netWorth > 0 ? fmtEur(netWorth) : '—';
      document.getElementById('kpiFondosTotal').textContent = fondosVal > 0 ? fmtEur(fondosVal) : '—';
      document.getElementById('kpiBancaTotal').textContent = bancaTotal > 0 ? fmtEur(bancaTotal) : '—';

      const gainEl = document.getElementById('kpiFondosReturn');
      const fundsLabels = getFondosMetricPresentation(fm);
      if (gainEl && (fondosVal > 0 || fondosInv !== 0)) {
        const gainText = `${fondosGain >= 0 ? '+' : ''}${fmtEur(fondosGain, 2)}`;
        const roiText = fondosRoi === null ? 'no calculable' : `${fondosRoi >= 0 ? '+' : ''}${fmt(fondosRoi, 2)}%`;
        const investedText = fmtEur(fondosInv, 2);
        gainEl.textContent = `${fundsLabels.gainLabel}: ${gainText} · ${fundsLabels.roiLabel}: ${roiText} · ${fundsLabels.basisLabel}: ${investedText}`;
        gainEl.title = fundsLabels.caution;
        gainEl.className = `text-[11px] font-semibold mt-1 block ${fondosGain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;
      } else if (gainEl) {
        gainEl.textContent = 'Sin datos suficientes de fondos';
        gainEl.removeAttribute('title');
      }

      const interestLabel = document.getElementById('kpiBancaIntereses');
      if (interestLabel) interestLabel.textContent = `Saldo de ${state.bancaTables.length} entidad${state.bancaTables.length !== 1 ? 'es' : ''}`;

      const interesesEl = document.getElementById('kpiInteresesBanca');
      if (interesesEl) interesesEl.textContent = Math.abs(bancaIntereses) > 0.0001 ? `${bancaIntereses > 0 ? '+' : ''}${fmtEur(bancaIntereses, 2)}` : '—';

      // Lectura rápida de composición patrimonial y fechas de registro.
      const contextEl = document.getElementById('dashboardFinancialContext');
      if (contextEl) {
        const bankPct = netWorth > 0 ? Math.max(0, Math.min(100, bancaFinanciero / netWorth * 100)) : 0;
        const fundsPct = netWorth > 0 ? Math.max(0, Math.min(100, fondosVal / netWorth * 100)) : 0;
        const bankLatestRows = state.bancaTables.map(bt => getLatestBankRow(bt)).filter(Boolean);
        const bankDateRows = bankLatestRows.filter(row => row.fecha).sort((a, b) => {
          const da = parseFinancialDate(a.fecha)?.getTime() ?? 0;
          const db = parseFinancialDate(b.fecha)?.getTime() ?? 0;
          return da - db;
        });
        const latestBankDate = bankDateRows.length ? bankDateRows[bankDateRows.length - 1].fecha : '';
        const latestFundsRow = getLatestFundRow();
        const bankDateText = latestBankDate || (state.bancaTables.length ? 'Fecha no registrada' : 'Sin registros');
        const fundsDateText = latestFundsRow?.fecha || (state.fondosList.length ? 'Cartera manual · sin fecha' : 'Sin registros');
        const allocationAvailable = netWorth > 0;
        contextEl.innerHTML = `
          <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm min-w-0">
            <div class="flex items-center justify-between gap-2 mb-3">
              <p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Composición del patrimonio</p>
              <i class="ph-bold ph-chart-donut text-emerald-500" aria-hidden="true"></i>
            </div>
            <div class="space-y-2.5">
              <div class="flex items-center justify-between gap-3 text-xs"><span class="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300"><span class="w-2.5 h-2.5 rounded-sm bg-violet-600"></span>Banca</span><strong class="font-mono-num text-slate-900 dark:text-white">${allocationAvailable ? `${fmt(bankPct, 1)}%` : '—'}</strong></div>
              <div class="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div class="h-full rounded-full bg-violet-600 transition-[width] duration-300" style="width:${bankPct}%"></div></div>
              <div class="flex items-center justify-between gap-3 text-xs"><span class="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300"><span class="w-2.5 h-2.5 rounded-sm bg-emerald-600"></span>Fondos indexados</span><strong class="font-mono-num text-slate-900 dark:text-white">${allocationAvailable ? `${fmt(fundsPct, 1)}%` : '—'}</strong></div>
              <div class="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div class="h-full rounded-full bg-emerald-600 transition-[width] duration-300" style="width:${fundsPct}%"></div></div>
              <div class="pt-2 mt-1 border-t border-slate-100 dark:border-slate-800 flex justify-between gap-2 text-[10px] text-slate-400"><span>Banca: ${fmtEur(bancaFinanciero)}</span><span>Fondos: ${fmtEur(fondosVal)}</span></div>
            </div>
          </div>
          <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm min-w-0">
            <div class="flex items-center justify-between gap-2 mb-3"><p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Últimos registros</p><i class="ph-bold ph-calendar-check text-blue-500" aria-hidden="true"></i></div>
            <div class="space-y-3">
              <div class="flex items-start justify-between gap-3"><span class="text-xs text-slate-500 dark:text-slate-400">Banca · registro más reciente</span><strong class="text-xs font-mono-num text-slate-800 dark:text-slate-200 text-right">${esc(bankDateText)}</strong></div>
              <div class="flex items-start justify-between gap-3"><span class="text-xs text-slate-500 dark:text-slate-400">Fondos · última cartera</span><strong class="text-xs font-mono-num text-slate-800 dark:text-slate-200 text-right">${esc(fundsDateText)}</strong></div>
              <p class="text-[10px] leading-relaxed text-slate-400">Las fechas corresponden a tus registros guardados; no son necesariamente la fecha de valoración del proveedor.</p>
            </div>
          </div>
          <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm min-w-0">
            <div class="flex items-center justify-between gap-2 mb-3"><p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Alcance del cálculo</p><i class="ph-bold ph-info text-amber-500" aria-hidden="true"></i></div>
            <p class="text-xs leading-relaxed text-slate-600 dark:text-slate-300">Patrimonio financiero registrado = últimos saldos bancarios + ganancia de cuentas remuneradas + último valor total de fondos.</p>
            <p class="text-[10px] leading-relaxed text-slate-400 mt-2">No incluye préstamos, vivienda ni activos que no hayas registrado. El histórico anual de ahorro se muestra aparte y no se suma, para evitar una posible doble contabilización.</p>
          </div>`;
      }

      // ── 4. Bank Breakdown Table (Draggable reorder) ───────────────────────────
      const breakdownCard = document.getElementById('dashBancaBreakdownCard');
      const breakdownBody = document.getElementById('dashBancaBreakdownBody');
      if (breakdownBody && state.bancaTables.length > 0) {
        if (breakdownCard) breakdownCard.classList.remove('hidden');
        breakdownBody.innerHTML = '';
        state.bancaTables.forEach(bt => {
          const rows = bt.rows || [];
          const lastRow = getLatestBankRow(bt);
          const saldo = lastRow ? parseNum(lastRow.cantidadTotal || lastRow.vl) : 0;
          const lastFecha = lastRow ? (lastRow.fecha || '—') : '—';
          const intereses = bt.hasInterest ? getBankLatestPeriodicGain(bt) : 0;
          const tr = document.createElement('tr');
          tr.setAttribute('draggable', 'true');
          tr.dataset.bankId = bt.id;
          tr.className = 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group cursor-grab';
          tr.innerHTML = `
        <td class="py-2 px-2 text-center text-slate-400 group-hover:text-purple-600 transition" title="Arrastra para reordenar esta entidad bancaria">
          <i class="ph-bold ph-dots-six-vertical text-base"></i>
        </td>
        <td class="py-2 px-3 font-bold text-slate-900 dark:text-white">${esc(bt.name)}</td>
        <td class="py-2 px-3">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${bt.hasInterest ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}">
            ${bt.hasInterest ? '🟢 Remunerada' : '⚪ Estándar'}
          </span>
        </td>
        <td class="py-2 px-3 text-slate-500 font-mono">${esc(lastFecha)}</td>
        <td class="py-2 px-3 text-right font-bold text-slate-900 dark:text-white">${saldo > 0 ? fmtEur(saldo) : '—'}</td>
        <td class="py-2 px-3 text-right font-extrabold text-emerald-600 dark:text-emerald-400">${intereses > 0 ? `+${fmtEur(intereses, 2)}` : '—'}</td>
        <td class="py-2 px-3 text-right text-slate-400">${bt.rows.length}</td>
      `;

          tr.addEventListener('dragstart', (e) => {
            window.__draggedDashBankId = bt.id;
            tr.classList.add('opacity-40');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', bt.id);
          });
          tr.addEventListener('dragend', () => {
            tr.classList.remove('opacity-40');
            breakdownBody.querySelectorAll('tr').forEach(r => r.classList.remove('bg-purple-50', 'dark:bg-purple-950/30'));
            window.__draggedDashBankId = null;
          });
          tr.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (window.__draggedDashBankId && window.__draggedDashBankId !== bt.id) {
              tr.classList.add('bg-purple-50', 'dark:bg-purple-950/30');
            }
          });
          tr.addEventListener('dragleave', () => {
            tr.classList.remove('bg-purple-50', 'dark:bg-purple-950/30');
          });
          tr.addEventListener('drop', (e) => {
            e.preventDefault();
            tr.classList.remove('bg-purple-50', 'dark:bg-purple-950/30');
            const sourceId = window.__draggedDashBankId;
            if (!sourceId || sourceId === bt.id) return;
            const fromIdx = state.bancaTables.findIndex(t => t.id === sourceId);
            const toIdx = state.bancaTables.findIndex(t => t.id === bt.id);
            if (fromIdx !== -1 && toIdx !== -1) {
              const [moved] = state.bancaTables.splice(fromIdx, 1);
              state.bancaTables.splice(toIdx, 0, moved);
              saveState();
              renderDashboardSection();
              showToast('Orden de bancos en Dashboard actualizado.', 'info');
            }
          });

          breakdownBody.appendChild(tr);
        });

        // Filter if query or date range exists
        const searchDash = document.getElementById('searchFecha_dashBanca');
        const drpDash = window.dateRangePickers && window.dateRangePickers['dashBanca'];
        if ((searchDash && searchDash.value) || (drpDash && drpDash.getRange().start)) {
          filterDashBancaRows(searchDash ? searchDash.value : '');
        } else {
          const cnt = document.getElementById('searchCount_dashBanca');
          if (cnt) cnt.textContent = `${state.bancaTables.length} entidades`;
        }
      } else {
        if (breakdownCard) breakdownCard.classList.add('hidden');
      }

      // ── 5. Donut allocation chart ─────────────────────────────────────────────
      const allocLabels = ['Fondos Indexados', 'Banca'];
      const allocData = [fondosVal, bancaFinanciero];
      const totalAlloc = fondosVal + bancaFinanciero;
      buildChart('chartGlobalAllocation', {
        type: 'doughnut',
        data: {
          labels: allocLabels,
          datasets: [{ data: totalAlloc > 0 ? allocData : [1], backgroundColor: totalAlloc > 0 ? ['#059669', '#7c3aed'] : ['rgba(148,163,184,0.3)'], borderWidth: 2, borderColor: document.documentElement.classList.contains('dark') ? '#0f172a' : '#fff' }]
        },
        options: { plugins: { legend: { display: false } }, cutout: '70%' }
      });
      const legendEl = document.getElementById('globalAllocationLegend');
      if (legendEl) {
        if (totalAlloc > 0) {
          legendEl.innerHTML = allocLabels.map((l, i) => {
            const pct = fmt(allocData[i] / totalAlloc * 100);
            return `<div class="flex items-center justify-between"><div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" style="background:${['#059669', '#7c3aed'][i]}"></span><span class="text-slate-600 dark:text-slate-400 font-medium">${esc(l)}</span></div><span class="font-mono-num font-bold text-slate-900 dark:text-white">${pct}% (${fmtEur(allocData[i])})</span></div>`;
          }).join('');
        } else {
          legendEl.innerHTML = '<p class="text-slate-400 text-center text-xs">Introduce datos en Banca y Fondos para ver la distribución.</p>';
        }
      }

      // ── 6. Global History: Patrimonio total = Banca + Fondos ─────────────────
      const parseFecha = s => { const p = String(s || '').split('/'); return new Date(+p[2], (+p[1] || 1) - 1, +p[0] || 1); };
      const globalDates = Array.from(new Set([
        ...state.bancaTables.flatMap(bt => (bt.rows || []).filter(r => r?.fecha && (hasUserValue(r.cantidadTotal) || hasUserValue(r.vl) || (bt.hasInterest && hasUserValue(r.cantidadGanada)))).map(r => r.fecha)),
        ...state.myinvestor.filter(r => r?.fecha && hasPortfolioRowTotals(r)).map(r => r.fecha)
      ])).sort((a, b) => parseFecha(a) - parseFecha(b));

      // Saldo bancario agregado por fecha con el último saldo conocido de cada entidad.
      const bancaByDate = buildBankBalanceHistoryByDate(globalDates);

      const fondosByDate = {};
      getChronologicalRows(state.myinvestor || []).forEach(({ row }) => {
        if (!row?.fecha || !hasPortfolioRowTotals(row)) return;
        fondosByDate[row.fecha] = getComparableRowTotal(row);
      });

      let lastBanca = 0;
      let lastFondos = 0;
      const bancaSeries = [];
      const fondosSeries = [];
      const totalSeries = [];
      globalDates.forEach(d => {
        if (bancaByDate[d] !== undefined) lastBanca = bancaByDate[d];
        if (fondosByDate[d] !== undefined) lastFondos = fondosByDate[d];
        bancaSeries.push(lastBanca);
        fondosSeries.push(lastFondos);
        totalSeries.push(lastBanca + lastFondos);
      });

      const modeHist = getChartMode('chartGlobalHistory', 'line-curve');
      const typeHist = resolveChartType(modeHist);
      const tensionHist = resolveChartTension(modeHist);
      const isLineHist = typeHist === 'line';

      const finalDatasets = [
        {
          label: 'Patrimonio total (€)',
          data: totalSeries,
          borderColor: '#2563eb',
          backgroundColor: hexRgba('#2563eb', isLineHist ? (modeHist === 'area' ? 0.18 : 0) : 0.72),
          fill: resolveChartFill(modeHist),
          borderWidth: 3.5,
          tension: tensionHist,
          stepped: resolveChartStepped(modeHist),
          pointRadius: 3,
          borderRadius: typeHist === 'bar' ? 4 : undefined,
          order: 0
        },
        {
          label: 'Banca (€)',
          data: bancaSeries,
          borderColor: '#7c3aed',
          backgroundColor: hexRgba('#7c3aed', isLineHist ? 0.05 : 0.4),
          fill: false,
          borderWidth: 2,
          tension: tensionHist,
          stepped: resolveChartStepped(modeHist),
          pointRadius: 2,
          borderRadius: typeHist === 'bar' ? 4 : undefined,
          order: 1
        },
        {
          label: 'Fondos (€)',
          data: fondosSeries,
          borderColor: '#059669',
          backgroundColor: hexRgba('#059669', isLineHist ? 0.05 : 0.4),
          fill: false,
          borderWidth: 2,
          tension: tensionHist,
          stepped: resolveChartStepped(modeHist),
          pointRadius: 2,
          borderRadius: typeHist === 'bar' ? 4 : undefined,
          order: 1
        }
      ];

      buildChart('chartGlobalHistory', {
        type: typeHist,
        data: { labels: globalDates, datasets: finalDatasets },
        options: {
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
            tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtEur(ctx.parsed.y, 2)}` } }
          },
          scales: { y: { ticks: { callback: v => `${fmt(v)} €` } } }
        }
      });
      addChartModeToolbar('chartGlobalHistoryHeader', 'chartGlobalHistory', renderDashboardSection, ['line-curve', 'area', 'bar']);
    }

    // ════════════════════════════════════════════════════════════════════════════
    // MOTOR UNIVERSAL: COPIAR Y PEGAR DESDE EXCEL
    // ════════════════════════════════════════════════════════════════════════════

// --- Extracted responsibility (legacy source lines 5204-5291) ---
    // ── STARTUP SPLASH / INITIAL PUPPETEER REFRESH ───────────────────────────────
    // ── ARRANQUE: PROGRESO, VERIFICACIÓN Y ACTUALIZACIÓN DE COTIZACIONES ──────────
    /** Actualiza el título y el mensaje de la pantalla de arranque. */
    function setStartupSplashMessage(title, message, isError = false) {
      const titleEl = document.getElementById('appStartupTitle');
      const msgEl = document.getElementById('appStartupMessage');
      const spinner = document.getElementById('appStartupSpinner');
      const fundEl = document.getElementById('appStartupFund');
      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      if (spinner) spinner.style.background = isError
        ? 'conic-gradient(#f43f5e var(--startup-progress), rgba(148,163,184,.16) 0)'
        : 'conic-gradient(#10b981 var(--startup-progress), rgba(148,163,184,.16) 0)';
      if (fundEl) fundEl.style.color = isError ? '#f43f5e' : '#10b981';
    }

    /** Actualiza el porcentaje, la barra y los detalles de progreso del arranque. */
    function setStartupSplashProgress(processed, total, currentFund = '', isError = false, extra = {}) {
      const safeTotal = Math.max(0, Number(total) || 0);
      const safeProcessed = Math.min(Math.max(0, Number(processed) || 0), safeTotal || Number(processed) || 0);
      const percent = safeTotal > 0 ? Math.round((safeProcessed / safeTotal) * 100) : 0;
      const deg = `${percent * 3.6}deg`;
      const splash = document.getElementById('appStartupSplash');
      const percentEl = document.getElementById('appStartupPercent');
      const barEl = document.getElementById('appStartupProgressBar');
      const countEl = document.getElementById('appStartupCount');
      const fundEl = document.getElementById('appStartupFund');
      const spinner = document.getElementById('appStartupSpinner');
      const activityEl = document.getElementById('appStartupActivityText');
      const activeEl = document.getElementById('appStartupActive');

      if (splash) splash.style.setProperty('--startup-progress', deg);
      if (percentEl) percentEl.textContent = `${percent}%`;
      if (barEl) barEl.style.width = `${percent}%`;
      if (countEl) {
        countEl.textContent = safeTotal > 0
          ? `${safeProcessed} de ${safeTotal} fondos completados · ${Math.max(0, safeTotal - safeProcessed)} pendientes`
          : 'Preparando fondos…';
      }
      if (fundEl) fundEl.textContent = currentFund ? `${isError ? '⚠ ' : '↻ '}${currentFund}` : 'Preparando actualización…';
      if (spinner) spinner.style.background = isError
        ? `conic-gradient(#f43f5e ${deg}, rgba(148,163,184,.16) 0)`
        : `conic-gradient(#10b981 ${deg}, rgba(148,163,184,.16) 0)`;
      if (activityEl && extra.activity) activityEl.textContent = extra.activity;
      if (activeEl && extra.active !== undefined) activeEl.textContent = String(extra.active);
    }

    let startupElapsedStartedAt = 0;
    let startupElapsedTimer = null;

    /** Inicia el reloj del tiempo transcurrido durante el arranque. */
    function startStartupElapsedClock() {
      if (!startupElapsedStartedAt) startupElapsedStartedAt = performance.now();
      if (startupElapsedTimer) return;

      const update = () => {
        const el = document.getElementById('appStartupElapsed');
        if (!el || !startupElapsedStartedAt) return;
        el.textContent = `${((performance.now() - startupElapsedStartedAt) / 1000).toFixed(2).replace('.', ',')} s`;
      };

      update();
      startupElapsedTimer = setInterval(update, 100);
    }

    /** Detiene el reloj y actualiza el tiempo transcurrido. */
    function stopStartupElapsedClock() {
      if (startupElapsedTimer) {
        clearInterval(startupElapsedTimer);
        startupElapsedTimer = null;
      }
      const el = document.getElementById('appStartupElapsed');
      if (el && startupElapsedStartedAt) {
        el.textContent = `${((performance.now() - startupElapsedStartedAt) / 1000).toFixed(2).replace('.', ',')} s`;
      }
    }

    /** Oculta la pantalla inicial cuando se completa la comprobación de fondos. */
    function hideStartupSplash() {
      const splash = document.getElementById('appStartupSplash');
      if (!splash) return;
      stopStartupElapsedClock();
      splash.classList.add('is-hidden');
    }

    // Arranque eficiente: no se hacen consultas de prueba que luego puedan duplicarse
    // con una actualización completa. Si la cotización guardada es reciente, se muestra
    // inmediatamente; si está anticuada, se solicita una única actualización por lotes.

// --- Extracted responsibility (legacy source lines 5421-5524) ---
    // ── INITIALIZATION ───────────────────────────────────────────────────────────
    // Punto de entrada: restaura datos y tema, enlaza controles y resuelve el arranque.
    window.addEventListener('DOMContentLoaded', async () => {
      loadTheme();
      await loadState();
      loadLiveQuotesViewMode();
      await loadLiveQuotes();
      queueMonthlyBackup();
      initAhorroControls();

      // DEFAULT SECTION: BANCA
      switchSection('banca');

      if (typeof initDateRangePicker === 'function') {
        initDateRangePicker({
          id: 'fondos',
          containerId: 'drp_fondos_container',
          onApply: () => filterFondosTableRows(),
          onClear: () => filterFondosTableRows()
        });
        initDateRangePicker({
          id: 'dashBanca',
          containerId: 'drp_dashBanca_container',
          onApply: () => filterDashBancaRows(),
          onClear: () => filterDashBancaRows()
        });
      }

      document.querySelectorAll('.section-tab, .mobile-tab').forEach(btn => {
        btn.addEventListener('click', () => switchSection(btn.dataset.section));
      });

      document.getElementById('btnOpenPasteModal')?.addEventListener('click', () => {
        openPasteModalFor(currentSection === 'banca' && state.bancaTables.length > 0 ? `banca_${state.bancaTables[0].id}` : currentSection === 'fondos' ? 'myinvestor' : 'matrizAnual');
      });
      document.getElementById('btnClearAll')?.addEventListener('click', clearAllData);
      document.getElementById('btnTheme')?.addEventListener('click', toggleTheme);
      document.getElementById('btnBackupHistory')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleBackupHistoryMenu();
      });
      document.getElementById('backupHistoryFrom')?.addEventListener('change', () => renderBackupHistory().catch(console.warn));
      document.getElementById('backupHistoryTo')?.addEventListener('change', () => renderBackupHistory().catch(console.warn));
      document.getElementById('btnBackupHistoryClearFilters')?.addEventListener('click', () => {
        const from = document.getElementById('backupHistoryFrom');
        const to = document.getElementById('backupHistoryTo');
        if (from) from.value = '';
        if (to) to.value = '';
        renderBackupHistory().catch(console.warn);
      });
      document.getElementById('btnExportSelectedBackup')?.addEventListener('click', () => exportHistoricalBackup().catch(error => showToast(error?.message || 'No se pudo exportar el backup.', 'error')));
      document.getElementById('btnDeleteAllBackups')?.addEventListener('click', () => deleteAllHistoricalBackups().catch(error => showToast(error?.message || 'No se pudo borrar el histórico.', 'error')));
      document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('btnBackupHistory')?.parentElement;
        if (wrapper && !wrapper.contains(e.target)) toggleBackupHistoryMenu(false);
      });
      const exportDropdown = document.getElementById('exportBackupDropdown');
      const exportMenu = document.getElementById('exportBackupMenu');
      const exportTrigger = document.getElementById('btnExportWS');
      const setExportMenuOpen = (isOpen) => {
        if (!exportMenu || !exportTrigger) return;
        exportMenu.hidden = !isOpen;
        exportMenu.setAttribute('aria-hidden', String(!isOpen));
        exportTrigger.setAttribute('aria-expanded', String(isOpen));
      };
      const closeExportMenu = () => setExportMenuOpen(false);
      // Es un botón real (no <summary>): iguala el estilo del botón Importar y
      // controla el menú explícitamente para evitar diferencias nativas del navegador.
      exportTrigger?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const isOpen = exportTrigger.getAttribute('aria-expanded') === 'true';
        setExportMenuOpen(!isOpen);
      });
      setExportMenuOpen(false);
      document.getElementById('btnExportWSPlain')?.addEventListener('click', async (event) => {
        event.preventDefault(); event.stopPropagation(); closeExportMenu();
        try { await exportWorkspace(); } catch (error) { showToast(error?.message || 'No se pudo exportar el backup.', 'error'); }
      });
      document.getElementById('btnExportEncryptedMenuItem')?.addEventListener('click', async (event) => {
        event.preventDefault(); event.stopPropagation(); closeExportMenu();
        try { await exportSecureWorkspace(); } catch (error) { showToast(error?.message || 'No se pudo cifrar el backup.', 'error'); }
      });
      document.addEventListener('click', (event) => { if (exportDropdown && !exportDropdown.contains(event.target)) closeExportMenu(); });
      document.getElementById('btnImportWS')?.addEventListener('click', () => document.getElementById('wsFileInput').click());
      document.getElementById('wsFileInput')?.addEventListener('change', importWorkspace);

      document.getElementById('btnExportFondosCSV')?.addEventListener('click', exportFondosCSV);
      document.getElementById('btnExportFondosXLSX')?.addEventListener('click', exportFondosXLSX);
      document.getElementById('fundChartClose')?.addEventListener('click', closeFundChart);
      document.getElementById('fundChartRefresh')?.addEventListener('click', () => { if (fundChartActiveKey) loadFundHistory(fundChartActiveKey, true, fundChartRange).catch(err => window.showFundChartError(err, 'No se pudo actualizar el histórico.')); });
      document.querySelectorAll('[data-fund-range]').forEach(btn => btn.addEventListener('click', () => {
        fundChartRange = btn.dataset.fundRange;
        document.querySelectorAll('[data-fund-range]').forEach(b => { const active = b === btn; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
        if (fundChartActiveKey) loadFundHistory(fundChartActiveKey, false, fundChartRange).catch(err => window.showFundChartError(err, 'No se pudo cargar este periodo histórico.'));
        else renderFundChart();
      }));
      document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeExportMenu(); if (document.getElementById('fundChartModal')?.classList.contains('is-open')) closeFundChart(); } });

      document.getElementById('quickAddForm')?.addEventListener('submit', handleQuickAdd);
      document.getElementById('refreshAllQuotesBtn')?.addEventListener('click', refreshAllQuotes);
      document.getElementById('liveQuotesCardsModeBtn')?.addEventListener('click', () => setLiveQuotesViewMode('cards'));
      document.getElementById('liveQuotesListModeBtn')?.addEventListener('click', () => setLiveQuotesViewMode('list'));

      document.getElementById('btnAddNewYearMatrix')?.addEventListener('click', addNewYearMatrix);

      // Comprobación inicial: el splash se mantiene visible hasta decidir si hace falta actualizar.
      // Límite de seguridad: nunca bloquear la interfaz más de 3.5s si el servidor o scraping tardan.
      const splashSafetyTimer = setTimeout(hideStartupSplash, 3500);
      const startupCheck = await checkStartupFundsUnchanged();
      if (startupCheck.unchanged) {
        clearTimeout(splashSafetyTimer);
        setStartupSplashProgress(liveQuotes.length, liveQuotes.length, '✓ Datos guardados recientes', false, {
          activity: 'Sin consultas de red redundantes; fechas originales conservadas',
          active: 0
        });
        setStartupSplashMessage(
          'Monitor listo',
          `Las ${liveQuotes.length} cotizaciones guardadas tienen menos de 30 minutos. Se evita repetir el scraping al arrancar; puedes forzar una actualización desde el botón del monitor.`
        );
        setTimeout(hideStartupSplash, 350);
      } else {
        await refreshFundsOnStartup();
        clearTimeout(splashSafetyTimer);
      }

      // La actualización histórica se hace en segundo plano, sin bloquear la app.
      setTimeout(() => autoSyncFundHistories().catch(console.warn), 60000);

      document.getElementById('confirmCancel')?.addEventListener('click', hideConfirm);
      document.getElementById('confirmOk')?.addEventListener('click', () => {
        if (pendingConfirm) pendingConfirm();
        hideConfirm();
      });

      document.addEventListener('keydown', e => {
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key.toLowerCase() === 's') {
          e.preventDefault();
          saveState();
          showToast('Guardado manualmente.', 'success');
        }
        if (e.key === 'Escape') {
          closePasteModal();
          closeAddFundModal();
          closeCreateBankTableModal();
          hideConfirm();
        }
      });
    });
  
