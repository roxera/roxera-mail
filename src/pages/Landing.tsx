import { Link } from 'react-router-dom';

export function Landing() {
  return (
    <div className="min-h-full bg-[#f6f8fc]">
      <header className="flex items-center gap-2 px-6 h-16 bg-white border-b">
        <span className="w-9 h-9 rounded-xl grid place-items-center text-white font-bold text-lg" style={{ background: '#1a73e8' }}>R</span>
        <span className="text-xl text-[#5f6368]">Roxera <b className="text-black">Mail</b></span>
        <span className="flex-1" />
        <Link to="/temp" className="text-sm text-[#1a73e8] font-medium px-4 py-2 hover:bg-[#e8f0fe] rounded-full">Временная почта</Link>
        <Link to="/login" className="text-sm font-medium text-white rounded-full px-5 py-2.5" style={{ background: '#1a73e8' }}>Войти</Link>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-14 grid md:grid-cols-2 gap-10 items-center">
        <div className="animate-in">
          <h1 className="text-4xl md:text-5xl font-medium leading-tight">Почта в стиле Gmail.<br />Бесплатно. Быстро.</h1>
          <p className="text-[#5f6368] mt-4 text-lg">Временный ящик за 1 клик (живёт 15 минут) + до 5 постоянных ящиков с отправкой. Приём — Cloudflare, отправка — Resend.</p>
          <div className="flex gap-3 mt-8">
            <Link to="/temp" className="rounded-full px-6 py-3 text-white font-medium" style={{ background: '#1a73e8' }}>Создать TempMail</Link>
            <Link to="/app" className="rounded-full px-6 py-3 font-medium border border-[#dadce0] hover:bg-white">Личный кабинет</Link>
          </div>
          <ul className="mt-8 space-y-2 text-sm text-[#3c4043]">
            <li>✓ Google + GitHub вход через Firebase</li>
            <li>✓ Шифрование паролем (AES-GCM) + экспорт в PDF</li>
            <li>✓ Админка: аналитика, анти-спам, логи in/out</li>
          </ul>
        </div>
        <div className="bg-white rounded-3xl shadow-xl border p-0 overflow-hidden">
          <div className="bg-[#f1f3f4] px-5 h-11 flex items-center gap-2 text-sm text-[#5f6368]">
            <span className="material-symbols-outlined">inbox</span> Входящие — k7x2pq9m4z@roxera-mail.ajoure.cfd
            <span className="ml-auto bg-[#d3e3fd] rounded-full px-3 py-1 text-xs">14:59</span>
          </div>
          {[['GitHub', 'Ваш код подтверждения: 482-910', '12:01'], ['Resend', 'Домен подтверждён', '11:47'], ['Roxera', 'Добро пожаловать! 5 ящиков ждут', '11:20']].map(([f, s, t]) => (
            <div key={s} className="px-5 py-4 border-b flex gap-3 items-center hover:bg-[#f6f8fc]">
              <span className="w-9 h-9 rounded-full bg-[#e8f0fe] grid place-items-center font-medium text-[#0b57d0]">{f[0]}</span>
              <span className="flex-1 min-w-0"><span className="block font-medium truncate">{f}</span><span className="block text-sm text-[#5f6368] truncate">{s}</span></span>
              <span className="text-xs text-[#5f6368]">{t}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
