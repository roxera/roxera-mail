import { useMemo, useState } from 'react';
import { TopBar, SideBar } from '../components/Chrome';
import { MessageList, MessageReader } from '../components/Mail';
import { ComposeModal } from '../components/Compose';
import { usePermanent, useTemp } from '../hooks/useMail';
import { MAX_PERMANENT_PER_USER, isValidLocal } from '../lib/config';
import { exportMailboxPdf } from '../lib/pdf';

export function TempPage() {
  const { box, msgs, loading, left, create, extend, destroy, domains } = useTemp();
  const [domain, setDomain] = useState<string>(domains[0] as string);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useMemo(() => msgs.find((m) => m.id === sel) || null, [msgs, sel]);

  return (
    <div className="min-h-full">
      <TopBar onCompose={() => {}} onMenu={() => {}} />
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
        <div className="bg-white rounded-3xl border p-5 md:p-6 animate-in">
          <h1 className="text-2xl font-medium">Временная почта — 15 минут</h1>
          <p className="text-sm text-[#5f6368]">Только приём. Для отправки войдите и создайте постоянный ящик.</p>
          {!box ? (
            <div className="flex flex-col sm:flex-row gap-2 mt-4">
              <select value={domain} onChange={(e) => setDomain(e.target.value)} className="border rounded-full px-4 py-3 text-sm">
                {domains.map((d) => <option key={d} value={d}>@{d}</option>)}
              </select>
              <button
                disabled={busy || loading}
                onClick={async () => { setBusy(true); try { await create(domain); } finally { setBusy(false); } }}
                className="gmail-btn-blue rounded-full px-6 py-3 text-sm font-medium disabled:opacity-50"
              >{busy ? 'Генерация…' : 'Сгенерировать адрес'}</button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-[#f1f3f4] rounded-2xl p-3">
                <code className="flex-1 break-all text-[15px] font-medium">{box.address}</code>
                <button onClick={() => navigator.clipboard.writeText(box.address)} className="border rounded-full px-4 py-2 text-sm bg-white hover:bg-gray-50">Копировать</button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="bg-[#d3e3fd] rounded-full px-3 py-1.5 font-medium">⏳ {left || '—'}</span>
                <button onClick={extend} className="border rounded-full px-4 py-1.5 hover:bg-white">Продлить +15 мин</button>
                <button onClick={async () => { await destroy(); await create(domain); }} className="border rounded-full px-4 py-1.5 hover:bg-white">Пересоздать</button>
                <button onClick={destroy} className="text-red-600 border border-red-200 rounded-full px-4 py-1.5 hover:bg-red-50">Удалить</button>
              </div>
            </div>
          )}
        </div>
        {box && (
          <div className="bg-white rounded-3xl border overflow-hidden grid md:grid-cols-[380px_1fr] min-h-[480px]">
            <div className="border-r"><MessageList msgs={msgs} loading={loading} selected={sel} onSelect={setSel} /></div>
            <MessageReader msg={active} />
          </div>
        )}
      </div>
    </div>
  );
}

export function Cabinet() {
  const temp = useTemp();
  const perm = usePermanent();
  const [view, setView] = useState('inbox');
  const [menuOpen, setMenuOpen] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [compose, setCompose] = useState(false);
  const [local, setLocal] = useState('');
  const [pdom, setPdom] = useState<string>(perm.domains[0] as string);
  const [err, setErr] = useState('');

  const activeBox = perm.boxes.find((b) => b.id === perm.activeId) || null;
  const filtered = useMemo(() => {
    if (view === 'temp') return temp.msgs;
    if (view === 'sent') return perm.msgs.filter((m) => m.direction === 'out');
    if (view === 'spam') return perm.msgs.filter((m) => m.spamVerdict === 'quarantine' || m.spamVerdict === 'blocked');
    return perm.msgs.filter((m) => m.direction !== 'out' && m.spamVerdict !== 'blocked');
  }, [view, temp.msgs, perm.msgs]);
  const activeMsg = useMemo(() => filtered.find((m) => m.id === sel) || null, [filtered, sel]);

  return (
    <div className="min-h-full">
      <TopBar onCompose={() => setCompose(true)} onMenu={() => setMenuOpen((v) => !v)} />
      <div className="flex">
        <SideBar
          open={menuOpen} active={view}
          tempCount={temp.box ? 1 : 0} permCount={perm.boxes.length}
          onNav={(k) => { setView(k); setSel(null); }}
        />
        <main className="flex-1 p-3 md:p-4 space-y-3 min-w-0">
          {view === 'boxes' && (
            <div className="bg-white rounded-3xl border p-5 animate-in">
              <h2 className="text-lg font-medium">Мои ящики ({perm.boxes.length}/{MAX_PERMANENT_PER_USER})</h2>
              <div className="mt-3 space-y-2">
                {perm.boxes.map((b) => (
                  <div key={b.id} className={`flex items-center gap-3 border rounded-2xl px-4 py-3 ${perm.activeId === b.id ? 'border-[#1a73e8] bg-[#e8f0fe]/40' : ''}`}>
                    <span className="material-symbols-outlined">mail</span>
                    <span className="flex-1 break-all font-medium">{b.address}</span>
                    <button onClick={() => perm.setActiveId(b.id)} className="text-sm text-[#1a73e8]">Выбрать</button>
                    <button onClick={() => perm.removeBox(b.id)} className="text-sm text-red-600">Удалить</button>
                  </div>
                ))}
              </div>
              {perm.boxes.length < MAX_PERMANENT_PER_USER ? (
                <div className="flex flex-col sm:flex-row gap-2 mt-4">
                  <input value={local} onChange={(e) => setLocal(e.target.value.toLowerCase())} placeholder="имя-ящика" className="border rounded-full px-4 py-2.5 text-sm flex-1" />
                  <select value={pdom} onChange={(e) => setPdom(e.target.value)} className="border rounded-full px-4 py-2.5 text-sm">
                    {perm.domains.map((d) => <option key={d} value={d}>@{d}</option>)}
                  </select>
                  <button
                    onClick={async () => {
                      setErr('');
                      try { await perm.createBox(local.trim(), pdom!); setLocal(''); }
                      catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); }
                    }}
                    className="gmail-btn-blue rounded-full px-6 py-2.5 text-sm font-medium"
                  >Создать</button>
                </div>
              ) : <div className="text-sm text-amber-700 mt-3">Достигнут лимит {MAX_PERMANENT_PER_USER} ящиков.</div>}
              {!isValidLocal(local) && local.length > 0 && <div className="text-xs text-red-600 mt-1">Имя: a-z, 0-9, точки/дефисы, 3–32 символа.</div>}
              {err && <div className="text-sm text-red-600 mt-2">{err}</div>}
            </div>
          )}

          {view === 'temp' && (
            <div className="bg-white rounded-3xl border p-5">
              {!temp.box ? (
                <button onClick={() => temp.create()} className="gmail-btn-blue rounded-full px-6 py-3 text-sm font-medium">Сгенерировать Temp-адрес</button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <code className="font-medium">{temp.box.address}</code>
                  <span className="bg-[#d3e3fd] rounded-full px-3 py-1">⏳ {temp.left}</span>
                  <button onClick={temp.extend} className="border rounded-full px-3 py-1">+15 мин</button>
                  <button onClick={temp.destroy} className="text-red-600 border rounded-full px-3 py-1">Удалить</button>
                </div>
              )}
            </div>
          )}

          {view !== 'boxes' && (
            <div className="bg-white rounded-3xl border overflow-hidden">
              <div className="flex items-center gap-2 px-4 h-12 border-b text-sm">
                <span className="font-medium">{view === 'temp' ? 'Временный инбокс' : activeBox ? activeBox.address : 'Входящие'}</span>
                <span className="flex-1" />
                {activeBox && view !== 'temp' && (
                  <button onClick={() => exportMailboxPdf(activeBox.address, perm.msgs)} className="border rounded-full px-3 py-1.5 text-xs flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span> Экспорт ящика в PDF
                  </button>
                )}
              </div>
              <div className="grid md:grid-cols-[380px_1fr] min-h-[560px]">
                <div className="border-r"><MessageList msgs={filtered} loading={false} selected={sel} onSelect={setSel} /></div>
                <MessageReader msg={activeMsg} />
              </div>
            </div>
          )}
        </main>
      </div>
      {compose && activeBox && (
        <ComposeModal
          from={activeBox.address} onClose={() => setCompose(false)}
          onSend={(p) => perm.sendMail(activeBox.id, p)}
        />
      )}
      {compose && !activeBox && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/30" onClick={() => setCompose(false)}>
          <div className="bg-white rounded-2xl p-6 text-sm" onClick={(e) => e.stopPropagation()}>
            Сначала создайте постоянный ящик во вкладке «Мои ящики».
            <button onClick={() => { setCompose(false); setView('boxes'); }} className="gmail-btn-blue rounded-full px-4 py-2 ml-3">Создать</button>
          </div>
        </div>
      )}
    </div>
  );
}
