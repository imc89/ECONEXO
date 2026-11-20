// Shared table-edit interactions and external-link event guard.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 154-252) ---
    // ── EDICIÓN SEGURA DE TABLAS ─────────────────────────────────────────────────
    /** Indica si la tabla identificada está en modo de edición. */
    function isTableEditable(tableKey) {
      return tableEditModes[tableKey] === true;
    }

    /** Sincroniza los campos y atributos accesibles con el modo lectura/edición. */
    function updateTableEditUi(tableKey, root) {
      const scope = root || document;
      const editable = isTableEditable(tableKey);
      const host = scope.closest?.('[data-table-key]') || scope.querySelector?.('[data-table-key]') || scope;
      if (!host) return;

      host.classList.toggle('table-readonly', !editable);

      host.querySelectorAll?.('[data-edit-input]').forEach(el => {
        if ('readOnly' in el) {
          el.readOnly = !editable;
          el.toggleAttribute('readonly', !editable);
        }
        el.setAttribute('aria-readonly', String(!editable));
        el.tabIndex = editable ? 0 : -1;
      });

      host.querySelectorAll?.('[data-edit-delete]').forEach(btn => {
        btn.disabled = !editable;
        btn.hidden = !editable;
        btn.classList.remove('pointer-events-none', 'opacity-50');
      });

      host.querySelectorAll?.('[data-edit-action], [data-edit-rename]').forEach(btn => {
        btn.disabled = !editable;
        btn.classList.toggle('pointer-events-none', !editable);
        btn.classList.toggle('opacity-50', !editable);
      });

      const addRowButtons = new Set([
        ...(host.querySelectorAll?.('[data-edit-add-row]') || []),
        ...Array.from(document.querySelectorAll('[data-edit-add-row][data-edit-target]'))
          .filter(btn => btn.dataset.editTarget === tableKey)
      ]);
      addRowButtons.forEach(btn => {
        btn.disabled = !editable;
        btn.setAttribute('aria-disabled', String(!editable));
        btn.classList.toggle('opacity-50', !editable);
        btn.classList.toggle('cursor-not-allowed', !editable);
      });

      host.querySelectorAll?.('[data-calculated-indicator]').forEach(el => {
        el.classList.toggle('hidden', !editable);
      });

      const toggle = host.querySelector?.('[data-edit-toggle]');
      if (toggle) {
        toggle.classList.toggle('is-editing', editable);
        toggle.title = editable ? 'Desactivar edición' : 'Activar edición';
        toggle.setAttribute('aria-label', editable ? 'Desactivar edición de esta tabla' : 'Activar edición de esta tabla');
        toggle.innerHTML = editable
          ? '<i class="ph-bold ph-pencil-line edit-toggle-icon" aria-hidden="true"></i><span class="edit-toggle-label">Editando</span>'
          : '<i class="ph-bold ph-pencil-simple edit-toggle-icon" aria-hidden="true"></i><span class="edit-toggle-label">Editar</span>';
        toggle.setAttribute('aria-pressed', String(editable));
      }
    }

    /** Alterna el modo de edición de una tabla y actualiza su interfaz. */
    function toggleTableEditMode(tableKey, buttonEl) {
      tableEditModes[tableKey] = !isTableEditable(tableKey);
      updateTableEditUi(tableKey, buttonEl?.closest('[data-table-key]') || document);
    }

    /** Comprueba que la tabla esté habilitada para edición antes de aceptar cambios. */
    function requireTableEdit(tableKey) {
      if (isTableEditable(tableKey)) return true;
      showToast('Pulsa "Editar" para modificar esta tabla.', 'info');
      return false;
    }

    /** Desactiva el modo de edición de todas las tablas al abandonar una sección. */
    function disableAllTableEditModes() {
      // Al salir del campo activo, dispara onchange si el usuario acaba de modificarlo.
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && activeElement.matches('[data-edit-input]')) {
        activeElement.blur();
      }

      // Apaga tanto los modos registrados como los de tablas creadas dinámicamente.
      Object.keys(tableEditModes).forEach(tableKey => {
        tableEditModes[tableKey] = false;
      });

      document.querySelectorAll('[data-table-key]').forEach(host => {
        const tableKey = host.dataset.tableKey;
        if (!tableKey) return;
        tableEditModes[tableKey] = false;
        updateTableEditUi(tableKey, host);
      });
    }

    /** Convierte números escritos en distintos formatos habituales en un valor numérico. */

// Investing links must escape card click/drag handlers and open in a separate tab.
/* ── Investing link guard ────────────────────────────────────────────────
       Evita que los manejadores de las tarjetas/drag & drop interfieran con
       los enlaces de Investing. Todos los enlaces se abren en una pestaña nueva.
    */
    // Protege los enlaces externos de Investing frente a eventos de las tarjetas y arrastres.
    document.addEventListener('click', function (event) {
      const link = event.target.closest('a[href]');
      if (!link) return;

      try {
        const url = new URL(link.href, window.location.href);
        if (!/(^|\.)investing\.com$/i.test(url.hostname)) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        window.open(url.href, '_blank', 'noopener,noreferrer');
      } catch (_) {
        // Si la URL no es válida, no interferimos con el comportamiento normal.
      }
    }, true);
