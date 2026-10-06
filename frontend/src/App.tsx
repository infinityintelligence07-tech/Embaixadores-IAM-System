import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute } from '@/components/routing/ProtectedRoute';
import { AdminPage } from '@/pages/AdminPage';
import { CandidaturasPage } from '@/pages/CandidaturasPage';
import { CapturePage } from '@/pages/CapturePage';
import { CaptureSuccessPage } from '@/pages/CaptureSuccessPage';
import { AuthCallbackPage } from '@/pages/AuthCallbackPage';
import { ConnectionsPage } from '@/pages/ConnectionsPage';
import { ContentsPage } from '@/pages/ContentsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { LoginPage } from '@/pages/LoginPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { PrivacyPage } from '@/pages/PrivacyPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { RankingsPage } from '@/pages/RankingsPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { TermsPage } from '@/pages/TermsPage';

const DevPreview = import.meta.env.DEV
  ? lazy(() => import('@/pages/PreviewPage'))
  : null;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CapturePage />} />
      <Route path="/sucesso" element={<CaptureSuccessPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/cadastro" element={<RegisterPage />} />
      <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/auth/reset" element={<ResetPasswordPage />} />
      <Route path="/termos" element={<TermsPage />} />
      <Route path="/privacidade" element={<PrivacyPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/conexoes" element={<ConnectionsPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute requireApproved />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/conteudos" element={<ContentsPage />} />
          <Route path="/rankings" element={<RankingsPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute requireApproved requireAdmin />}>
        <Route element={<AppShell />}>
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/candidaturas" element={<CandidaturasPage />} />
        </Route>
      </Route>

      {DevPreview ? (
        <Route
          path="/preview"
          element={
            <Suspense fallback={null}>
              <DevPreview />
            </Suspense>
          }
        />
      ) : null}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
