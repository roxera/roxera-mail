import { useCallback, useEffect, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, limit, onSnapshot,
  orderBy, query, updateDoc, where,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { MAX_PERMANENT_PER_USER, PERMANENT_DOMAINS, TEMP_DOMAINS, TEMP_TTL_MIN, expiryFromNow, isValidLocal, makeTempAddress } from '../lib/config';
import { makeToken, sha256Hex } from '../lib/crypto';
import type { MailMessage, PermanentMailbox, TempMailbox } from '../lib/types';
import { api } from '../lib/api';

// ---------- TEMP ----------
const LS_TEMP = 'roxera.temp.v2'; // единый объект { box, token } — переживает перезагрузку
const LS_TEMP_OLD = 'roxera.temp';
const LS_TOKEN_OLD = 'roxera.temp.token';

function loadStored(): { box: TempMailbox; token: string } | null {
  try {
    const raw = localStorage.getItem(LS_TEMP);
    if (raw) {
      const o = JSON.parse(raw) as { box?: TempMailbox; token?: string };
      if (o?.box?.id && o?.token) return { box: o.box, token: o.token };
    }
    // миграция со старого формата (два отдельных ключа)
    const b = localStorage.getItem(LS_TEMP_OLD);
    const t = localStorage.getItem(LS_TOKEN_OLD);
    if (b && t) {
      const box = JSON.parse(b) as TempMailbox;
      if (box?.id) return { box, token: t };
    }
  } catch { /* ignore */ }
  return null;
}

export function useTemp() {
  const [stored, setStored] = useState<{ box: TempMailbox; token: string } | null>(loadStored);
  const [msgs, setMsgs] = useState<MailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [left, setLeft] = useState('');
  const [gone, setGone] = useState(false); // сервер вернул 404 — адрес истёк или удалён
  const box = stored?.box || null;

  const save = (b: TempMailbox | null, token?: string) => {
    if (b) {
      const t = token ?? stored?.token ?? '';
      setStored({ box: b, token: t });
      localStorage.setItem(LS_TEMP, JSON.stringify({ box: b, token: t }));
    } else {
      setStored(null);
      localStorage.removeItem(LS_TEMP);
    }
    try {
      localStorage.removeItem(LS_TEMP_OLD);
      localStorage.removeItem(LS_TOKEN_OLD);
    } catch { /* ignore */ }
  };
  const curToken = () => stored?.token || '';

  const create = useCallback(async (domain?: string) => {
    setLoading(true);
    setGone(false);
    try {
      try {
        const r = await api.createTemp(domain);
        const b: TempMailbox = { id: r.id, address: r.address, domain: r.address.split('@')[1]!, expiresAt: r.expiresAt, createdAt: new Date().toISOString() };
          save(b, r.token);
          return;
      } catch { /* fallback ниже (нет API) */ }
      const address = makeTempAddress(domain);
      const token = makeToken();
      const b: TempMailbox = {
        id: await sha256Hex(address).then((h) => h.slice(0, 16)),
        address, domain: address.split('@')[1]!,
        expiresAt: expiryFromNow(TEMP_TTL_MIN), createdAt: new Date().toISOString(),
      };
      save(b, token);
      setMsgs([]);
    } finally { setLoading(false); }
  }, []);

  const extend = useCallback(async () => {
    if (!box) return;
    const token = curToken();
    try { const r = await api.extendTemp(box.id, token); save({ ...box, expiresAt: r.expiresAt }); return; }
    catch { /* fallback */ }
    const cur = new Date(box.expiresAt).getTime();
    const max = Date.now() + 24 * 3600_000;
    const next = Math.min(cur + 15 * 60_000, max);
    save({ ...box, expiresAt: new Date(next).toISOString() });
  }, [box]);

  const destroy = useCallback(async () => {
    if (box) {
      const token = curToken();
      try { await api.deleteTemp(box.id, token); } catch { /* best effort */ }
    }
    save(null);
    setMsgs([]);
  }, [box]);

  // polling инбокса через Worker API (KV-хранилище, работает без Firebase)
  useEffect(() => {
    if (!box) return;
    let dead = false;
    const pull = async () => {
      const token = curToken();
      try {
        const r = await api.inboxTemp(box.id, token);
        if (dead) return;
        setGone(false);
        setMsgs(r.messages);
        if (r.expiresAt && r.expiresAt !== box.expiresAt) save({ ...box, expiresAt: r.expiresAt });
      } catch (e) {
        if (dead) return;
        if (e instanceof Error && e.message.startsWith('API 404')) {
          // адреса больше нет на сервере (истёк/удалён) — чистим и показываем экран «истёк»
          setGone(true);
          save(null);
          setMsgs([]);
          return;
        }
        if (dead) return;
        // нет API — демо-письмо чтобы UI не был пустым
        setMsgs((prev) => prev.length ? prev : [{
          id: 'demo1', mailboxId: box.id, ownerType: 'temp', direction: 'in',
          from: 'welcome@roxera.example', to: box.address, subject: 'Добро пожаловать в Roxera Mail',
          text: 'Нет связи с API. Проверьте VITE_API_BASE и воркер mail-api.',
          createdAt: new Date().toISOString(), spamScore: 0, spamVerdict: 'inbox',
        }]);
      }
    };
    pull();
    const t = setInterval(pull, 4000);
    return () => { dead = true; clearInterval(t); };
  }, [box?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // таймер
  useEffect(() => {
    if (!box) return;
    const t = setInterval(() => {
      const ms = new Date(box.expiresAt).getTime() - Date.now();
      if (ms <= 0) { destroy(); return; }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setLeft(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(t);
  }, [box, destroy]);

  return { box, msgs, loading, left, gone, create, extend, destroy, domains: [...TEMP_DOMAINS] };
}

// ---------- PERMANENT ----------
export function usePermanent() {
  const { user, demoMode } = useAuth();
  const [boxes, setBoxes] = useState<PermanentMailbox[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<MailMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || demoMode) {
      if (demoMode) {
        const demo: PermanentMailbox[] = [{
          id: 'demo-box', userId: 'demo', address: `ivan@${PERMANENT_DOMAINS[0]}`, local: 'ivan', domain: PERMANENT_DOMAINS[0]!, createdAt: new Date().toISOString(),
        }];
        setBoxes(demo);
        setActiveId('demo-box');
        setMsgs([{
          id: 'demo2', mailboxId: 'demo-box', ownerType: 'user', direction: 'in',
          from: 'team@resend.example', to: demo[0]!.address, subject: 'Resend подключён (демо)',
          text: 'Настройте Resend API key в Worker, чтобы отправлять настоящие письма.', createdAt: new Date().toISOString(),
        }]);
      }
      return;
    }
    const q = query(collection(db, 'mailboxes'), where('userId', '==', user.uid), orderBy('createdAt', 'asc'), limit(5));
    return onSnapshot(q, (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PermanentMailbox, 'id'>) })) as PermanentMailbox[];
      setBoxes(list);
      if (!activeId && list[0]) setActiveId(list[0].id);
    });
  }, [user, demoMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeId || !user || demoMode) return;
    const q = query(collection(db, 'messages'), where('mailboxId', '==', activeId), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(q, (s) => setMsgs(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MailMessage, 'id'>) })) as MailMessage[]));
  }, [activeId, user, demoMode]);

  const createBox = useCallback(async (local: string, domain: string) => {
    if (boxes.length >= MAX_PERMANENT_PER_USER) throw new Error(`Лимит: максимум ${MAX_PERMANENT_PER_USER} ящиков`);
    if (!isValidLocal(local)) throw new Error('Некорректное имя (a-z, 0-9, . _ -)');
    const address = `${local}@${domain}`;
    if (!user) throw new Error('Войдите через Google/GitHub');
    setLoading(true);
    try {
      const ref = await addDoc(collection(db, 'mailboxes'), { userId: user.uid, address, local, domain, createdAt: new Date().toISOString() });
      setActiveId(ref.id);
    } finally { setLoading(false); }
  }, [boxes.length, user]);

  const removeBox = useCallback(async (id: string) => {
    await deleteDoc(doc(db, 'mailboxes', id));
    const rest = boxes.filter((b) => b.id !== id);
    setActiveId(rest[0]?.id || null);
  }, [boxes]);

  const sendMail = useCallback(async (mailboxId: string, p: { to: string; subject: string; text: string; encryptedPayload?: string }) => {
    const box = boxes.find((b) => b.id === mailboxId);
    if (!box) throw new Error('Ящик не найден');
    // 1) пробуем Worker+Resend
    try {
      await api.send({ mailboxId, ...p });
      return;
    } catch { /* fallback: пишем в outbox напрямую (Worker подхватит/админ увидит) */ }
    if (!isFirebaseConfigured()) throw new Error('Нет API (VITE_API_BASE) — настройте Worker для отправки');
    await addDoc(collection(db, 'messages'), {
      mailboxId, ownerType: 'user', ownerRef: box.userId, direction: 'out',
      from: box.address, to: p.to, subject: p.subject, text: p.text || '',
      encryptedPayload: p.encryptedPayload || null, encrypted: !!p.encryptedPayload,
      createdAt: new Date().toISOString(),
    });
    await addDoc(collection(db, 'auditLogs'), { ts: new Date().toISOString(), actor: box.userId, action: 'send', target: box.address, meta: { to: p.to } });
  }, [boxes]);

  const touchRead = useCallback(async (_id: string) => {
    // пометка прочитанным — Phase 2 (поле read). Сейчас no-op чтобы не жечь квоты.
    try { await updateDoc(doc(db, 'messages', _id), {}); } catch { /* noop */ }
  }, []);

  return { boxes, activeId, setActiveId, msgs, loading, createBox, removeBox, sendMail, touchRead, domains: [...PERMANENT_DOMAINS] };
}
