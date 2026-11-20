// Local fund chart UI: real scraped history, responsive range selection and app theme support.
'use strict';

let fundChartInstance = null;
let fundChartActiveKey = null;
let fundChartRange = '6months';
let fundChartReturnFocus = null;
let fundChartPreviousBodyOverflow = '';

function formatChartDate(date, includeYear = true) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-ES', includeYear
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { month: 'short', day: 'numeric' });
}

function formatChartAxisLabel(date, range) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  if (range === 'day') return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (range === 'week') {
    const day = date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
    return (date.getHours() || date.getMinutes())
      ? `${day} ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
      : day;
  }
  if (['month', '3months', '6months'].includes(range)) {
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }
  return date.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
}

function formatChartTooltipDate(date, range) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const dateText = date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
  return hasTime || range === 'day'
    ? `${dateText} · ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
    : dateText;
}

function formatChartPrice(value, decimals = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

function fundChartCssTheme() {
  const modal = document.getElementById('fundChartModal');
  const style = getComputedStyle(modal || document.documentElement);
  const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    text: read('--fund-chart-text', '#0f172a'),
    muted: read('--fund-chart-muted', '#64748b'),
    border: read('--fund-chart-border', '#e2e8f0'),
    grid: read('--fund-chart-grid', 'rgba(148,163,184,.20)'),
    line: read('--fund-chart-line', '#059669'),
    fillTop: read('--fund-chart-fill-top', 'rgba(16,185,129,.23)'),
    fillBottom: read('--fund-chart-fill-bottom', 'rgba(16,185,129,.015)'),
    tooltipBg: read('--fund-chart-tooltip-bg', '#0f172a'),
    tooltipText: read('--fund-chart-tooltip-text', '#f8fafc'),
    priceLine: read('--fund-chart-price-line', '#64748b'),
    priceTag: read('--fund-chart-price-tag', '#047857'),
    priceTagText: read('--fund-chart-price-tag-text', '#ffffff')
  };
}

function getFundRangeRows(history, range) {
  if (!Array.isArray(history) || !history.length) return [];
  const sorted = history.filter(point => Number.isFinite(point.timestamp) && Number.isFinite(point.close))
    .slice().sort((a, b) => a.timestamp - b.timestamp);
  if (range === 'max') return sorted;
  const daysByRange = { day: 1, week: 7, month: 31, '3months': 92, '6months': 183, year: 365, '5years': 1826 };
  const days = daysByRange[range] || 183;
  const last = sorted[sorted.length - 1]?.timestamp;
  if (!Number.isFinite(last)) return [];
  const start = last - days * 86400000;
  // Never append a last point outside the selected time window; all plotted values are provider observations.
  return sorted.filter(point => point.timestamp >= start);
}

function findFundForChart() {
  return liveQuotes.find(q => q.isin === fundChartActiveKey || q.url === fundChartActiveKey || q.fundName === fundChartActiveKey);
}

function setFundChartEmptyState(title, message) {
  const empty = document.getElementById('fundChartEmpty');
  const titleEl = document.getElementById('fundChartEmptyTitle');
  const messageEl = document.getElementById('fundChartEmptyMessage');
  const canvas = document.getElementById('fundChartCanvas');
  const loading = document.getElementById('fundChartLoading');
  if (titleEl) titleEl.textContent = title || 'No hay datos históricos suficientes';
  if (messageEl) messageEl.textContent = message || 'Prueba otro periodo o actualiza el histórico del fondo.';
  if (empty) empty.classList.remove('hidden');
  if (canvas) canvas.style.visibility = 'hidden';
  if (loading) loading.classList.add('hidden');
}

window.showFundChartError = function(error, context = 'No se pudo cargar la gráfica.') {
  const detail = String(error?.message || error || 'Error desconocido');
  setFundChartEmptyState(context, detail);
};

const fundCurrentPriceLinePlugin = {
  id: 'fundCurrentPriceLine',
  afterDatasetsDraw(chart, args, options) {
    const value = Number(options?.value);
    if (!Number.isFinite(value) || !chart.chartArea || !chart.scales?.y) return;
    const { ctx, chartArea, scales } = chart;
    const y = scales.y.getPixelForValue(value);
    if (y < chartArea.top || y > chartArea.bottom) return;
    ctx.save();
    ctx.strokeStyle = options?.lineColor || '#64748b';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(chartArea.left, y); ctx.lineTo(chartArea.right, y); ctx.stroke();
    ctx.setLineDash([]);
    const label = formatChartPrice(value, 3);
    ctx.font = '700 11px Inter, Arial, sans-serif';
    const boxWidth = Math.max(70, ctx.measureText(label).width + 18);
    const boxHeight = 23;
    const x = Math.max(chartArea.left + 2, Math.min(chartArea.right - boxWidth + 2, chart.width - boxWidth - 2));
    const top = Math.max(chartArea.top, Math.min(y - boxHeight / 2, chartArea.bottom - boxHeight));
    const radius = 5;
    ctx.fillStyle = options?.labelBackground || '#047857';
    ctx.beginPath();
    ctx.moveTo(x + radius, top);
    ctx.arcTo(x + boxWidth, top, x + boxWidth, top + boxHeight, radius);
    ctx.arcTo(x + boxWidth, top + boxHeight, x, top + boxHeight, radius);
    ctx.arcTo(x, top + boxHeight, x, top, radius);
    ctx.arcTo(x, top, x + boxWidth, top, radius);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = options?.labelColor || '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + boxWidth / 2, top + boxHeight / 2);
    ctx.restore();
  }
};

function renderFundChart() {
  const quote = findFundForChart();
  if (!quote) return;
  const periodHistory = getFundHistory(quote);
  const history = getFundRangeRows(periodHistory, fundChartRange);
  const canvas = document.getElementById('fundChartCanvas');
  const empty = document.getElementById('fundChartEmpty');
  if (!canvas) return;
  if (fundChartInstance) { fundChartInstance.destroy(); fundChartInstance = null; }

  const modal = document.getElementById('fundChartModal');
  const theme = fundChartCssTheme();
  const title = document.getElementById('fundChartTitle');
  const sourceLink = document.getElementById('fundChartSourceLink');
  if (sourceLink) {
    const base = String(quote.url || '').replace(/\/+$/, '').replace(/-chart$/, '');
    sourceLink.href = base ? `${base}-chart` : 'https://es.investing.com/';
  }
  const subtitle = document.getElementById('fundChartSubtitle');
  const lastEl = document.getElementById('fundChartLast');
  const changeEl = document.getElementById('fundChartChange');
  const directionEl = document.getElementById('fundChartDirection');
  const latestPoint = periodHistory[periodHistory.length - 1];
  const quotePriceParsed = parseNumericForChart(quote.lastPrice);
  const latestPrice = Number.isFinite(quotePriceParsed) && quotePriceParsed > 0 ? quotePriceParsed : latestPoint?.close;
  const rawChange = parseNumericForChart(quote.changeValue);
  const rawPercent = parseNumericForChart(quote.changePercent);
  const down = quote.direction === 'down' || (Number.isFinite(rawChange) && rawChange < 0) || (Number.isFinite(rawPercent) && rawPercent < 0);

  if (title) title.textContent = quote.fundName || quote.isin || 'Fondo de inversión';
  if (lastEl) lastEl.textContent = formatChartPrice(latestPrice, 3);
  if (changeEl) {
    const changeText = Number.isFinite(rawChange) ? `${rawChange > 0 ? '+' : ''}${formatChartPrice(rawChange, 3)}` : String(quote.changeValue || '—');
    const percentText = Number.isFinite(rawPercent) ? `(${rawPercent > 0 ? '+' : ''}${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rawPercent)}%)` : String(quote.changePercent || '');
    changeEl.textContent = `${changeText} ${percentText}`.trim();
    changeEl.classList.toggle('is-negative', down);
  }
  if (directionEl) { directionEl.textContent = down ? '▼' : '▲'; directionEl.classList.toggle('is-negative', down); }

  if (subtitle) {
    const isinPart = quote.isin ? `${quote.isin} · ` : '';
    const datePart = quote.historyUpdatedAt
      ? `Actualizado ${new Date(quote.historyUpdatedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`
      : 'Histórico consultado desde Investing.com';
    const availableDays = periodHistory.length > 1 ? Math.max(1, Math.round((periodHistory[periodHistory.length - 1].timestamp - periodHistory[0].timestamp) / 86400000)) : 0;
    const requestedDays = ({ day: 1, week: 7, month: 31, '3months': 92, '6months': 183, year: 365, '5years': 1826 })[fundChartRange];
    const spanNote = requestedDays && availableDays && fundChartRange !== 'day' && availableDays < requestedDays - 3
      ? ` · histórico disponible: ${availableDays} días`
      : '';
    const intradayNote = fundChartRange === 'day' && history.length < 2
      ? ' · El proveedor no ha devuelto suficientes puntos intradía para este fondo.'
      : '';
    subtitle.textContent = `${isinPart}${quote.currency || 'EUR'} · ${datePart}${history.length ? ` · ${history.length} observaciones del periodo` : ''}${spanNote}${intradayNote}`;
    subtitle.classList.remove('is-warning');
  }

  const hasHistory = history.length >= 2;
  if (empty) empty.classList.toggle('hidden', hasHistory);
  canvas.style.visibility = hasHistory ? 'visible' : 'hidden';
  if (!hasHistory) {
    const emptyTitle = document.getElementById('fundChartEmptyTitle');
    const emptyMessage = document.getElementById('fundChartEmptyMessage');
    if (emptyTitle) emptyTitle.textContent = fundChartRange === 'day' ? 'No hay detalle intradía suficiente' : 'No hay datos suficientes para este periodo';
    if (emptyMessage) emptyMessage.textContent = fundChartRange === 'day'
      ? 'El fondo puede publicar solo valores liquidativos diarios. No se inventarán observaciones intradía; prueba 1 semana o un periodo más amplio.'
      : 'No se han recibido al menos dos observaciones reales para el periodo elegido. Prueba un rango más amplio o actualiza el histórico.';
    return;
  }

  const ctx = canvas.getContext('2d');
  const values = history.map(point => point.close);
  const labels = history.map(point => point.date);
  const lineValue = Number.isFinite(latestPrice) ? latestPrice : values[values.length - 1];
  fundChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Valor liquidativo', data: values,
        borderColor: theme.line,
        backgroundColor: context => {
          const chart = context.chart; const area = chart.chartArea;
          if (!area) return theme.fillTop;
          const gradient = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
          gradient.addColorStop(0, theme.fillTop); gradient.addColorStop(1, theme.fillBottom);
          return gradient;
        },
        borderWidth: 2, fill: true, tension: .12,
        pointRadius: history.length < 18 ? 2.2 : 0,
        pointHoverRadius: 4, pointHoverBackgroundColor: theme.line,
        pointHoverBorderColor: theme.text, pointHoverBorderWidth: 1.5,
        borderCapStyle: 'round', borderJoinStyle: 'round'
      }]
    },
    plugins: [fundCurrentPriceLinePlugin],
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 170 },
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 10, right: 5, bottom: 1, left: 4 } },
      plugins: {
        legend: { display: false },
        fundCurrentPriceLine: {
          value: lineValue, lineColor: theme.priceLine,
          labelBackground: theme.priceTag, labelColor: theme.priceTagText
        },
        tooltip: {
          displayColors: false, backgroundColor: theme.tooltipBg,
          titleColor: theme.tooltipText, bodyColor: theme.tooltipText,
          borderColor: theme.border, borderWidth: 1,
          padding: 11, cornerRadius: 9, usePointStyle: false,
          callbacks: {
            title: items => formatChartTooltipDate(labels[items[0]?.dataIndex], fundChartRange),
            label: item => `${formatChartPrice(item.parsed.y, 3)} ${quote.currency || 'EUR'}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: context => context.index === 0 ? theme.border : theme.grid, drawTicks: true, tickLength: 6 },
          border: { color: theme.border },
          ticks: {
            color: theme.muted, maxTicksLimit: 8, autoSkip: true, maxRotation: 0, padding: 10,
            font: { family: 'Inter, sans-serif', size: window.innerWidth < 700 ? 10 : 11 },
            callback: function(value) { return formatChartAxisLabel(labels[Number(value)], fundChartRange); }
          }
        },
        y: {
          position: 'right', grace: '6%',
          grid: { color: theme.grid, drawTicks: false }, border: { display: false },
          ticks: {
            color: theme.muted, maxTicksLimit: 6, padding: 8,
            font: { family: 'Inter, sans-serif', size: 11 },
            callback: value => formatChartPrice(value, 3)
          }
        }
      }
    }
  });
}

window.openFundChart = async function(key) {
  fundChartReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  fundChartActiveKey = key;
  fundChartRange = '6months';
  document.querySelectorAll('[data-fund-range]').forEach(button => {
    const active = button.dataset.fundRange === fundChartRange;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const modal = document.getElementById('fundChartModal');
  if (!modal) return;
  fundChartPreviousBodyOverflow = document.body.style.overflow;
  modal.classList.add('is-open'); modal.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
  const canvas = document.getElementById('fundChartCanvas'); if (canvas) canvas.style.visibility = 'hidden';
  const empty = document.getElementById('fundChartEmpty'); if (empty) empty.classList.add('hidden');
  const loading = document.getElementById('fundChartLoading'); if (loading) loading.classList.remove('hidden');
  document.getElementById('fundChartClose')?.focus({ preventScroll: true });
  try { await loadFundHistory(key, false, fundChartRange); }
  catch (error) { window.showFundChartError(error, 'No se pudo cargar el histórico del fondo.'); }
};

window.closeFundChart = function() {
  const modal = document.getElementById('fundChartModal');
  if (!modal) return;
  modal.classList.remove('is-open'); modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = fundChartPreviousBodyOverflow;
  if (fundChartInstance) { fundChartInstance.destroy(); fundChartInstance = null; }
  if (fundChartReturnFocus?.isConnected) fundChartReturnFocus.focus({ preventScroll: true });
};

// Keep Chart.js colours synchronised when the user changes the global light/dark theme.
if (typeof MutationObserver !== 'undefined' && document.documentElement) {
  const fundChartThemeObserver = new MutationObserver(records => {
    if (records.some(record => record.attributeName === 'class') && document.getElementById('fundChartModal')?.classList.contains('is-open')) {
      renderFundChart();
    }
  });
  fundChartThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

// Accessible keyboard behaviour: keep Tab navigation inside the full-screen modal.
document.getElementById('fundChartModal')?.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const modal = event.currentTarget;
  const focusable = Array.from(modal.querySelectorAll('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'))
    .filter(element => element.getClientRects().length && !element.closest('[hidden]'));
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
