import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, githubProvider, googleProvider, isFirebaseConfigured } from '../lib/firebase';

interface AuthState {
  user: User | null;
  role: string | null;
  loading: boolean;
  loginGoogle: () => Promise<void>;
  loginGithub: () => Promise<void>;
  logout: () => Promise<void>;
  demoMode: boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const demoMode = !isFirebaseConfigured();

  useEffect(() => {
    if (demoMode) { setLoading(false); return; }
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const t = await u.getIdTokenResult();
        setRole((t.claims.role as string) || 'user');
      } else setRole(null);
      setLoading(false);
    });
  }, [demoMode]);

  const loginGoogle = async () => { await signInWithPopup(auth, googleProvider); };
  const loginGithub = async () => { await signInWithPopup(auth, githubProvider); };
  const logout = async () => { await signOut(auth); };

  return <Ctx.Provider value={{ user, role, loading, loginGoogle, loginGithub, logout, demoMode }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside provider');
  return v;
}
