// Toast notifications.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 676-690) ---
    /** Muestra una notificación temporal de información, éxito o error. */
    function showToast(msg, type = 'info') {
      const container = document.getElementById('toastContainer');
      if (!container) return;
      const t = document.createElement('div');
      const bg = type === 'error' ? 'bg-rose-600' : type === 'success' ? 'bg-emerald-600' : 'bg-slate-900 dark:bg-slate-800';
      t.className = `${bg} text-white px-4 py-2.5 rounded-xl text-xs shadow-xl transform translate-y-2 opacity-0 pointer-events-auto flex items-center gap-2 border border-white/10 transition-all duration-200`;
      t.innerHTML = `<span>${esc(msg)}</span>`;
      container.appendChild(t);
      setTimeout(() => t.classList.remove('translate-y-2', 'opacity-0'), 10);
      setTimeout(() => {
        t.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => t.remove(), 250);
      }, 3500);
    }
