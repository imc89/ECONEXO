// JSON workspace export and JSON/encrypted workspace import.
'use strict';

/** Descarga una copia de seguridad JSON legible y portable. */
async function exportWorkspace() {
  await persistStateNow();
  await persistLiveQuotesNow();
  const payload = getWorkspacePayload();
  await saveMonthlyBackup({ force: true });
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }),
    `ECONEXO_DATA_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  showToast('Copia de seguridad JSON exportada.', 'success');
}

/** Valida y restaura el contenido ya descifrado o un backup JSON normal. */
async function restoreWorkspacePayload(payload) {
  if (!payload || !payload.state || typeof payload.state !== 'object' || Array.isArray(payload.state)) {
    throw new Error('El archivo no contiene un espacio de trabajo ECONEXO válido.');
  }

  state = { ...JSON.parse(JSON.stringify(CLEAN_EMPTY_STATE)), ...payload.state };
  if (Array.isArray(payload.liveQuotes)) liveQuotes = payload.liveQuotes;
  if (payload.chartModes && typeof payload.chartModes === 'object') {
    Object.keys(chartModes).forEach(key => delete chartModes[key]);
    Object.assign(chartModes, payload.chartModes);
  }
  await persistStateNow();
  await persistLiveQuotesNow();
  onPageEnter(currentSection);
}

/** Importa backup normal o cifrado; las interacciones de contraseña se muestran en la modal propia. */
async function importWorkspace(event) {
  const input = event?.target;
  const file = input?.files?.[0];
  if (!file) return;

  try {
    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch (_) {
      throw new Error('El archivo seleccionado no contiene un JSON válido.');
    }

    if (payload?.format === 'ECONEXO-SECURE-BACKUP') {
      await openBackupPasswordDialog({
        mode: 'unlock',
        title: 'Restaurar copia cifrada',
        description: `El archivo «${file.name}» está protegido con contraseña. Verifica la contraseña para comprobar su integridad y restaurar los datos.`
      }, async ({ password }) => {
        const decryptedPayload = await decryptSecureBackupEnvelope(payload, password);
        await restoreWorkspacePayload(decryptedPayload);
        return { message: 'La contraseña es correcta. La copia se ha verificado y restaurado en ECONEXO.' };
      });
      return;
    }

    await restoreWorkspacePayload(payload);
    showToast('Datos importados y validados correctamente.', 'success');
  } catch (error) {
    showToast(error?.message || 'Error al importar el archivo.', 'error');
  } finally {
    if (input) input.value = '';
  }
}
