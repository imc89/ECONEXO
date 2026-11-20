// Shared chart colors and Chart.js builder.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 271-288) ---
    // ── COLORES, PERSISTENCIA, NOTIFICACIONES Y TEMA ─────────────────────────────
    /** Devuelve los colores apropiados para las gráficas según el tema activo. */
    function chartColors() {
      const dark = document.documentElement.classList.contains('dark');
      return {
        text: dark ? '#94a3b8' : '#64748b',
        grid: dark ? 'rgba(71,85,105,0.22)' : 'rgba(226,232,240,0.8)',
        tooltipBg: dark ? '#0f172a' : '#1e293b'
      };
    }

    /** Convierte un color hexadecimal a una cadena rgba con la opacidad indicada. */
    function hexRgba(hex, a = 1) {
      if (!hex || !hex.startsWith('#')) return `rgba(37,99,235,${a})`;
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${a})`;
    }


// --- Extracted responsibility (legacy source lines 833-884) ---
    // ── CHART BUILDER ────────────────────────────────────────────────────────────
    /** Crea o actualiza una instancia de Chart.js y conecta su interacción. */
    function buildChart(id, config) {
      if (charts[id]) {
        try { charts[id].destroy(); } catch (_) { }
      }
      const canvas = document.getElementById(id);
      if (!canvas) return null;
      const { text, grid, tooltipBg } = chartColors();

      if (!config.options) config.options = {};
      if (!config.options.plugins) config.options.plugins = {};

      config.options.responsive = true;
      config.options.maintainAspectRatio = false;
      if (!config.options.animation) config.options.animation = { duration: 350, easing: 'easeOutQuart' };

      const existingOnHover = config.options.onHover;
      config.options.onHover = (event, activeElements, chart) => {
        const canvasEl = chart?.canvas || canvas;
        if (canvasEl) canvasEl.style.cursor = activeElements?.length ? 'pointer' : '';
        if (typeof existingOnHover === 'function') existingOnHover(event, activeElements, chart);
      };

      config.options.plugins.tooltip = {
        backgroundColor: tooltipBg,
        titleColor: '#94a3b8',
        bodyColor: '#ffffff',
        padding: 10,
        cornerRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        ...(config.options.plugins.tooltip || {})
      };

      if (config.options.scales) {
        if (config.options.scales.x) {
          if (!config.options.scales.x.ticks) config.options.scales.x.ticks = {};
          config.options.scales.x.ticks.color = text;
          config.options.scales.x.grid = { color: 'transparent', ...(config.options.scales.x.grid || {}) };
        }
        if (config.options.scales.y) {
          if (!config.options.scales.y.ticks) config.options.scales.y.ticks = {};
          config.options.scales.y.ticks.color = text;
          config.options.scales.y.grid = { color: grid, ...(config.options.scales.y.grid || {}) };
        }
      }

      charts[id] = new Chart(canvas.getContext('2d'), config);
      return charts[id];
    }

