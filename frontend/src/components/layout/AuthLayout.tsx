import type { ReactNode } from 'react';
import { useSurfaceTheme } from '@/lib/theme';
import { LegalLinks } from './LegalLinks';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  useSurfaceTheme('apple');

  return (
    <div className="auth-screen">
      <div className="auth-wrap">
        <div className="auth-brand">
          <img src="/brand/apple-touch-icon.png" alt="" width={56} height={56} />
          <p>Embaixadores</p>
          <p>Acorde Sua Mente</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="auth-card">{children}</div>
        <LegalLinks className="mt-6" />
      </div>
    </div>
  );
}
