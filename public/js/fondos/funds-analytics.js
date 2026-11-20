// Fund performance metrics, allocation and holding analytics.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 1645-2411) ---
    // ── FONDOS INDEXADOS: MÉTRICAS Y ANÁLISIS DE CARTERA ─────────────────────────
    /** Devuelve la plusvalía importada de la última fotografía de cartera, sin sumar snapshots mensuales. */
    function getLatestImportedPortfolioGain(row) {
      if (!row) return null;
      const imported = row.cantidadGanadaImportada === true || row.plusvaliaComercialImportada === true;
      if (!imported || !hasUserValue(row.cantidadGanada)) return null;
      return parseNum(row.cantidadGanada);
    }

    /** Calcula las métricas agregadas de inversión, valoración, ganancia y rentabilidad. */
    function computeFondosMetrics() {
      // Si está disponible el motor de cálculo de rentabilidad de cartera, usarlo como fuente única de verdad
      if (typeof computePortfolioReturns === 'function') {
        const pr = computePortfolioReturns();
        if (pr && pr.valorMercadoTotal > 0) {
          return {
            val: pr.valorMercadoTotal,
            inv: pr.capitalInvertidoTotal,
            gain: pr.beneficioTotal,
            roi: pr.rentabilidadTotal,
            usedCommercialGain: true,
            method: 'commercial'
          };
        }
      }

      let val = 0;
      let inv = 0;
      let gain = 0;
      let usedCommercialGain = false;
      let method = 'none';

      const populatedRows = state.myinvestor.filter(hasPortfolioRowTotals);
      if (populatedRows.length > 0) {
        const rows = populatedRows;
        const last = getLatestFundRow() || rows[rows.length - 1];

        // Valor de mercado: suma de los valores individuales en la última fila con datos.
        // Respaldo al total histórico guardado solo si la fila no tiene desglose individual.
        val = getComparableRowTotal(last);

        // La plusvalía comercial de cada fila es una fotografía a esa fecha,
        // no una ganancia incremental que deba sumarse mes a mes. Solo usamos
        // la plusvalía importada de la misma fila que aporta la valoración actual.
        const importedGain = getLatestImportedPortfolioGain(last);
        if (importedGain !== null) {
          gain = Number(importedGain.toFixed(2));
          inv = Number((val - gain).toFixed(2));
          usedCommercialGain = true;
          method = 'commercial';
        } else {
          // Compatibilidad con la fotografía de referencia guardada en versiones anteriores.
          const ref = COMMERCIAL_REFERENCE_SNAPSHOT;
          if (Math.abs(val - ref.value) < 0.05) {
            gain = ref.gain;
            inv = ref.invested;
            usedCommercialGain = true;
            method = 'reference';
          }
        }

        // Si no existe plusvalía comercial registrada, el cálculo es una estimación
        // basada en los movimientos y puede verse afectado por traspasos internos.
        if (!usedCommercialGain) {
          inv = rows.reduce((sum, row) => sum + getPortfolioMovementTotal(row), 0);
          gain = Number((val - inv).toFixed(2));
          method = 'movements';
        }
      } else if (state.fondosList.length > 0) {
        val = state.fondosList.reduce((sum, fund) => sum + parseNum(fund.currentValue), 0);
        inv = state.fondosList.reduce((sum, fund) => sum + parseNum(fund.invested), 0);
        gain = Number((val - inv).toFixed(2));
        method = 'fundsList';
      }

      const roi = inv > 0 ? (gain / inv * 100) : null;
      return { val, inv, gain, roi, usedCommercialGain, method };
    }

    /** Etiquetas y cautelas metodológicas para no presentar estimaciones como cifras exactas. */
    function getFondosMetricPresentation(metrics) {
      const method = metrics?.method || 'none';
      if (method === 'commercial') {
        return {
          basisLabel: 'INVERTIDO',
          basisSub: 'Capital de adquisición asociado a posiciones actuales.',
          gainLabel: 'BENEFICIO / PÉRDIDA',
          gainSub: 'Diferencia absoluta respecto al capital invertido.',
          roiLabel: 'RENTABILIDAD',
          roiSub: 'Rendimiento total ponderado por capital invertido.',
          guideSub: 'Cálculo automático según la metodología MyInvestor: valor de mercado total menos capital invertido total. Rentabilidad ponderada por el capital de cada posición.',
          caution: 'Rentabilidad calculada ponderada por el capital invertido en cada posición.'
        };
      }
      if (method === 'reference') {
        return {
          basisLabel: 'Capital de referencia',
          basisSub: 'Snapshot histórico migrado; confirma que sigue vigente.',
          gainLabel: 'Plusvalía de referencia',
          gainSub: 'Dato histórico de migración, no una cotización actual confirmada.',
          roiLabel: 'ROI de referencia · no anualizado',
          roiSub: 'Porcentaje simple del snapshot; no equivale a una TIR anualizada.',
          guideSub: 'Se ha usado una referencia histórica migrada porque el valor de la cartera coincide con esa fotografía guardada. Confirma que corresponde a la misma fecha y cartera antes de tomar decisiones.',
          caution: 'Métrica calculada desde una referencia histórica migrada. Verifica fecha y alcance de la cartera; el ROI es simple, no anualizado, y no equivale a la TIR/XIRR.'
        };
      }
      if (method === 'fundsList') {
        return {
          basisLabel: 'Capital aportado registrado',
          basisSub: 'Suma del campo de capital invertido de cada fondo.',
          gainLabel: 'Ganancia / pérdida vs. aportado',
          gainSub: 'Valor actual menos capital registrado.',
          roiLabel: 'ROI simple · no anualizado',
          roiSub: 'Diferencia ÷ capital registrado × 100.',
          guideSub: 'Cálculo basado en los campos Capital invertido y Valor actual de cada fondo. Comprueba que las aportaciones estén completas y que no haya traspasos contados como dinero nuevo. El ROI no está anualizado.',
          caution: 'Estimación basada en los campos de capital invertido y valor actual. No está anualizada y depende de que el capital registrado sea completo y comparable.'
        };
      }
      if (method === 'movements') {
        return {
          basisLabel: 'Capital neto estimado',
          basisSub: 'Suma de movimientos mensuales registrados.',
          gainLabel: 'Plusvalía estimada',
          gainSub: 'Valor actual menos movimientos acumulados.',
          roiLabel: 'ROI estimado · no anualizado',
          roiSub: 'Estimación simple; los traspasos pueden distorsionarla.',
          guideSub: 'No se ha encontrado una plusvalía comercial importada. El capital se estima sumando movimientos; si estos incluyen traspasos internos, reembolsos o aportaciones omitidas, la ganancia y el ROI pueden distorsionarse. No es rentabilidad anualizada ni sustituye a la TIR/XIRR.',
          caution: 'Estimación basada en la suma de movimientos; los traspasos internos, reembolsos o aportaciones no registradas pueden distorsionar el resultado. ROI simple, no anualizado.'
        };
      }
      return {
        basisLabel: 'Capital registrado',
        basisSub: 'Introduce datos de aportaciones para calcularlo.',
        gainLabel: 'Ganancia / pérdida',
        gainSub: 'Requiere capital y valor actual.',
        roiLabel: 'ROI simple · no anualizado',
        roiSub: 'No calculable sin capital positivo.',
        guideSub: 'Registra la cartera y sus aportaciones para obtener una estimación interpretable de rentabilidad. El ROI simple no está anualizado.',
        caution: 'Todavía no hay datos suficientes para interpretar la rentabilidad.'
      };
    }


    // ════════════════════════════════════════════════════════════════════════════
    // ANÁLISIS DE FONDOS · composición sectorial/geográfica y principales posiciones
    // Datos de referencia por ISIN. El peso de MI cartera se calcula dinámicamente
    // a partir de la última fila mensual (o fondosList como respaldo).
    // ════════════════════════════════════════════════════════════════════════════
    const FUND_PROFILE_DATA = {
      'IE00BYX5MX67': {
        shortName: 'S&P 500',
        sector: {
          'Tecnología': 32.06, 'Servicios financieros': 13.66, 'Consumo cíclico': 11.52,
          'Salud': 10.47, 'Servicios de comunicación': 9.82, 'Industria': 7.41,
          'Bienes de consumo': 5.49, 'Energía': 3.21, 'Suministros': 2.54,
          'Bienes raíces': 2.07, 'Materias primas': 1.73
        },
        geography: { 'EE. UU.': 100 },
        holdings: [
          ['Apple', 6.95], ['Microsoft', 5.97], ['NVIDIA', 5.92],
          ['Amazon', 4.25], ['Meta Platforms', 2.90]
        ],
        sourceDate: '06/10/2026'
      },
      'IE0031786696': {
        shortName: 'Emerging Markets',
        sector: {
          'Tecnología': 33.50, 'Servicios financieros': 20.45, 'Consumo cíclico': 10.46,
          'Servicios de comunicación': 7.62, 'Materias primas': 7.43, 'Industria': 7.22,
          'Energía': 3.79, 'Bienes de consumo': 3.14, 'Salud': 3.07,
          'Suministros': 2.07, 'Bienes raíces': 1.25
        },
        geography: { 'Taiwán': 26.62, 'China': 21.38, 'Corea del Sur': 20.32, 'India': 11.66, 'Brasil': 4.15, 'Sudáfrica': 3.00, 'Arabia Saudí': 2.45, 'México': 1.74, 'Otros': 8.68 },
        holdings: [
          ['Taiwan Semiconductor', 13.38], ['Samsung Electronics', 6.07],
          ['Tencent', 3.62], ['SK Hynix', 3.43], ['Alibaba', 2.67]
        ],
        sourceDate: '07/10/2026'
      },
      'IE0007987690': {
        shortName: 'MSCI Europe',
        sector: {
          'Servicios financieros': 22.80, 'Industria': 19.96, 'Salud': 13.83,
          'Bienes de consumo': 9.41, 'Tecnología': 7.97, 'Consumo cíclico': 6.88,
          'Materias primas': 5.48, 'Suministros': 4.64, 'Otros': 9.03
        },
        geography: { 'Eurozona': 51.23, 'Europa ex-Euro': 23.94, 'Reino Unido': 21.25, 'EE. UU.': 2.26, 'Asia desarrollada': 0.50, 'Otros': 0.82 },
        holdings: [
          ['ASML Holding', 4.48], ['HSBC Holdings', 2.55],
          ['Roche', 2.15], ['Novartis', 2.00], ['Nestlé', 1.80]
        ],
        sourceDate: '14/09/2026'
      },
      'IE0007281425': {
        shortName: 'Vanguard Japan',
        sector: {
          'Industria': 23.11, 'Tecnología': 20.95, 'Servicios financieros': 19.21,
          'Consumo cíclico': 11.69, 'Servicios de comunicación': 9.35, 'Salud': 5.42,
          'Bienes de consumo': 3.55, 'Materias primas': 3.02, 'Bienes raíces': 1.77,
          'Suministros': 0.99, 'Energía': 0.95
        },
        geography: { 'Japón': 100 },
        holdings: [
          ['Mitsubishi UFJ Financial', 4.60], ['Toyota Motor', 3.50],
          ['Tokyo Electron', 3.00], ['Sumitomo Mitsui Financial', 2.99],
          ['Advantest', 2.87]
        ],
        sourceDate: '31/07/2026'
      },
      'IE00B4468526': {
        shortName: 'Polar Global Technology',
        sector: {
          'Tecnología': 85.65, 'Industria': 7.43, 'Servicios de comunicación': 5.10,
          'Servicios financieros': 0.80, 'Salud': 0.54, 'Consumo cíclico': 0.48
        },
        geography: { 'EE. UU.': 69.19, 'Taiwán': 13.71, 'Corea del Sur': 4.46, 'Japón': 4.22, 'Países Bajos': 1.75, 'Canadá': 1.54, 'China': 1.42, 'Alemania': 1.15, 'Otros': 2.56 },
        holdings: [
          ['NVIDIA', 7.57], ['AMD', 4.75], ['Taiwan Semiconductor', 4.59],
          ['Micron Technology', 3.80], ['SanDisk', 3.51]
        ],
        sourceDate: '30/06/2026'
      }
    };

    const FUND_CHART_COLORS = ['#059669', '#2563eb', '#7c3aed', '#d97706', '#e11d48', '#0891b2', '#65a30d', '#9333ea', '#dc2626', '#0f766e', '#c2410c', '#be123c', '#1d4ed8', '#7e22ce', '#15803d', '#a16207'];

    /** Obtiene el perfil descriptivo de un fondo a partir de sus datos de cotización. */
    function getFundProfile(quote) {
      return FUND_PROFILE_DATA[quote?.isin] || null;
    }

    /** Prepara los datos más recientes para distribuir la cartera por fondo. */
    function getLatestFondosAllocationData() {
      const funds = getMonitorFunds();
      if (!funds.length || !state.myinvestor.length) {
        return { rows: [], totalCartera: 0 };
      }

      // La referencia correcta es SIEMPRE la última fila de la tabla mensual:
      // (TOTAL del fondo × 100) / TOTAL CARTERA.
      const latest = getLatestFundRow();
      if (!latest) return { rows: [], totalCartera: 0 };
      ensurePortfolioFunds(latest);
      const totalCartera = parseNum(latest.totalCartera);

      const rows = funds.map(f => ({
        key: f.key,
        name: f.name,
        value: parseNum(latest.fondos?.[f.key]?.total)
      })).filter(x => x.value > 0);

      return { rows, totalCartera, latest };
    }

    /** Pinta la distribución de la cartera entre los fondos registrados. */
    function renderFondosAllocationChart() {
      const chartId = 'chartFondosAllocation';
      const canvas = document.getElementById(chartId);
      const legend = document.getElementById('fondosAllocationLegend');
      const totalEl = document.getElementById('fondosAllocationTotal');
      const centerValue = document.getElementById('fondosAllocationCenterValue');
      const formulaEl = document.getElementById('fondosAllocationFormula');
      if (!canvas) return;

      const { rows, totalCartera } = getLatestFondosAllocationData();

      if (charts[chartId]) {
        try { charts[chartId].destroy(); } catch (_) { }
        delete charts[chartId];
      }

      if (centerValue) centerValue.textContent = '—';

      if (!rows.length || totalCartera <= 0) {
        if (legend) legend.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Necesitas una última fila con TOTAL CARTERA y TOTAL por fondo.</p>';
        if (totalEl) totalEl.textContent = 'Sin datos';
        if (formulaEl) formulaEl.textContent = 'Fórmula: (TOTAL del fondo × 100) / TOTAL CARTERA.';
        return;
      }

      const allocation = rows.map((x, i) => ({
        ...x,
        pct: (x.value * 100) / totalCartera,
        color: FUND_CHART_COLORS[i % FUND_CHART_COLORS.length]
      }));
      const fundValueTotal = rows.reduce((s, x) => s + x.value, 0);
      const restValue = Math.max(totalCartera - fundValueTotal, 0);
      const restPct = restValue > 0 ? (restValue * 100) / totalCartera : 0;
      if (restPct > 0.01) {
        allocation.push({
          key: '__rest__',
          name: 'Sin asignar',
          value: restValue,
          pct: restPct,
          color: '#94a3b8',
          isRest: true
        });
      }

      if (totalEl) totalEl.textContent = `TOTAL CARTERA: ${fmtEur(totalCartera)}`;
      if (centerValue) centerValue.textContent = fmtEur(totalCartera);

      buildChart(chartId, {
        type: 'doughnut',
        data: {
          labels: allocation.map(x => x.name),
          datasets: [{
            data: allocation.map(x => x.pct),
            backgroundColor: allocation.map(x => x.color),
            borderColor: document.documentElement.classList.contains('dark') ? '#131d31' : '#ffffff',
            borderWidth: 2,
            hoverOffset: 4
          }]
        },
        options: {
          cutout: '66%',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const row = allocation[ctx.dataIndex];
                  return ` ${fmt(row.pct, 2)}% · ${fmtEur(row.value)}`;
                }
              }
            }
          }
        }
      });

      if (legend) {
        legend.innerHTML = allocation.map(x => `
          <div class="flex items-center justify-between gap-3 py-1">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-2.5 h-2.5 rounded-sm flex-shrink-0" style="background:${x.color}"></span>
              <span class="text-[12px] leading-snug font-semibold text-slate-700 dark:text-slate-200 whitespace-normal break-words">${esc(x.name)}</span>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <span class="text-[11px] text-slate-500 dark:text-slate-400 font-mono-num">${fmtEur(x.value)}</span>
              <span class="min-w-[56px] text-right text-[11px] font-extrabold font-mono-num text-slate-900 dark:text-white">${fmt(x.pct, 2)}%</span>
            </div>
          </div>`).join('');
      }

      if (formulaEl) {
        const warning = fundValueTotal > totalCartera + 0.01
          ? ' · Aviso: los TOTAL por fondo superan TOTAL CARTERA.'
          : '';
        formulaEl.textContent = `Cada porcentaje = (TOTAL del fondo × 100) / TOTAL CARTERA.${warning}`;
      }
    }

    /** Pinta la exposición sectorial ponderada de la cartera. */
    function renderFondosSectorChart() {
      const chartId = 'chartFondosSectores';
      const canvas = document.getElementById(chartId);
      if (!canvas) return;

      const filterEl = document.getElementById('fondosSectorFundFilter');
      const emptyEl = document.getElementById('fondosSectorEmpty');
      const emptyTitle = document.getElementById('fondosSectorEmptyTitle');
      const emptyText = document.getElementById('fondosSectorEmptyText');
      const noteEl = document.getElementById('fondosSectorDataNote');
      const subtitleEl = document.getElementById('fondosSectorSubtitle');
      const totalValueEl = document.getElementById('fondosSectorTotalValue');
      const coverageLabelEl = document.getElementById('fondosSectorCoverageLabel');
      const coverageEl = document.getElementById('fondosSectorCoverage');
      const coverageSubEl = document.getElementById('fondosSectorCoverageSub');
      const topEl = document.getElementById('fondosSectorTop');
      const topPctEl = document.getElementById('fondosSectorTopPct');
      const previousSelection = filterEl?.value || '__portfolio__';

      if (charts[chartId]) {
        try { charts[chartId].destroy(); } catch (_) { }
        delete charts[chartId];
      }
      canvas.classList.remove('hidden');
      if (emptyEl) {
        emptyEl.classList.add('hidden');
        emptyEl.classList.remove('flex');
      }

      const profiles = liveQuotes
        .map((q, index) => ({ q, p: getFundProfile(q), index }))
        .filter(x => x.p);

      // Única fuente de importes y denominador: la misma que usa «¿DÓNDE ESTÁ MI DINERO?».
      const allocationData = getLatestFondosAllocationData();
      const allocationRows = Array.isArray(allocationData.rows) ? allocationData.rows : [];
      const totalPortfolio = Math.max(0, parseNum(allocationData.totalCartera));
      const allocationByKey = new Map(allocationRows.map(row => [row.key, Math.max(0, parseNum(row.value))]));
      const portfolioHasValues = totalPortfolio > 0 && allocationRows.length > 0;

      const profileRows = profiles.map(({ q, p, index }) => {
        const key = q.isin || q.url || q.fundName || `monitor_fund_${index}`;
        const value = allocationByKey.get(key) || 0;
        const entries = Object.entries(p.sector || {})
          .map(([sector, rawPct]) => [sector, Math.max(0, Number(rawPct) || 0)])
          .filter(([, pct]) => pct > 0);
        const sumPct = entries.reduce((sum, [, pct]) => sum + pct, 0);
        return { q, p, key, value, entries, sumPct };
      });

      if (filterEl) {
        const options = [
          '<option value="__portfolio__">Toda la cartera · distribución 100%</option>',
          ...profileRows.map(row => {
            const weight = portfolioHasValues ? (row.value / totalPortfolio) * 100 : null;
            const weightLabel = weight == null ? 'peso no disponible' : `${fmt(weight, 2)}% de cartera`;
            return `<option value="${esc(row.q.isin || '')}">${esc(row.p.shortName)} · ${esc(weightLabel)}</option>`;
          })
        ];
        filterEl.innerHTML = options.join('');
        filterEl.value = profileRows.some(row => row.q.isin === previousSelection) ? previousSelection : '__portfolio__';
        filterEl.onchange = () => renderFondosSectorChart();
      }

      if (!profiles.length) {
        canvas.classList.add('hidden');
        if (emptyEl) { emptyEl.classList.remove('hidden'); emptyEl.classList.add('flex'); }
        if (emptyTitle) emptyTitle.textContent = 'No hay perfiles sectoriales disponibles';
        if (emptyText) emptyText.textContent = 'Añade al monitor un fondo con perfil sectorial compatible para visualizar su distribución.';
        if (noteEl) noteEl.textContent = 'Los porcentajes sectoriales son datos de referencia asociados al ISIN del fondo.';
        if (totalValueEl) totalValueEl.textContent = '—';
        if (coverageLabelEl) coverageLabelEl.textContent = 'Distribución total de cartera';
        if (coverageEl) coverageEl.textContent = '—';
        if (coverageSubEl) coverageSubEl.textContent = 'Sin desglose disponible';
        if (topEl) topEl.textContent = '—';
        if (topPctEl) topPctEl.textContent = '—';
        return;
      }

      const selectedIsin = filterEl?.value || '__portfolio__';
      const isPortfolioView = selectedIsin === '__portfolio__';
      const selectedFund = isPortfolioView ? null : profileRows.find(row => String(row.q.isin || '') === selectedIsin);
      let items = [];
      let sectorCoveragePct = 0;
      let coveredValue = 0;
      let distributionComplete = false;
      let selectedFundPortfolioPct = null;

      if (isPortfolioView) {
        if (!portfolioHasValues) {
          canvas.classList.add('hidden');
          if (emptyEl) { emptyEl.classList.remove('hidden'); emptyEl.classList.add('flex'); }
          if (emptyTitle) emptyTitle.textContent = 'Faltan valores por fondo';
          if (emptyText) emptyText.textContent = 'Para que los porcentajes coincidan con «¿DÓNDE ESTÁ MI DINERO?», completa TOTAL CARTERA y el TOTAL de cada fondo en la última fila mensual.';
          if (subtitleEl) subtitleEl.textContent = 'La distribución sectorial usa los mismos importes y el mismo total que el gráfico de distribución de cartera.';
          if (noteEl) noteEl.textContent = 'Cuando existan importes válidos, los sectores más el importe sin desglose representarán el 100% de la cartera.';
          if (totalValueEl) totalValueEl.textContent = 'Sin datos';
          if (coverageLabelEl) coverageLabelEl.textContent = 'Distribución total de cartera';
          if (coverageEl) coverageEl.textContent = '—';
          if (coverageSubEl) coverageSubEl.textContent = 'Faltan importes actuales';
          if (topEl) topEl.textContent = '—';
          if (topPctEl) topPctEl.textContent = 'Completa los totales mensuales';
          return;
        }

        const sectorAmounts = Object.create(null);
        profileRows.forEach(row => {
          if (row.value <= 0 || row.sumPct <= 0) return;

          const knownPct = Math.min(row.sumPct, 100);
          coveredValue += row.value * knownPct / 100;
          row.entries.forEach(([sector, rawPct]) => {
            const effectivePct = row.sumPct > 100 ? (rawPct / row.sumPct) * 100 : rawPct;
            sectorAmounts[sector] = (sectorAmounts[sector] || 0) + row.value * effectivePct / 100;
          });
        });

        // El resto incluye fondos sin perfil y partes del fondo sin desglose sectorial.
        // Se calcula a partir de la suma de sectores para asegurar que la distribución cierre al 100%.
        let knownSectorAmount = Object.values(sectorAmounts).reduce((sum, amount) => sum + amount, 0);
        if (knownSectorAmount > totalPortfolio && knownSectorAmount > 0) {
          // Protección ante datos inconsistentes: conservamos las proporciones entre sectores,
          // pero la suma visible de la cartera no puede superar el 100%.
          const factor = totalPortfolio / knownSectorAmount;
          Object.keys(sectorAmounts).forEach(sector => { sectorAmounts[sector] *= factor; });
          knownSectorAmount = totalPortfolio;
        }
        const unclassifiedValue = Math.max(0, totalPortfolio - knownSectorAmount);
        if (unclassifiedValue > 0.005) sectorAmounts['Sin datos sectoriales'] = unclassifiedValue;

        items = Object.entries(sectorAmounts).map(([sector, amount]) => ({
          sector,
          amount,
          pct: totalPortfolio > 0 ? (amount / totalPortfolio) * 100 : 0,
          color: sector === 'Sin datos sectoriales' ? '#94a3b8' : null
        }));
        sectorCoveragePct = Math.min(100, (coveredValue / totalPortfolio) * 100);
        distributionComplete = true;
      } else if (selectedFund) {
        const knownPct = Math.min(selectedFund.sumPct, 100);
        const normalizedEntries = selectedFund.entries.map(([sector, rawPct]) => {
          const effectivePct = selectedFund.sumPct > 100 ? (rawPct / selectedFund.sumPct) * 100 : rawPct;
          return {
            sector,
            amount: selectedFund.value > 0 ? selectedFund.value * effectivePct / 100 : null,
            pct: effectivePct,
            color: null
          };
        });
        items = normalizedEntries;
        const missingPct = Math.max(0, 100 - knownPct);
        if (missingPct > 0.005) {
          items.push({
            sector: 'Sin desglose sectorial',
            amount: selectedFund.value > 0 ? selectedFund.value * missingPct / 100 : null,
            pct: missingPct,
            color: '#94a3b8'
          });
        }
        sectorCoveragePct = knownPct;
        selectedFundPortfolioPct = portfolioHasValues ? (selectedFund.value / totalPortfolio) * 100 : null;
        distributionComplete = true;
      }

      const allSectors = new Set();
      profileRows.forEach(row => row.entries.forEach(([sector]) => allSectors.add(sector)));
      const stableSectors = [...allSectors].sort((a, b) => a.localeCompare(b, 'es'));
      const colorsBySector = Object.create(null);
      stableSectors.forEach((sector, index) => {
        colorsBySector[sector] = FUND_CHART_COLORS[index % FUND_CHART_COLORS.length];
      });
      items.forEach(item => { if (!item.color) item.color = colorsBySector[item.sector] || '#64748b'; });
      items.sort((a, b) => b.pct - a.pct);

      if (!items.length) {
        canvas.classList.add('hidden');
        if (emptyEl) { emptyEl.classList.remove('hidden'); emptyEl.classList.add('flex'); }
        if (emptyTitle) emptyTitle.textContent = 'No hay datos sectoriales';
        if (emptyText) emptyText.textContent = 'No se ha encontrado una distribución sectorial válida para esta selección. Comprueba el ISIN y la disponibilidad de los datos de referencia.';
        return;
      }

      const top = items.find(item => !['Sin datos sectoriales', 'Sin desglose sectorial'].includes(item.sector)) || items[0];
      if (totalValueEl) totalValueEl.textContent = isPortfolioView ? fmtEur(totalPortfolio) : (selectedFund.value > 0 ? fmtEur(selectedFund.value) : 'Valor no registrado');
      if (coverageLabelEl) coverageLabelEl.textContent = isPortfolioView ? 'Distribución total de cartera' : 'Peso del fondo en cartera';
      if (coverageEl) coverageEl.textContent = isPortfolioView ? '100,00%' : (selectedFundPortfolioPct == null ? '—' : `${fmt(selectedFundPortfolioPct, 2)}%`);
      if (coverageSubEl) coverageSubEl.textContent = isPortfolioView
        ? 'Sectores identificados + importe sin desglose'
        : `Mismo porcentaje que «¿Dónde está mi dinero?» · Fuente: ${selectedFund.p.sourceDate || 'fecha no indicada'}`;
      if (topEl) topEl.textContent = top.sector;
      if (topPctEl) topPctEl.textContent = `${fmt(top.pct, 2)}% ${isPortfolioView ? 'de la cartera' : 'del fondo'}`;
      if (subtitleEl) subtitleEl.textContent = isPortfolioView
        ? 'Cada sector se pondera por el valor real del fondo. La suma de sectores y cantidades sin desglose representa el 100% de la cartera.'
        : `Composición sectorial dentro de ${selectedFund.p.shortName}. El peso del fondo sobre la cartera completa se muestra arriba y coincide con «¿Dónde está mi dinero?».`;

      if (noteEl) {
        if (isPortfolioView) {
          const displayedTotal = items.reduce((sum, item) => sum + item.pct, 0);
          noteEl.textContent = `Cálculo: exposición sectorial = suma de (valor de cada fondo × porcentaje sectorial). Cada porcentaje se divide por ${fmtEur(totalPortfolio)} —el mismo TOTAL usado en «¿Dónde está mi dinero?»—. La distribución mostrada suma ${fmt(displayedTotal, 2)}%; «Sin datos sectoriales» incluye fondos sin perfil o partes no desglosadas. ${sectorCoveragePct < 99.995 ? `Cobertura con desglose sectorial identificado: ${fmt(sectorCoveragePct, 2)}%.` : 'Todo el valor tiene desglose sectorial identificado.'}`;
        } else {
          noteEl.textContent = `Datos sectoriales de referencia: ${selectedFund.p.sourceDate || 'fecha no indicada'}. Las barras muestran el porcentaje dentro del fondo y, si la fuente no detalla el 100%, se añade «Sin desglose sectorial». El peso de este fondo en la cartera completa es ${selectedFundPortfolioPct == null ? 'no disponible' : `${fmt(selectedFundPortfolioPct, 2)}%`}, igual que en «¿Dónde está mi dinero?».`;
        }
      }

      const maxPct = Math.max(...items.map(x => x.pct), 0);
      const axisMax = Math.min(100, Math.max(10, Math.ceil((maxPct * 1.24) / 5) * 5));
      const currentColors = chartColors();
      const sectorLabelsPlugin = {
        id: 'fondosSectorValueLabels',
        afterDatasetsDraw(chart) {
          const meta = chart.getDatasetMeta(0);
          const ctx = chart.ctx;
          ctx.save();
          ctx.font = '700 10px Inter, sans-serif';
          ctx.fillStyle = currentColors.text;
          ctx.textBaseline = 'middle';
          meta.data.forEach((bar, index) => {
            const item = items[index];
            if (!item) return;
            const label = `${fmt(item.pct, 1)}%`;
            const x = Math.min(bar.x + 7, chart.chartArea.right - 2);
            ctx.textAlign = x >= chart.chartArea.right - 3 ? 'right' : 'left';
            ctx.fillText(label, x, bar.y);
          });
          ctx.restore();
        }
      };

      buildChart(chartId, {
        type: 'bar',
        data: {
          labels: items.map(item => item.sector),
          datasets: [{
            label: isPortfolioView ? 'Peso sobre toda la cartera' : `Peso dentro de ${selectedFund.p.shortName}`,
            data: items.map(item => item.pct),
            backgroundColor: items.map(item => item.color),
            hoverBackgroundColor: items.map(item => item.color),
            borderColor: items.map(item => item.color),
            borderWidth: 0,
            borderRadius: 6,
            borderSkipped: false,
            barThickness: items.length > 13 ? 15 : 20,
            maxBarThickness: 24,
            categoryPercentage: 0.8,
            barPercentage: 0.86
          }]
        },
        plugins: [sectorLabelsPlugin],
        options: {
          indexAxis: 'y',
          interaction: { mode: 'nearest', axis: 'y', intersect: false },
          layout: { padding: { top: 4, right: 34, bottom: 4, left: 2 } },
          scales: {
            x: {
              beginAtZero: true,
              max: axisMax,
              title: { display: true, text: 'Porcentaje (%)', color: currentColors.text, font: { size: 10, weight: '600' } },
              ticks: { font: { size: 9 }, stepSize: Math.max(1, Math.ceil(axisMax / 5)), callback: value => `${fmt(value, 0)}%` },
              grid: { color: currentColors.grid, drawBorder: false }
            },
            y: {
              grid: { display: false, drawBorder: false },
              ticks: { font: { size: 10, weight: '600' }, padding: 7, autoSkip: false }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              mode: 'nearest',
              intersect: false,
              displayColors: false,
              callbacks: {
                title: contexts => contexts?.length ? contexts[0].label : '',
                label: context => {
                  const item = items[context.dataIndex];
                  if (!item) return '';
                  const scope = isPortfolioView ? 'Peso sobre toda la cartera' : 'Peso dentro del fondo';
                  return [`${scope}: ${fmt(item.pct, 2)}%`, `Exposición estimada: ${item.amount == null ? 'importe no disponible' : fmtEur(item.amount, 2)}`];
                },
                afterBody: () => isPortfolioView
                  ? []
                  : [`Fuente sectorial: ${selectedFund.p.sourceDate || 'referencia sin fecha'}`]
              }
            }
          }
        }
      });
    }

    /** Muestra las principales posiciones de los fondos analizados. */
    function renderFondosTopHoldings() {
      const root = document.getElementById('fondosTopHoldingsGrid');
      if (!root) return;

      const profiles = liveQuotes.map(q => ({ q, p: getFundProfile(q) })).filter(x => x.p);
      if (!profiles.length) {
        root.innerHTML = '<p class="text-xs text-slate-400 md:col-span-2 xl:col-span-5 text-center py-6">No hay perfiles de fondos disponibles.</p>';
        return;
      }

      root.innerHTML = profiles.map(({ q, p }, idx) => {
        const fundColor = FUND_CHART_COLORS[idx % FUND_CHART_COLORS.length];
        const maxHolding = Math.max(...p.holdings.map(h => Number(h[1]) || 0), 1);
        return `
          <div class="fund-badge-card p-3 space-y-2.5">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-sm flex-shrink-0" style="background:${fundColor}"></span>
              <div class="min-w-0">
                <div class="text-[11px] font-extrabold text-slate-900 dark:text-white truncate">${esc(p.shortName)}</div>
                <div class="text-[9px] text-slate-400 font-mono">${esc(q.isin || '')}</div>
              </div>
            </div>
            <div class="space-y-2">
              ${p.holdings.map((h, i) => {
          const pct = Number(h[1]) || 0;
          const barPct = Math.max(4, (pct / maxHolding) * 100);
          return `
                  <div class="space-y-1">
                    <div class="flex items-center justify-between gap-2 text-[10px]">
                      <span class="text-slate-500 dark:text-slate-400 truncate"><span class="font-mono text-slate-400 mr-1">${i + 1}.</span>${esc(h[0])}</span>
                      <span class="font-bold font-mono-num text-slate-900 dark:text-white flex-shrink-0">${fmt(pct, 2)}%</span>
                    </div>
                    <div class="h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div class="h-full rounded-full" style="width:${barPct}%; background:${fundColor}"></div>
                    </div>
                  </div>`;
        }).join('')}
            </div>
            <div class="pt-2 border-t border-slate-100 dark:border-slate-800 text-[9px] text-slate-400">
              Datos de referencia: ${esc(p.sourceDate)}
            </div>
          </div>`;
      }).join('');
    }

    /** Actualiza los componentes de análisis de la cartera de fondos. */
    function renderFondosAnalytics() {
      renderFondosAllocationChart();
      renderFondosSectorChart();
      renderFondosTopHoldings();
    }

    /** Explica visualmente las fórmulas de rentabilidad usadas en el resumen. */
    function renderFondosCalculationGuide(metrics) {
      const m = metrics || computeFondosMetrics();
      const labels = getFondosMetricPresentation(m);
      const isPositive = m.gain >= 0;
      const valueEl = document.getElementById('fondosGuideValue');
      const gainEl = document.getElementById('fondosGuideGain');
      const investedEl = document.getElementById('fondosGuideInvested');
      const roiEl = document.getElementById('fondosGuideRoi');
      const formulaEl = document.getElementById('fondosGuideFormula');
      const guideSub = document.getElementById('fondosCalculationGuideSubtitle');
      if (valueEl) valueEl.textContent = m.val > 0 ? fmtEur(m.val, 2) : '—';
      if (gainEl) {
        gainEl.textContent = m.val > 0 ? `${m.gain >= 0 ? '+' : ''}${fmtEur(m.gain, 2)}` : '—';
        gainEl.className = `mt-1.5 text-xl font-extrabold font-mono-num ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;
      }
      if (investedEl) investedEl.textContent = m.inv > 0 ? fmtEur(m.inv, 2) : '—';
      if (roiEl) {
        roiEl.textContent = m.roi !== null ? `${isPositive ? '+' : ''}${fmt(m.roi, 2)}%` : '—';
        roiEl.className = `mt-1.5 text-xl font-extrabold font-mono-num ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;
        roiEl.title = labels.caution;
      }
      const gainLabel = document.getElementById('fondosGuideGainLabel');
      const gainSub = document.getElementById('fondosGuideGainSub');
      const investedLabel = document.getElementById('fondosGuideInvestedLabel');
      const investedSub = document.getElementById('fondosGuideInvestedSub');
      const roiLabel = document.getElementById('fondosGuideRoiLabel');
      if (gainLabel) gainLabel.textContent = `2 · ${labels.gainLabel}`;
      if (gainSub) gainSub.textContent = labels.gainSub;
      if (investedLabel) investedLabel.textContent = `3 · ${labels.basisLabel}`;
      if (investedSub) investedSub.textContent = labels.basisSub;
      if (roiLabel) roiLabel.textContent = `4 · ${labels.roiLabel}`;
      if (guideSub) guideSub.textContent = labels.guideSub;
      if (formulaEl) {
        formulaEl.textContent = m.roi !== null && m.inv > 0
          ? `${fmtEur(m.gain, 2)} ÷ ${fmtEur(m.inv, 2)} × 100 = ${m.gain >= 0 ? '+' : ''}${fmt(m.roi, 2)}% · no anualizado`
          : labels.roiSub;
      }
    }

    /** Actualiza la sección de fondos indexados y sus indicadores. */
    function renderFondosSection() {
      // 1. KPIs y explicación transparente del método de cálculo utilizado.
      const m = computeFondosMetrics();
      const labels = getFondosMetricPresentation(m);
      const isPos = m.gain >= 0;
      renderFondosCalculationGuide(m);

      const labelMap = {
        statFondosInvestedLabel: labels.basisLabel,
        statFondosInvestedSub: labels.basisSub,
        statFondosTotalGainSub: labels.gainSub,
        statFondosRoiLabel: labels.roiLabel,
        statFondosRoiSub: labels.roiSub,
        statFondosTableGainLabel: `${labels.gainLabel}:`
      };
      Object.entries(labelMap).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      });

      const statInv = document.getElementById('statFondosTotalInvested');
      if (statInv) statInv.textContent = m.inv > 0 ? fmtEur(m.inv, 2) : '—';

      const statVal = document.getElementById('statFondosTotalValue');
      if (statVal) statVal.textContent = m.val > 0 ? fmtEur(m.val) : '—';

      const statGain = document.getElementById('statFondosTotalGain');
      if (statGain) {
        statGain.textContent = m.val > 0 ? `${m.gain >= 0 ? '+' : ''}${fmtEur(m.gain)}` : '—';
        statGain.className = `text-2xl font-extrabold font-mono-num ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;
      }

      const statRoi = document.getElementById('statFondosTotalRoi');
      if (statRoi) {
        statRoi.textContent = m.roi !== null ? `${isPos ? '+' : ''}${fmt(m.roi, 2)}%` : '—';
        statRoi.className = `text-2xl font-extrabold font-mono-num ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;
        statRoi.title = labels.caution;
      }

      // 2. Render sub-components.
      renderLiveQuotes();
      renderMyInvestorTable();
      renderFondosChart();
      renderFondosAnalytics();
      // 3. Rentabilidad de cartera: KPIs globales + desglose individual por fondo.
      if (typeof renderPortfolioReturnsPanel === 'function') renderPortfolioReturnsPanel();
    }

