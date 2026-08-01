import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { isAdminUid } from '../lib/adminCheck';

type AuthStatus = 'loading' | 'signedOut' | 'unauthorized' | 'authorized';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOutAdmin: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const NOT_AUTHORIZED =
  'Not authorized. Your account is not on the ops allowlist (admins/{uid}).';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  /** Survives the signOut → onAuthStateChanged(null) round-trip after reject. */
  const rejectMsgRef = useRef<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (next) => {
      if (!next) {
        setUser(null);
        if (rejectMsgRef.current) {
          setStatus('unauthorized');
          setError(rejectMsgRef.current);
          rejectMsgRef.current = null;
        } else {
          setStatus('signedOut');
        }
        return;
      }

      setUser(next);
      setError(null);
      try {
        const allowed = await isAdminUid(next.uid);
        if (!allowed) {
          rejectMsgRef.current = NOT_AUTHORIZED;
          await signOut(auth);
          return;
        }
        setStatus('authorized');
      } catch (err) {
        rejectMsgRef.current =
          err instanceof Error
            ? err.message
            : 'Failed to verify admin allowlist.';
        await signOut(auth);
      }
    });
    return unsub;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      error,
      clearError: () => {
        rejectMsgRef.current = null;
        setError(null);
        if (status === 'unauthorized') setStatus('signedOut');
      },
      signIn: async (email, password) => {
        rejectMsgRef.current = null;
        setError(null);
        setStatus('loading');
        try {
          await signInWithEmailAndPassword(auth, email.trim(), password);
        } catch (err) {
          setStatus('signedOut');
          const code =
            typeof err === 'object' && err !== null && 'code' in err
              ? String((err as { code?: string }).code)
              : '';
          if (
            code === 'auth/invalid-credential' ||
            code === 'auth/wrong-password' ||
            code === 'auth/user-not-found'
          ) {
            setError('Invalid email or password.');
          } else if (code === 'auth/too-many-requests') {
            setError('Too many attempts. Wait a moment and try again.');
          } else {
            setError(
              err instanceof Error ? err.message : 'Sign-in failed.',
            );
          }
        }
      },
      signOutAdmin: async () => {
        rejectMsgRef.current = null;
        await signOut(auth);
      },
    }),
    [status, user, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
