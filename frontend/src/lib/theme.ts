import { useLayoutEffect } from 'react';

export type SurfaceTheme = 'apple' | 'arena';

const themeColor: Record<SurfaceTheme, string> = {
  apple: '#f2f2f7',
  arena: '#070b14',
};

export function useSurfaceTheme(theme: SurfaceTheme) {
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', themeColor[theme]);
  }, [theme]);
}

/** A área do embaixador é toda no palco escuro; só a administração usa o painel claro. */
export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}
