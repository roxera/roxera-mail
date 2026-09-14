import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Icon({ n, cls }: { n: string; cls?: string }) {
  return <span className={`material-symbols-outlined text-[20px] ${cls || ''}`}>{n}</span>;
}

export function TopBar({ onCompose, onMenu, query, onQuery }: {
  onCompose: () => void; onMenu: () => void; query?: string; onQuery?: (q: string) => void;
}) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <header className="flex items-center gap-2 md:gap-3 px-3 md:px-4 h-16 bg-white border-b border-[#dadce0] sticky top-0 z-20">
      <button onClick={onMenu} className="p-2 rounded-full hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-[#1a73e8]" aria-label="menu"><Icon n="menu" /></button>
      <Link to="/" className="flex items-center gap-2 shrink-0">
        <span className="w-8 h-8 rounded-lg grid place-items-center text-white font-bold" style={{ background: '#1a73e8' }}>R</span>
        <span className="hidden sm:inline text-[22px] text-[#5f6368]">Roxera <span className="text-[#1f1f1f]">Mail</span></span>
      </Link>
      <div className="hidden md:flex flex-1 max-w-2xl mx-4 items-center gap-2 bg-[#f1f3f4] focus-within:bg-white focus-within:shadow-md focus-within:border rounded-full px-4 h-12 transition-shadow">
        <Icon n="search" cls="text-[#5f6368]" />
        <input
          value={query ?? ''} onChange={(e) => onQuery?.(e.target.value)}
          placeholder="Поиск в почте" className="bg-transparent outline-none flex-1 text-[15px]"
        />
        {query ? (
          <button onClick={() => onQuery?.('')} aria-label="clear"><Icon n="close" cls="text-[#5f6368]" /></button>
        ) : (
          <Icon n="tune" cls="text-[#5f6368]" />
        )}
      </div>
      <div className="flex-1 md:hidden" />
      <div className="hidden md:flex flex-1" />
      <button onClick={onCompose} className="gmail-btn-blue hidden sm:flex items-center gap-2 rounded-full px-5 h-11 text-sm font-medium">
        <Icon n="edit" /> Написать
      </button>
      {user ? (
        <div className="flex items-center gap-2">
          {user.photoURL
            ? <img src={user.photoURL} alt="" className="w-9 h-9 rounded-full bg-gray-200" />
            : <span className="w-9 h-9 rounded-full grid place-items-center text-white font-medium" style={{ background: '#7b1fa2' }}>{(user.email || 'R')[0]?.toUpperCase()}</span>}
          <button onClick={() => { logout().then(() => nav('/')); }} className="hidden sm:inline text-sm text-[#5f6368] hover:underline">Выйти</button>
        </div>
      ) : (
        <Link to="/login" className="text-sm font-medium text-[#1a73e8] border border-[#dadce0] rounded-full px-5 py-2 hover:bg-[#e8f0fe]">Войти</Link>
      )}
    </header>
  );
}

export function SideBar({ open, active, onNav, onCompose, tempCount, permCount }: {
  open: boolean; active: string; onNav: (k: string) => void; onCompose: () => void; tempCount: number; permCount: number;
}) {
  const items = [
    { k: 'temp', icon: 'timer', label: 'Временная почта', badge: tempCount },
    { k: 'inbox', icon: 'inbox', label: 'Входящие', badge: permCount },
    { k: 'sent', icon: 'send', label: 'Отправленные' },
    { k: 'spam', icon: 'report', label: 'Спам / Карантин' },
    { k: 'boxes', icon: 'mail', label: 'Мои ящики (до 5)' },
    { k: 'admin', icon: 'admin_panel_settings', label: 'Админ-панель' },
  ];
  return (
    <aside className={`${open ? 'w-64' : 'w-[72px]'} shrink-0 transition-all bg-[#f6f8fc] px-2 py-3 min-h-[calc(100vh-64px)]`}>
      <button
        onClick={onCompose}
        className={`flex items-center gap-3 bg-white shadow hover:shadow-md rounded-2xl h-14 mb-4 text-sm font-medium text-[#3c4043] transition-shadow ${open ? 'w-36 justify-start px-5' : 'w-14 justify-center mx-auto'}`}
      >
        <Icon n="edit" />
        {open && 'Написать'}
      </button>
      {items.map((it) => (
        <button
          key={it.k}
          onClick={() => onNav(it.k)}
          className={`w-full flex items-center gap-4 px-4 h-10 rounded-full text-[14px] mb-0.5 transition-colors ${active === it.k ? 'bg-[#d3e3fd] font-medium text-[#041e49]' : 'hover:bg-[#e8eaed] text-[#3c4043]'}`}
        >
          <Icon n={it.icon} />
          {open && <span className="flex-1 text-left truncate">{it.label}</span>}
          {open && !!it.badge && <span className="text-xs bg-white rounded-full px-2 py-0.5">{it.badge}</span>}
        </button>
      ))}
      {open && (
        <div className="mt-6 px-4 text-xs text-[#5f6368] leading-relaxed">
          Приём — Cloudflare.<br />Отправка — Resend (100/день free).<br />Temp живёт 15 мин.
        </div>
      )}
    </aside>
  );
}
