import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from '@/components/brand/BrandMark';
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
  useSurfaceTheme('arena');

  return (
    <div className="auth-screen">
      <main className="auth-wrap">
        <div className="auth-brand">
          <Link to="/" className="auth-brand-link">
            <BrandMark variant="wordmark" />
          </Link>
          <h1>{title}</h1>
          <p className="auth-subtitle">{subtitle}</p>
        </div>
        <div className="auth-card">{children}</div>
        <LegalLinks className="auth-legal" />
      </main>
    </div>
  );
}
