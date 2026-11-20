// Encrypted workspace backups: AES-256-GCM + PBKDF2-SHA-256.
'use strict';

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveBackupKey(password, salt, iterations = 250000) {
  const safeIterations = Number(iterations);
  if (!Number.isInteger(safeIterations) || safeIterations < 100000 || safeIterations > 1000000) {
    throw new Error('El archivo de backup utiliza parámetros de cifrado no válidos.');
  }
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: safeIterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function decryptSecureBackupEnvelope(envelope, password) {
  if (!envelope || envelope.format !== 'ECONEXO-SECURE-BACKUP' || envelope.version !== 1) {
    throw new Error('El archivo no tiene un formato de backup cifrado compatible.');
  }
  if (!envelope.salt || !envelope.iv || !envelope.data || !envelope.checksum) {
    throw new Error('El archivo cifrado está incompleto o dañado.');
  }

  let plaintext;
  try {
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    const ciphertext = base64ToBytes(envelope.data);
    const key = await deriveBackupKey(password, salt, envelope.iterations || 250000);
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  } catch (error) {
    if (error instanceof Error && /parámetros de cifrado|formato de backup|incompleto|dañado/.test(error.message)) throw error;
    throw new Error('No se ha podido descifrar la copia. Comprueba la contraseña o que el archivo no esté dañado.');
  }

  const digest = await crypto.subtle.digest('SHA-256', plaintext);
  const checksum = bytesToBase64(new Uint8Array(digest));
  if (checksum !== envelope.checksum) {
    throw new Error('La comprobación de integridad ha fallado. La copia podría estar dañada o manipulada.');
  }

  try {
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch (_) {
    throw new Error('La copia se ha descifrado, pero su contenido no es un JSON válido.');
  }
}

async function exportSecureWorkspace() {
  return openBackupPasswordDialog({
    mode: 'create',
    title: 'Proteger copia de seguridad',
    description: 'Crea una contraseña para cifrar tu información financiera antes de descargar la copia.'
  }, async ({ password }) => {
    await persistStateNow();
    await persistLiveQuotesNow();

    const payload = getWorkspacePayload();
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const checksum = await crypto.subtle.digest('SHA-256', plaintext);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveBackupKey(password, salt);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    const envelope = {
      format: 'ECONEXO-SECURE-BACKUP',
      version: 1,
      algorithm: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA-256',
      iterations: 250000,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      checksum: bytesToBase64(new Uint8Array(checksum)),
      data: bytesToBase64(new Uint8Array(ciphertext))
    };

    downloadBlob(
      new Blob([JSON.stringify(envelope)], { type: 'application/json;charset=utf-8' }),
      `ECONEXO_SECURE_${new Date().toISOString().replace(/[:.]/g, '-')}.econexo.json`
    );
    return { message: 'La copia cifrada se ha generado y descargado correctamente.' };
  });
}
