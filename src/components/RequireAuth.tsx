import { Navigate, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useAuth } from '../context/AuthContext';

export default function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-primary" />
          <p className="text-sm text-muted">Chargement…</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  return children;
}
