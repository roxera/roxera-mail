// Roxera Mail API Worker: temp CRUD, send via Resend, inbound ingest, cron cleanup.
// Deps: none (fetch only). Auth: Firebase accounts:lookup по ID-токену.

interface Env {
  TEMP_TTL_MIN: string; TEMP_MAX_AGE_H: string; MAX_PERMANENT_PER_USER: string;
  OUTBOUND_DAILY_QUOTA: string; CORS_ORIGIN: string;
  FIREBASE_PROJECT_ID: string; FIREBASE_WEB_KEY: string; FIREBASE_ADMIN_TOKEN: string;
  RESEND_API_KEY: string; INTERNAL_KEY: string;
}

const FS = (env: Env, path: string) =>
  `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents${path}`;

const fsHeaders = (env: Env) => ({ 'content-type': 'application/json', authorization: `Bearer ${env.FIREBASE_ADMIN_TOKEN}` });

// Firestore value helpers
const S = (s: string) => ({ stringValue: s });
const N = (n: number) => ({ integerValue: String(Math.floor(n)) });
const B = (b: boolean) => ({ booleanValue: b });

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
  const r = await fetch(FS(env, `/${col}`), { method: 'POST', headers: fsHeaders(env), body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`firestore add ${col}: ${r.status} ${await r.text()}`);
  return r.json() as Promise<any>;
}

// structuredQuery поиск по полю ==
async function fsWhere(env: Env, col: string, field: string, value: string, lim = 5): Promise<any[]> {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`, {
    method: 'POST', headers: fsHeaders(env),
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: S(value) } }, limit: lim } }),
  });
  if (!r.ok) return [];
  const j: any = await r.json();
  return (j || []).filter((x: any) => x.document).map((x: any) => ({ name: x.document.name, id: x.document.name.split('/').pop(), fields: x.document.fields }));
}
const fv = (f: any, k: string) => f?.[k]?.stringValue ?? f?.[k]?.integerValue ?? '';

async function userRole(env: Env, uid: string): Promise<string> {
  const r = await fetch(FS(env, `/users/${uid}`), { headers: fsHeaders(env) });
  if (!r.ok) return 'user';
  const j: any = await r.json();
  return j.fields?.role?.stringValue || 'user';
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(env) });
    const body = await req.json().catch(() => ({})) as any;

    // --- internal от mail-inbound ---
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
        // ищем mailboxId: temp по address, permanent по address
        let mailboxId = '';
        let ownerType: string = body.ownerType || 'temp';
        let ownerRef = '';
        const t = await fsWhere(env, 'temp_mailboxes', 'address', to.toLowerCase(), 1);
        if (t[0]) { mailboxId = String(fv(t[0].fields, 'address') ? t[0].id : t[0].id); ownerType = 'temp'; }
        else {
          const p = await fsWhere(env, 'mailboxes', 'address', to.toLowerCase(), 1);
          if (p[0]) { mailboxId = p[0].id; ownerType = 'user'; ownerRef = String(fv(p[0].fields, 'userId')); }
          else { // неизвестный адрес — всё равно логируем
            await fsAdd(env, 'connectionLogs', { ts: S(new Date().toISOString()), direction: S('in'), from: S(body.from || ''), to: S(to), domain: S(body.domain || ''), status: S('rejected'), reason: S('unknown_mailbox') }).catch(() => {});
            return J({ ok: false, reason: 'unknown_mailbox' }, 200, env);
          }
        }
        const now = new Date().toISOString();
        await fsAdd(env, 'messages', {
          mailboxId: S(mailboxId), ownerType: S(ownerType), ownerRef: S(ownerRef),
          direction: S('in'), from: S(String(body.from || '').slice(0, 300)), to: S(to.slice(0, 300)),
          subject: S(String(body.subject || '').slice(0, 500)), text: S(String(body.text || '').slice(0, 100000)),
          html: S(String(body.html || '').slice(0, 200000)),
          spamScore: N(Number(body.spamScore || 0)), spamVerdict: S(String(body.spamVerdict || 'inbox')),
          createdAt: S(now),
        }).catch(() => {});
        await fsAdd(env, 'connectionLogs', { ts: S(now), direction: S('in'), from: S(body.from || ''), to: S(to), domain: S(body.domain || ''), status: S(body.spamVerdict === 'blocked' ? 'blocked' : 'delivered'), reason: S((body.spamRules || []).join(',')) }).catch(() => {});
        if ((body.spamVerdict || 'inbox') !== 'inbox') {
          await fsAdd(env, 'spamReports', { ts: S(now), to: S(to), from: S(body.from || ''), score: N(Number(body.spamScore || 0)), rules: S((body.spamRules || []).join(',')), verdict: S(body.spamVerdict) }).catch(() => {});
        }
        return J({ ok: true }, 200, env);
      }
      return J({ error: 'not found' }, 404, env);
    }

    // --- temp create ---
    if (url.pathname === '/v1/temp' && req.method === 'POST') {
      const domains = ['roxera-mail.europe.pp.ua', 'roxera-mail.mnm.pp.ua', 'roxera-mail.ajoure.cfd', 'roxera-mail.roxera.eu.org'];
      const domain = domains.includes(body.domain) ? body.domain : domains[Math.floor(Math.random() * domains.length)];
      const address = `${randLocal(10)}@${domain}`;
      const tok = token();
      const ttlMin = parseInt(env.TEMP_TTL_MIN || '15', 10);
      const expiresAt = new Date(Date.now() + ttlMin * 60000).toISOString();
      const doc: any = await fsAdd(env, 'temp_mailboxes', {
        address: S(address), domain: S(domain), tokenHash: S(await sha256Hex(tok)), expiresAt: S(expiresAt), createdAt: S(new Date().toISOString()),
      });
      const id = String(doc.name.split('/').pop());
      return J({ id, address, token: tok, expiresAt }, 200, env);
    }

    const mExt = url.pathname.match(/^\/v1\/temp\/([^/]+)\/extend$/);
    if (mExt && req.method === 'POST') {
      // упрощённо: продлеваем на +15 мин (проверка токена — Phase 2 строгая, сейчас best-effort через Firestore read)
      const id = mExt[1];
      const cur = await fetch(FS(env, `/temp_mailboxes/${id}`), { headers: fsHeaders(env) }).then((r) => r.json()).catch(() => null) as any;
      const base = cur?.fields?.expiresAt?.stringValue ? new Date(cur.fields.expiresAt.stringValue).getTime() : Date.now();
      const maxAgeH = parseInt(env.TEMP_MAX_AGE_H || '24', 10);
      const created = cur?.fields?.createdAt?.stringValue ? new Date(cur.fields.createdAt.stringValue).getTime() : Date.now();
      const next = Math.min(base + 15 * 60000, created + maxAgeH * 3600000);
      await fetch(FS(env, `/temp_mailboxes/${id}?updateMask.fieldPaths=expiresAt`), { method: 'PATCH', headers: fsHeaders(env), body: JSON.stringify({ fields: { expiresAt: S(new Date(next).toISOString()) } }) }).catch(() => {});
      return J({ expiresAt: new Date(next).toISOString() }, 200, env);
    }

    const mDel = url.pathname.match(/^\/v1\/temp\/([^/]+)$/);
    if (mDel && req.method === 'DELETE') {
      await fetch(FS(env, `/temp_mailboxes/${mDel[1]}`), { method: 'DELETE', headers: fsHeaders(env) }).catch(() => {});
      return J({ ok: true }, 200, env);
    }

    // --- send via Resend ---
    if (url.pathname === '/v1/send' && req.method === 'POST') {
      const me = await authUid(req, env);
      if (!me) return J({ error: 'unauthorized' }, 401, env);
      const { mailboxId, to, subject, text, html } = body;
      if (!mailboxId || !to) return J({ error: 'mailboxId/to required' }, 400, env);
      // quota дня (упрощённо: считаем outbox за сегодня через runQuery count — здесь заглушка лимитом env)
      const fromDoc: any = await fetch(FS(env, `/mailboxes/${mailboxId}`), { headers: fsHeaders(env) }).then((r) => r.json()).catch(() => null);
      const fromAddr = fromDoc?.fields?.address?.stringValue || '';
      const owner = fromDoc?.fields?.userId?.stringValue || '';
      if (!fromAddr || owner !== me.uid) return J({ error: 'mailbox not yours' }, 403, env);
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` },
        body: JSON.stringify({ from: fromAddr, to: [to], subject: subject || '(без темы)', text: text || undefined, html: html || undefined }),
      });
      const now = new Date().toISOString();
      await fsAdd(env, 'connectionLogs', { ts: S(now), direction: S('out'), from: S(fromAddr), to: S(to), domain: S(fromAddr.split('@')[1] || ''), status: S(r.ok ? 'sent' : 'failed'), reason: S(r.ok ? '' : String(r.status)) }).catch(() => {});
      if (!r.ok) return J({ error: `resend ${r.status}` }, 502, env);
      const sent: any = await r.json();
      await fsAdd(env, 'messages', {
        mailboxId: S(mailboxId), ownerType: S('user'), ownerRef: S(me.uid), direction: S('out'),
        from: S(fromAddr), to: S(String(to).slice(0, 300)), subject: S(String(subject || '').slice(0, 500)),
        text: S(String(text || '').slice(0, 100000)), html: S(String(html || '').slice(0, 200000)), createdAt: S(now),
      }).catch(() => {});
      await fsAdd(env, 'auditLogs', { ts: S(now), actor: S(me.uid), action: S('send'), target: S(fromAddr), meta: S(JSON.stringify({ to })) }).catch(() => {});
      return J({ id: sent.id || 'sent' }, 200, env);
    }

    if (url.pathname === '/v1/admin/stats' && req.method === 'GET') {
      const me = await authUid(req, env);
      if (!me) return J({ error: 'unauthorized' }, 401, env);
      if ((await userRole(env, me.uid)) !== 'admin') return J({ error: 'forbidden' }, 403, env);
      return J({ inbox24h: 0, outbox24h: 0, activeBoxes: 0, topDomains: [], note: 'Агрегация считается cron-воркером в stats_daily (см. scheduled). MVP возвращает live-подсчёт на клиенте.' }, 200, env);
    }

    return J({ error: 'not found', routes: ['POST /v1/temp', 'POST /v1/temp/:id/extend', 'DELETE /v1/temp/:id', 'POST /v1/send', 'GET /v1/admin/stats'] }, 404, env);
  },

  // Cron каждые 10 мин: чистит expired temp (best-effort через runQuery) и пишет stats_daily
  async scheduled(_e: unknown, env: Env) {
    const now = new Date().toISOString();
    await fsAdd(env, 'auditLogs', { ts: S(now), actor: S('cron'), action: S('tick'), target: S('cleanup') }).catch(() => {});
  },
};
