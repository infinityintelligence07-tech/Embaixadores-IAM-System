import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
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
  const { state, profile, profileError, isAdmin, refreshProfile, signOut } = useAuth();
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

  // A sessão existe, mas o perfil ainda não chegou. Sem ele não dá para decidir
  // papel nem status, então não renderizamos nada que dependa disso.
  if (!profile && !profileError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Carregando seu perfil..." />
      </div>
    );
  }

  if (profileError && !profile) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-16">
        <Alert variant="error" role="alert" title="Não foi possível continuar">
          {profileError}
        </Alert>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="secondary" onClick={() => void refreshProfile()}>
            Tentar de novo
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sair da conta
          </Button>
        </div>
      </div>
    );
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (profile?.status === 'suspended') {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-16">
        <Alert variant="warning" role="alert" title="Conta suspensa">
          Sua conta foi suspensa. Fale com a equipe do programa para entender o motivo e
          pedir a revisão.
        </Alert>
        <Button variant="secondary" onClick={() => void signOut()}>
          Sair da conta
        </Button>
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

  // Quem já foi aprovado não volta para o cadastro, mesmo que a marca de
  // onboarding não tenha sido gravada (cadastros antigos ou aprovação manual).
  if (
    !requireAdmin &&
    profile &&
    profile.status !== 'approved' &&
    !profile.onboardingCompleted &&
    location.pathname !== '/onboarding' &&
    !PENDING_ALLOWED_PATHS.includes(location.pathname)
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
