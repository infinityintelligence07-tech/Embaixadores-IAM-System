import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  requireApproved?: boolean;
  requireAdmin?: boolean;
}

const PENDING_ALLOWED_PATHS = ['/onboarding', '/conexoes', '/perfil'];

export function ProtectedRoute({
  requireApproved = false,
  requireAdmin = false,
}: ProtectedRouteProps) {
  const { state, profile, profileError, isAdmin } = useAuth();
  const location = useLocation();

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Verificando sessão..." />
      </div>
    );
  }

  if (state === 'unauthenticated' || state === 'expired') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (profileError && !profile) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Alert variant="error" role="alert" title="Não foi possível continuar">
          {profileError}
        </Alert>
      </div>
    );
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (profile?.status === 'suspended') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Alert variant="warning" role="alert" title="Conta suspensa">
          Sua conta foi suspensa. Entre em contato com a equipe para mais informações.
        </Alert>
      </div>
    );
  }

  if (
    profile?.status === 'approved' &&
    location.pathname === '/onboarding'
  ) {
    return <Navigate to="/dashboard" replace />;
  }

  if (
    requireApproved &&
    profile &&
    profile.status === 'pending' &&
    !PENDING_ALLOWED_PATHS.includes(location.pathname)
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  if (
    profile &&
    !profile.onboardingCompleted &&
    location.pathname !== '/onboarding' &&
    !PENDING_ALLOWED_PATHS.includes(location.pathname)
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
