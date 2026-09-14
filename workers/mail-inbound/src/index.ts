import PostalMime from 'postal-mime';

interface Env {
  TEMP_DOMAINS: string;
  PERMANENT_DOMAINS: string;
  BLOCK_FROM: string;
  BLOCK_DOMAINS: string;
  BLOCK_WORDS: string;
  MAX_MAIL_KB: string;
  MAIL_API_BASE: string;
  INTERNAL_KEY: string;
}

export interface SpamResult { score: number; verdict: 'inbox' | 'quarantine' | 'blocked'; rules: string[] }

export function scoreSpam(o: { from: string; subject: string; text: string; hasAttachments: boolean; linkCount: number }, env: Env): SpamResult {
  const rules: string[] = [];
  let score = 0;
  const from = o.from.toLowerCase();
  const subj = o.subject.toLowerCase();
  const body = o.text.toLowerCase();
  const list = (s: string) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

  if (list(env.BLOCK_FROM).some((b) => b && from.includes(b))) { score += 100; rules.push('block_from'); }
  const fromDomain = (from.split('@')[1] || '').split('>')[0]!.trim();
  if (list(env.BLOCK_DOMAINS).some((b) => b && fromDomain === b)) { score += 100; rules.push('block_domain'); }
  for (const w of list(env.BLOCK_WORDS)) {
    if (w && (subj.includes(w) || body.includes(w))) { score += 25; rules.push(`word:${w}`); break;
    }
  }
  if (o.linkCount > 5) { score += 20; rules.push('many_links'); }
  if (o.hasAttachments && /invoice|payment|\.exe|\.scr/i.test(subj + body)) { score += 30; rules.push('risky_attach'); }
  if (!o.text.trim() && !o.subject.trim()) { score += 15; rules.push('empty'); }

  const verdict = score >= 100 ? 'blocked' : score >= 40 ? 'quarantine' : 'inbox';
  return { score, verdict, rules };
}

function addrDomain(to: string): string {
  const m = to.toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})/);
  return m?.[1] || '';
}

export default {
  async email(message: any, env: Env, ctx: any) {
    const raw = await new Response(message.raw).arrayBuffer();
    const maxKb = parseInt(env.MAX_MAIL_KB || '5120', 10);
    if (raw.byteLength > maxKb * 1024) {
      await fetch(`${env.MAIL_API_BASE}/internal/ingest-log`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-internal': env.INTERNAL_KEY },
        body: JSON.stringify({ direction: 'in', from: String(message.from), to: String(message.to), status: 'dropped_too_large', reason: `${Math.round(raw.byteLength / 1024)}KB` }),
      }).catch(() => {});
      return;
    }
    const parsed: any = await PostalMime.parse(raw);
    const to = String(message.to || parsed.to?.[0]?.address || '');
    const from = String(message.from || parsed.from?.address || 'unknown');
    const subject = String(parsed.subject || '');
    const text = String(parsed.text || '');
    const html = String(parsed.html || '');
    const domain = addrDomain(to);
    const temps = env.TEMP_DOMAINS.split(',').map((s) => s.trim());
    const perms = env.PERMANENT_DOMAINS.split(',').map((s) => s.trim());
    const linkCount = (text.match(/https?:\/\//g) || []).length + (html.match(/<a /gi) || []).length;

    if (!temps.includes(domain) && !perms.includes(domain)) {
      await fetch(`${env.MAIL_API_BASE}/internal/ingest-log`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-internal': env.INTERNAL_KEY },
        body: JSON.stringify({ direction: 'in', from, to, domain, status: 'rejected', reason: 'unknown_domain' }),
      }).catch(() => {});
      return;
    }

    const spam = scoreSpam({ from, subject, text: text || html.slice(0, 5000), hasAttachments: (parsed.attachments?.length || 0) > 0, linkCount }, env);

    ctx.waitUntil(
      fetch(`${env.MAIL_API_BASE}/internal/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal': env.INTERNAL_KEY },
        body: JSON.stringify({
          to, from, subject, text: text.slice(0, 100000), html: html.slice(0, 200000),
          domain, ownerType: temps.includes(domain) ? 'temp' : 'user',
          spamScore: spam.score, spamVerdict: spam.verdict, spamRules: spam.rules,
          attachments: (parsed.attachments || []).slice(0, 5).map((a: any) => ({ name: a.filename || 'file', mime: a.mimeType || 'application/octet-stream', size: a.content?.byteLength || 0 })),
        }),
      }).catch(() => {}),
    );
  },
};
