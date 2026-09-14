// Центральный конфиг Roxera Mail. Всё бесплатное: Pages + Firebase + Cloudflare + Resend.
export const GOOGLE_BLUE = '#1a73e8';
export const GOOGLE_BLUE_DARK = '#0b57d0';

export const TEMP_TTL_MIN = 15;
export const TEMP_MAX_AGE_H = 24;
export const TEMP_EXTEND_MIN = 15;
export const MAX_PERMANENT_PER_USER = 5;

// Temp-пул — только приём (как просил заказчик: с префиксом roxera-mail.)
// Активны только домены с рабочим Email Routing. mnm.pp.ua (нет зоны в CF)
// и roxera.eu.org (NS не делегированы, pending) подключаются позже через /admin.
export const TEMP_DOMAINS = [
  'roxera-mail.europe.pp.ua',
  'roxera-mail.ajoure.cfd',
] as const;

// Permanent-пул — те же корни без префикса (приём + отправка через Resend).
// Отправка работает только с верифицированных в Resend доменов (см. /admin).
export const PERMANENT_DOMAINS = [
  'europe.pp.ua',
  'ajoure.cfd',
] as const;

export const API_BASE =
  import.meta.env.VITE_API_BASE?.toString().replace(/\/$/, '') || '';

export const FREE_RESEND_DAILY_LIMIT = 100;

export function randomLocal(len = 10): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (x) => abc[x % abc.length]).join('');
}

export function makeTempAddress(domain?: string): string {
  const d = domain || TEMP_DOMAINS[Math.floor(Math.random() * TEMP_DOMAINS.length)];
  return `${randomLocal(10)}@${d}`;
}

export function isValidLocal(local: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/.test(local);
}

export function expiryFromNow(min: number): string {
  return new Date(Date.now() + min * 60_000).toISOString();
}
