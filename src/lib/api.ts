import { API_BASE } from './config';
import { auth } from './firebase';

async function idToken(): Promise<string | null> {
  const u = auth.currentUser;
  if (!u) return null;
  return u.getIdToken();
}

import type { MailMessage } from './types';

export interface PublicStats { ok: boolean; tempCreated: number; mailsIn: number; adminsCount: number; ts: string }
export interface AdminOverview {
  stats: { tempCreated: number; mailsIn: number };
  connlog: { ts: string; from: string; to: string; verdict: string; subject: string }[];
  admins: { uid: string; email: string; ts: string }[];
}

async function reqRaw<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await idToken();
  const r = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) throw new Error('VITE_API_BASE не задан — Worker API недоступен (см. .env.example). Работает демо-режим Firestore.');
  return reqRaw<T>(path, init);
}

export const api = {
  createTemp: (domain?: string) => req<{ id: string; address: string; token: string; expiresAt: string }>('/v1/temp', { method: 'POST', body: JSON.stringify({ domain }) }),
  extendTemp: (id: string, token: string) => req<{ expiresAt: string }>(`/v1/temp/${id}/extend`, { method: 'POST', body: JSON.stringify({ token }) }),
  deleteTemp: (id: string, token: string) => req<{ ok: boolean }>(`/v1/temp/${id}`, { method: 'DELETE', body: JSON.stringify({ token }) }),
  inboxTemp: (id: string, token: string) =>
    req<{ address: string; expiresAt: string; messages: MailMessage[] }>(`/v1/temp/${encodeURIComponent(id)}/inbox?token=${encodeURIComponent(token)}`),
  send: (p: { mailboxId: string; to: string; subject: string; text: string; html?: string }) =>
    req<{ id: string }>('/v1/send', { method: 'POST', body: JSON.stringify(p) }),
  adminStats: () => req<{ inbox24h: number; outbox24h: number; activeBoxes: number; topDomains: { domain: string; n: number }[] }>('/v1/admin/stats'),
  stats: () => req<PublicStats>('/v1/stats'),
  whoami: () => req<{ uid: string; email: string; role: string }>('/v1/admin/whoami'),
  claimAdmin: () => req<{ ok: boolean; role: string }>('/v1/admin/claim', { method: 'POST', body: '{}' }),
  adminOverview: () => req<AdminOverview>('/v1/admin/overview'),
};
