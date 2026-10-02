import type { ConnectionStatus, SocialAccount, SocialPlatform } from '@/lib/api';
import { platformLabel } from '@/lib/format';

export type DutyKind =
  | 'ready'
  | 'connect'
  | 'reconnect'
  | 'permission'
  | 'incompatible'
  | 'unavailable';

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
