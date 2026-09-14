import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Cabinet, TempPage } from './pages/Cabinet';
import { Admin } from './pages/Admin';
import { ToastHost } from './components/Toast';
import type { JSX } from 'react';

function Guard({ children, admin }: { children: JSX.Element; admin?: boolean }) {
  const { user, loading, demoMode } = useAuth();
  if (loading) return <div className="p-10 text-sm text-[#5f6368]">Загрузка…</div>;
  // Решения по доступу в /admin принимает сам компонент (claim/роль через API).
  if (!admin && !demoMode && !user && window.location.pathname.startsWith('/app')) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ToastHost />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/temp" element={<TempPage />} />
          <Route path="/app" element={<Guard><Cabinet /></Guard>} />
          <Route path="/admin" element={<Guard admin><Admin /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
