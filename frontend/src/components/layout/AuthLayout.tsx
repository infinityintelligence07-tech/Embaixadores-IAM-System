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
    <div className="min-h-screen bg-surface px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="mb-4 text-[15px] font-semibold tracking-[-0.02em] text-text">
            Embaixadores
          </p>
          <h1 className="mt-2 font-display text-3xl text-text">{title}</h1>
          <p className="mt-2 text-sm text-text-muted">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface-card p-6 shadow-xl shadow-black/20">
          {children}
        </div>
        <LegalLinks className="mt-6" />
      </div>
    </div>
  );
}
