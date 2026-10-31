import type {
  AccountReviewStatus,
  ConnectionStatus,
  SocialAccount,
  SocialPlatform,
} from '@/lib/api';
import { platformLabel } from '@/lib/format';

/** Limite de contas ativas por rede, igual ao do servidor. */
export const MAX_ACCOUNTS_PER_PLATFORM = 5;

export const PLATFORMS: SocialPlatform[] = ['instagram', 'tiktok'];

/** Situação da conta na análise da equipe, numa frase. */
export function reviewLine(
  status: AccountReviewStatus,
  note: string | null | undefined,
): string {
  switch (status) {
    case 'pending':
      return 'Aguardando aprovação da equipe.';
    case 'approved':
      return 'Aprovada, somando no ranking.';
    case 'changes_requested':
      return note ? `Ajuste pedido: ${note}` : 'A equipe pediu um ajuste nesta conta.';
    case 'rejected':
      return note ? `Reprovada: ${note}` : 'Reprovada pela equipe.';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function reviewBadge(
  status: AccountReviewStatus,
): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  switch (status) {
    case 'approved':
      return { label: 'Aprovada, somando no ranking', tone: 'success' };
    case 'pending':
      return { label: 'Aguardando aprovação da equipe', tone: 'neutral' };
    case 'changes_requested':
      return { label: 'Ajuste pedido', tone: 'warning' };
    case 'rejected':
      return { label: 'Reprovada', tone: 'danger' };
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

export function handleOf(username: string | null | undefined): string | null {
  const handle = username?.replace(/^@/, '').trim();
  return handle ? `@${handle}` : null;
}

export type DutyKind =
  | 'ready'
  | 'connect'
  | 'reconnect'
  | 'permission'
  | 'incompatible'
  | 'unavailable'
  | 'verify';

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

type GateAccount = Pick<SocialAccount, 'id' | 'platform' | 'username' | 'status' | 'reviewStatus' | 'reviewNote'>;

export function activeAccounts<T extends Pick<SocialAccount, 'status'>>(accounts: T[]): T[] {
  return accounts.filter((account) => account.status !== 'disconnected');
}

/** Conta que soma no ranking: aprovada pela equipe e com a leitura funcionando. */
export function countsInRanking(account: Pick<SocialAccount, 'status' | 'reviewStatus'>): boolean {
  return account.reviewStatus === 'approved' && connectionDuty(account.status) === 'ready';
}

export type GateState<T extends GateAccount = GateAccount> =
  | { kind: 'empty' }
  | { kind: 'adjust'; accounts: T[] }
  | { kind: 'waiting'; accounts: T[]; anyApproved: boolean }
  | { kind: 'rejected'; accounts: T[] };

/** O que falta para a pessoa entrar no ranking. Nulo quando nada depende dela nem da equipe. */
export function gateState<T extends GateAccount>(accounts: T[]): GateState<T> | null {
  const active = activeAccounts(accounts);
  if (active.length === 0) return { kind: 'empty' };
  const adjust = active.filter((item) => item.reviewStatus === 'changes_requested');
  if (adjust.length > 0) return { kind: 'adjust', accounts: adjust };
  const waiting = active.filter((item) => item.reviewStatus === 'pending');
  const anyApproved = active.some((item) => item.reviewStatus === 'approved');
  if (waiting.length > 0) return { kind: 'waiting', accounts: waiting, anyApproved };
  if (!anyApproved) return { kind: 'rejected', accounts: active };
  return null;
}
