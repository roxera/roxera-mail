import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export function Landing() {
  const [live, setLive] = useState<{ tempCreated: number; mailsIn: number } | null>(null);
  useEffect(() => {
    api.stats().then((s) => setLive({ tempCreated: s.tempCreated, mailsIn: s.mailsIn })).catch(() => {});
  }, []);

  return (
    <div className="min-h-full bg-[#f6f8fc]">
      <header className="flex items-center gap-2 px-4 md:px-6 h-16 bg-white border-b border-[#dadce0] sticky top-0 z-10">
        <span className="w-9 h-9 rounded-xl grid place-items-center text-white font-bold text-lg" style={{ background: '#1a73e8' }}>R</span>
        <span className="text-xl text-[#5f6368]">Roxera <b className="text-black">Mail</b></span>
        <span className="flex-1" />
        <Link to="/admin" className="hidden sm:inline text-sm text-[#5f6368] px-4 py-2 hover:bg-gray-100 rounded-full">Админка</Link>
        <Link to="/temp" className="text-sm text-[#1a73e8] font-medium px-4 py-2 hover:bg-[#e8f0fe] rounded-full">Временная почта</Link>
        <Link to="/login" className="text-sm font-medium text-white rounded-full px-5 py-2.5" style={{ background: '#1a73e8' }}>Войти</Link>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16 grid md:grid-cols-2 gap-10 items-center">
        <div className="animate-in">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0b57d0] bg-[#e8f0fe] rounded-full px-3 py-1.5 mb-4">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Сервис запущен{live ? ` · ящиков создано: ${live.tempCreated}, писем: ${live.mailsIn}` : ''}
          </div>
          <h1 className="text-4xl md:text-[52px] font-medium leading-[1.1] tracking-tight">Почта в стиле Gmail.<br />Бесплатно. Быстро.</h1>
          <p className="text-[#5f6368] mt-4 text-lg leading-relaxed">Временный ящик за 1 клик (живёт 15 минут) + до 5 постоянных ящиков с отправкой. Приём — Cloudflare, отправка — Resend.</p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Link to="/temp" className="rounded-full px-7 py-3.5 text-white font-medium shadow hover:shadow-lg transition-shadow" style={{ background: '#1a73e8' }}>Создать TempMail</Link>
            <Link to="/app" className="rounded-full px-7 py-3.5 font-medium border border-[#dadce0] bg-white hover:shadow-sm transition-shadow">Личный кабинет</Link>
          </div>
          <ul className="mt-8 space-y-2.5 text-sm text-[#3c4043]">
            {['Google + GitHub вход через Firebase', 'Шифрование паролем (AES-GCM) + экспорт в PDF', 'Админка: живая аналитика, анти-спам, логи in/out'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="material-symbols-outlined text-green-600 text-[20px]">check_circle</span>{t}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white rounded-3xl shadow-xl border border-[#dadce0] overflow-hidden animate-in">
          <div className="bg-[#f1f3f4] px-5 h-12 flex items-center gap-2 text-sm text-[#5f6368]">
            <span className="material-symbols-outlined">inbox</span>
            <span className="truncate">Входящие — k7x2pq9m4z@roxera-mail.ajoure.cfd</span>
          </div>
          {[['GitHub', 'Ваш код подтверждения: 482-910', '12:01', '#24292f'], ['Resend', 'Домен подтверждён', '11:47', '#0b57d0'], ['Roxera', 'Добро пожаловать! 5 ящиков ждут', '11:20', '#7b1fa2']].map(([f, s, t, c]) => (
            <div key={s} className="px-5 py-4 border-b border-[#eef1f5] last:border-0 flex gap-3 items-center hover:bg-[#f6f8fc] transition-colors">
              <span className="w-10 h-10 rounded-full grid place-items-center font-medium text-white shrink-0" style={{ background: c }}>{f[0]}</span>
              <span className="flex-1 min-w-0"><span className="block font-medium text-[14px] truncate">{f}</span><span className="block text-[13px] text-[#5f6368] truncate">{s}</span></span>
              <span className="text-xs text-[#5f6368] shrink-0">{t}</span>
            </div>
          ))}
        </div>
      </main>

      <section className="max-w-5xl mx-auto px-4 md:px-6 pb-14 grid sm:grid-cols-3 gap-3">
        {[['bolt', '15 минут и готово', 'Анонимный ящик без регистрации. Продли, пересоздай или удали в один клик.'], ['lock', 'Шифрование', 'Парольный шифр AES-GCM: содержимое знаешь только ты.'], ['monitoring', 'Полный контроль', 'Админка с живой статистикой, анти-спамом и логами соединений.']].map(([icon, t, d]) => (
          <div key={t} className="bg-white border border-[#dadce0] rounded-2xl p-5 hover:shadow-md transition-shadow">
            <span className="w-11 h-11 rounded-2xl bg-[#e8f0fe] grid place-items-center"><span className="material-symbols-outlined text-[#0b57d0]">{icon}</span></span>
            <div className="font-medium mt-3">{t}</div>
            <div className="text-sm text-[#5f6368] mt-1 leading-relaxed">{d}</div>
          </div>
        ))}
      </section>

      <footer className="border-t border-[#dadce0] bg-white">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-5 flex flex-wrap items-center gap-3 text-sm text-[#5f6368]">
          <span>Roxera Mail · бесплатно навсегда</span>
          <span className="flex-1" />
          <Link to="/temp" className="hover:text-black">Временная почта</Link>
          <Link to="/admin" className="hover:text-black">Админка</Link>
          <a href="https://github.com/roxera/roxera-mail" target="_blank" rel="noreferrer" className="hover:text-black">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
