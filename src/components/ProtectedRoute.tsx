import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="centered">
        <p className="muted">Checking admin session…</p>
      </div>
    );
  }

  if (status !== 'authorized') {
    return <Navigate to="/login" replace />;
  }

  return children;
}
