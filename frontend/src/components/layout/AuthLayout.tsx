import type { ReactNode } from 'react';
import { BrandMark } from '@/components/brand/BrandMark';
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
  return (
    <div className="min-h-screen bg-surface px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <BrandMark variant="wordmark" />
          </div>
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
