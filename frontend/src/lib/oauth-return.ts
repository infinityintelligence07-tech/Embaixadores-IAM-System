import type { SocialPlatform } from './api';

const STORAGE_KEY = 'embaixadores:oauth-started';
const MAX_AGE_MS = 15 * 60 * 1000;

interface StartedOAuth {
  platform: SocialPlatform;
  at: number;
}

export const ABANDONED_OAUTH_HINT: Record<SocialPlatform, string> = {
  instagram:
    'O Instagram não te trouxe de volta. Isso acontece quando ele pede login e abre o feed no lugar da autorização. Clique em Conectar Instagram de novo: como você já entrou, ele vai direto para a tela de permitir.',
  tiktok:
    'O TikTok não te trouxe de volta. Clique em Conectar TikTok de novo: como você já entrou, ele vai direto para a tela de autorizar.',
};

export function markOAuthStarted(platform: SocialPlatform): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ platform, at: Date.now() }));
  } catch {
    // Storage indisponível (modo privado restrito): o aviso de retorno só não aparece.
  }
}

export function clearOAuthStarted(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Rede que a pessoa começou a conectar e da qual o site não recebeu o retorno. */
export function readAbandonedOAuth(): SocialPlatform | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const started = JSON.parse(raw) as StartedOAuth;
    if (Date.now() - started.at > MAX_AGE_MS) return null;
    return started.platform === 'instagram' || started.platform === 'tiktok'
      ? started.platform
      : null;
  } catch {
    return null;
  }
}
