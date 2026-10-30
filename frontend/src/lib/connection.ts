import type {
  AccountReviewStatus,
  ConnectionStatus,
  SocialAccount,
  SocialPlatform,
} from '@/lib/api';
import { platformLabel } from '@/lib/format';

/** Situação da conta na análise da equipe, para quem já conectou a rede. */
export function reviewLine(
  status: AccountReviewStatus | undefined,
  note: string | null | undefined,
): string | null {
  switch (status) {
    case undefined:
    case 'approved':
      return null;
    case 'pending':
      return 'Em análise pela equipe. Quando for aprovada, entra no ranking.';
    case 'changes_requested':
      return note ? `A equipe pediu um ajuste: ${note}` : 'A equipe pediu um ajuste nesta conta.';
    case 'rejected':
      return note
        ? `Não aprovada para a competição: ${note}`
        : 'Não aprovada para a competição.';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function reviewBadge(
  status: AccountReviewStatus,
): { label: string; tone: 'success' | 'warning' | 'danger' } {
  switch (status) {
    case 'approved':
      return { label: 'Aprovada', tone: 'success' };
    case 'pending':
      return { label: 'Em análise', tone: 'warning' };
    case 'changes_requested':
      return { label: 'Ajuste pedido', tone: 'warning' };
    case 'rejected':
      return { label: 'Não aprovada', tone: 'danger' };
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function statusBadge(
  status: ConnectionStatus,
): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  switch (status) {
    case 'connected':
      return { label: 'Conectado', tone: 'success' };
    case 'syncing':
      return { label: 'Em coleta', tone: 'neutral' };
    case 'pending_verification':
      return { label: 'Falta confirmar o @', tone: 'warning' };
    case 'authorization_expired':
      return { label: 'Conexão expirou', tone: 'danger' };
    case 'insufficient_permission':
      return { label: 'Falta permissão', tone: 'danger' };
    case 'incompatible_account':
      return { label: 'Conta não profissional', tone: 'danger' };
    case 'integration_unavailable':
      return { label: 'Indisponível no momento', tone: 'danger' };
    case 'disconnected':
      return { label: 'Desconectado', tone: 'neutral' };
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

const POST_PATHS = new Set(['p', 'reel', 'reels', 'stories', 'tv', 'explore', 'video']);

/**
 * Aceita "@perfil", "perfil" ou o link do perfil colado do app.
 * Link de publicação não tem o @ e volta vazio.
 */
export function normalizeHandle(input: string | null | undefined): string {
  let value = (input ?? '').trim();
  const fromUrl = value.match(/(?:instagram\.com|tiktok\.com)\/(@?[^/?#\s]+)/i);
  if (fromUrl) {
    const segment = fromUrl[1];
    if (!segment.startsWith('@') && POST_PATHS.has(segment.toLowerCase())) return '';
    value = segment;
  }
  return value.replace(/^@+/, '').trim();
}

const HANDLE_MAX: Record<SocialPlatform, number> = { instagram: 30, tiktok: 24 };

/** Confere o @ já normalizado. Devolve a mensagem de erro, ou null quando está certo. */
export function handleError(platform: SocialPlatform, handle: string): string | null {
  if (!/^[A-Za-z0-9._]+$/.test(handle)) return 'Use só letras, números, ponto e sublinhado.';
  const max = HANDLE_MAX[platform];
  if (handle.length > max) return `O @ do ${platformLabel(platform)} tem no máximo ${max} caracteres.`;
  return null;
}

/** Com as redes conectadas, avisa o que ainda falta na análise da equipe. */
export function reviewHeadline(
  accounts: Pick<SocialAccount, 'platform' | 'status' | 'reviewStatus'>[],
): { title: string; detail: string } | null {
  const connected = accounts.filter((item) => connectionDuty(item.status) === 'ready');
  if (connected.some((item) => item.reviewStatus === 'changes_requested')) {
    return {
      title: 'A equipe pediu um ajuste',
      detail: 'Veja o recado na rede abaixo. Depois de ajustar, toque em "Já ajustei".',
    };
  }
  if (connected.some((item) => item.reviewStatus === 'pending')) {
    return {
      title: 'Sua conta está em análise',
      detail:
        'A equipe confere o perfil antes de liberar o ranking. Você recebe um aviso aqui quando for aprovado.',
    };
  }
  return null;
}

export type DutyKind =
  | 'ready'
  | 'connect'
  | 'reconnect'
  | 'permission'
  | 'incompatible'
  | 'unavailable'
  | 'verify';

const PLATFORMS: SocialPlatform[] = ['instagram', 'tiktok'];

export function connectionDuty(status: ConnectionStatus | null | undefined): DutyKind {
  switch (status) {
    case 'connected':
    case 'syncing':
      return 'ready';
    case 'authorization_expired':
      return 'reconnect';
    case 'insufficient_permission':
      return 'permission';
    case 'incompatible_account':
      return 'incompatible';
    case 'integration_unavailable':
      return 'unavailable';
    case 'pending_verification':
      return 'verify';
    default:
      return 'connect';
  }
}

export function dutyLine(platform: SocialPlatform, duty: DutyKind): string {
  const name = platformLabel(platform);
  switch (duty) {
    case 'ready':
      return 'Conectado';
    case 'reconnect':
      return `A conexão com o ${name} expirou. Conecte de novo para continuar no ranking.`;
    case 'permission':
      return `Falta permissão para ler as views do ${name}. Conecte de novo e aceite o acesso.`;
    case 'incompatible':
      return 'A conta do Instagram precisa ser profissional (criador ou empresa) para as views entrarem.';
    case 'unavailable':
      return `A conexão com o ${name} está fora do ar no momento. Tente mais tarde ou avise a equipe.`;
    case 'connect':
      return `Digite o seu @ do ${name} para entrar neste ranking.`;
    case 'verify':
      return `Falta confirmar o seu @ do ${name}.`;
    default: {
      const exhaustive: never = duty;
      return exhaustive;
    }
  }
}

export function actionLabel(platform: SocialPlatform, duty: DutyKind): string | null {
  const name = platformLabel(platform);
  switch (duty) {
    case 'ready':
    case 'unavailable':
      return null;
    case 'reconnect':
    case 'permission':
      return `Conectar ${name} de novo`;
    case 'incompatible':
      return 'Conectar outra conta';
    case 'connect':
      return `Conectar ${name}`;
    case 'verify':
      return 'Confirmar @';
    default: {
      const exhaustive: never = duty;
      return exhaustive;
    }
  }
}

export function gateHeadline(
  accounts: Pick<SocialAccount, 'platform' | 'status'>[],
): { title: string; detail: string } | null {
  const pending = PLATFORMS.filter((platform) => {
    const account = accounts.find((item) => item.platform === platform);
    return connectionDuty(account?.status) !== 'ready';
  });

  if (pending.length === 0) return null;

  if (pending.length === 2) {
    return {
      title: 'Conecte o Instagram ou o TikTok',
      detail: 'Escolha a rede onde você posta e digite o seu @. Não pedimos senha.',
    };
  }

  const name = platformLabel(pending[0]);
  return {
    title: `Quer disputar também no ${name}?`,
    detail: `Digite o seu @ do ${name}. Cada rede tem o seu ranking.`,
  };
}
