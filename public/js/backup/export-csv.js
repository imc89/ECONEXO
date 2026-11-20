// Fund monitor and portfolio CSV export.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 5106-5126) ---
    function exportFondosRows() {
      const rows = [];
      for (const q of liveQuotes) rows.push({ tipo: 'Monitor', isin: q.isin || '', fondo: q.fundName || '', moneda: q.currency || '', precio: parseNumericForChart(q.lastPrice), variacion: q.changePercent || '', consulta: q.updatedAt || '', url: q.url || '' });
      for (const r of getChronologicalRows(state.myinvestor || []).map(x => x.row)) {
        rows.push({ tipo: 'Cartera', fecha: r.fecha || '', isin: '', fondo: '', moneda: 'EUR', precio: '', variacion: '', totalCartera: r.totalCartera ?? '', fechaRegistro: r.fecha || '' });
      }
      return rows;
    }

    function downloadBlob(blob, filename) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    function exportFondosCSV() {
      const rows = exportFondosRows();
      const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
      const csv = '\ufeff' + [keys.join(';'), ...rows.map(r => keys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `ECONEXO_FONDOS_${new Date().toISOString().slice(0,10)}.csv`);
      showToast('Exportación CSV de fondos creada.', 'success');
    }

