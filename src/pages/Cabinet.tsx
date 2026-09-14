import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TopBar, SideBar } from '../components/Chrome';
import { MessageList, MessageReader } from '../components/Mail';
import { ComposeModal } from '../components/Compose';
import { useLocalBoxes, usePermanent, useTemp } from '../hooks/useMail';
import { useAuth } from '../context/AuthContext';
import { MAX_PERMANENT_PER_USER, isValidLocal } from '../lib/config';
import { exportMailboxPdf } from '../lib/pdf';
import { toast } from '../components/Toast';

function copyText(t: string, okMsg: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(t).then(() => toast(okMsg)).catch(() => toast('Не удалось скопировать'));
  } else toast('Копирование недоступно');
}

function TimerChip({ left }: { left: string }) {
  const [mm = 0, ss = 0] = left.split(':').map(Number);
  const frac = Math.max(0, Math.min(1, ((mm * 60) + ss) / (15 * 60)));
  const C = 2 * Math.PI * 9;
  return (
    <span className="flex items-center gap-2 bg-[#d3e3fd] text-[#041e49] rounded-full pl-1.5 pr-3 py-1 text-sm font-medium">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <circle cx="11" cy="11" r="9" fill="none" stroke="#ffffff" strokeWidth="3" />
        <circle cx="11" cy="11" r="9" fill="none" stroke="#0b57d0" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - frac)).toFixed(1)} transform="rotate(-90 11 11)" />
      </svg>
      {left || '—'}
    </span>
  );
}

export function TempPage() {
  const { box, msgs, loading, left, gone, create, extend, destroy, domains } = useTemp();
  const [domain, setDomain] = useState<string>(domains[0] as string);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useMemo(() => msgs.find((m) => m.id === sel) || null, [msgs, sel]);

  const doCreate = async () => {
    setBusy(true);
    try {
      await create(domain);
      setSel(null);
      toast('Временный адрес создан');
    } catch { toast('Нет связи с API'); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-full">
      <TopBar onCompose={() => toast('Войдите, чтобы отправлять письма')} onMenu={() => {}} />
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
        <div className="bg-white rounded-3xl border border-[#dadce0] p-5 md:p-7 animate-in shadow-sm">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl grid place-items-center text-white shrink-0" style={{ background: '#1a73e8' }}>
              <span className="material-symbols-outlined">timer</span>
            </span>
            <div>
              <h1 className="text-[22px] md:text-2xl font-medium leading-tight">Временная почта — 15 минут</h1>
              <p className="text-sm text-[#5f6368]">Анонимно, без регистрации. Только приём — идеально для кодов и подтверждений.</p>
            </div>
          </div>

          {!box && !gone && (
            <div className="flex flex-col sm:flex-row gap-2 mt-5">
              <select value={domain} onChange={(e) => setDomain(e.target.value)} className="border border-[#dadce0] rounded-full px-4 py-3 text-sm bg-white">
                {domains.map((d) => <option key={d} value={d}>@{d}</option>)}
              </select>
              <button
                disabled={busy || loading}
                onClick={doCreate}
                className="gmail-btn-blue rounded-full px-6 py-3 text-sm font-medium disabled:opacity-50"
              >{busy ? 'Генерация…' : 'Сгенерировать адрес'}</button>
            </div>
          )}

          {gone && !box && (
            <div className="mt-5 bg-[#fef7e0] border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 animate-in">
              <span className="material-symbols-outlined text-amber-600 text-3xl">timer_off</span>
              <div className="flex-1">
                <div className="font-medium">Адрес истёк или был удалён</div>
                <div className="text-sm text-[#5f6368]">Ничего страшного — новый создаётся за секунду.</div>
              </div>
              <button onClick={doCreate} disabled={busy} className="gmail-btn-blue rounded-full px-6 py-2.5 text-sm font-medium disabled:opacity-50">
                Создать новый
              </button>
            </div>
          )}

          {box && (
            <div className="mt-5 flex flex-col gap-3 animate-in">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-[#f1f3f4] rounded-2xl p-3">
                <code className="flex-1 break-all text-[16px] font-medium px-1">{box.address}</code>
                <button onClick={() => copyText(box.address, 'Адрес скопирован')} className="flex items-center gap-1.5 border border-[#dadce0] rounded-full px-4 py-2 text-sm bg-white hover:shadow-sm">
                  <span className="material-symbols-outlined text-[18px]">content_copy</span>Копировать
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <TimerChip left={left} />
                <button onClick={async () => { await extend(); toast('Продлено на 15 минут'); }} className="border border-[#dadce0] rounded-full px-4 py-1.5 hover:bg-gray-50">Продлить +15 мин</button>
                <button onClick={async () => { await destroy(); await create(domain); toast('Адрес пересоздан'); }} className="border border-[#dadce0] rounded-full px-4 py-1.5 hover:bg-gray-50">Пересоздать</button>
                <button onClick={async () => { await destroy(); toast('Ящик удалён'); }} className="text-red-600 border border-red-200 rounded-full px-4 py-1.5 hover:bg-red-50">Удалить</button>
                <span className="ml-auto hidden md:flex items-center gap-1.5 text-xs text-green-700">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> автообновление
                </span>
              </div>
            </div>
          )}
        </div>

        {box && (
          <div className="bg-white rounded-3xl border border-[#dadce0] overflow-hidden grid md:grid-cols-[380px_1fr] min-h-[480px] shadow-sm">
            <div className="border-r border-[#eef1f5]"><MessageList msgs={msgs} loading={loading && msgs.length === 0} selected={sel} onSelect={setSel} /></div>
            <MessageReader msg={active} onBack={() => setSel(null)} />
          </div>
        )}

        {!box && !gone && (
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            {[['bolt', '1 клик', 'Адрес генерируется мгновенно, без почты и паролей'], ['inbox', 'Читай в браузере', 'Письма появляются сами каждые 4 секунды'], ['delete', 'Сгори красиво', 'Автоудаление через 15 минут или одной кнопкой']].map(([icon, t, d]) => (
              <div key={t} className="bg-white border border-[#dadce0] rounded-2xl p-4">
                <span className="material-symbols-outlined text-[#1a73e8] text-2xl">{icon}</span>
                <div className="font-medium mt-1">{t}</div>
                <div className="text-[#5f6368] text-[13px] mt-0.5">{d}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Cabinet() {
  const temp = useTemp();
  const perm = usePermanent();
  const localBx = useLocalBoxes();
  const { user } = useAuth();
  const nav = useNavigate();
  const [view, setView] = useState('inbox');
  const [menuOpen, setMenuOpen] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [compose, setCompose] = useState(false);
  const [local, setLocal] = useState('');
  const [pdom, setPdom] = useState<string>(localBx.domains[0] as string);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');

  const activeBox = perm.boxes.find((b) => b.id === perm.activeId) || null;
  const q = query.trim().toLowerCase();
  const matchQ = (m: { from: string; to: string; subject: string; text?: string }) =>
    !q || `${m.from} ${m.to} ${m.subject || ''} ${m.text || ''}`.toLowerCase().includes(q);
  const filtered = useMemo(() => {
    const list = view === 'temp' ? temp.msgs
      : view === 'sent' ? perm.msgs.filter((m) => m.direction === 'out')
      : view === 'spam' ? perm.msgs.filter((m) => m.spamVerdict === 'quarantine' || m.spamVerdict === 'blocked')
      : perm.msgs.filter((m) => m.direction !== 'out' && m.spamVerdict !== 'blocked');
    return list.filter(matchQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, temp.msgs, perm.msgs, q]);
  const localMsgs = useMemo(() => localBx.msgs.filter(matchQ), [localBx.msgs, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeMsg = useMemo(() => filtered.find((m) => m.id === sel) || null, [filtered, sel]);
  const activeLocalMsg = useMemo(() => localMsgs.find((m) => m.id === sel) || null, [localMsgs, sel]);

  const composeLocal = view === 'local' && !!localBx.active;

  return (
    <div className="min-h-full">
      <TopBar onCompose={() => setCompose(true)} onMenu={() => setMenuOpen((v) => !v)} query={query} onQuery={(v) => setQuery(v)} />
      <div className="flex">
        <SideBar
          open={menuOpen} active={view}
          tempCount={temp.box ? 1 : 0} permCount={localBx.boxes.length + perm.boxes.length}
          onCompose={() => setCompose(true)}
          onNav={(k) => { if (k === 'admin') { nav('/admin'); return; } setView(k); setSel(null); }}
        />
        <main className="flex-1 p-3 md:p-4 space-y-3 min-w-0">
          {!user && (
            <div className="bg-[#e8f0fe] border border-[#d3e3fd] rounded-2xl px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="flex-1">Ящики живут в этом браузере. <Link to="/login" className="text-[#0b57d0] font-medium hover:underline">Войдите</Link>, чтобы синхронизировать их между устройствами.</span>
            </div>
          )}

          {view === 'boxes' && (
            <div className="bg-white rounded-3xl border border-[#dadce0] p-5 animate-in shadow-sm">
              <h2 className="text-lg font-medium">Мои ящики ({localBx.boxes.length}/{MAX_PERMANENT_PER_USER})</h2>
              <p className="text-xs text-[#5f6368] mt-1">Именные адреса вида <code>имя@europe.pp.ua</code> — принимают письма сразу. Живут 27 дней и продлеваются сами, пока вы заходите.</p>
              <div className="mt-3 space-y-2">
                {localBx.boxes.map((b) => (
                  <div key={b.id} className={`flex items-center gap-2 md:gap-3 border rounded-2xl px-4 py-3 ${localBx.activeId === b.id ? 'border-[#1a73e8] bg-[#e8f0fe]/40' : 'border-[#dadce0]'}`}>
                    <span className="material-symbols-outlined text-[#5f6368]">mail</span>
                    <span className="flex-1 break-all font-medium text-sm md:text-[15px]">{b.address}</span>
                    <button onClick={() => copyText(b.address, 'Адрес скопирован')} className="text-sm text-[#5f6368] hover:text-black hidden sm:inline">Копировать</button>
                    <button onClick={() => { localBx.setActiveId(b.id); setView('local'); setSel(null); }} className="text-sm text-[#1a73e8] font-medium">Открыть</button>
                    <button onClick={async () => { await localBx.remove(b.id); toast('Ящик удалён'); }} className="text-sm text-red-600">Удалить</button>
                  </div>
                ))}
                {localBx.boxes.length === 0 && (
                  <div className="text-sm text-[#5f6368] border border-dashed border-[#dadce0] rounded-2xl p-4 text-center">
                    Пока пусто. Придумайте имя ниже — например <code>rox</code> — и ящик будет создан мгновенно.
                  </div>
                )}
              </div>
              {localBx.boxes.length < MAX_PERMANENT_PER_USER ? (
                <div className="flex flex-col sm:flex-row gap-2 mt-4">
                  <input value={local} onChange={(e) => setLocal(e.target.value.toLowerCase())} placeholder="имя-ящика" className="border border-[#dadce0] rounded-full px-4 py-2.5 text-sm flex-1 outline-none focus:border-[#1a73e8]" />
                  <select value={pdom} onChange={(e) => setPdom(e.target.value)} className="border border-[#dadce0] rounded-full px-4 py-2.5 text-sm bg-white">
                    {localBx.domains.map((d) => <option key={d} value={d}>@{d}</option>)}
                  </select>
                  <button
                    onClick={async () => {
                      setErr('');
                      try { await localBx.create(local.trim(), pdom!); setLocal(''); toast('Ящик создан'); }
                      catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); }
                    }}
                    className="gmail-btn-blue rounded-full px-6 py-2.5 text-sm font-medium"
                  >Создать</button>
                </div>
              ) : <div className="text-sm text-amber-700 mt-3">Достигнут лимит {MAX_PERMANENT_PER_USER} ящиков.</div>}
              {!isValidLocal(local) && local.length > 0 && <div className="text-xs text-red-600 mt-1">Имя: a-z, 0-9, точки/дефисы, 3–32 символа.</div>}
              {err && <div className="text-sm text-red-600 mt-2">{err}</div>}

              {user && (
                <div className="mt-6 pt-4 border-t border-[#eef1f5]">
                  <h3 className="text-sm font-medium text-[#5f6368]">Ящики аккаунта (синхронизация, после настройки Firebase)</h3>
                  {perm.boxes.length === 0
                    ? <div className="text-xs text-[#5f6368] mt-1">Пока нет — появятся после включения базы в консоли.</div>
                    : perm.boxes.map((b) => (
                      <div key={b.id} className="flex items-center gap-3 border border-[#dadce0] rounded-2xl px-4 py-2.5 mt-2 text-sm">
                        <span className="flex-1 break-all font-medium">{b.address}</span>
                        <button onClick={() => perm.setActiveId(b.id)} className="text-[#1a73e8]">Выбрать</button>
                        <button onClick={() => perm.removeBox(b.id)} className="text-red-600">Удалить</button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {view === 'local' && (
            <div className="bg-white rounded-3xl border border-[#dadce0] overflow-hidden shadow-sm animate-in">
              {!localBx.active ? (
                <div className="p-8 text-center text-sm text-[#5f6368]">
                  Нет открытого ящика. <button onClick={() => setView('boxes')} className="text-[#1a73e8] font-medium">Создайте или выберите</button>.
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 px-4 h-12 border-b border-[#eef1f5] text-sm">
                    <span className="material-symbols-outlined text-[#5f6368]">mail</span>
                    <span className="font-medium truncate">{localBx.active.address}</span>
                    <span className="flex-1" />
                    <button onClick={() => copyText(localBx.active!.address, 'Адрес скопирован')} className="text-xs text-[#5f6368] hover:text-black">Копировать</button>
                    <button onClick={() => { exportMailboxPdf(localBx.active!.address, localBx.msgs); toast('PDF сохранён'); }} className="border border-[#dadce0] rounded-full px-3 py-1.5 text-xs flex items-center gap-1 hover:shadow-sm">
                      <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span> PDF
                    </button>
                  </div>
                  <div className="grid md:grid-cols-[380px_1fr] min-h-[560px]">
                    <div className="border-r border-[#eef1f5]"><MessageList msgs={localMsgs} loading={false} selected={sel} onSelect={setSel} /></div>
                    <MessageReader msg={activeLocalMsg} onBack={() => setSel(null)} />
                  </div>
                </>
              )}
            </div>
          )}

          {view === 'temp' && (
            <div className="bg-white rounded-3xl border border-[#dadce0] p-5 shadow-sm">
              {!temp.box ? (
                <button onClick={async () => { await temp.create(); toast('Временный адрес создан'); }} className="gmail-btn-blue rounded-full px-6 py-3 text-sm font-medium">Сгенерировать Temp-адрес</button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <code className="font-medium break-all">{temp.box.address}</code>
                  <TimerChip left={temp.left} />
                  <button onClick={async () => { await temp.extend(); toast('Продлено на 15 минут'); }} className="border border-[#dadce0] rounded-full px-3 py-1 hover:bg-gray-50">+15 мин</button>
                  <button onClick={async () => { await temp.destroy(); toast('Ящик удалён'); }} className="text-red-600 border border-red-200 rounded-full px-3 py-1 hover:bg-red-50">Удалить</button>
                </div>
              )}
            </div>
          )}

          {view !== 'boxes' && view !== 'local' && (
            <div className="bg-white rounded-3xl border border-[#dadce0] overflow-hidden shadow-sm">
              <div className="flex items-center gap-2 px-4 h-12 border-b border-[#eef1f5] text-sm">
                <span className="font-medium truncate">{view === 'temp' ? 'Временный инбокс' : activeBox ? activeBox.address : 'Входящие'}</span>
                {query.trim() && <span className="text-xs text-[#5f6368]">· поиск: «{query.trim()}» ({filtered.length})</span>}
                <span className="flex-1" />
                {activeBox && view !== 'temp' && (
                  <button onClick={() => { exportMailboxPdf(activeBox.address, perm.msgs); toast('PDF сохранён'); }} className="border border-[#dadce0] rounded-full px-3 py-1.5 text-xs flex items-center gap-1 hover:shadow-sm">
                    <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span> Экспорт ящика в PDF
                  </button>
                )}
              </div>
              <div className="grid md:grid-cols-[380px_1fr] min-h-[560px]">
                <div className="border-r border-[#eef1f5]"><MessageList msgs={filtered} loading={false} selected={sel} onSelect={setSel} /></div>
                <MessageReader msg={activeMsg} onBack={() => setSel(null)} />
              </div>
            </div>
          )}
        </main>
      </div>
      {compose && (composeLocal || activeBox) && (
        <ComposeModal
          from={composeLocal ? localBx.active!.address : activeBox!.address}
          onClose={() => setCompose(false)}
          onSend={async (p) => {
            if (composeLocal) {
              try {
                const r = await localBx.send(localBx.active!.id, { to: p.to, subject: p.subject, text: p.text });
                toast(`Письмо отправлено (${r.via === 'resend' ? 'Resend' : 'Cloudflare'})`);
              } catch (e) {
                const msg = e instanceof Error ? e.message : 'Ошибка отправки';
                if (msg.includes('not verified') || msg.includes('verified')) {
                  toast('Отправка включится после верификации домена (DNS)');
                  throw new Error('Домен не верифицирован для отправки. Письмо сохранено в ящике.');
                }
                throw e;
              }
            } else {
              await perm.sendMail(activeBox!.id, p);
              toast('Письмо отправлено');
            }
          }}
        />
      )}
      {compose && !composeLocal && !activeBox && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/30 p-4" onClick={() => setCompose(false)}>
          <div className="bg-white rounded-2xl p-6 text-sm max-w-sm" onClick={(e) => e.stopPropagation()}>
            Сначала создайте ящик во вкладке «Мои ящики».
            <button onClick={() => { setCompose(false); setView('boxes'); }} className="gmail-btn-blue rounded-full px-4 py-2 ml-3">Создать</button>
          </div>
        </div>
      )}
    </div>
  );
}
