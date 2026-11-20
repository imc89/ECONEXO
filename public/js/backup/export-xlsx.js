// Fund monitor and portfolio XLSX export.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 5127-5136) ---
    function exportFondosXLSX() {
      if (!window.XLSX) { showToast('No se ha podido cargar el motor de Excel. Usa CSV como alternativa.', 'error'); return; }
      const wb = XLSX.utils.book_new();
      const monitor = liveQuotes.map(q => ({ ISIN: q.isin || '', Fondo: q.fundName || '', Moneda: q.currency || '', Precio: parseNumericForChart(q.lastPrice), Variacion: q.changePercent || '', UltimaConsulta: q.updatedAt || '', URL: q.url || '' }));
      const historico = getChronologicalRows(state.myinvestor || []).map(x => x.row);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monitor), 'Monitor');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(historico), 'Historico cartera');
      XLSX.writeFile(wb, `ECONEXO_FONDOS_${new Date().toISOString().slice(0,10)}.xlsx`);
      showToast('Excel de fondos creado.', 'success');
    }
