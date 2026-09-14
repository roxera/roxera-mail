import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, GithubAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'MISSING',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'missing.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'missing',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'missing.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID || '0',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '0:0:web:0',
};

const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();

export function isFirebaseConfigured(): boolean {
  return (import.meta.env.VITE_FIREBASE_API_KEY || '') !== '';
}
