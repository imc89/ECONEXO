// ECONEXO branded password dialog for encrypted backups.
// All password validation, decryption errors and password-flow feedback stay inside this modal.
'use strict';

let backupPasswordDialogContext = null;
let backupPasswordDialogBound = false;

function setBackupPasswordFeedback(message = '', type = 'info') {
  const box = document.getElementById('backupPasswordFeedback');
  const text = document.getElementById('backupPasswordFeedbackText');
  const icon = document.getElementById('backupPasswordFeedbackIcon');
  if (!box || !text || !icon) return;
  text.textContent = message;
  box.classList.remove('hidden');
  const styles = {
    info: {
      box: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200',
      icon: 'ph-info text-slate-500 dark:text-slate-300'
    },
    error: {
      box: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200',
      icon: 'ph-warning-circle text-rose-600 dark:text-rose-400'
    },
    success: {
      box: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200',
      icon: 'ph-check-circle text-emerald-600 dark:text-emerald-400'
    }
  };
  const selected = styles[type] || styles.info;
  box.className = `flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${selected.box}`;
  icon.className = `ph-bold ${selected.icon} text-base shrink-0 mt-px`;
  box.setAttribute('role', type === 'error' ? 'alert' : 'status');
  box.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
}

function clearBackupPasswordFeedback() {
  const box = document.getElementById('backupPasswordFeedback');
  const text = document.getElementById('backupPasswordFeedbackText');
  if (box) box.classList.add('hidden');
  if (text) text.textContent = '';
}

function closeBackupPasswordDialog(success = false) {
  const ctx = backupPasswordDialogContext;
  if (!ctx) return;
  if (ctx.busy) return;

  const modal = document.getElementById('backupPasswordModal');
  const submit = document.getElementById('backupPasswordSubmit');
  const form = document.getElementById('backupPasswordForm');
  const password = document.getElementById('backupPasswordInput');
  const confirmation = document.getElementById('backupPasswordConfirmInput');
  const trigger = ctx.returnFocus;

  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.setAttribute('aria-hidden', 'true');
  }
  if (form) form.reset();
  if (password) password.type = 'password';
  if (confirmation) confirmation.type = 'password';
  if (submit) {
    submit.disabled = false;
    submit.innerHTML = '<i class="ph-bold ph-lock-key-open text-sm" aria-hidden="true"></i><span id="backupPasswordSubmitText">Continuar</span>';
  }
  document.getElementById('backupPasswordFields')?.classList.remove('hidden');
  document.getElementById('backupPasswordCancel')?.classList.remove('hidden');
  document.getElementById('backupPasswordClose')?.removeAttribute('disabled');
  clearBackupPasswordFeedback();

  backupPasswordDialogContext = null;
  if (ctx.bodyHadOverflowHidden === false) document.body.classList.remove('overflow-hidden');
  if (typeof ctx.resolve === 'function') ctx.resolve({ success: Boolean(success), cancelled: !success });
  if (trigger && typeof trigger.focus === 'function') setTimeout(() => trigger.focus(), 0);
}

/**
 * Opens ECONEXO's branded password modal.
 * options.mode: 'create' asks for password + confirmation; 'unlock' asks for an existing password.
 * onSubmit may throw an Error; its message is shown inside this modal without closing it.
 */
function openBackupPasswordDialog(options = {}, onSubmit) {
  const modal = document.getElementById('backupPasswordModal');
  const form = document.getElementById('backupPasswordForm');
  if (!modal || !form) {
    return Promise.reject(new Error('No se ha podido abrir la ventana de contraseña de ECONEXO. Actualiza la aplicación e inténtalo de nuevo.'));
  }

  if (backupPasswordDialogContext) {
    if (backupPasswordDialogContext.busy) return Promise.reject(new Error('Hay otra operación de backup en curso.'));
    closeBackupPasswordDialog(false);
  }

  return new Promise((resolve) => {
    const mode = options.mode === 'unlock' ? 'unlock' : 'create';
    const confirmationRequired = mode === 'create';
    const title = options.title || (confirmationRequired ? 'Proteger copia de seguridad' : 'Restaurar copia cifrada');
    const description = options.description || (confirmationRequired
      ? 'Crea una contraseña para proteger tus datos financieros antes de descargar la copia.'
      : 'Introduce la contraseña utilizada al cifrar este backup para verificarlo y restaurar tus datos.');

    backupPasswordDialogContext = {
      resolve,
      onSubmit,
      mode,
      confirmationRequired,
      busy: false,
      completed: false,
      returnFocus: (document.activeElement?.closest?.('#exportBackupMenu') ? document.getElementById('btnExportWS') : document.activeElement?.id === 'wsFileInput' ? document.getElementById('btnImportWS') : document.activeElement),
      bodyHadOverflowHidden: document.body.classList.contains('overflow-hidden')
    };

    document.getElementById('backupPasswordTitle').textContent = title;
    document.getElementById('backupPasswordDescription').textContent = description;
    document.getElementById('backupPasswordIcon').innerHTML = confirmationRequired
      ? '<i class="ph-bold ph-shield-check text-xl" aria-hidden="true"></i>'
      : '<i class="ph-bold ph-lock-key text-xl" aria-hidden="true"></i>';
    document.getElementById('backupPasswordIconWrap').className = confirmationRequired
      ? 'w-11 h-11 rounded-2xl flex items-center justify-center bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-900/70'
      : 'w-11 h-11 rounded-2xl flex items-center justify-center bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-200/70 dark:border-sky-900/70';
    document.getElementById('backupPasswordInputLabel').textContent = confirmationRequired ? 'Nueva contraseña' : 'Contraseña del backup';
    document.getElementById('backupPasswordInput').autocomplete = confirmationRequired ? 'new-password' : 'current-password';
    document.getElementById('backupPasswordInput').placeholder = confirmationRequired ? 'Mínimo 8 caracteres' : 'Introduce la contraseña';
    document.getElementById('backupPasswordConfirmWrap').classList.toggle('hidden', !confirmationRequired);
    document.getElementById('backupPasswordHint').textContent = confirmationRequired
      ? 'Usa al menos 8 caracteres. Guarda esta contraseña en un lugar seguro: ECONEXO no puede recuperarla si la olvidas.'
      : 'La contraseña no se envía a ningún servidor. Si no coincide o el archivo está dañado, podrás volver a intentarlo aquí.';
    document.getElementById('backupPasswordSubmitText').textContent = confirmationRequired ? 'Cifrar y exportar' : 'Verificar y restaurar';
    document.getElementById('backupPasswordCancel').textContent = 'Cancelar';
    document.getElementById('backupPasswordCancel').classList.remove('hidden');
    document.getElementById('backupPasswordSubmit').disabled = false;
    document.getElementById('backupPasswordSubmit').className = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-wait text-white text-xs font-semibold shadow-lg shadow-indigo-600/15 transition';
    document.getElementById('backupPasswordSubmit').innerHTML = `<i class="ph-bold ${confirmationRequired ? 'ph-shield-check' : 'ph-lock-key-open'} text-sm" aria-hidden="true"></i><span id="backupPasswordSubmitText">${confirmationRequired ? 'Cifrar y exportar' : 'Verificar y restaurar'}</span>`;
    document.getElementById('backupPasswordFields').classList.remove('hidden');
    document.getElementById('backupPasswordInput').value = '';
    document.getElementById('backupPasswordConfirmInput').value = '';
    document.getElementById('backupPasswordInput').type = 'password';
    document.getElementById('backupPasswordConfirmInput').type = 'password';
    const visibilityToggle = document.getElementById('backupPasswordToggle');
    if (visibilityToggle) {
      visibilityToggle.setAttribute('aria-pressed', 'false');
      visibilityToggle.innerHTML = '<i class="ph ph-eye text-base" aria-hidden="true"></i><span>Mostrar</span>';
    }
    clearBackupPasswordFeedback();

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden');
    setTimeout(() => document.getElementById('backupPasswordInput')?.focus(), 40);
  });
}

function bindBackupPasswordDialog() {
  if (backupPasswordDialogBound) return;
  backupPasswordDialogBound = true;

  const form = document.getElementById('backupPasswordForm');
  const passwordInput = document.getElementById('backupPasswordInput');
  const confirmationInput = document.getElementById('backupPasswordConfirmInput');
  const submit = document.getElementById('backupPasswordSubmit');
  const cancel = document.getElementById('backupPasswordCancel');
  const close = document.getElementById('backupPasswordClose');
  const modal = document.getElementById('backupPasswordModal');
  const toggle = document.getElementById('backupPasswordToggle');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const ctx = backupPasswordDialogContext;
    if (!ctx || ctx.busy) return;
    if (ctx.completed) {
      closeBackupPasswordDialog(true);
      return;
    }

    const password = passwordInput?.value || '';
    const confirmation = confirmationInput?.value || '';
    if (!password) {
      setBackupPasswordFeedback('Escribe la contraseña para continuar.', 'error');
      passwordInput?.focus();
      return;
    }
    if (ctx.confirmationRequired && password.length < 8) {
      setBackupPasswordFeedback('La contraseña debe tener al menos 8 caracteres.', 'error');
      passwordInput?.focus();
      return;
    }
    if (ctx.confirmationRequired && password !== confirmation) {
      setBackupPasswordFeedback('Las contraseñas no coinciden. Comprueba ambos campos e inténtalo de nuevo.', 'error');
      if (confirmationInput) {
        confirmationInput.value = '';
        confirmationInput.focus();
      }
      return;
    }

    ctx.busy = true;
    submit.disabled = true;
    if (cancel) cancel.disabled = true;
    if (close) close.disabled = true;
    submit.innerHTML = '<i class="ph-bold ph-circle-notch animate-spin text-sm" aria-hidden="true"></i><span>Procesando…</span>';
    setBackupPasswordFeedback(ctx.confirmationRequired ? 'Cifrando y preparando la descarga segura…' : 'Verificando la contraseña y restaurando la copia…', 'info');

    try {
      const result = await ctx.onSubmit({ password, confirmation, mode: ctx.mode });
      ctx.busy = false;
      ctx.completed = true;
      if (passwordInput) passwordInput.value = '';
      if (confirmationInput) confirmationInput.value = '';
      document.getElementById('backupPasswordFields')?.classList.add('hidden');
      document.getElementById('backupPasswordHint').textContent = 'La operación ha terminado. Cierra esta ventana para volver a ECONEXO.';
      setBackupPasswordFeedback(result?.message || (ctx.confirmationRequired ? 'La copia cifrada está lista.' : 'La copia se ha restaurado correctamente.'), 'success');
      submit.disabled = false;
      submit.innerHTML = '<i class="ph-bold ph-check text-sm" aria-hidden="true"></i><span id="backupPasswordSubmitText">Cerrar</span>';
      if (cancel) cancel.classList.add('hidden');
      if (close) close.disabled = false;
      submit.focus();
    } catch (error) {
      ctx.busy = false;
      submit.disabled = false;
      if (cancel) cancel.disabled = false;
      if (close) close.disabled = false;
      submit.innerHTML = `<i class="ph-bold ${ctx.confirmationRequired ? 'ph-shield-check' : 'ph-lock-key-open'} text-sm" aria-hidden="true"></i><span id="backupPasswordSubmitText">${ctx.confirmationRequired ? 'Cifrar y exportar' : 'Verificar y restaurar'}</span>`;
      setBackupPasswordFeedback(error?.message || 'No se ha podido completar la operación. Comprueba los datos e inténtalo de nuevo.', 'error');
      if (passwordInput) {
        passwordInput.value = '';
        passwordInput.focus();
      }
      if (confirmationInput) confirmationInput.value = '';
    }
  });

  cancel?.addEventListener('click', () => closeBackupPasswordDialog(false));
  close?.addEventListener('click', () => closeBackupPasswordDialog(Boolean(backupPasswordDialogContext?.completed)));
  modal?.addEventListener('click', (event) => {
    if (event.target === modal && !backupPasswordDialogContext?.busy) {
      closeBackupPasswordDialog(Boolean(backupPasswordDialogContext?.completed));
    }
  });
  toggle?.addEventListener('click', () => {
    const fields = [passwordInput, confirmationInput].filter(Boolean);
    const show = fields.some(field => field.type === 'password');
    fields.forEach(field => { field.type = show ? 'text' : 'password'; });
    toggle.setAttribute('aria-pressed', String(show));
    toggle.innerHTML = show
      ? '<i class="ph ph-eye-slash text-base" aria-hidden="true"></i><span>Ocultar</span>'
      : '<i class="ph ph-eye text-base" aria-hidden="true"></i><span>Mostrar</span>';
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && backupPasswordDialogContext && !backupPasswordDialogContext.busy) {
      event.preventDefault();
      closeBackupPasswordDialog(Boolean(backupPasswordDialogContext.completed));
    }
    if (event.key === 'Tab' && backupPasswordDialogContext) {
      const focusable = Array.from(document.querySelectorAll('#backupPasswordModal button:not([disabled]), #backupPasswordModal input:not([disabled])'))
        .filter(element => !element.closest('.hidden') && element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindBackupPasswordDialog, { once: true });
} else {
  bindBackupPasswordDialog();
}
