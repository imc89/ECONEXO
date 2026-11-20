// Shared confirmation dialog and paste/import modal interactions.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 659-674) ---
    /** Solicita confirmación y restablece los datos de la aplicación. */
    function clearAllData() {
      showConfirm({
        title: '¿Limpiar todos los datos?',
        msg: 'Se vaciarán todas las tablas y comenzarás completamente desde cero.',
        onOk: () => {
          state = JSON.parse(JSON.stringify(CLEAN_EMPTY_STATE));
          liveQuotes = [];
          saveState({ skipBackup: true });
          saveLiveQuotes();
          clearTimeout(monthlyBackupTimer);
          onPageEnter(currentSection);
          showToast('Todos los datos han sido vaciados.', 'info');
        }
      });
    }

// --- Extracted responsibility (legacy source lines 692-709) ---
    /** Presenta el diálogo de confirmación reutilizable y registra la acción aceptada. */
    function showConfirm({ title, msg, onOk }) {
      document.getElementById('confirmTitle').textContent = title || '¿Confirmar?';
      document.getElementById('confirmMsg').textContent = msg || '';
      pendingConfirm = onOk;
      const d = document.getElementById('confirmDialog');
      d.classList.remove('hidden');
      d.style.display = 'flex';
    }

    /** Cierra el diálogo de confirmación y limpia su acción pendiente. */
    function hideConfirm() {
      const d = document.getElementById('confirmDialog');
      d.classList.add('hidden');
      d.style.display = 'none';
      pendingConfirm = null;
    }


// --- Extracted responsibility (legacy source lines 4653-4954) ---
    // ── IMPORTACIÓN/PEGADO DESDE HOJAS DE CÁLCULO ─────────────────────────────────
    /** Rellena el selector de destino del importador de datos tabulares. */
    function updatePasteModalTargets() {
      const select = document.getElementById('pasteTargetSelect');
      if (!select) return;
      select.innerHTML = '';

      // 1. Bank tables
      if (state.bancaTables.length > 0) {
        state.bancaTables.forEach(bt => {
          const opt = document.createElement('option');
          opt.value = `banca_${bt.id}`;
          opt.textContent = `1. Banca — ${bt.name} (${bt.hasInterest ? 'Con % Interés' : 'Estándar'})`;
          select.appendChild(opt);
        });
      } else {
        const opt = document.createElement('option');
        opt.value = `banca_none`;
        opt.textContent = `1. Banca — (Añade una cuenta primero)`;
        select.appendChild(opt);
      }

      // 2. Fondos Indexados
      const optF1 = document.createElement('option');
      optF1.value = 'fondosList';
      optF1.textContent = '2. Fondos Indexados — Cartera (Nombre, ISIN, Aportado, Valor)';
      select.appendChild(optF1);

      const optF2 = document.createElement('option');
      optF2.value = 'myinvestor';
      optF2.textContent = '2. Fondos Indexados — Registro Mensual (Fecha, Inv. Mensual, Aportado, Valor)';
      select.appendChild(optF2);

      // 3. Ahorro
      const optA1 = document.createElement('option');
      optA1.value = 'matrizAnual';
      optA1.textContent = '3. Ahorro — Matriz Anual (Año y meses Ene-Dic)';
      select.appendChild(optA1);

    }

    /** Comprueba que el destino elegido admita pegado e importación. */
    function isPasteTargetEditable(target) {
      if (target.startsWith('banca_')) return isTableEditable(target);
      if (target === 'myinvestor') return isTableEditable('myinvestor');
      if (target === 'mensual') return isTableEditable('mensual');
      if (target === 'matrizAnual') return true;
      return true;
    }

    /** Abre el importador de datos y selecciona su destino. */
    function openPasteModalFor(target) {
      if (target && target !== 'bancaAuto' && !isPasteTargetEditable(target)) {
        showToast('Pulsa "Editar" en la tabla antes de pegar datos.', 'info');
        return;
      }
      updatePasteModalTargets();
      const modal = document.getElementById('pasteModal');
      const select = document.getElementById('pasteTargetSelect');
      if (select && target && target !== 'bancaAuto') select.value = target;
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      const input = document.getElementById('pasteTextInput');
      input.value = '';
      document.getElementById('pastePreviewBox').classList.add('hidden');
      setTimeout(() => input.focus(), 60);
    }

    /** Abre el importador con una cuenta bancaria como destino. */
    function openPasteModalForBankTable(btId) {
      openPasteModalFor(`banca_${btId}`);
    }

    /** Cierra y restablece el diálogo para pegar datos tabulares. */
    function closePasteModal() {
      const modal = document.getElementById('pasteModal');
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }

    /** Convierte texto tabulado o separado por delimitadores en filas y columnas. */
    function parseSpreadsheetText(rawText) {
      if (!rawText || !rawText.trim()) return [];
      const lines = rawText.trim().split(/\r?\n/);
      return lines.map(line => {
        const delimiter = line.includes('\t') ? '\t' : (line.includes(';') ? ';' : ',');
        return line.split(delimiter).map(cell => cell.trim());
      });
    }

    document.getElementById('pasteTextInput')?.addEventListener('input', e => {
      const parsed = parseSpreadsheetText(e.target.value);
      const previewBox = document.getElementById('pastePreviewBox');
      const previewTbody = document.getElementById('pastePreviewTbody');
      const badge = document.getElementById('pastePreviewBadge');

      if (parsed.length === 0) {
        previewBox.classList.add('hidden');
        return;
      }

      previewBox.classList.remove('hidden');
      badge.textContent = `${parsed.length} fila${parsed.length > 1 ? 's' : ''}`;
      previewTbody.innerHTML = parsed.slice(0, 6).map(row => `
    <tr class="hover:bg-slate-100 dark:hover:bg-slate-800">
      ${row.map(cell => `<td class="py-1 px-2 truncate max-w-[140px] text-slate-700 dark:text-slate-300">${esc(cell)}</td>`).join('')}
    </tr>
  `).join('');
    });

    document.getElementById('btnExecutePaste')?.addEventListener('click', () => {
      const rawText = document.getElementById('pasteTextInput').value;
      const target = document.getElementById('pasteTargetSelect').value;
      const mode = document.querySelector('input[name="pasteMode"]:checked')?.value || 'append';
      const parsed = parseSpreadsheetText(rawText);

      if (parsed.length === 0) {
        showToast('Por favor, pega datos válidos.', 'error');
        return;
      }
      if (!isPasteTargetEditable(target)) {
        showToast('Pulsa "Editar" en la tabla seleccionada antes de importar.', 'info');
        return;
      }

      applyParsedRowsToTarget(target, parsed, mode);
      closePasteModal();
      saveState();
      onPageEnter(currentSection);
      showToast(`¡Se han importado ${parsed.length} filas con éxito!`, 'success');
    });

    /** Integra las filas importadas en la tabla de destino respetando el modo elegido. */
    function applyParsedRowsToTarget(target, parsedRows, mode) {
      if (target.startsWith('banca_')) {
        const btId = target.replace('banca_', '');
        const bt = state.bancaTables.find(t => t.id === btId);
        if (!bt) {
          showToast('No se encontró la tabla bancaria seleccionada.', 'error');
          return;
        }

        if (bt.hasInterest) {
          // Columns: Fecha | Transferencia | Cantidad Total | Interés | Cantidad Ganada
          const newRows = parsedRows.map(cols => ({
            fecha: cols[0] || '01/01/2025',
            transferencia: cols[1] || '',
            cantidadTotal: parseNum(cols[2]),
            interes: parseNum(cols[3] || 0),
            cantidadGanada: parseNum(cols[4] || 0),
            cantidadGanadaManual: true
          }));
          if (mode === 'replace') bt.rows = newRows;
          else bt.rows = bt.rows.concat(newRows);
        } else {
          // Columns: Fecha | Transferencias | Valor Liquidativo | Cantidad Total | Dif. Mensual
          const newRows = parsedRows.map(cols => ({
            fecha: cols[0] || '01/01/2025',
            transferencias: parseNum(cols[1]),
            vl: parseNum(cols[2]),
            cantidadTotal: parseNum(cols[3] || cols[2]),
            diffMensual: parseNum(cols[4] || 0)
          }));
          if (mode === 'replace') bt.rows = newRows;
          else bt.rows = bt.rows.concat(newRows);
        }
      }
      else if (target === 'fondosList') {
        const newRows = parsedRows.map(cols => ({
          id: uid('f'),
          name: cols[0] || 'Fondo',
          isin: cols[1] || '',
          invested: parseNum(cols[2]),
          currentValue: parseNum(cols[3] || cols[2])
        }));
        if (mode === 'replace') state.fondosList = newRows;
        else state.fondosList = state.fondosList.concat(newRows);
      }
      else if (target === 'myinvestor') {
        const funds = getMonitorFunds();
        if (funds.length === 0) {
          showToast('Añade primero fondos en MONITOR DE FONDOS.', 'error');
          return;
        }

        const firstRowLooksLikeHeader = parsedRows[0] && String(parsedRows[0][0] || '').trim().toLowerCase() === 'fecha';
        const dataRows = firstRowLooksLikeHeader ? parsedRows.slice(1) : parsedRows;

        const newRows = dataRows
          .filter(cols => cols.some(cell => String(cell || '').trim() !== ''))
          .map(cols => {
            const row = { fecha: cols[0] || '', fondos: {} };
            funds.forEach((fund, idx) => {
              row.fondos[fund.key] = {
                movimiento: parseNum(cols[1 + idx * 2] || 0),
                total: parseNum(cols[2 + idx * 2] || 0)
              };
            });

            // Formato completo de la tabla bancaria:
            // Fecha + (Movimiento/Total) x fondos + TOTAL CARTERA + CANTIDAD GANADA.
            // Los dos últimos valores son fuente bancaria y NO deben recalcularse.
            const sourceTotal = cols[1 + funds.length * 2];
            const sourceGain = cols[2 + funds.length * 2];
            const hasSourceTotal = sourceTotal !== undefined && String(sourceTotal).trim() !== '';
            const hasSourceGain = sourceGain !== undefined && String(sourceGain).trim() !== '';

            // TOTAL CARTERA se recalcula siempre a partir de los TOTAL de los fondos.
            row.totalCartera = 0;
            row.totalCarteraImportado = false;

            // CANTIDAD GANADA sí se conserva cuando viene de la fuente.
            row.cantidadGanada = hasSourceGain ? parseNum(sourceGain) : 0;
            row.cantidadGanadaImportada = hasSourceGain;
            row.plusvaliaComercialImportada = hasSourceGain;
            return row;
          });

        if (mode === 'replace') state.myinvestor = newRows;
        else state.myinvestor = state.myinvestor.concat(newRows);
      }
      else if (target === 'mensual') {
        const newRows = parsedRows.map(cols => ({
          periodo: cols[0] || 'Mes',
          ingresos: parseNum(cols[1]),
          gastos: parseNum(cols[2]),
          notas: cols[3] || ''
        }));
        if (mode === 'replace') state.mensual = newRows;
        else state.mensual = state.mensual.concat(newRows);
      }
      else if (target === 'matrizAnual') {
        const first = parsedRows[0] || [];
        const looksLikeHeader = String(first[0] || '').trim().toLowerCase().includes('año');
        const dataRows = looksLikeHeader ? parsedRows.slice(1) : parsedRows;
        dataRows.forEach(cols => {
          const yr = String(cols[0] || '').trim().replace(/[^0-9]/g, '');
          if (!/^\d{4}$/.test(yr)) return;
          const yearObj = { _createdManually: false };
          MESES.forEach((m, idx) => {
            const cell = cols[idx + 1];
            const rawCell = cell === undefined || cell === null ? '' : String(cell).trim();
            yearObj[m] = rawCell === '' || !/\d/.test(rawCell) ? '' : parseNum(rawCell);
          });
          state.matricesAnuales[yr] = yearObj;
        });
      }
    }

    /** Copia una tabla en formato tabulado compatible con hojas de cálculo. */
    function copyTableToClipboard(tableId) {
      const table = document.getElementById(tableId);
      if (!table) return;

      const rows = [];
      const ths = table.querySelectorAll('thead th');
      const headerTexts = [];
      ths.forEach((th, i) => {
        if (i < ths.length - 1) headerTexts.push(th.textContent.trim());
      });
      rows.push(headerTexts.join('\t'));

      const trs = table.querySelectorAll('tbody tr');
      trs.forEach(tr => {
        const rowData = [];
        const tds = tr.querySelectorAll('td');
        tds.forEach((td, i) => {
          if (i < tds.length - 1) {
            const input = td.querySelector('input');
            const text = input ? input.value : td.textContent.trim();
            rowData.push(text.replace(/\t/g, ' '));
          }
        });
        if (rowData.length) rows.push(rowData.join('\t'));
      });

      const tsv = rows.join('\n');
      navigator.clipboard.writeText(tsv).then(() => {
        showToast('¡Tabla copiada al portapapeles!', 'success');
      }).catch(() => {
        showToast('Error al copiar.', 'error');
      });
    }

    document.addEventListener('paste', e => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || document.getElementById('pasteModal')?.style.display === 'flex' || document.getElementById('modalCreateBankTable')?.style.display === 'flex') return;

      const clipText = e.clipboardData?.getData('text');
      if (!clipText || (!clipText.includes('\t') && !clipText.includes('\n'))) return;

      const parsed = parseSpreadsheetText(clipText);
      if (parsed.length >= 2 || (parsed[0] && parsed[0].length >= 3)) {
        e.preventDefault();
        openPasteModalFor(currentSection === 'banca' && state.bancaTables.length > 0 ? `banca_${state.bancaTables[0].id}` : currentSection === 'fondos' ? 'myinvestor' : 'matrizAnual');
        const input = document.getElementById('pasteTextInput');
        if (input) {
          input.value = clipText;
          input.dispatchEvent(new Event('input'));
        }
      }
    });

