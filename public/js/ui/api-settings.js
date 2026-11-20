// Backend API Connection and Health Settings
'use strict';

(function () {
  const STORAGE_KEY = 'econexo_api_url';

  function getStoredApiUrl() {
    try {
      return (localStorage.getItem(STORAGE_KEY) || '').trim();
    } catch (_) {
      return '';
    }
  }

  function setStoredApiUrl(url) {
    try {
      const clean = (url || '').trim().replace(/\/+$/, '');
      if (clean) {
        localStorage.setItem(STORAGE_KEY, clean);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (_) {}
  }

  async function checkBackendHealth(targetUrl) {
    const base = targetUrl !== undefined ? targetUrl.trim().replace(/\/+$/, '') : getStoredApiUrl();
    const endpoint = base ? `${base}/api/health` : '/api/health';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      return { ok: true, data };
    } catch (err) {
      clearTimeout(timeoutId);
      return { ok: false, error: err.name === 'AbortError' ? 'Tiempo de espera agotado' : (err.message || 'Error de conexión') };
    }
  }

  function updateStatusIndicator(isOnline, detail) {
    const dot = document.getElementById('apiStatusDot');
    const icon = document.getElementById('apiStatusIcon');
    const badge = document.getElementById('apiModalStatusBadge');
    const text = document.getElementById('apiModalStatusText');
    const sub = document.getElementById('apiModalStatusSub');

    if (dot) {
      dot.className = isOnline
        ? 'absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50'
        : 'absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500 animate-pulse';
    }

    if (badge) {
      badge.className = isOnline
        ? 'w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50'
        : 'w-3 h-3 rounded-full bg-rose-500';
    }

    if (text) {
      text.textContent = isOnline ? 'Backend Conectado (Puppeteer listo)' : 'Backend Desconectado';
      text.className = isOnline ? 'text-xs font-semibold text-emerald-600 dark:text-emerald-400' : 'text-xs font-semibold text-rose-600 dark:text-rose-400';
    }

    if (sub) {
      if (isOnline) {
        sub.textContent = detail?.version ? `Versión ${detail.version} · Uptime: ${detail.uptime || 0}s` : 'Servicio activo';
      } else {
        const isGh = window.location.hostname.includes('github.io');
        sub.textContent = isGh
          ? 'GitHub Pages requiere conectar un backend remoto (Render o local).'
          : (detail || 'No se pudo contactar con el endpoint /api/health.');
      }
    }
  }

  window.openApiSettingsModal = function () {
    const modal = document.getElementById('modalApiSettings');
    const input = document.getElementById('apiUrlInput');
    if (!modal) return;
    if (input) input.value = getStoredApiUrl();
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    window.testCurrentApiSettings();
  };

  window.closeApiSettingsModal = function () {
    const modal = document.getElementById('modalApiSettings');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  };

  window.testCurrentApiSettings = async function () {
    const input = document.getElementById('apiUrlInput');
    const btn = document.getElementById('btnTestApiConnection');
    const url = input ? input.value : getStoredApiUrl();

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ph-bold ph-circle-notch animate-spin text-xs"></i> Probando…';
    }

    const res = await checkBackendHealth(url);
    updateStatusIndicator(res.ok, res.ok ? res.data : res.error);

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Comprobar';
    }
    return res;
  };

  window.saveApiSettings = async function () {
    const input = document.getElementById('apiUrlInput');
    const raw = input ? input.value.trim() : '';
    setStoredApiUrl(raw);

    const test = await window.testCurrentApiSettings();
    if (test.ok) {
      if (typeof showToast === 'function') {
        showToast('Backend conectado correctamente.', 'success');
      }
      setTimeout(window.closeApiSettingsModal, 800);
    } else {
      if (typeof showToast === 'function') {
        showToast('Guardado, pero el servidor no responde todavía.', 'error');
      }
    }
  };

  window.resetApiSettings = function () {
    setStoredApiUrl('');
    const input = document.getElementById('apiUrlInput');
    if (input) input.value = '';
    window.testCurrentApiSettings();
    if (typeof showToast === 'function') {
      showToast('Restablecido a conexión local por defecto.', 'info');
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const btnOpen = document.getElementById('btnApiSettings');
    if (btnOpen) btnOpen.addEventListener('click', window.openApiSettingsModal);

    const btnTest = document.getElementById('btnTestApiConnection');
    if (btnTest) btnTest.addEventListener('click', window.testCurrentApiSettings);

    const btnSave = document.getElementById('btnSaveApiUrl');
    if (btnSave) btnSave.addEventListener('click', window.saveApiSettings);

    const btnReset = document.getElementById('btnResetApiUrl');
    if (btnReset) btnReset.addEventListener('click', window.resetApiSettings);

    // Initial check on load
    checkBackendHealth().then(res => {
      updateStatusIndicator(res.ok, res.ok ? res.data : res.error);
    });
  });
})();
