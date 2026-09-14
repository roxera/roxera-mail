import { useState } from 'react';
import { encryptText } from '../lib/crypto';

export function ComposeModal({ from, onClose, onSend }: {
  from: string;
  onClose: () => void;
  onSend: (p: { to: string; subject: string; text: string; encryptedPayload?: string }) => Promise<void>;
}) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [lock, setLock] = useState(false);
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { setErr('Некорректный адрес получателя'); return; }
    setBusy(true);
    try {
      let encryptedPayload: string | undefined;
      if (lock) {
        if (pwd.length < 4) { setErr('Пароль минимум 4 символа'); setBusy(false); return; }
        encryptedPayload = await encryptText(text, pwd);
      }
      await onSend({ to, subject, text: lock ? '' : text, encryptedPayload });
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка отправки'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center px-5 h-12 bg-[#f1f3f4] text-sm font-medium">
          <span className="flex-1">Новое письмо · от {from}</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-200"><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5 space-y-3">
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Кому" className="w-full border-b outline-none py-2" />
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Тема" className="w-full border-b outline-none py-2" />
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Текст письма" rows={8} className="w-full outline-none py-2 resize-y" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} /> Зашифровать паролем (AES-GCM)
          </label>
          {lock && <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Пароль шифрования" className="border rounded-lg px-3 py-2 w-full" />}
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={submit} className="gmail-btn-blue rounded-full px-6 py-2.5 text-sm font-medium disabled:opacity-50">
              {busy ? 'Отправка…' : 'Отправить via Resend'}
            </button>
            <button onClick={onClose} className="rounded-full px-6 py-2.5 text-sm hover:bg-gray-100">Отмена</button>
          </div>
          <div className="text-xs text-[#5f6368]">Free-лимит Resend: 100 писем/день на весь сервис. При превышении — очередь/429.</div>
        </div>
      </div>
    </div>
  );
}
