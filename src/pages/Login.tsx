import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { status, error, signIn, clearError } = useAuth();
  const [email, setEmail] = useState('admin@wedding2day.local');
  const [password, setPassword] = useState('admin-pass-123');
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authorized') {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    setSubmitting(true);
    try {
      await signIn(email, password);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={(e) => void onSubmit(e)}>
        <div className="brand brand-login">
          <span className="brand-mark">W2D</span>
          <div>
            <h1>Ops sign-in</h1>
            <p className="muted">Email/password — allowlisted admins only</p>
          </div>
        </div>

        {(error || status === 'unauthorized') && (
          <div className="alert danger" role="alert">
            {error ?? 'Not authorized.'}
          </div>
        )}

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <button className="btn primary" type="submit" disabled={submitting || status === 'loading'}>
          {submitting || status === 'loading' ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="muted tiny">
          No self-serve signup. Create ops accounts via Firebase Console / emulator
          seed, then add <code>admins/{'{uid}'}</code>.
        </p>
      </form>
    </div>
  );
}
