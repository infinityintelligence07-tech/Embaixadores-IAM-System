import clsx from 'clsx';
import { Home, Link2, Shield, Trophy, User, Video } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
  { to: '/dashboard', label: 'Início', icon: Home },
  { to: '/conexoes', label: 'Conexões', icon: Link2 },
  { to: '/conteudos', label: 'Conteúdos', icon: Video },
  { to: '/rankings', label: 'Rankings', icon: Trophy },
  { to: '/perfil', label: 'Perfil', icon: User },
];

export function AppShell() {
  const { profile, isAdmin } = useAuth();

  return (
    <div className="min-h-screen bg-surface pb-24 md:pb-8">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-brand-gold">
              Embaixadores
            </p>
            <h1 className="font-display text-lg text-text">Acorde Sua Mente</h1>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            {navItems.map((item) => (
              <DesktopNavLink key={item.to} {...item} />
            ))}
            {isAdmin ? (
              <DesktopNavLink to="/admin" label="Admin" icon={Shield} />
            ) : null}
          </div>
          <div className="hidden text-right text-sm md:block">
            <p className="font-medium text-text">
              {profile?.publicName ?? 'Embaixador'}
            </p>
            <p className="text-text-muted">{profile?.email}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>

      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-elevated/95 backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5">
          {navItems.map((item) => (
            <li key={item.to}>
              <MobileNavLink {...item} />
            </li>
          ))}
        </ul>
        {isAdmin ? (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              clsx(
                'flex items-center justify-center gap-2 border-t border-border px-4 py-2 text-xs',
                isActive ? 'text-brand-gold' : 'text-text-muted',
              )
            }
          >
            <Shield className="size-4" aria-hidden />
            Administração
          </NavLink>
        ) : null}
      </nav>
    </div>
  );
}

function DesktopNavLink({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: typeof Home;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
          isActive
            ? 'bg-brand-violet/20 text-violet-100'
            : 'text-text-muted hover:bg-surface-card hover:text-text',
        )
      }
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </NavLink>
  );
}

function MobileNavLink({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: typeof Home;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex flex-col items-center gap-1 px-2 py-3 text-[11px]',
          isActive ? 'text-brand-gold' : 'text-text-muted',
        )
      }
    >
      <Icon className="size-5" aria-hidden />
      <span>{label}</span>
    </NavLink>
  );
}
