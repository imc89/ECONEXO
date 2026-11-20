// Monthly backup history, snapshots and backup-history UI.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 289-555) ---
    // ── MONTHLY JSON BACKUP HISTORY ───────────────────────────────────────────────
    let monthlyBackupTimer = null;
    let selectedBackupId = null;

    function getWorkspacePayload(exportedAt = new Date().toISOString()) {
      return {
        version: 9,
        exportedAt,
        state: JSON.parse(JSON.stringify(state)),
        liveQuotes: JSON.parse(JSON.stringify(liveQuotes)),
        chartModes: JSON.parse(JSON.stringify(chartModes))
      };
    }

    async function readLegacyMonthlyBackups() {
      try {
        const saved = JSON.parse(localStorage.getItem(BACKUP_HISTORY_KEY) || '[]');
        return Array.isArray(saved) ? saved.filter(x => x && x.id && x.payload) : [];
      } catch (_) { return []; }
    }

    // El índice guarda solo metadatos; cada backup mensual es un registro separado.
    // Así, actualizar un mes no obliga a reescribir los otros 23 snapshots completos.
    async function readMonthlyBackups() {
      try {
        const index = await idbGetValue('monthlyBackupIndex');
        if (Array.isArray(index)) return index;
        const legacy = await readLegacyMonthlyBackups();
        if (!legacy.length) return [];
        const metadata = [];
        for (const item of legacy.slice(-24)) {
          await idbSetValue(`monthlyBackup:${item.id}`, item);
          metadata.push({ id: item.id, date: item.date, label: item.label, bytes: JSON.stringify(item.payload).length });
        }
        await idbSetValue('monthlyBackupIndex', metadata);
        // Migración finalizada: evitar mantener una segunda copia grande en localStorage.
        try { localStorage.removeItem(BACKUP_HISTORY_KEY); } catch (_) {}
        return metadata;
      } catch (error) {
        console.warn('IndexedDB no está disponible para el índice de backups; se consultará localStorage.', error);
        const legacy = await readLegacyMonthlyBackups();
        return legacy.map(item => ({ id: item.id, date: item.date, label: item.label, bytes: JSON.stringify(item.payload).length }));
      }
    }

    async function writeMonthlyBackups(backups) {
      try {
        const previous = await readMonthlyBackups();
        const nextIds = new Set(backups.map(item => item.id));
        for (const item of previous) {
          if (!nextIds.has(item.id)) await idbDeleteKey(`monthlyBackup:${item.id}`).catch(() => {});
        }
        await idbSetValue('monthlyBackupIndex', backups.map(({ id, date, label, bytes }) => ({ id, date, label, bytes: Number(bytes) || 0 })));
        return true;
      } catch (error) {
        console.warn('IndexedDB no disponible para backups; se usará localStorage.', error);
        const legacy = await readLegacyMonthlyBackups();
        const allowed = new Set(backups.map(item => item.id));
        const fallback = legacy.filter(item => allowed.has(item.id));
        try {
          localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(fallback.slice(-12)));
          return true;
        } catch (_) { return false; }
      }
    }

    async function saveMonthlyBackup(options = {}) {
      const now = new Date();
      const monthId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const metadata = await readMonthlyBackups();
      const existingCurrentMonth = metadata.find(item => item.id === monthId);
      const lastBackupTime = Date.parse(existingCurrentMonth?.date || '');
      const minAutoBackupIntervalMs = 6 * 60 * 60 * 1000;
      // Con históricos grandes, volver a clonar/escribir el espacio de trabajo tras
      // cada ráfaga de cambios consume memoria y disco. Actualización automática como
      // máximo cada seis horas; la exportación manual fuerza una fotografía nueva.
      if (options.force !== true && Number.isFinite(lastBackupTime) && now.getTime() - lastBackupTime < minAutoBackupIntervalMs) return;
      const entry = {
        id: monthId,
        date: now.toISOString(),
        label: now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
        payload: getWorkspacePayload(now.toISOString())
      };
      const bytes = JSON.stringify(entry.payload).length;
      const indexEntry = { id: entry.id, date: entry.date, label: entry.label, bytes };
      const updatedIndex = metadata.filter(item => item.id !== monthId);
      updatedIndex.push(indexEntry);
      updatedIndex.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const trimmedIndex = updatedIndex.slice(-24);

      try {
        await idbSetValue(`monthlyBackup:${monthId}`, entry);
        for (const oldItem of updatedIndex.slice(0, Math.max(0, updatedIndex.length - 24))) {
          await idbDeleteKey(`monthlyBackup:${oldItem.id}`).catch(() => {});
        }
        await idbSetValue('monthlyBackupIndex', trimmedIndex);
      } catch (error) {
        console.warn('No se pudo guardar el backup separado en IndexedDB; se usará la copia heredada.', error);
        const legacy = await readLegacyMonthlyBackups();
        const merged = legacy.filter(item => item.id !== monthId);
        merged.push(entry);
        merged.sort((a, b) => String(a.date).localeCompare(String(b.date)));
        try {
          localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(merged.slice(-4)));
        } catch (_) {
          showToast('No se pudo crear el backup mensual. Exporta una copia de seguridad manual.', 'error');
          return;
        }
      }
      await renderBackupHistory();
    }

    function queueMonthlyBackup() {
      clearTimeout(monthlyBackupTimer);
      // La copia se genera tras 30 s sin cambios, no después de cada edición rápida.
      monthlyBackupTimer = setTimeout(() => {
        saveMonthlyBackup().catch(error => console.warn('Error creando backup mensual:', error));
      }, 30000);
    }

    function formatBackupBytes(value) {
      const bytes = Number(value) || 0;
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    async function renderBackupHistory() {
      const list = document.getElementById('backupHistoryList');
      const countEl = document.getElementById('backupHistoryCount');
      const exportBtn = document.getElementById('btnExportSelectedBackup');
      const deleteAllBtn = document.getElementById('btnDeleteAllBackups');
      if (!list || !countEl || !exportBtn) return;

      const from = document.getElementById('backupHistoryFrom')?.value || '';
      const to = document.getElementById('backupHistoryTo')?.value || '';
      const all = (await readMonthlyBackups()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const filtered = all.filter(item => {
        const d = String(item.date).slice(0, 10);
        return (!from || d >= from) && (!to || d <= to);
      });

      if (!filtered.some(x => x.id === selectedBackupId)) selectedBackupId = filtered[0]?.id || null;
      countEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'backup' : 'backups'}`;
      if (deleteAllBtn) deleteAllBtn.disabled = all.length === 0;

      if (!filtered.length) {
        list.innerHTML = '<div class="py-6 text-center text-[10px] text-slate-400">No hay backups en este rango de fechas.</div>';
        exportBtn.disabled = true;
        return;
      }

      list.innerHTML = filtered.map(item => {
        const bytes = Number(item.bytes) || 0;
        const dateText = new Date(item.date).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const checked = item.id === selectedBackupId ? 'checked' : '';
        const selectedClass = item.id === selectedBackupId ? ' is-selected' : '';
        return `<div class="backup-history-item${selectedClass} flex items-center gap-2.5 p-2.5 rounded-xl border border-transparent">
          <label class="min-w-0 flex-1 flex items-center gap-2.5 cursor-pointer">
            <input type="radio" name="backupHistorySelection" value="${esc(item.id)}" ${checked} class="accent-indigo-600 flex-shrink-0">
            <span class="min-w-0 flex-1">
              <span class="block text-[11px] font-bold capitalize text-slate-800 dark:text-slate-100">${esc(item.label)}</span>
              <span class="block text-[9px] text-slate-400 mt-0.5">${esc(dateText)} · ${formatBackupBytes(bytes)}</span>
            </span>
          </label>
          <button type="button" data-delete-backup="${esc(item.id)}" aria-label="Eliminar backup ${esc(item.label)}" title="Eliminar este backup" class="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition">
            <i class="ph ph-trash text-sm pointer-events-none"></i>
          </button>
        </div>`;
      }).join('');

      list.querySelectorAll('input[name="backupHistorySelection"]').forEach(input => {
        input.addEventListener('change', () => { selectedBackupId = input.value; renderBackupHistory().catch(console.warn); });
      });
      list.querySelectorAll('button[data-delete-backup]').forEach(button => {
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          deleteHistoricalBackup(button.dataset.deleteBackup).catch(error => showToast(error?.message || 'No se pudo eliminar el backup.', 'error'));
        });
      });
      exportBtn.disabled = !selectedBackupId;
    }

    /** Elimina una copia histórica de la memoria local tras confirmación explícita. */
    async function deleteHistoricalBackup(id) {
      const existing = (await readMonthlyBackups()).find(item => item.id === id);
      if (!existing) {
        showToast('Ese backup ya no está disponible.', 'info');
        renderBackupHistory().catch(console.warn);
        return;
      }
      showConfirm({
        title: '¿Eliminar este backup?',
        msg: `Se borrará del almacenamiento de este navegador la copia de ${existing.label}. Esta acción no se puede deshacer.`,
        onOk: async () => {
          clearTimeout(monthlyBackupTimer);
          const backups = (await readMonthlyBackups()).filter(item => item.id !== id);
          if (!await writeMonthlyBackups(backups)) {
            showToast('No se pudo eliminar el backup del almacenamiento local.', 'error');
            return;
          }
          if (selectedBackupId === id) selectedBackupId = null;
          await renderBackupHistory();
          showToast(`Backup de ${existing.label} eliminado.`, 'success');
        }
      });
    }

    async function deleteAllHistoricalBackups() {
      const backups = await readMonthlyBackups();
      if (!backups.length) {
        showToast('No hay backups históricos que eliminar.', 'info');
        renderBackupHistory();
        return;
      }
      showConfirm({
        title: '¿Vaciar todo el histórico?',
        msg: `Se eliminarán ${backups.length} copias de seguridad del almacenamiento de este navegador. Los datos actuales de ECONEXO no se borrarán. Esta acción no se puede deshacer.`,
        onOk: async () => {
          clearTimeout(monthlyBackupTimer);
          if (!await writeMonthlyBackups([])) {
            showToast('No se pudo vaciar el histórico de backups.', 'error');
            return;
          }
          selectedBackupId = null;
          await renderBackupHistory();
          showToast('Histórico de backups eliminado.', 'success');
        }
      });
    }

    async function exportHistoricalBackup() {
      const selected = (await readMonthlyBackups()).find(x => x.id === selectedBackupId);
      if (!selected) {
        showToast('Selecciona primero un backup histórico.', 'info');
        return;
      }
      let fullBackup = null;
      try { fullBackup = await idbGetValue(`monthlyBackup:${selected.id}`); } catch (_) {}
      if (!fullBackup?.payload) {
        const legacy = await readLegacyMonthlyBackups();
        fullBackup = legacy.find(item => item.id === selected.id) || null;
      }
      if (!fullBackup?.payload) {
        showToast('El contenido de ese backup no está disponible. Exporta los datos actuales como alternativa.', 'error');
        return;
      }
      const blob = new Blob([JSON.stringify(fullBackup.payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ECONEXO_BACKUP_${String(selected.id).replace(/[^0-9-]/g, '')}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 500);
      showToast(`Backup de ${selected.label} exportado.`, 'success');
    }

    function toggleBackupHistoryMenu(force) {
      const menu = document.getElementById('backupHistoryMenu');
      const btn = document.getElementById('btnBackupHistory');
      if (!menu || !btn) return;
      const shouldOpen = typeof force === 'boolean' ? force : menu.classList.contains('hidden');
      menu.classList.toggle('hidden', !shouldOpen);
      btn.setAttribute('aria-expanded', String(shouldOpen));
      if (shouldOpen) renderBackupHistory().catch(console.warn);
    }

