import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Login() {
  const { loginGoogle, loginGithub, demoMode } = useAuth();
  const [err, setErr] = useState('');
  const nav = useNavigate();

  const go = async (fn: () => Promise<void>) => {
    setErr('');
    try { await fn(); nav('/app'); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка входа'); }
  };

  return (
    <div className="min-h-full grid place-items-center bg-[#f6f8fc] p-6">
      <div className="bg-white rounded-3xl border shadow-sm w-full max-w-md p-8 animate-in">
        <div className="w-11 h-11 rounded-xl grid place-items-center text-white font-bold text-xl mx-auto" style={{ background: '#1a73e8' }}>R</div>
        <h1 className="text-2xl text-center mt-4">Вход в Roxera Mail</h1>
        <p className="text-center text-sm text-[#5f6368] mt-1">Чтобы создать до 5 постоянных ящиков</p>
        {demoMode && (
          <div className="mt-4 text-xs bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900">
            Демо-режим: Firebase ключи не заданы (.env). Вход отключён, но временная почта и демо-кабинет работают.
          </div>
        )}
        <div className="mt-6 space-y-3">
          <button disabled={demoMode} onClick={() => go(loginGoogle)} className="w-full border border-[#dadce0] rounded-full py-3 font-medium hover:bg-[#f6f8fc] disabled:opacity-50 flex items-center justify-center gap-2">
            <span className="font-bold text-[#1a73e8]">G</span> Продолжить с Google
          </button>
          <button disabled={demoMode} onClick={() => go(loginGithub)} className="w-full bg-[#1f1f1f] text-white rounded-full py-3 font-medium hover:bg-black disabled:opacity-50 flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[20px]">code</span> Продолжить с GitHub
          </button>
        </div>
        {err && <div className="text-red-600 text-sm mt-4">{err}</div>}
        <div className="text-xs text-[#5f6368] mt-6 text-center">Нажимая «Продолжить», вы соглашаетесь с правилами сервиса.<br />TempMail доступен и без входа — <a href="/temp" className="text-[#1a73e8]">открыть</a>.</div>
      </div>
    </div>
  );
}
