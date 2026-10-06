import { Home, Link2, Shield, Trophy, User, Video } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BrandMark } from '@/components/brand/BrandMark';
import { useAuth } from '@/contexts/AuthContext';
import { isRankingPath, useSurfaceTheme } from '@/lib/theme';
import { LegalLinks } from './LegalLinks';

const navItems = [
  { to: '/dashboard', label: 'Início', icon: Home },
  { to: '/conexoes', label: 'Conexões', icon: Link2 },
  { to: '/conteudos', label: 'Conteúdos', icon: Video },
  { to: '/rankings', label: 'Rankings', icon: Trophy },
  { to: '/perfil', label: 'Perfil', icon: User },
];

export function AppShell() {
  const { profile, isAdmin } = useAuth();
  const location = useLocation();
  const apple = !isRankingPath(location.pathname);

  useSurfaceTheme(apple ? 'apple' : 'arena');

  return (
    <div className={apple ? 'shell shell-apple' : 'shell shell-arena'}>
      <header className="shell-bar">
        <NavLink to="/dashboard" className="shell-brand">
          {apple ? (
            <span className="shell-brand-name">Embaixadores</span>
          ) : (
            <BrandMark variant="wordmark" />
          )}
        </NavLink>
        <nav className="shell-nav" aria-label="Navegação principal">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to}>
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </NavLink>
          ))}
          {isAdmin ? (
            <NavLink to="/candidaturas">
              <Shield className="size-4" aria-hidden />
              Candidaturas
            </NavLink>
          ) : null}
          {isAdmin ? (
            <NavLink to="/admin">
              <Shield className="size-4" aria-hidden />
              Administração
            </NavLink>
          ) : null}
        </nav>
        <div className="shell-user">
          <strong>{profile?.publicName ?? 'Embaixador'}</strong>
          <span>{profile?.email}</span>
        </div>
      </header>

      <main className="shell-main">
        <Outlet />
      </main>

      <footer className="shell-foot">
        <LegalLinks />
      </footer>

      <nav className="shell-tabbar" aria-label="Navegação principal">
        <ul>
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to}>
                <item.icon className="size-5" aria-hidden />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        {isAdmin ? (
          <NavLink to="/admin" className="shell-admin-link">
            <Shield className="size-4" aria-hidden />
            Administração
          </NavLink>
        ) : null}
      </nav>
    </div>
  );
}
