function normalizeB64(s) {
  const cleaned = String(s || '')
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/[^A-Za-z0-9+/=]/g, '');
  const pad = cleaned.length % 4;
  return pad ? cleaned + '='.repeat(4 - pad) : cleaned;
}

export function bytesToB64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.byteLength; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

export function b64ToBytes(b64) {
  const norm = normalizeB64(b64);
  const binary = atob(norm);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBytes(len) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return arr;
}

export async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input));
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export async function aesGcmEncrypt(buffer) {
  const iv = randomBytes(12);
  const keyBytes = randomBytes(32);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buffer);
  return {
    cipherBuf,
    keyB64: bytesToB64(keyBytes),
    ivB64: bytesToB64(iv),
  };
}

export async function aesGcmDecrypt(cipherBuf, keyB64, ivB64) {
  const keyBytes = b64ToBytes(keyB64);
  const iv = b64ToBytes(ivB64);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
}
