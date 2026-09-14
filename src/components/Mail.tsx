import { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import type { MailMessage } from '../lib/types';
import { decryptText } from '../lib/crypto';
import { exportMessagePdf } from '../lib/pdf';
import { toast } from './Toast';

const AVATAR_COLORS = ['#0b57d0', '#7b1fa2', '#00796b', '#c2185b', '#e8710a', '#455a64'];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

function Avatar({ name }: { name: string }) {
  const ch = (name.trim()[0] || '?').toUpperCase();
  return (
    <span className="w-10 h-10 rounded-full grid place-items-center text-white font-medium shrink-0" style={{ background: avatarColor(name) }}>
      {ch}
    </span>
  );
}

export function MessageList({ msgs, loading, selected, onSelect }: {
  msgs: MailMessage[]; loading: boolean; selected: string | null; onSelect: (id: string) => void;
}) {
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const toggleStar = (id: string) => setStarred((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  if (loading) {
    return <div className="p-3 space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-[68px]" />)}</div>;
  }
  if (!msgs.length) {
    return (
      <div className="p-10 text-center text-[#5f6368]">
        <div className="w-20 h-20 mx-auto rounded-full bg-[#f1f3f4] grid place-items-center mb-4">
          <span className="material-symbols-outlined text-4xl">mark_email_unread</span>
        </div>
        <div className="font-medium text-[#3c4043]">Писем пока нет</div>
        <div className="text-sm mt-1">Новые письма появятся здесь автоматически</div>
      </div>
    );
  }
  return (
    <div className="divide-y divide-[#eef1f5]">
      {msgs.map((m) => (
        <div
          key={m.id}
          onClick={() => onSelect(m.id)}
          className={`flex gap-3 items-center px-4 py-3 cursor-pointer transition-colors animate-in ${selected === m.id ? 'bg-[#e8f0fe]' : 'bg-white hover:bg-[#f6f8fc] hover:shadow-[inset_0_0_0_999px_rgba(0,0,0,0.015)]'}`}
        >
          <Avatar name={m.direction === 'out' ? m.to : m.from} />
          <span className="flex-1 min-w-0">
            <span className="flex gap-2 items-baseline">
              <span className="font-medium text-[14px] truncate text-[#1f1f1f]">{m.direction === 'out' ? m.to : m.from}</span>
              <span className="text-[11px] text-[#5f6368] shrink-0 ml-auto">{new Date(m.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </span>
            <span className="block truncate text-[13px] text-[#3c4043]">
              {m.subject || '(без темы)'}
              <span className="text-[#5f6368] font-normal"> — {m.encrypted ? '🔒 зашифровано' : (m.text || '').slice(0, 80)}</span>
            </span>
          </span>
          {m.spamVerdict === 'quarantine' && <span className="text-[11px] bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 shrink-0">спам</span>}
          <button
            aria-label="star"
            onClick={(e) => { e.stopPropagation(); toggleStar(m.id); }}
            className="shrink-0 p-1 rounded-full hover:bg-black/5"
          >
            <span className={`material-symbols-outlined text-[20px] ${starred.has(m.id) ? 'text-amber-500' : 'text-[#bdc1c6]'}`}
              style={starred.has(m.id) ? { fontVariationSettings: "'FILL' 1, 'wght' 400" } : undefined}>
              star
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}

export function MessageReader({ msg, onBack }: { msg: MailMessage | null; onBack?: () => void }) {
  const [pwd, setPwd] = useState('');
  const [plain, setPlain] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const html = useMemo(() => (msg?.html ? DOMPurify.sanitize(msg.html) : ''), [msg]);

  useEffect(() => { setPwd(''); setPlain(null); setErr(''); }, [msg?.id]);

  if (!msg) {
    return (
      <div className="p-10 text-[#5f6368] text-sm hidden md:block">
        <div className="max-w-xs">Выберите письмо из списка слева, чтобы прочитать его здесь.</div>
      </div>
    );
  }

  return (
    <div className="p-5 md:p-6 animate-in">
      {onBack && (
        <button onClick={onBack} className="md:hidden flex items-center gap-1 text-sm text-[#1a73e8] mb-3">
          <span className="material-symbols-outlined">arrow_back</span> Назад к списку
        </button>
      )}
      <div className="flex items-start gap-3">
        <h2 className="text-[20px] font-medium flex-1 leading-snug">{msg.subject || '(без темы)'}</h2>
        <button onClick={() => { exportMessagePdf(msg); toast('PDF сохранён'); }} className="text-sm border border-[#dadce0] rounded-full px-4 py-2 hover:shadow-sm flex items-center gap-2 shrink-0">
          <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span><span className="hidden sm:inline">PDF</span>
        </button>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <Avatar name={msg.from} />
        <div className="text-sm min-w-0">
          <div className="font-medium truncate">{msg.from}</div>
          <div className="text-xs text-[#5f6368]">кому: {msg.to} · {new Date(msg.createdAt).toLocaleString('ru-RU')}</div>
        </div>
      </div>
      {msg.spamScore !== undefined && msg.spamScore > 0 && (
        <div className="text-xs mt-3 inline-block bg-amber-50 border border-amber-200 text-amber-800 rounded-full px-3 py-1">
          Анти-спам: score {msg.spamScore} · {msg.spamVerdict}
        </div>
      )}
      <hr className="my-4 border-[#eef1f5]" />
      {msg.encrypted ? (
        plain ? (
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{plain}</div>
        ) : (
          <div className="bg-[#fef7e0] border border-amber-200 rounded-2xl p-4">
            <div className="font-medium mb-2">🔒 Письмо зашифровано паролем</div>
            <div className="flex gap-2">
              <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Пароль" className="border border-[#dadce0] rounded-lg px-3 py-2 flex-1 outline-none focus:border-[#1a73e8]" />
              <button
                className="gmail-btn-blue rounded-lg px-4 text-sm"
                onClick={async () => {
                  setErr('');
                  try { setPlain(await decryptText(msg.encryptedPayload!, pwd)); }
                  catch { setErr('Неверный пароль'); }
                }}
              >Расшифровать</button>
            </div>
            {err && <div className="text-red-600 text-sm mt-2">{err}</div>}
          </div>
        )
      ) : html ? (
        <div className="mail-body text-[15px] leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.text || '(пусто)'}</div>
      )}
      {!!msg.attachments?.length && (
        <div className="mt-6">
          <div className="font-medium text-sm mb-2">Вложения ({msg.attachments.length})</div>
          {msg.attachments.map((a, i) => (
            <a key={i} href={a.url || '#'} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-[#0b57d0] hover:underline py-1">
              <span className="material-symbols-outlined">attach_file</span>{a.name} ({Math.round(a.size / 1024)} KB)
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
