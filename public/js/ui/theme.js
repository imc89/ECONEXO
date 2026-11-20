// Dark/light theme management.
// Compatibility note: ordered classic script; shared names remain available to legacy inline actions.
'use strict';

// --- Extracted responsibility (legacy source lines 710-735) ---
    // ── THEME ────────────────────────────────────────────────────────────────────
    /** Lee la preferencia de tema guardada y aplica el tema correspondiente. */
    function loadTheme() {
      const stored = localStorage.getItem(THEME_KEY);
      const dark = stored === 'dark' || (!stored && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
      updateThemeIcon();
    }

    /** Cambia entre tema claro y oscuro y persiste la preferencia. */
    function toggleTheme() {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
      updateThemeIcon();
      Object.values(charts).forEach(c => { try { c.destroy(); } catch (_) { } });
      for (const k in charts) delete charts[k];
      onPageEnter(currentSection);
    }

    /** Sincroniza el icono del botón de tema con el tema activo. */
    function updateThemeIcon() {
      const dark = document.documentElement.classList.contains('dark');
      const icon = document.getElementById('themeIcon');
      if (icon) icon.className = `ph ${dark ? 'ph-sun text-amber-400' : 'ph-moon text-slate-600'} text-base`;
    }

