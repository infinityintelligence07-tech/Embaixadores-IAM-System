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
      return { label: 'Aprovada no ranking', tone: 'success' };
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
      return `A autorização do ${name} expirou. Entre de novo para continuar no ranking.`;
    case 'permission':
      return `Falta permissão para ler as views do ${name}. Conecte de novo e aceite o acesso.`;
    case 'incompatible':
      return 'A conta do Instagram precisa ser profissional para as views entrarem.';
    case 'unavailable':
      return `A conexão com o ${name} ainda não está liberada. Avise a equipe.`;
    case 'connect':
      return `Conecte o ${name} com a sua conta para entrar neste ranking.`;
    case 'verify':
      return `Falta confirmar que o perfil é seu. Coloque o código na bio do ${name}.`;
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
      return `Entrar de novo no ${name}`;
    case 'permission':
      return `Conectar ${name} de novo`;
    case 'incompatible':
      return 'Conectar outra conta';
    case 'connect':
      return `Conectar ${name}`;
    case 'verify':
      return 'Confirmar pela bio';
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
      title: 'Para entrar na competição',
      detail:
        'Conecte o Instagram e o TikTok com a sua conta. Sem essa autorização, suas views não entram no ranking.',
    };
  }

  const name = platformLabel(pending[0]);
  return {
    title: `Falta conectar o ${name}`,
    detail: `Sem o ${name}, você fica de fora do ranking dessa rede. A autorização é feita na sua conta.`,
  };
}
