// Portfolio returns: individual fund profitability and total portfolio indicators.
// Follows the financial management methodology used by MyInvestor.
// Compatibility note: classic script; functions available globally.
'use strict';

/**
 * Estructura base vacía para la cartera cuando aún no hay registros introducidos.
 * Por seguridad y privacidad, no se precargan datos reales ni de demostración.
 */
const PORTFOLIO_REFERENCE_DATA = Object.freeze({
  valorMercadoTotal: 0,
  capitalInvertidoTotal: 0,
  beneficioTotal: 0,
  rentabilidadTotal: 0,
  fondos: Object.freeze([])
});

/**
 * Busca datos de referencia para un fondo a partir de su ISIN, nombre o clave.
 */
function findPortfolioReferenceFund(key, isin, name) {
  return null;
}

/**
 * CÁLCULO FINANCIERO DINÁMICO DE LA CARTERA DE FONDOS
 *
 * Implementa las reglas financieras de MyInvestor:
 * 1. Para cada fondo:
 *    - Si se tiene valorMercado y beneficioPerdida:
 *      capitalInvertido = valorMercado - beneficioPerdida
 *    - Si se tiene valorMercado y capitalInvertido:
 *      beneficioPerdida = valorMercado - capitalInvertido
 *    - rentabilidadFondo = (beneficioPerdida / capitalInvertido) * 100 (si capitalInvertido > 0)
 *
 * 2. Indicadores generales de cartera:
 *    - valorMercadoTotal = SUMA(valorMercado de cada fondo)
 *    - capitalInvertidoTotal = SUMA(capitalInvertido de cada fondo)
 *    - beneficioTotal = valorMercadoTotal - capitalInvertidoTotal
 *    - rentabilidadTotal = (beneficioTotal / capitalInvertidoTotal) * 100
 *
 * NOTA: La rentabilidad total se calcula utilizando el capital invertido total
 * como denominador (rentabilidad ponderada), NUNCA mediante la media ni suma de
 * porcentajes individuales.
 */
function computePortfolioReturns() {
  const monitorFunds = typeof getMonitorFunds === 'function' ? getMonitorFunds() : [];
  const latestRow = typeof getLatestFundRow === 'function' ? getLatestFundRow() : null;

  let computedFunds = [];

  // ── Caso A: Hay fila mensual con importes registrados por fondo ─────────
  if (latestRow && hasPortfolioRowTotals(latestRow)) {
    if (typeof ensurePortfolioFunds === 'function') ensurePortfolioFunds(latestRow);

    computedFunds = monitorFunds.map(fund => {
      const rawTotal = latestRow.fondos?.[fund.key]?.total;
      const valorMercado = hasUserValue(rawTotal) ? parseNum(rawTotal) : 0;

      const liveQuote = (typeof liveQuotes !== 'undefined' && Array.isArray(liveQuotes))
        ? liveQuotes.find(q => q.isin === fund.key || q.url === fund.key || q.fundName === fund.key)
        : null;
      const isin = liveQuote?.isin || (String(fund.key).match(/^[A-Z]{2}[A-Z0-9]{10}$/) ? fund.key : '');
      const ref = findPortfolioReferenceFund(fund.key, isin, fund.name);

      let beneficioPerdida = null;
      let capitalInvertido = null;

      // 1. Si la celda contiene beneficioPerdida explícito
      const rawBP = latestRow.fondos?.[fund.key]?.beneficioPerdida;
      if (hasUserValue(rawBP) && String(rawBP).trim() !== '') {
        beneficioPerdida = parseNum(rawBP);
        capitalInvertido = valorMercado - beneficioPerdida;
      }
      // 2. Si coincide con la referencia de posiciones
      else if (ref && Math.abs(valorMercado - ref.valorMercado) < 0.05) {
        beneficioPerdida = ref.beneficioPerdida;
        capitalInvertido = ref.capitalInvertido;
      }
      // 3. Si se registran movimientos acumulados
      else {
        const rows = (state.myinvestor || []).filter(hasPortfolioRowTotals);
        const movTotal = rows.reduce((s, r) => s + parseNum(r.fondos?.[fund.key]?.movimiento), 0);
        if (movTotal > 0) {
          capitalInvertido = movTotal;
          beneficioPerdida = valorMercado - capitalInvertido;
        } else if (ref) {
          // Estimación por ratio de coste de referencia
          const costRatio = ref.capitalInvertido / ref.valorMercado;
          capitalInvertido = Number((valorMercado * costRatio).toFixed(2));
          beneficioPerdida = Number((valorMercado - capitalInvertido).toFixed(2));
        }
      }

      const rentabilidad = (capitalInvertido !== null && capitalInvertido > 0)
        ? (beneficioPerdida / capitalInvertido) * 100
        : null;

      return {
        key: fund.key,
        name: ref?.fullName || fund.name,
        shortName: fund.name,
        isin: isin || ref?.isin || '',
        valorMercado,
        capitalInvertido,
        beneficioPerdida,
        rentabilidad
      };
    }).filter(f => f.valorMercado > 0);
  }

  // ── Caso B: No hay registros mensuales con desglose; cartera vacía ──
  if (!computedFunds.length) {
    return {
      valorMercadoTotal: 0,
      capitalInvertidoTotal: 0,
      beneficioTotal: 0,
      rentabilidadTotal: null,
      fondos: []
    };
  }

  // ── Totales de cartera ───────────────────────────────────────────────────
  const valorMercadoTotal = computedFunds.reduce((sum, f) => sum + f.valorMercado, 0);

  const allHaveInvested = computedFunds.every(f => f.capitalInvertido !== null);
  const capitalInvertidoTotal = allHaveInvested
    ? computedFunds.reduce((sum, f) => sum + f.capitalInvertido, 0)
    : 0;

  const beneficioTotal = valorMercadoTotal - capitalInvertidoTotal;

  const rentabilidadTotal = (capitalInvertidoTotal > 0)
    ? (beneficioTotal / capitalInvertidoTotal) * 100
    : null;

  return {
    valorMercadoTotal,
    capitalInvertidoTotal,
    beneficioTotal,
    rentabilidadTotal,
    fondos: computedFunds
  };
}

/**
 * PRESENTACIÓN VISUAL
 *
 * Muestra en la cabecera de la cartera los 4 indicadores solicitados:
 * 1. VALOR DE MERCADO: valor total actual de los fondos.
 * 2. BENEFICIO/PÉRDIDA: diferencia absoluta en euros respecto al capital invertido.
 * 3. RENTABILIDAD: porcentaje de rendimiento total (ponderada).
 * 4. INVERTIDO: capital total asociado a las posiciones actuales.
 *
 * A continuación, muestra cada fondo con:
 * - Nombre
 * - Valor de mercado
 * - Beneficio o pérdida en euros
 * - Rentabilidad porcentual
 *
 * Formato monetario: euros con 2 decimales y formato español (ej: 20.353,22 €).
 * Formato porcentual: dos decimales (ej: +4,22 % o -22,03 %).
 * Verde para rendimientos positivos y rojo para negativos (con signo menos).
 */
function renderPortfolioReturnsPanel() {
  const data = computePortfolioReturns();

  const isPos = v => (v !== null && v >= 0);
  const colorClass = v => v === null ? 'text-slate-400' : (v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400');
  const bgClass = v => v === null ? 'bg-slate-100 dark:bg-slate-800' : (v >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-rose-50 dark:bg-rose-950/30');

  // ── 1. Cuatro indicadores de cabecera ────────────────────────────────────
  const vmEl = document.getElementById('statFondosTotalValue');
  if (vmEl) {
    vmEl.textContent = fmtEur(data.valorMercadoTotal, 2);
  }

  const bpEl = document.getElementById('statFondosTotalGain');
  if (bpEl) {
    const sign = data.beneficioTotal > 0 ? '+' : '';
    bpEl.textContent = `${sign}${fmtEur(data.beneficioTotal, 2)}`;
    bpEl.className = `text-2xl font-extrabold font-mono-num ${colorClass(data.beneficioTotal)}`;
  }

  const roiEl = document.getElementById('statFondosTotalRoi');
  if (roiEl) {
    if (data.rentabilidadTotal !== null) {
      const sign = data.rentabilidadTotal > 0 ? '+' : '';
      roiEl.textContent = `${sign}${fmt(data.rentabilidadTotal, 2)}%`;
      roiEl.className = `text-2xl font-extrabold font-mono-num ${colorClass(data.rentabilidadTotal)}`;
    } else {
      roiEl.textContent = 'N/D';
      roiEl.className = 'text-2xl font-extrabold font-mono-num text-slate-400';
    }
  }

  const invEl = document.getElementById('statFondosTotalInvested');
  if (invEl) {
    invEl.textContent = fmtEur(data.capitalInvertidoTotal, 2);
  }

  // Si existe el panel separado de KPIs (prVM, prBP, prRentabilidad, prCapital), sincronizarlos también
  const prVM = document.getElementById('prVM');
  if (prVM) prVM.textContent = fmtEur(data.valorMercadoTotal, 2);

  const prBP = document.getElementById('prBP');
  if (prBP) {
    const sign = data.beneficioTotal > 0 ? '+' : '';
    prBP.textContent = `${sign}${fmtEur(data.beneficioTotal, 2)}`;
    prBP.className = `text-xl sm:text-2xl font-extrabold font-mono-num ${colorClass(data.beneficioTotal)}`;
  }

  const prRent = document.getElementById('prRentabilidad');
  if (prRent) {
    if (data.rentabilidadTotal !== null) {
      const sign = data.rentabilidadTotal > 0 ? '+' : '';
      prRent.textContent = `${sign}${fmt(data.rentabilidadTotal, 2)}%`;
      prRent.className = `text-xl sm:text-2xl font-extrabold font-mono-num ${colorClass(data.rentabilidadTotal)}`;
    } else {
      prRent.textContent = 'N/D';
      prRent.className = 'text-xl sm:text-2xl font-extrabold font-mono-num text-slate-400';
    }
  }

  const prCap = document.getElementById('prCapital');
  if (prCap) prCap.textContent = fmtEur(data.capitalInvertidoTotal, 2);

  // ── 2. Desglose individual de cada fondo ─────────────────────────────────
  const tbody = document.getElementById('prFondosBody');
  if (tbody) {
    if (!data.fondos.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-xs text-slate-400">Sin fondos en cartera.</td></tr>`;
    } else {
      tbody.innerHTML = data.fondos.map(f => {
        const bpSign = (f.beneficioPerdida !== null && f.beneficioPerdida > 0) ? '+' : '';
        const bpText = f.beneficioPerdida !== null ? `${bpSign}${fmtEur(f.beneficioPerdida, 2)}` : '—';
        const bpCls = colorClass(f.beneficioPerdida);

        const rentSign = (f.rentabilidad !== null && f.rentabilidad > 0) ? '+' : '';
        const rentText = f.rentabilidad !== null ? `${rentSign}${fmt(f.rentabilidad, 2)} %` : 'N/D';
        const rentCls = colorClass(f.rentabilidad);

        const capText = f.capitalInvertido !== null ? fmtEur(f.capitalInvertido, 2) : '—';

        return `
          <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-100 dark:border-slate-800/60">
            <td class="py-2.5 px-3 text-left">
              <span class="text-xs font-bold text-slate-900 dark:text-white" title="${esc(f.name)}">
                ${esc(f.name)}
              </span>
            </td>
            <td class="py-2.5 px-3 text-left">
              <span class="text-[11px] font-mono text-slate-500 dark:text-slate-400">${esc(f.isin || '—')}</span>
            </td>
            <td class="py-2.5 px-3 text-right font-mono-num text-xs font-bold text-slate-900 dark:text-white">
              ${fmtEur(f.valorMercado, 2)}
            </td>
            <td class="py-2.5 px-3 text-right font-mono-num text-xs text-slate-600 dark:text-slate-300">
              ${capText}
            </td>
            <td class="py-2.5 px-3 text-right font-mono-num text-xs font-extrabold ${bpCls}">
              ${bpText}
            </td>
            <td class="py-2.5 px-3 text-right font-mono-num text-xs font-extrabold ${rentCls}">
              <span class="inline-block px-1.5 py-0.5 rounded ${bgClass(f.rentabilidad)}">
                ${rentText}
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // ── 3. Fila de totales en el pie de tabla ─────────────────────────────────
  const tfoot = document.getElementById('prFondosTfoot');
  if (tfoot) {
    const totalBpSign = data.beneficioTotal > 0 ? '+' : '';
    const totalBpText = `${totalBpSign}${fmtEur(data.beneficioTotal, 2)}`;
    const totalBpCls = colorClass(data.beneficioTotal);

    const totalRentSign = (data.rentabilidadTotal !== null && data.rentabilidadTotal > 0) ? '+' : '';
    const totalRentText = data.rentabilidadTotal !== null ? `${totalRentSign}${fmt(data.rentabilidadTotal, 2)} %` : 'N/D';
    const totalRentCls = colorClass(data.rentabilidadTotal);

    tfoot.innerHTML = `
      <tr class="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-800/80 font-bold">
        <td class="py-2.5 px-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100">
          TOTAL CARTERA
        </td>
        <td class="py-2.5 px-3 text-left font-mono text-[11px] text-slate-400">
          —
        </td>
        <td class="py-2.5 px-3 text-right font-mono-num text-xs font-extrabold text-slate-900 dark:text-white">
          ${fmtEur(data.valorMercadoTotal, 2)}
        </td>
        <td class="py-2.5 px-3 text-right font-mono-num text-xs font-extrabold text-slate-800 dark:text-slate-200">
          ${fmtEur(data.capitalInvertidoTotal, 2)}
        </td>
        <td class="py-2.5 px-3 text-right font-mono-num text-xs font-extrabold ${totalBpCls}">
          ${totalBpText}
        </td>
        <td class="py-2.5 px-3 text-right font-mono-num text-xs font-extrabold ${totalRentCls}">
          <span class="inline-block px-1.5 py-0.5 rounded ${bgClass(data.rentabilidadTotal)}">
            ${totalRentText}
          </span>
        </td>
      </tr>
    `;
  }

  // Método explicativo
  const methodEl = document.getElementById('prMethod');
  if (methodEl) {
    methodEl.textContent = `Rentabilidad ponderada por capital invertido: ${fmtEur(data.beneficioTotal, 2)} ÷ ${fmtEur(data.capitalInvertidoTotal, 2)} × 100`;
  }
}
