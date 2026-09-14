import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, getDocs, limit, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import type { AuditLog, ConnectionLog, DomainRow } from '../lib/types';
import { api } from '../lib/api';

export function Admin() {
  const { role, demoMode } = useAuth();
  const [domains, setDomains] = useState<DomainRow[]>([
    { id: 'roxera-mail.ajoure.cfd', domain: 'roxera-mail.ajoure.cfd', type: 'temp', status: 'active', dnsVerified: false, resendVerified: false, createdAt: new Date().toISOString() },
    { id: 'ajoure.cfd', domain: 'ajoure.cfd', type: 'permanent', status: 'active', dnsVerified: false, resendVerified: false, createdAt: new Date().toISOString() },
  ]);
  const [conn, setConn] = useState<ConnectionLog[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<{ inbox24h: number; outbox24h: number; activeBoxes: number } | null>(null);
  const [form, setForm] = useState({ domain: '', type: 'both' as DomainRow['type'] });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const u1 = onSnapshot(collection(db, 'domains'), (s) => setDomains(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DomainRow, 'id'>) })) as DomainRow[]));
    const u2 = onSnapshot(query(collection(db, 'connectionLogs'), orderBy('ts', 'desc'), limit(50)), (s) => setConn(s.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as ConnectionLog[]));
    const u3 = onSnapshot(query(collection(db, 'auditLogs'), orderBy('ts', 'desc'), limit(50)), (s) => setAudit(s.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as AuditLog[]));
    api.adminStats().then(setStats).catch(() => {});
    return () => { u1(); u2(); u3(); };
  }, []);

  const addDomain = async () => {
    setMsg('');
    const d = form.domain.trim().toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) { setMsg('Некорректный домен'); return; }
    const row = { domain: d, type: form.type, status: 'active', dnsVerified: false, resendVerified: false, createdAt: new Date().toISOString() };
    if (isFirebaseConfigured()) await addDoc(collection(db, 'domains'), row);
    setDomains((v) => [...v, { id: d, ...row } as DomainRow]);
    setForm({ domain: '', type: 'both' });
  };

  const toggleDomain = async (r: DomainRow) => {
    const next = r.status === 'active' ? 'disabled' : 'active';
    if (isFirebaseConfigured()) {
      const s = await getDocs(collection(db, 'domains'));
      const hit = s.docs.find((x) => (x.data() as { domain: string }).domain === r.domain);
      if (hit) await updateDoc(hit.ref, { status: next });
      else await addDoc(collection(db, 'domains'), { ...r, status: next });
    }
    setDomains((v) => v.map((x) => (x.domain === r.domain ? { ...x, status: next as 'active' | 'disabled' } : x)));
  };

  const delDomain = async (r: DomainRow) => {
    if (isFirebaseConfigured()) {
      try {
        const s = await getDocs(collection(db, 'domains'));
        const hit = s.docs.find((x) => (x.data() as { domain: string }).domain === r.domain);
        if (hit) await deleteDoc(hit.ref);
      } catch { /* ignore */ }
    }
    setDomains((v) => v.filter((x) => x.domain !== r.domain));
  };

  return (
    <div className="min-h-full bg-[#f6f8fc]">
      <header className="h-16 bg-white border-b flex items-center px-6 gap-3">
        <span className="material-symbols-outlined">admin_panel_settings</span>
        <b>Админ-панель Roxera Mail</b>
        <span className="text-xs text-[#5f6368]">роль: {demoMode ? 'demo' : role || '…'}</span>
        <span className="flex-1" />
        <a href="/app" className="text-sm text-[#1a73e8]">← в кабинет</a>
      </header>
      {demoMode && <div className="m-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">Демо-режим без Firebase: изменения локальные. Подключите .env чтобы управлять продом.</div>}
      <main className="max-w-6xl mx-auto p-4 space-y-4">
        <section className="grid sm:grid-cols-3 gap-3">
          {[
            ['Входящие 24ч', stats?.inbox24h ?? conn.filter((c) => c.direction === 'in').length],
            ['Исходящие 24ч', stats?.outbox24h ?? conn.filter((c) => c.direction === 'out').length],
            ['Активные ящики', stats?.activeBoxes ?? domains.filter((d) => d.status === 'active').length],
          ].map(([k, v]) => (
            <div key={k as string} className="bg-white border rounded-2xl p-5">
              <div className="text-sm text-[#5f6368]">{k}</div>
              <div className="text-3xl font-medium mt-1">{v as number}</div>
            </div>
          ))}
        </section>

        <section className="bg-white border rounded-2xl p-5">
          <h2 className="font-medium">Домены (temp / permanent / both)</h2>
          <div className="flex flex-col sm:flex-row gap-2 mt-3">
            <input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="new-domain.example" className="border rounded-full px-4 py-2 text-sm flex-1" />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DomainRow['type'] })} className="border rounded-full px-4 py-2 text-sm">
              <option value="temp">temp (только приём)</option>
              <option value="permanent">permanent (приём+отправка)</option>
              <option value="both">both</option>
            </select>
            <button onClick={addDomain} className="gmail-btn-blue rounded-full px-5 py-2 text-sm">Добавить</button>
          </div>
          {msg && <div className="text-red-600 text-sm mt-2">{msg}</div>}
          <div className="mt-3 divide-y text-sm">
            {domains.map((d) => (
              <div key={d.domain} className="py-2.5 flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${d.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="font-medium flex-1 break-all">{d.domain} <span className="text-xs text-[#5f6368]">[{d.type}]</span></span>
                <span className="text-xs text-[#5f6368] hidden md:inline">DNS {d.dnsVerified ? '✓' : '×'} · Resend {d.resendVerified ? '✓' : '×'}</span>
                <button onClick={() => toggleDomain(d)} className="border rounded-full px-3 py-1 text-xs">{d.status === 'active' ? 'Отключить' : 'Включить'}</button>
                <button onClick={() => delDomain(d)} className="text-red-600 text-xs">Удалить</button>
              </div>
            ))}
          </div>
          <div className="text-xs text-[#5f6368] mt-3">Каждый новый домен: 1) NS на Cloudflare → 2) Email Routing Catch-all → Worker mail-inbound → 3) SPF/DKIM/DMARC + верификация в Resend (для отправки). Детали — SETUP.md.</div>
        </section>

        <section className="grid md:grid-cols-2 gap-4">
          <div className="bg-white border rounded-2xl p-5">
            <h2 className="font-medium mb-2">Логи соединений in/out (последние 50)</h2>
            <div className="text-xs space-y-1.5 max-h-80 overflow-auto">
              {conn.length === 0 && <div className="text-[#5f6368]">Пока пусто — логи пишет Worker mail-inbound/mail-api.</div>}
              {conn.map((c) => (
                <div key={c.id} className="border-b pb-1.5">
                  <span className={`rounded px-1.5 py-0.5 ${c.direction === 'in' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>{c.direction}</span>{' '}
                  {c.from} → {c.to} <span className="text-[#5f6368]">[{c.status}{c.reason ? `: ${c.reason}` : ''}]</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white border rounded-2xl p-5">
            <h2 className="font-medium mb-2">Аудит действий + анти-спам отчёт</h2>
            <div className="text-xs space-y-1.5 max-h-80 overflow-auto">
              {audit.length === 0 && <div className="text-[#5f6368]">Пока пусто. Сюда пишутся login/create/send/block + verdict quarantine/blocked.</div>}
              {audit.map((a) => (
                <div key={a.id} className="border-b pb-1.5">{a.ts} · <b>{a.actor}</b> · {a.action} · {a.target || ''}</div>
              ))}
            </div>
            <div className="text-xs text-[#5f6368] mt-3">Безопасность: роли admin/moderator/user (customClaims), лимиты 5/uid, блок-листы в settings/global, хэширование IP, санитизация HTML (DOMPurify), CSP.</div>
          </div>
        </section>
      </main>
    </div>
  );
}

// Phase 2 (заложено): RBAC-матрица, SIEM-экспорт, публичные API-ключи.
export const ADMIN_PHASE2 = ['rbac-matrix', 'siem-export', 'public-api-keys'] as const;
