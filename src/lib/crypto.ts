// AES-GCM парольное шифрование тела письма (WebCrypto). Ключ нигде не хранится.
const enc = new TextEncoder();
const dec = new TextDecoder();

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 120_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function b64e(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
  return btoa(s);
}
function b64d(s: string): Uint8Array {
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

export async function encryptText(plain: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, enc.encode(plain));
  return JSON.stringify({ v: 1, salt: b64e(salt), iv: b64e(iv), data: b64e(ct) });
}

export async function decryptText(payload: string, password: string): Promise<string> {
  const o = JSON.parse(payload) as { salt: string; iv: string; data: string };
  const key = await deriveKey(password, b64d(o.salt));
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64d(o.iv) as BufferSource },
    key,
    b64d(o.data) as BufferSource,
  );
  return dec.decode(pt);
}

export function makeToken(bytes = 24): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return b64e(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(s: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, '0')).join('');
}
