// Reusable Date Range Picker component with calendar dropdown for ECONEXO tables.
'use strict';

(function () {
  const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const DAY_NAMES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

  function formatShortDate(d) {
    if (!d) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  }

  function formatFullDate(d) {
    if (!d) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function parseDate(val) {
    if (typeof parseDateFlexible === 'function') return parseDateFlexible(val);
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const text = String(val).trim();
    const m = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 0, 0, 0);
    const t = Date.parse(text);
    return isNaN(t) ? null : new Date(t);
  }

  class DateRangePicker {
    constructor(options) {
      this.id = options.id;
      this.containerId = options.containerId;
      this.onApply = options.onApply || null;
      this.onClear = options.onClear || null;
      this.placeholder = options.placeholder || 'Fechas';

      this.activeStart = options.initialStart || null;
      this.activeEnd = options.initialEnd || null;
      this.tempStart = this.activeStart;
      this.tempEnd = this.activeEnd;
      this.hoverDate = null;

      const now = new Date();
      this.viewYear = this.activeStart ? this.activeStart.getFullYear() : now.getFullYear();
      this.viewMonth = this.activeStart ? this.activeStart.getMonth() : now.getMonth();

      this.isOpen = false;
      this._onDocClick = this._handleDocClick.bind(this);
      this._onDocKey = this._handleDocKey.bind(this);

      this.render();
    }

    render() {
      const host = document.getElementById(this.containerId);
      if (!host) return;

      host.innerHTML = `
        <div class="date-range-picker" id="drp_${this.id}">
          <button type="button" class="date-range-btn" id="drp_btn_${this.id}" aria-haspopup="dialog" aria-expanded="false" title="Filtrar por rango de fechas">
            <i class="ph ph-calendar text-xs"></i>
            <span class="drp-btn-text">${this.placeholder}</span>
            <i class="ph ph-caret-down text-[9px] opacity-60"></i>
          </button>
          <div class="date-range-dropdown" id="drp_dropdown_${this.id}" role="dialog" aria-label="Selector de rango de fechas">
            <!-- Presets bar -->
            <div class="drp-presets">
              <button type="button" class="drp-preset" data-preset="this-year">Este año</button>
              <button type="button" class="drp-preset" data-preset="last-year">Año anterior</button>
              <button type="button" class="drp-preset" data-preset="last-30d">Últimos 30d</button>
              <button type="button" class="drp-preset" data-preset="last-3m">Últimos 3m</button>
              <button type="button" class="drp-preset" data-preset="all">Todo</button>
            </div>

            <!-- Month navigation -->
            <div class="drp-header">
              <button type="button" class="drp-nav-btn" data-action="prev-year" title="Año anterior">
                <i class="ph ph-caret-double-left text-xs"></i>
              </button>
              <button type="button" class="drp-nav-btn" data-action="prev-month" title="Mes anterior">
                <i class="ph ph-caret-left text-xs"></i>
              </button>
              <div class="drp-month-label" id="drp_month_label_${this.id}"></div>
              <button type="button" class="drp-nav-btn" data-action="next-month" title="Mes siguiente">
                <i class="ph ph-caret-right text-xs"></i>
              </button>
              <button type="button" class="drp-nav-btn" data-action="next-year" title="Año siguiente">
                <i class="ph ph-caret-double-right text-xs"></i>
              </button>
            </div>

            <!-- Calendar Grid -->
            <div class="drp-grid" id="drp_grid_${this.id}">
              ${DAY_NAMES.map(name => `<div class="drp-day-name">${name}</div>`).join('')}
              <div class="drp-days-container col-span-7 grid grid-cols-7 gap-[2px]" id="drp_days_${this.id}"></div>
            </div>

            <!-- Manual Inputs -->
            <div class="drp-inputs">
              <div class="drp-input-group">
                <label>Desde</label>
                <input type="text" class="drp-inp-desde" id="drp_desde_${this.id}" placeholder="DD/MM/AAAA" maxlength="10">
              </div>
              <div class="drp-input-group">
                <label>Hasta</label>
                <input type="text" class="drp-inp-hasta" id="drp_hasta_${this.id}" placeholder="DD/MM/AAAA" maxlength="10">
              </div>
            </div>

            <!-- Action buttons -->
            <div class="drp-actions">
              <button type="button" class="drp-btn drp-btn-clear" id="drp_clear_${this.id}">Limpiar</button>
              <button type="button" class="drp-btn drp-btn-apply" id="drp_apply_${this.id}">Aplicar</button>
            </div>
          </div>
        </div>
      `;

      this.wrapperEl = document.getElementById(`drp_${this.id}`);
      this.btnEl = document.getElementById(`drp_btn_${this.id}`);
      this.dropdownEl = document.getElementById(`drp_dropdown_${this.id}`);
      this.monthLabelEl = document.getElementById(`drp_month_label_${this.id}`);
      this.daysContainerEl = document.getElementById(`drp_days_${this.id}`);
      this.inpDesde = document.getElementById(`drp_desde_${this.id}`);
      this.inpHasta = document.getElementById(`drp_hasta_${this.id}`);

      this.bindEvents();
      this.updateButtonUi();
    }

    bindEvents() {
      if (!this.btnEl) return;

      this.btnEl.addEventListener('click', (e) => {
        // If clicked on clear inline icon
        if (e.target.closest('.drp-clear-inline')) {
          e.stopPropagation();
          this.clear(true);
          return;
        }
        this.toggle();
      });

      // Navigation buttons
      this.dropdownEl?.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const act = btn.dataset.action;
          if (act === 'prev-month') this.prevMonth();
          else if (act === 'next-month') this.nextMonth();
          else if (act === 'prev-year') this.prevYear();
          else if (act === 'next-year') this.nextYear();
        });
      });

      // Presets
      this.dropdownEl?.querySelectorAll('[data-preset]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.applyPreset(btn.dataset.preset);
        });
      });

      // Manual inputs
      this.inpDesde?.addEventListener('input', () => {
        const d = parseDate(this.inpDesde.value);
        if (d) {
          this.tempStart = d;
          this.viewYear = d.getFullYear();
          this.viewMonth = d.getMonth();
          this.renderCalendar();
        }
      });

      this.inpHasta?.addEventListener('input', () => {
        const d = parseDate(this.inpHasta.value);
        if (d) {
          this.tempEnd = d;
          this.renderCalendar();
        }
      });

      // Action buttons
      document.getElementById(`drp_clear_${this.id}`)?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clear(true);
      });

      document.getElementById(`drp_apply_${this.id}`)?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.apply();
      });

      // Days hover tracking
      this.daysContainerEl?.addEventListener('pointerleave', () => {
        if (this.hoverDate) {
          this.hoverDate = null;
          this.renderCalendarDays();
        }
      });
    }

    _handleDocClick(e) {
      if (!this.isOpen) return;
      if (this.wrapperEl && !this.wrapperEl.contains(e.target)) {
        this.close();
      }
    }

    _handleDocKey(e) {
      if (this.isOpen && e.key === 'Escape') {
        this.close();
      }
    }

    toggle() {
      if (this.isOpen) this.close();
      else this.open();
    }

    open() {
      // Close any other open date range pickers
      if (window.dateRangePickers) {
        Object.values(window.dateRangePickers).forEach(p => {
          if (p !== this && p.isOpen) p.close();
        });
      }

      this.isOpen = true;
      this.dropdownEl?.classList.add('drp-open');
      this.btnEl?.setAttribute('aria-expanded', 'true');

      // Initialize temporary selection with active range
      this.tempStart = this.activeStart;
      this.tempEnd = this.activeEnd;
      this.hoverDate = null;

      if (this.tempStart) {
        this.viewYear = this.tempStart.getFullYear();
        this.viewMonth = this.tempStart.getMonth();
      } else {
        const now = new Date();
        this.viewYear = now.getFullYear();
        this.viewMonth = now.getMonth();
      }

      this.syncInputsFromTemp();
      this.renderCalendar();

      document.addEventListener('pointerdown', this._onDocClick);
      document.addEventListener('keydown', this._onDocKey);
    }

    close() {
      this.isOpen = false;
      this.dropdownEl?.classList.remove('drp-open');
      this.btnEl?.setAttribute('aria-expanded', 'false');
      this.hoverDate = null;

      document.removeEventListener('pointerdown', this._onDocClick);
      document.removeEventListener('keydown', this._onDocKey);
    }

    prevMonth() {
      if (this.viewMonth === 0) {
        this.viewMonth = 11;
        this.viewYear--;
      } else {
        this.viewMonth--;
      }
      this.renderCalendar();
    }

    nextMonth() {
      if (this.viewMonth === 11) {
        this.viewMonth = 0;
        this.viewYear++;
      } else {
        this.viewMonth++;
      }
      this.renderCalendar();
    }

    prevYear() {
      this.viewYear--;
      this.renderCalendar();
    }

    nextYear() {
      this.viewYear++;
      this.renderCalendar();
    }

    renderCalendar() {
      if (this.monthLabelEl) {
        this.monthLabelEl.textContent = `${MONTH_NAMES[this.viewMonth]} ${this.viewYear}`;
      }
      this.renderCalendarDays();
    }

    renderCalendarDays() {
      if (!this.daysContainerEl) return;
      this.daysContainerEl.innerHTML = '';

      const firstDay = (new Date(this.viewYear, this.viewMonth, 1).getDay() + 6) % 7; // Monday = 0
      const daysInMonth = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();
      const today = new Date();

      const frag = document.createDocumentFragment();

      // Empty padding cells before the 1st day of month
      for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'drp-day drp-empty';
        frag.appendChild(emptyCell);
      }

      let selStart = this.tempStart ? new Date(this.tempStart.getFullYear(), this.tempStart.getMonth(), this.tempStart.getDate()).getTime() : null;
      let selEnd = this.tempEnd ? new Date(this.tempEnd.getFullYear(), this.tempEnd.getMonth(), this.tempEnd.getDate()).getTime() : null;

      // Handle interactive hover preview while picking range
      if (selStart && !selEnd && this.hoverDate) {
        const hoverTime = new Date(this.hoverDate.getFullYear(), this.hoverDate.getMonth(), this.hoverDate.getDate()).getTime();
        if (hoverTime < selStart) {
          selEnd = selStart;
          selStart = hoverTime;
        } else {
          selEnd = hoverTime;
        }
      }

      for (let d = 1; d <= daysInMonth; d++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'drp-day';
        dayCell.textContent = String(d);

        const currentDayTime = new Date(this.viewYear, this.viewMonth, d).getTime();

        const isToday = today.getFullYear() === this.viewYear && today.getMonth() === this.viewMonth && today.getDate() === d;
        if (isToday) dayCell.classList.add('drp-today');

        if (selStart && currentDayTime === selStart) {
          dayCell.classList.add('drp-selected-start');
        }
        if (selEnd && currentDayTime === selEnd) {
          dayCell.classList.add('drp-selected-end');
        }
        if (selStart && selEnd && currentDayTime > selStart && currentDayTime < selEnd) {
          dayCell.classList.add('drp-in-range');
        }

        dayCell.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleDayClick(new Date(this.viewYear, this.viewMonth, d));
        });

        dayCell.addEventListener('pointerenter', () => {
          if (this.tempStart && !this.tempEnd) {
            this.hoverDate = new Date(this.viewYear, this.viewMonth, d);
            this.renderCalendarDays();
          }
        });

        frag.appendChild(dayCell);
      }

      this.daysContainerEl.appendChild(frag);
    }

    handleDayClick(date) {
      if (!this.tempStart || (this.tempStart && this.tempEnd)) {
        this.tempStart = date;
        this.tempEnd = null;
        this.hoverDate = null;
      } else if (this.tempStart && !this.tempEnd) {
        if (date.getTime() < this.tempStart.getTime()) {
          this.tempEnd = this.tempStart;
          this.tempStart = date;
        } else {
          this.tempEnd = date;
        }
        this.hoverDate = null;
      }
      this.syncInputsFromTemp();
      this.renderCalendar();
    }

    syncInputsFromTemp() {
      if (this.inpDesde) this.inpDesde.value = this.tempStart ? formatFullDate(this.tempStart) : '';
      if (this.inpHasta) this.inpHasta.value = this.tempEnd ? formatFullDate(this.tempEnd) : '';
    }

    applyPreset(presetKey) {
      const now = new Date();
      let start = null;
      let end = null;

      if (presetKey === 'this-year') {
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
      } else if (presetKey === 'last-year') {
        start = new Date(now.getFullYear() - 1, 0, 1);
        end = new Date(now.getFullYear() - 1, 11, 31);
      } else if (presetKey === 'last-30d') {
        start = new Date(now.getTime() - 30 * 86400000);
        end = now;
      } else if (presetKey === 'last-3m') {
        start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        end = now;
      } else if (presetKey === 'all') {
        this.clear(true);
        return;
      }

      if (start && end) {
        this.tempStart = start;
        this.tempEnd = end;
        this.viewYear = start.getFullYear();
        this.viewMonth = start.getMonth();
        this.syncInputsFromTemp();
        this.renderCalendar();
        this.apply();
      }
    }

    apply() {
      if (this.tempStart && !this.tempEnd) {
        this.tempEnd = this.tempStart;
      }
      if (this.tempStart && this.tempEnd && this.tempStart.getTime() > this.tempEnd.getTime()) {
        const tmp = this.tempStart;
        this.tempStart = this.tempEnd;
        this.tempEnd = tmp;
      }

      this.activeStart = this.tempStart;
      this.activeEnd = this.tempEnd;
      this.updateButtonUi();
      this.close();

      if (typeof this.onApply === 'function') {
        this.onApply(this.getRange());
      }
    }

    clear(trigger = true) {
      this.activeStart = null;
      this.activeEnd = null;
      this.tempStart = null;
      this.tempEnd = null;
      this.hoverDate = null;
      this.syncInputsFromTemp();
      this.updateButtonUi();
      this.close();

      if (trigger && typeof this.onClear === 'function') {
        this.onClear();
      }
    }

    getRange() {
      return {
        start: this.activeStart,
        end: this.activeEnd
      };
    }

    updateButtonUi() {
      if (!this.btnEl) return;
      const hasRange = this.activeStart && this.activeEnd;

      this.btnEl.classList.toggle('drp-active', Boolean(hasRange));

      if (hasRange) {
        const isSameYear = this.activeStart.getFullYear() === this.activeEnd.getFullYear();
        const isSameDay = this.activeStart.getTime() === this.activeEnd.getTime();
        let label = '';
        if (isSameDay) {
          label = formatFullDate(this.activeStart);
        } else if (isSameYear) {
          label = `${formatShortDate(this.activeStart)} - ${formatShortDate(this.activeEnd)}`;
        } else {
          label = `${formatShortDate(this.activeStart)} - ${formatShortDate(this.activeEnd)}`;
        }

        this.btnEl.title = `Filtro activo: ${formatFullDate(this.activeStart)} al ${formatFullDate(this.activeEnd)}`;
        this.btnEl.innerHTML = `
          <i class="ph-bold ph-calendar-check text-xs text-blue-600 dark:text-blue-400"></i>
          <span class="drp-btn-text font-mono">${label}</span>
          <span class="drp-clear-inline" title="Quitar filtro de fechas"><i class="ph ph-x text-[10px]"></i></span>
        `;
      } else {
        this.btnEl.title = 'Filtrar por rango de fechas';
        this.btnEl.innerHTML = `
          <i class="ph ph-calendar text-xs text-slate-500 dark:text-slate-400"></i>
          <span class="drp-btn-text">${this.placeholder}</span>
          <i class="ph ph-caret-down text-[9px] text-slate-400"></i>
        `;
      }
    }

    destroy() {
      document.removeEventListener('pointerdown', this._onDocClick);
      document.removeEventListener('keydown', this._onDocKey);
      if (this.wrapperEl) {
        this.wrapperEl.remove();
      }
    }
  }

  window.DateRangePicker = DateRangePicker;
  window.dateRangePickers = window.dateRangePickers || {};

  window.initDateRangePicker = function (options) {
    if (!options || !options.id) return null;
    const container = document.getElementById(options.containerId);
    if (!container) return null;

    const existing = window.dateRangePickers[options.id];
    let preservedStart = null;
    let preservedEnd = null;
    if (existing) {
      if (existing.activeStart) {
        preservedStart = existing.activeStart;
        preservedEnd = existing.activeEnd;
      }
      existing.destroy();
    }

    const picker = new DateRangePicker(options);
    if (preservedStart) {
      picker.activeStart = preservedStart;
      picker.activeEnd = preservedEnd;
      picker.tempStart = preservedStart;
      picker.tempEnd = preservedEnd;
      picker.updateButtonUi();
    }
    window.dateRangePickers[options.id] = picker;
    return picker;
  };
})();
