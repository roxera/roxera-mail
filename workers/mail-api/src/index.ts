// Roxera Mail API Worker: temp CRUD, send via Resend/CF, inbound ingest, cron.
// Хранение: Cloudflare KV — primary (работает без Firebase), Firestore — best-effort
// (админка/аналитика подхватят данные, когда база будет создана). Auth: Firebase accounts:lookup.
import { EmailMessage } from 'cloudflare:email';

interface Env {
  TEMP_TTL_MIN: string; TEMP_MAX_AGE_H: string; MAX_PERMANENT_PER_USER: string;
  OUTBOUND_DAILY_QUOTA: string; CORS_ORIGIN: string;
  FIREBASE_PROJECT_ID: string; FIREBASE_WEB_KEY: string; FIREBASE_ADMIN_TOKEN: string;
  FIREBASE_SA_JSON: string;
  RESEND_API_KEY: string; INTERNAL_KEY: string;
  ROXERA: any; // KVNamespace
  SEB: any; // send_email binding (Cloudflare Email Sending fallback)
}

const FS = (env: Env, path: string) =>
  `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents${path}`;

const fsHeaders = (_env: Env) => ({ 'content-type': 'application/json', authorization: 'Bearer ' });

// Долгоживущая авторизация в Firestore: самоминтинг OAuth-токена из
// сервисного ключа (секрет FIREBASE_SA_JSON), fallback — статичный токен.
let _gtok = '';
let _gexp = 0;
async function gcpToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_gtok && _gexp > now + 120) return _gtok;
  try {
    const sa = JSON.parse(env.FIREBASE_SA_JSON || 'null');
    if (sa?.private_key && sa?.client_email) {
      const enc = new TextEncoder();
      const b64u = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
      const bod = b64u(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
      const pem = String(sa.private_key).replace(/\\n/g, '\n');
      const b64 = pem.split('\n').filter((l) => l && !l.startsWith('-----')).join('');
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const key = await crypto.subtle.importKey('pkcs8', bin.buffer as ArrayBuffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(head + '.' + bod));
      let s = '';
      new Uint8Array(sig).forEach((x) => { s += String.fromCharCode(x); });
      const assertion = `${head}.${bod}.${b64u(s)}`;
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
      });
      const jj = (await r.json()) as { access_token?: string };
      if (jj.access_token) { _gtok = jj.access_token; _gexp = now + 3500; return _gtok; }
    }
  } catch { /* fall through */ }
  return env.FIREBASE_ADMIN_TOKEN || '';
}
async function ah(env: Env): Promise<Record<string, string>> {
  return { 'content-type': 'application/json', authorization: `Bearer ${await gcpToken(env)}` };
}

// Firestore value helpers
const S = (s: string) => ({ stringValue: s });
const N = (n: number) => ({ integerValue: String(Math.floor(n)) });

function cors(env: Env) {
  return { 'access-control-allow-origin': env.CORS_ORIGIN || '*', 'access-control-allow-headers': 'content-type,authorization,x-internal', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS' };
}
const J = (data: unknown, status = 200, env?: Env) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...(env ? cors(env) : {}) } });

async function sha256Hex(s: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function token(n = 24): string {
  const b = crypto.getRandomValues(new Uint8Array(n));
  let s = ''; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randLocal(len = 10): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const b = crypto.getRandomValues(new Uint8Array(len));
  return [...b].map((x) => abc[x % abc.length]).join('');
}

// ---------- KV layer ----------
async function kvGet<T>(env: Env, key: string): Promise<T | null> {
  try {
    const v = await env.ROXERA.get(key);
    return v ? JSON.parse(v) as T : null;
  } catch { return null; }
}
async function kvPut(env: Env, key: string, val: unknown, ttlSec?: number): Promise<void> {
  const opt: any = ttlSec ? { expirationTtl: Math.max(60, Math.min(ttlSec, 86400 * 28)) } : undefined;
  await env.ROXERA.put(key, JSON.stringify(val), opt);
}
async function kvDel(env: Env, key: string): Promise<void> {
  try { await env.ROXERA.delete(key); } catch { /* ignore */ }
}
interface TempRec { id: string; address: string; domain: string; tokenHash: string; expiresAt: string; createdAt: string }
async function checkTempToken(env: Env, id: string, tok: string): Promise<TempRec | null> {
  const rec = await kvGet<TempRec>(env, 'temp:' + id);
  if (!rec) return null;
  if (new Date(rec.expiresAt).getTime() <= Date.now()) { ctx_Del(env, id, rec.address); return null; }
  if ((await sha256Hex(tok || '')) !== rec.tokenHash) return null;
  return rec;
}
async function ctx_Del(env: Env, id: string, address: string): Promise<void> {
  await kvDel(env, 'temp:' + id);
  await kvDel(env, 'taddr:' + address.toLowerCase());
  await kvDel(env, 'inbox:' + id);
}

// ---------- счётчики и админы в KV (работают без Firebase) ----------
async function kvIncr(env: Env, key: string): Promise<number> {
  let n = 0;
  try { n = parseInt((await env.ROXERA.get(key)) || '0', 10) || 0; } catch { n = 0; }
  n += 1;
  try { await env.ROXERA.put(key, String(n)); } catch { /* ignore */ }
  return n;
}
async function kvLogConn(env: Env, e: { ts: string; from: string; to: string; verdict: string; subject: string }) {
  try {
    const arr: any[] = (await kvGet<any[]>(env, 'connlog')) || [];
    arr.unshift(e);
    await kvPut(env, 'connlog', arr.slice(0, 50));
  } catch { /* ignore */ }
}
interface AdminRec { uid: string; email: string; ts: string }
async function kvAdmins(env: Env): Promise<AdminRec[]> {
  return (await kvGet<AdminRec[]>(env, 'admins')) || [];
}
async function kvStats(env: Env) {
  const num = async (k: string) => {
    try { return parseInt((await env.ROXERA.get(k)) || '0', 10) || 0; } catch { return 0; }
  };
  return { tempCreated: await num('stat:tempCreated'), mailsIn: await num('stat:mailsIn'), boxesCreated: await num('stat:boxesCreated') };
}

// Проверка Firebase ID token -> {uid,email} через accounts:lookup (просто и бесплатно)
async function authUid(req: Request, env: Env): Promise<{ uid: string; email: string } | null> {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_WEB_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: m[1] }),
  });
  if (!r.ok) return null;
  const j: any = await r.json();
  const u = j.users?.[0];
  return u ? { uid: u.localId, email: u.email || '' } : null;
}

async function fsAdd(env: Env, col: string, fields: Record<string, unknown>) {
  const r = await fetch(FS(env, `/${col}`), { method: 'POST',   headers: await ah(env), body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`firestore add ${col}: ${r.status} ${await r.text()}`);
  return r.json() as Promise<any>;
}

// structuredQuery поиск по полю ==
async function fsWhere(env: Env, col: string, field: string, value: string, lim = 5): Promise<any[]> {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`, {
    method: 'POST',   headers: await ah(env),
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: S(value) } }, limit: lim } }),
  });
  if (!r.ok) return [];
  const j: any = await r.json();
  return (j || []).filter((x: any) => x.document).map((x: any) => ({ name: x.document.name, id: x.document.name.split('/').pop(), fields: x.document.fields }));
}
const fv = (f: any, k: string) => f?.[k]?.stringValue ?? f?.[k]?.integerValue ?? '';

async function userRole(env: Env, uid: string): Promise<string> {
  const r = await fetch(FS(env, `/users/${uid}`), {   headers: await ah(env) }).catch(() => null) as any;
  if (!r || !r.ok) return 'user';
  const j: any = await r.json();
  return j.fields?.role?.stringValue || 'user';
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(env) });
    const body = await req.json().catch(() => ({})) as any;

    // --- internal от mail-inbound и тесты ---
    if (url.pathname.startsWith('/internal/')) {
      if (req.headers.get('x-internal') !== env.INTERNAL_KEY) return J({ error: 'forbidden' }, 403, env);
      if (url.pathname === '/internal/ingest-log' && req.method === 'POST') {
        await fsAdd(env, 'connectionLogs', {
          ts: S(new Date().toISOString()), direction: S(body.direction || 'in'),
          from: S(String(body.from || '')), to: S(String(body.to || '')), domain: S(String(body.domain || '')),
          status: S(String(body.status || 'ok')), reason: S(String(body.reason || '')),
        }).catch(() => {});
        return J({ ok: true }, 200, env);
      }
      if (url.pathname === '/internal/ingest' && req.method === 'POST') {
        const to: string = body.to || '';
        const m = to.toLowerCase().match(/([^@\s]+)@([a-z0-9.-]+\.[a-z]{2,})/);
        if (!m) return J({ error: 'bad to' }, 400, env);
        let mailboxId = '';
        let ownerType: string = body.ownerType || 'temp';
        let ownerRef = '';
        const tidRaw = await env.ROXERA.get('taddr:' + to.toLowerCase()).catch(() => null);
        const tid = String(tidRaw || '').replace(/^"|"$/g, '');
        if (tid) { mailboxId = tid; ownerType = 'temp'; }
        if (tid && await kvGet(env, 'pbox:' + tid)) { ownerType = 'user'; ownerRef = 'local'; }
        else {
          const t = await fsWhere(env, 'temp_mailboxes', 'address', to.toLowerCase(), 1);
          if (t[0]) { mailboxId = t[0].id; ownerType = 'temp'; }
          else {
            const p = await fsWhere(env, 'mailboxes', 'address', to.toLowerCase(), 1);
            if (p[0]) { mailboxId = p[0].id; ownerType = 'user'; ownerRef = String(fv(p[0].fields, 'userId')); }
            else {
              await fsAdd(env, 'connectionLogs', { ts: S(new Date().toISOString()), direction: S('in'), from: S(body.from || ''), to: S(to), domain: S(body.domain || ''), status: S('rejected'), reason: S('unknown_mailbox') }).catch(() => {});
              return J({ ok: false, reason: 'unknown_mailbox' }, 200, env);
            }
          }
        }
        const now = new Date().toISOString();
        const msg = {
          id: 'm' + Date.now().toString(36) + randLocal(6), mailboxId, ownerType, ownerRef,
          direction: 'in', from: String(body.from || '').slice(0, 300), to: to.slice(0, 300),
          subject: String(body.subject || '').slice(0, 500), text: String(body.text || '').slice(0, 20000),
          html: '', spamScore: Number(body.spamScore || 0), spamVerdict: String(body.spamVerdict || 'inbox'),
          createdAt: now,
        };
        const ik = 'inbox:' + mailboxId;
        const arr: any[] = (await kvGet<any[]>(env, ik)) || [];
        arr.unshift(msg);
        await kvPut(env, ik, arr.slice(0, 100), 86400);
        await kvIncr(env, 'stat:mailsIn');
        await kvLogConn(env, { ts: now, from: msg.from.slice(0, 80), to: msg.to.slice(0, 80), verdict: msg.spamVerdict, subject: msg.subject.slice(0, 80) });
        await fsAdd(env, 'messages', {
          mailboxId: S(mailboxId), ownerType: S(ownerType), ownerRef: S(ownerRef),
          direction: S('in'), from: S(msg.from), to: S(msg.to),
          subject: S(msg.subject), text: S(String(body.text || '').slice(0, 100000)),
          html: S(String(body.html || '').slice(0, 200000)),
          spamScore: N(msg.spamScore), spamVerdict: S(msg.spamVerdict),
          createdAt: S(now),
        }).catch(() => {});
        await fsAdd(env, 'connectionLogs', { ts: S(now), direction: S('in'), from: S(msg.from), to: S(msg.to), domain: S(body.domain || ''), status: S(msg.spamVerdict === 'blocked' ? 'blocked' : 'delivered'), reason: S((body.spamRules || []).join(',')) }).catch(() => {});
        if (msg.spamVerdict !== 'inbox') {
          await fsAdd(env, 'spamReports', { ts: S(now), to: S(msg.to), from: S(msg.from), score: N(msg.spamScore), rules: S((body.spamRules || []).join(',')), verdict: S(msg.spamVerdict) }).catch(() => {});
        }
        return J({ ok: true, via: 'kv', box: mailboxId, n: arr.length }, 200, env);
      }
      // Тестовая отправка через Cloudflare Email Sending (диагностика, без Firebase/Resend)
      if (url.pathname === '/internal/cf-send' && req.method === 'POST') {
        const { to, subject, text, from } = body;
        if (!to) return J({ error: 'to required' }, 400, env);
        const f = String(from || 'test@europe.pp.ua');
        const raw = `From: ${f}\r\nTo: ${to}\r\nSubject: ${String(subject || 'Roxera test')}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${String(text || 'hello from Roxera')}`;
        try {
          await env.SEB.send(new EmailMessage(f, to, raw));
          return J({ ok: true, via: 'cf' }, 200, env);
        } catch (e) { return J({ error: 'cf_send_failed', detail: String(e).slice(0, 300) }, 502, env); }
      }
      // Триггер верификации домена в Resend + статус (ключ не покидает воркер)
      if (url.pathname === '/internal/resend-verify' && req.method === 'POST') {
        const r = await fetch(`https://api.resend.com/domains/${body.domainId || ''}/verify`, {
          method: 'PATCH', headers: { authorization: `Bearer ${env.RESEND_API_KEY}` },
        });
        return J({ status: r.status, body: (await r.text()).slice(0, 400) }, 200, env);
      }
      if (url.pathname === '/internal/resend-status' && req.method === 'POST') {
        const r = await fetch(`https://api.resend.com/domains/${body.domainId || ''}`, {
          headers: { authorization: `Bearer ${env.RESEND_API_KEY}` },
        });
        const t = await r.text();
        let name = '', status = '';
        try { const j = JSON.parse(t); name = j.name || ''; status = j.status || ''; } catch { /* ignore */ }
        return J({ http: r.status, name, status, raw: t.slice(0, 300) }, 200, env);
      }
      return J({ error: 'not found' }, 404, env);
    }

    // --- temp create ---
    if (url.pathname === '/v1/temp' && req.method === 'POST') {
      const domains = ['roxera-mail.europe.pp.ua', 'roxera-mail.ajoure.cfd'];
      const domain = domains.includes(body.domain) ? body.domain : domains[Math.floor(Math.random() * domains.length)];
      const address = `${randLocal(10)}@${domain}`;
      const tok = token();
      const ttlMin = parseInt(env.TEMP_TTL_MIN || '15', 10);
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + ttlMin * 60000).toISOString();
      const id = (await sha256Hex(address)).slice(0, 16);
      const rec: TempRec = { id, address, domain, tokenHash: await sha256Hex(tok), expiresAt, createdAt: now };
      const ttl = Math.min(ttlMin * 60, 24 * 3600);
      await kvPut(env, 'temp:' + id, rec, ttl);
      await env.ROXERA.put('taddr:' + address.toLowerCase(), id, { expirationTtl: Math.max(60, Math.min(ttl, 86400 * 28)) });
      await kvIncr(env, 'stat:tempCreated');
      await fsAdd(env, 'temp_mailboxes', {
        address: S(address), domain: S(domain), tokenHash: S(rec.tokenHash), expiresAt: S(expiresAt), createdAt: S(now),
      }).catch(() => {});
      return J({ id, address, token: tok, expiresAt }, 200, env);
    }

    // --- именные ящики без логина (токен вместо пароля; приём работает сразу) ---
    const BOX_TTL = 2332800; // 27 дней, продлевается при каждом чтении
    const BOX_DOMAINS = ['europe.pp.ua', 'ajoure.cfd'];
    if (url.pathname === '/v1/boxes' && req.method === 'POST') {
      const local = String(body.local || '').toLowerCase().trim();
      const domain = String(body.domain || '');
      if (!/^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/.test(local)) return J({ error: 'bad_local' }, 400, env);
      if (!BOX_DOMAINS.includes(domain)) return J({ error: 'bad_domain' }, 400, env);
      const address = `${local}@${domain}`;
      if (await env.ROXERA.get('taddr:' + address).catch(() => null)) return J({ error: 'taken', detail: 'адрес занят' }, 409, env);
      const iph = await sha256Hex(req.headers.get('CF-Connecting-IP') || 'unknown');
      const reg: string[] = (await kvGet<string[]>(env, 'ipreg:' + iph)) || [];
      if (reg.length >= 5) return J({ error: 'limit', detail: 'максимум 5 ящиков' }, 403, env);
      const tok = token();
      const id = (await sha256Hex('box:' + address)).slice(0, 16);
      const rec = { id, address, local, domain, tokenHash: await sha256Hex(tok), createdAt: new Date().toISOString() };
      await kvPut(env, 'pbox:' + id, rec, BOX_TTL);
      await env.ROXERA.put('taddr:' + address, id, { expirationTtl: BOX_TTL });
      reg.push(id);
      await kvPut(env, 'ipreg:' + iph, reg, BOX_TTL);
      await kvIncr(env, 'stat:boxesCreated');
      return J({ id, address, token: tok, expiresAt: new Date(Date.now() + BOX_TTL * 1000).toISOString() }, 200, env);
    }
    const mBoxInbox = url.pathname.match(/^\/v1\/boxes\/([^/]+)\/inbox$/);
    if (mBoxInbox && req.method === 'GET') {
      const rec = await kvGet<any>(env, 'pbox:' + mBoxInbox[1]);
      if (!rec || (await sha256Hex(url.searchParams.get('token') || '')) !== rec.tokenHash) return J({ error: 'not_found' }, 404, env);
      await kvPut(env, 'pbox:' + rec.id, rec, BOX_TTL);
      await env.ROXERA.put('taddr:' + rec.address.toLowerCase(), rec.id, { expirationTtl: BOX_TTL }).catch(() => {});
      const bmsgs = (await kvGet<any[]>(env, 'inbox:' + rec.id)) || [];
      return J({ address: rec.address, messages: bmsgs }, 200, env);
    }
    const mBoxDel = url.pathname.match(/^\/v1\/boxes\/([^/]+)$/);
    if (mBoxDel && req.method === 'DELETE') {
      const rec = await kvGet<any>(env, 'pbox:' + mBoxDel[1]);
      if (rec && (await sha256Hex(body.token || '')) === rec.tokenHash) {
        await kvDel(env, 'pbox:' + rec.id);
        await kvDel(env, 'taddr:' + rec.address.toLowerCase());
        await kvDel(env, 'inbox:' + rec.id);
      }
      return J({ ok: true }, 200, env);
    }
    const mBoxSend = url.pathname.match(/^\/v1\/boxes\/([^/]+)\/send$/);
    if (mBoxSend && req.method === 'POST') {
      const rec = await kvGet<any>(env, 'pbox:' + mBoxSend[1]);
      if (!rec || (await sha256Hex(body.token || '')) !== rec.tokenHash) return J({ error: 'not_found' }, 404, env);
      const to = String(body.to || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return J({ error: 'bad_to' }, 400, env);
      const fromAddr = rec.address;
      const subject = String(body.subject || '(без темы)').slice(0, 500);
      const text = String(body.text || '');
      let via: string | null = null;
      let detail = '';
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` },
          body: JSON.stringify({ from: fromAddr, to: [to], subject, text: text || undefined }),
        });
        if (r.ok) via = 'resend';
        else detail = 'resend ' + r.status + ' ' + (await r.text()).slice(0, 160);
      } catch (e) { detail = 'resend_net ' + String(e).slice(0, 120); }
      if (!via) {
        const raw = `From: ${fromAddr}\r\nTo: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}`;
        try { await env.SEB.send(new EmailMessage(fromAddr, to, raw)); via = 'cf'; }
        catch (e) { detail += ' | cf: ' + String(e).slice(0, 160); }
      }
      const out = { id: 'm' + Date.now().toString(36) + randLocal(4), mailboxId: rec.id, ownerType: 'user', ownerRef: 'local', direction: 'out', from: fromAddr, to: to.slice(0, 300), subject, text: text.slice(0, 20000), html: '', createdAt: new Date().toISOString() };
      const ik2 = 'inbox:' + rec.id;
      const arr2: any[] = (await kvGet<any[]>(env, ik2)) || [];
      arr2.unshift(out);
      await kvPut(env, ik2, arr2.slice(0, 100), BOX_TTL);
      if (via) return J({ ok: true, via, id: out.id }, 200, env);
      return J({ error: 'send_failed', detail }, 502, env);
    }

    // --- temp inbox (polling для фронта) ---
    const mInbox = url.pathname.match(/^\/v1\/temp\/([^/]+)\/inbox$/);
    if (mInbox && req.method === 'GET') {
      const rec = await checkTempToken(env, mInbox[1]!, url.searchParams.get('token') || '');
      if (!rec) return J({ error: 'not_found' }, 404, env);
      const msgs = (await kvGet<any[]>(env, 'inbox:' + rec.id)) || [];
      return J({ address: rec.address, expiresAt: rec.expiresAt, messages: msgs }, 200, env);
    }

    const mExt = url.pathname.match(/^\/v1\/temp\/([^/]+)\/extend$/);
    if (mExt && req.method === 'POST') {
      const rec = await checkTempToken(env, mExt[1]!, body.token || '');
      if (!rec) return J({ error: 'not_found' }, 404, env);
      const maxAgeH = parseInt(env.TEMP_MAX_AGE_H || '24', 10);
      const created = new Date(rec.createdAt).getTime();
      const next = Math.min(new Date(rec.expiresAt).getTime() + 15 * 60000, created + maxAgeH * 3600000);
      rec.expiresAt = new Date(next).toISOString();
      const ttl = Math.max(60, Math.floor((next - Date.now()) / 1000));
      await kvPut(env, 'temp:' + rec.id, rec, ttl);
      await kvPut(env, 'taddr:' + rec.address.toLowerCase(), rec.id, ttl);
      await fetch(FS(env, `/temp_mailboxes/${rec.id}?updateMask.fieldPaths=expiresAt`), { method: 'PATCH',   headers: await ah(env), body: JSON.stringify({ fields: { expiresAt: S(rec.expiresAt) } }) }).catch(() => {});
      return J({ expiresAt: rec.expiresAt }, 200, env);
    }

    const mDel = url.pathname.match(/^\/v1\/temp\/([^/]+)$/);
    if (mDel && req.method === 'DELETE') {
      const rec = await kvGet<TempRec>(env, 'temp:' + mDel[1]);
      if (rec && (await sha256Hex(body.token || '')) === rec.tokenHash) await ctx_Del(env, rec.id, rec.address);
      await fetch(FS(env, `/temp_mailboxes/${mDel[1]}`), { method: 'DELETE',   headers: await ah(env) }).catch(() => {});
      return J({ ok: true }, 200, env);
    }

    // --- send via Resend (fallback: Cloudflare Email Sending) ---
    if (url.pathname === '/v1/send' && req.method === 'POST') {
      const me = await authUid(req, env);
      if (!me) return J({ error: 'unauthorized' }, 401, env);
      const { mailboxId, to, subject, text, html } = body;
      if (!mailboxId || !to) return J({ error: 'mailboxId/to required' }, 400, env);
      const fromDoc: any = await fetch(FS(env, `/mailboxes/${mailboxId}`), {   headers: await ah(env) }).then((r) => r.json()).catch(() => null);
      const fromAddr = fromDoc?.fields?.address?.stringValue || '';
      const owner = fromDoc?.fields?.userId?.stringValue || '';
      if (!fromAddr || owner !== me.uid) return J({ error: 'firebase_unavailable', detail: 'mailbox lookup needs Firestore' }, 503, env);
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` },
        body: JSON.stringify({ from: fromAddr, to: [to], subject: subject || '(без темы)', text: text || undefined, html: html || undefined }),
      });
      let via = 'resend';
      if (!r.ok) {
        const raw = `From: ${fromAddr}\r\nTo: ${to}\r\nSubject: ${String(subject || '(без темы)')}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${String(text || '')}`;
        try { await env.SEB.send(new EmailMessage(fromAddr, to, raw)); via = 'cf-fallback'; }
        catch { return J({ error: `resend ${r.status}` }, 502, env); }
      }
      const now = new Date().toISOString();
      const sent: any = r.ok ? await r.json().catch(() => ({})) : {};
      await fsAdd(env, 'messages', {
        mailboxId: S(mailboxId), ownerType: S('user'), ownerRef: S(me.uid), direction: S('out'),
        from: S(fromAddr), to: S(String(to).slice(0, 300)), subject: S(String(subject || '').slice(0, 500)),
        text: S(String(text || '').slice(0, 100000)), html: S(String(html || '').slice(0, 200000)), createdAt: S(now),
      }).catch(() => {});
      await fsAdd(env, 'auditLogs', { ts: S(now), actor: S(me.uid), action: S('send'), target: S(fromAddr), meta: S(JSON.stringify({ to, via })) }).catch(() => {});
      return J({ id: sent.id || 'sent', via }, 200, env);
    }

    if (url.pathname === '/v1/admin/stats' && req.method === 'GET') {
      const me = await authUid(req, env);
      if (!me) return J({ error: 'unauthorized' }, 401, env);
      if ((await userRole(env, me.uid)) !== 'admin') return J({ error: 'forbidden' }, 403, env);
      return J({ inbox24h: 0, outbox24h: 0, activeBoxes: 0, topDomains: [], note: 'До создания Firestore — заглушка. Live-подсчёт на клиенте.' }, 200, env);
    }

    // --- публичная статистика (только счётчики) ---
    if (url.pathname === '/v1/stats' && req.method === 'GET') {
      const s = await kvStats(env);
      const admins = await kvAdmins(env);
      return J({ ok: true, ...s, adminsCount: admins.length, ts: new Date().toISOString() }, 200, env);
    }

    // --- моя роль (KV-админы, затем Firestore) ---
    if (url.pathname === '/v1/admin/whoami' && req.method === 'GET') {
      const me = await authUid(req, env);
      if (!me) return J({ error: 'unauthorized' }, 401, env);
      const admins = await kvAdmins(env);
      let role = admins.some((a) => a.uid === me.uid) ? 'admin' : 'user';
      if (role === 'user' && (await userRole(env, me.uid)) === 'admin') role = 'admin';
      return J({ uid: me.uid, email: me.email, role }, 200, env);
    }

    // --- захват первого админа (только если админов ещё нет) ---
    if (url.pathname === '/v1/admin/claim' && req.method === 'POST') {
      const me = await authUid(req, env);
      if (!me) return J({ error: 'unauthorized' }, 401, env);
      const admins = await kvAdmins(env);
      if (admins.some((a) => a.uid === me.uid)) return J({ ok: true, role: 'admin' }, 200, env);
      if (admins.length > 0) return J({ error: 'taken' }, 403, env);
      admins.push({ uid: me.uid, email: me.email, ts: new Date().toISOString() });
      await kvPut(env, 'admins', admins);
      return J({ ok: true, role: 'admin' }, 200, env);
    }

    // --- обзор для админа: счётчики + последние подключения + админы ---
    if (url.pathname === '/v1/admin/overview' && req.method === 'GET') {
      const me = await authUid(req, env);
      if (!me) return J({ error: 'unauthorized' }, 401, env);
      const admins = await kvAdmins(env);
      if (!admins.some((a) => a.uid === me.uid)) return J({ error: 'forbidden' }, 403, env);
      const s = await kvStats(env);
      const conn = (await kvGet<any[]>(env, 'connlog')) || [];
      return J({ stats: s, connlog: conn.slice(0, 30), admins }, 200, env);
    }

    return J({ error: 'not found', routes: ['POST /v1/temp', 'GET /v1/temp/:id/inbox', 'POST /v1/temp/:id/extend', 'DELETE /v1/temp/:id', 'POST /v1/send', 'GET /v1/admin/stats', 'GET /v1/stats', 'GET /v1/admin/whoami', 'POST /v1/admin/claim', 'GET /v1/admin/overview'] }, 404, env);
  },

  // Cron: KV чистится сам через expirationTtl; сюда пишем heartbeat в Firestore когда он live.
  async scheduled(_e: unknown, env: Env) {
    const now = new Date().toISOString();
    await fsAdd(env, 'auditLogs', { ts: S(now), actor: S('cron'), action: S('tick'), target: S('cleanup') }).catch(() => {});
  },
};
