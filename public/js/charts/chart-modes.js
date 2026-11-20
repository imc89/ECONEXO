// Shared chart view-mode state and toolbars.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 736-832) ---
    // ── CHART MODE SYSTEM ────────────────────────────────────────────────────────
    /**
     * Todos los modos salvo barras usan el tipo línea de Chart.js.
     * El modo área se distingue por el relleno bajo la curva.
     */
    // ── MOTOR COMÚN DE GRÁFICAS Y SELECTOR DE VISUALIZACIÓN ──────────────────────
    /** Traduce el modo de visualización guardado al tipo compatible con Chart.js. */
    function resolveChartType(mode) {
      return mode === 'bar' ? 'bar' : 'line';
    }

    /** Suavizado de la curva; el área usa un suavizado más moderado. */
    /** Obtiene la tensión de línea correspondiente al modo de gráfica. */
    function resolveChartTension(mode) {
      if (mode === 'line-curve') return 0.35;
      if (mode === 'area') return 0.22;
      return 0;
    }

    /** Solo el modo área rellena la superficie bajo la curva. */
    /** Determina si el conjunto de datos debe rellenar el área bajo la curva. */
    function resolveChartFill(mode) {
      return mode === 'area';
    }

    // Se conserva la función para no alterar los constructores existentes:
    // ninguno de los modos actuales dibuja líneas escalonadas.
    /** Devuelve la configuración de línea escalonada utilizada por las gráficas. */
    function resolveChartStepped() {
      return false;
    }

    /**
     * Get current mode for a chart, defaulting to the provided fallback.
     * @param {string} chartId
     * @param {'line-curve'|'area'|'bar'} defaultMode
     */
    /** Obtiene el modo de visualización de una gráfica, respetando su valor predeterminado. */
    function getChartMode(chartId, defaultMode = 'line-curve') {
      // Compatibilidad con preferencias de versiones anteriores:
      // las opciones antiguas de línea recta/escalonada pasan a diagrama de área.
      if (chartModes[chartId] === 'line-straight' || chartModes[chartId] === 'area-step') {
        chartModes[chartId] = 'area';
      }
      return chartModes[chartId] || defaultMode;
    }

    /**
     * Injects a mode‐selector toolbar into the element with the given wrapperId.
     * Buttons call the provided renderFn when clicked.
     * @param {string} wrapperId  - ID of the flex header row that will host the toolbar
     * @param {string} chartId
     * @param {function} renderFn - Called after mode changes (re-renders the chart)
     * @param {string[]} modes    - Which mode buttons to show
     */
    /** Crea los controles para elegir el modo de visualización de una gráfica. */
    function addChartModeToolbar(wrapperId, chartId, renderFn,
      modes = ['line-curve', 'area', 'bar']) {
      const wrapper = document.getElementById(wrapperId);
      if (!wrapper) return;
      // Avoid duplicating toolbar if already added
      if (wrapper.querySelector('.chart-mode-toolbar')) return;

      const ICONS = {
        'line-curve': { icon: 'ph-chart-line-up', label: 'Curva' },
        'area': { icon: 'ph-chart-line', label: 'Diagrama de área' },
        'bar': { icon: 'ph-chart-bar', label: 'Barras' },
      };

      const toolbar = document.createElement('div');
      toolbar.className = 'chart-mode-toolbar';

      const current = getChartMode(chartId, modes[0]);

      modes.forEach(mode => {
        const btn = document.createElement('button');
        btn.className = 'chart-mode-btn' + (mode === current ? ' active' : '');
        btn.title = ICONS[mode].label;
        btn.dataset.chartId = chartId;
        btn.dataset.chartMode = mode;
        btn.innerHTML = mode === 'area'
          ? '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1 13V9L4.5 6.5 7.5 8 11 3.5 15 5V13Z" fill="currentColor" fill-opacity=".22"/><path d="M1 9 4.5 6.5 7.5 8 11 3.5 15 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
          : `<i class="ph-bold ${ICONS[mode].icon}" style="font-size:13px"></i>`;
        btn.onclick = () => {
          chartModes[chartId] = mode;
          saveState();
          wrapper.querySelectorAll('.chart-mode-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.chartMode === mode)
          );
          renderFn();
        };
        toolbar.appendChild(btn);
      });

      wrapper.appendChild(toolbar);
    }

