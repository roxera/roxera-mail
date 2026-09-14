import { useEffect, useState } from 'react';

export function toast(msg: string) {
  window.dispatchEvent(new CustomEvent<string>('roxera-toast', { detail: msg }));
}

export function ToastHost() {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  useEffect(() => {
    const h = (e: Event) => {
      const id = Date.now() + Math.random();
      setItems((v) => [...v.slice(-2), { id, msg: (e as CustomEvent<string>).detail }]);
      setTimeout(() => setItems((v) => v.filter((x) => x.id !== id)), 2600);
    };
    window.addEventListener('roxera-toast', h);
    return () => window.removeEventListener('roxera-toast', h);
  }, []);
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
      {items.map((i) => (
        <div key={i.id} className="toast-in bg-[#323232] text-white text-sm rounded-lg px-5 py-3 shadow-2xl">{i.msg}</div>
      ))}
    </div>
  );
}
