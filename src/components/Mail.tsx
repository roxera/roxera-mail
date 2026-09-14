import { useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import type { MailMessage } from '../lib/types';
import { decryptText } from '../lib/crypto';
import { exportMessagePdf } from '../lib/pdf';

export function MessageList({ msgs, loading, selected, onSelect }: {
  msgs: MailMessage[]; loading: boolean; selected: string | null; onSelect: (id: string) => void;
}) {
  if (loading) {
    return <div className="p-3 space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-16" />)}</div>;
  }
  if (!msgs.length) {
    return (
      <div className="p-10 text-center text-[#5f6368]">
        <div className="material-symbols-outlined text-5xl mb-3">mark_email_unread</div>
        <div className="font-medium">Писем пока нет</div>
        <div className="text-sm">Новые письма появятся здесь автоматически</div>
      </div>
    );
  }
  return (
    <div className="divide-y divide-[#eef1f5]">
      {msgs.map((m) => (
        <button
          key={m.id}
          onClick={() => onSelect(m.id)}
          className={`w-full text-left px-4 py-3 flex gap-3 items-center hover:shadow animate-in ${selected === m.id ? 'bg-[#e8f0fe]' : 'bg-white'}`}
        >
          <span className="material-symbols-outlined text-[#5f6368]">{m.direction === 'out' ? 'send' : m.spamVerdict === 'quarantine' ? 'warning' : 'mail'}</span>
          <span className="flex-1 min-w-0">
            <span className="flex gap-2 items-baseline">
              <span className="font-medium truncate">{m.direction === 'out' ? m.to : m.from}</span>
              <span className="text-xs text-[#5f6368] shrink-0">{new Date(m.createdAt).toLocaleString('ru-RU')}</span>
            </span>
            <span className="block truncate text-sm">{m.subject || '(без темы)'}</span>
            <span className="block truncate text-xs text-[#5f6368]">{m.encrypted ? '🔒 зашифровано' : (m.text || '').slice(0, 120)}</span>
          </span>
          {m.spamVerdict === 'quarantine' && <span className="text-[11px] bg-amber-100 text-amber-800 rounded-full px-2 py-1">карантин</span>}
        </button>
      ))}
    </div>
  );
}

export function MessageReader({ msg }: { msg: MailMessage | null }) {
  const [pwd, setPwd] = useState('');
  const [plain, setPlain] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const html = useMemo(() => (msg?.html ? DOMPurify.sanitize(msg.html) : ''), [msg]);

  if (!msg) return <div className="p-10 text-[#5f6368] text-sm">Выберите письмо слева</div>;

  return (
    <div className="p-6 animate-in">
      <div className="flex items-start gap-3">
        <h2 className="text-xl font-medium flex-1">{msg.subject || '(без темы)'}</h2>
        <button onClick={() => exportMessagePdf(msg)} className="text-sm border rounded-full px-4 py-2 hover:bg-gray-50 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span> PDF
        </button>
      </div>
      <div className="text-sm text-[#5f6368] mt-1">От: {msg.from} → {msg.to} · {new Date(msg.createdAt).toLocaleString('ru-RU')}</div>
      {msg.spamScore !== undefined && (
        <div className="text-xs mt-2 text-[#5f6368]">Анти-спам: score {msg.spamScore} · {msg.spamVerdict}</div>
      )}
      <hr className="my-4" />
      {msg.encrypted ? (
        plain ? (
          <div className="whitespace-pre-wrap text-[15px]">{plain}</div>
        ) : (
          <div className="bg-[#fef7e0] border border-amber-200 rounded-xl p-4">
            <div className="font-medium mb-2">🔒 Письмо зашифровано паролем</div>
            <div className="flex gap-2">
              <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Пароль" className="border rounded-lg px-3 py-2 flex-1" />
              <button
                className="gmail-btn-blue rounded-lg px-4"
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
        <div className="mail-body text-[15px]" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="whitespace-pre-wrap text-[15px]">{msg.text || '(пусто)'}</div>
      )}
      {!!msg.attachments?.length && (
        <div className="mt-6">
          <div className="font-medium text-sm mb-2">Вложения ({msg.attachments.length})</div>
          {msg.attachments.map((a, i) => (
            <a key={i} href={a.url || '#'} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-[#0b57d0] hover:underline">
              <span className="material-symbols-outlined">attach_file</span>{a.name} ({Math.round(a.size / 1024)} KB)
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
