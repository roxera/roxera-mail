import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, type AdminOverview, type PublicStats } from '../lib/api';
import { PERMANENT_DOMAINS, TEMP_DOMAINS } from '../lib/config';
import { toast } from '../components/Toast';

type RoleState = 'unknown' | 'user' | 'admin';

function CheckRow({ ok, label, hint }: { ok: boolean | null; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-0">
      <span className={`material-symbols-outlined mt-0.5 ${ok === true ? 'text-green-600' : ok === false ? 'text-red-500' : 'text-amber-500'}`}>
        {ok === true ? 'check_circle' : ok === false ? 'error' : 'pending'}
      </span>
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-[#5f6368] mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

export function Admin() {
  const { user, loading: authLoading, demoMode, logout } = useAuth();
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [role, setRole] = useState<RoleState>('unknown');
  const [ov, setOv] = useState<AdminOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.stats().then((s) => { setStats(s); setApiOk(true); }).catch(() => setApiOk(false));
  }, []);

  useEffect(() => {
    if (!user) { setRole('unknown'); setOv(null); return; }
    setRole('unknown');
    api.whoami().then((w) => setRole(w.role === 'admin' ? 'admin' : 'user')).catch(() => setRole('user'));
  }, [user]);

  useEffect(() => {
    if (role === 'admin') api.adminOverview().then(setOv).catch(() => setOv(null));
  }, [role]);

  const claim = async () => {
    setErr('');
    setBusy(true);
    try {
      await api.claimAdmin();
      setRole('admin');
      toast('Вы назначены администратором');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-full bg-[#f6f8fc]">
      <header className="h-16 bg-white border-b border-[#dadce0] flex items-center px-4 md:px-6 gap-3 sticky top-0 z-10">
        <span className="w-9 h-9 rounded-xl grid place-items-center text-white" style={{ background: '#1a73e8' }}>
          <span className="material-symbols-outlined">admin_panel_settings</span>
        </span>
        <div>
          <div className="font-medium leading-tight">Админ-панель</div>
          <div className="text-xs text-[#5f6368] leading-tight">
            {authLoading ? '…' : user ? `${user.email} · ${role === 'unknown' ? 'роль…' : role}` : demoMode ? 'демо-режим' : 'не вошли'}
          </div>
        </div>
        <span className="flex-1" />
        <Link to="/app" className="text-sm text-[#1a73e8] font-medium hover:bg-[#e8f0fe] rounded-full px-4 py-2">← в кабинет</Link>
        {user && <button onClick={() => logout()} className="text-sm text-[#5f6368] hover:underline">Выйти</button>}
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-4">
        {apiOk === false && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-800">
            API воркера недоступно. Проверьте деплой <code>roxera-mail-api</code> и <code>VITE_API_BASE</code>.
          </div>
        )}

        <section className="grid grid-cols-3 gap-3">
          {[
            ['Временных ящиков', stats?.tempCreated ?? '—', 'timer'],
            ['Писем принято', stats?.mailsIn ?? '—', 'inbox'],
            ['Админов', stats?.adminsCount ?? '—', 'badge'],
          ].map(([k, v, icon]) => (
            <div key={k as string} className="bg-white border border-[#dadce0] rounded-2xl p-4 md:p-5">
              <div className="flex items-center gap-2 text-sm text-[#5f6368]">
                <span className="material-symbols-outlined text-[18px]">{icon}</span>{k}
              </div>
              <div className="text-3xl font-medium mt-1">{v as number | string}</div>
            </div>
          ))}
        </section>

        {!user && !authLoading && (
          <section className="bg-white border border-[#dadce0] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="material-symbols-outlined text-4xl text-[#1a73e8]">lock</span>
            <div className="flex-1">
              <div className="font-medium">Войдите, чтобы управлять сервисом</div>
              <div className="text-sm text-[#5f6368]">Первый вошедший может забрать роль администратора одной кнопкой.</div>
            </div>
            <Link to="/login" className="gmail-btn-blue rounded-full px-6 py-2.5 text-sm font-medium text-center">Войти</Link>
          </section>
        )}

        {user && role === 'user' && (
          <section className="bg-white border border-[#dadce0] rounded-2xl p-5">
            <div className="font-medium">Нет прав администратора</div>
            {stats && stats.adminsCount === 0 ? (
              <div className="mt-2">
                <p className="text-sm text-[#5f6368]">Админов пока нет — вы можете стать первым.</p>
                <button disabled={busy} onClick={claim} className="gmail-btn-blue rounded-full px-6 py-2.5 text-sm font-medium mt-3 disabled:opacity-50">
                  {busy ? '…' : 'Стать администратором'}
                </button>
              </div>
            ) : (
              <p className="text-sm text-[#5f6368] mt-1">Попросите действующего админа выдать вам доступ.</p>
            )}
            {err && <div className="text-red-600 text-sm mt-2">{err}</div>}
          </section>
        )}

        {role === 'admin' && (
          <>
            <section className="bg-white border border-[#dadce0] rounded-2xl p-5">
              <h2 className="font-medium mb-1">Входящие подключения (последние {ov?.connlog.length ?? 0})</h2>
              {!ov ? (
                <div className="space-y-2 mt-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-8" />)}</div>
              ) : ov.connlog.length === 0 ? (
                <div className="text-sm text-[#5f6368] mt-2">Пока пусто — сюда попадает каждое входящее письмо (отправитель, получатель, вердикт анти-спама).</div>
              ) : (
                <div className="text-xs mt-2 max-h-80 overflow-auto divide-y">
                  {ov.connlog.map((c, i) => (
                    <div key={i} className="py-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-[#5f6368] whitespace-nowrap">{new Date(c.ts).toLocaleString('ru-RU')}</span>
                      <span className="font-medium break-all">{c.from}</span>
                      <span className="text-[#5f6368]">→</span>
                      <span className="break-all">{c.to}</span>
                      <span className={`rounded-full px-2 py-0.5 ${c.verdict === 'inbox' ? 'bg-green-50 text-green-700' : 'bg-amber-100 text-amber-800'}`}>{c.verdict}</span>
                      <span className="text-[#5f6368] truncate w-full">{c.subject}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white border border-[#dadce0] rounded-2xl p-5">
              <h2 className="font-medium mb-2">Администраторы ({ov?.admins.length ?? 0})</h2>
              {ov?.admins.map((a) => (
                <div key={a.uid} className="text-sm py-1.5 border-b last:border-0 flex gap-2">
                  <span className="material-symbols-outlined text-[18px] text-[#5f6368]">account_circle</span>
                  <span className="font-medium">{a.email || a.uid}</span>
                  <span className="text-xs text-[#5f6368] ml-auto">{new Date(a.ts).toLocaleDateString('ru-RU')}</span>
                </div>
              ))}
            </section>
          </>
        )}

        <section className="bg-white border border-[#dadce0] rounded-2xl p-5">
          <h2 className="font-medium">Домены</h2>
          <div className="grid md:grid-cols-2 gap-4 mt-3">
            <div>
              <div className="text-xs font-medium text-[#5f6368] uppercase tracking-wide mb-1">Временная почта (только приём)</div>
              {TEMP_DOMAINS.map((d) => (
                <div key={d} className="flex items-center gap-2 text-sm py-1.5 border-b last:border-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="font-medium break-all">{d}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-xs font-medium text-[#5f6368] uppercase tracking-wide mb-1">Постоянные ящики (приём + отправка)</div>
              {PERMANENT_DOMAINS.map((d) => (
                <div key={d} className="flex items-center gap-2 text-sm py-1.5 border-b last:border-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="font-medium break-all">{d}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-xs text-[#5f6368] mt-3 leading-relaxed">
            Для приёма на <code>roxera-mail.*</code> нужны MX-записи на каждом субдомене (route1/2/3.mx.cloudflare.net).
            Для отправки через Resend — DKIM/SPF/TXT по его карточкам доменов. Расширенное управление (добавление доменов, блок-листы) включится вместе с Firestore.
          </div>
        </section>

        <section className="bg-white border border-[#dadce0] rounded-2xl p-5">
          <h2 className="font-medium">Состояние запуска</h2>
          <div className="mt-1">
            <CheckRow ok={apiOk} label="API воркера отвечает" hint="KV-хранилище, счётчики, инжест писем" />
            <CheckRow ok={user ? true : false} label="Вход через Firebase Auth" hint={user ? user.email || '' : 'Нужны включённые провайдеры Google/GitHub в консоли Firebase'} />
            <CheckRow ok={role === 'admin' ? true : null} label="Роль администратора" hint={role === 'admin' ? 'Доступ к логам открыт' : 'Первый вошедший забирает роль кнопкой выше'} />
            <CheckRow ok={null} label="База Firestore + Storage" hint="Создай в консоли Firebase (Production, eur3) — оживут кабинет, отправка, вложения" />
            <CheckRow ok={null} label="MX на roxera-mail.* субдоменах" hint="6 записей в Cloudflare DNS — иначе Gmail не доставит письма на временные адреса" />
            <CheckRow ok={null} label="Resend: DKIM/SPF/TXT" hint="8 записей из карточек доменов в Resend — иначе отправка не верифицируется" />
          </div>
        </section>
      </main>
    </div>
  );
}
