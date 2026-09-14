import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Cabinet, TempPage } from './pages/Cabinet';
import { Admin } from './pages/Admin';
import type { JSX } from 'react';

function Guard({ children, admin }: { children: JSX.Element; admin?: boolean }) {
  const { user, role, loading, demoMode } = useAuth();
  if (loading) return <div className="p-10 text-sm text-[#5f6368]">Загрузка…</div>;
  if (admin && !demoMode && role !== 'admin') {
    return (
      <div className="min-h-full grid place-items-center p-6">
        <div className="bg-white border rounded-2xl p-6 text-sm">Нужна роль admin. Выдайте customClaim (см. SETUP.md) или откройте в демо-режиме.</div>
      </div>
    );
  }
  if (!admin && !demoMode && !user && window.location.pathname.startsWith('/app')) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
