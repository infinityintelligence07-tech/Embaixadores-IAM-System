import type { RankingCategory, SocialPlatform } from '@/lib/api';

export function formatViews(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

export function firstName(
  fullName?: string | null,
  publicName?: string | null,
): string {
  const source = fullName?.trim() || publicName?.trim() || 'Embaixador';
  const token = source.split(/\s+/)[0] || 'Embaixador';
  return token.charAt(0).toLocaleUpperCase('pt-BR') + token.slice(1);
}

export function ordinal(position: number): string {
  return `${position}ª`;
}

export function categoryPhrase(category: RankingCategory): string {
  switch (category) {
    case 'total_views':
      return 'views totais';
    case 'best_video':
      return 'vídeo com mais views';
    default: {
      const exhaustive: never = category;
      return exhaustive;
    }
  }
}

export function platformLabel(platform: SocialPlatform): string {
  switch (platform) {
    case 'instagram':
      return 'Instagram';
    case 'tiktok':
      return 'TikTok';
    default: {
      const exhaustive: never = platform;
      return exhaustive;
    }
  }
}

export function profileUrl(
  platform: SocialPlatform,
  username: string | null | undefined,
): string | null {
  if (!username) return null;
  const handle = username.replace(/^@/, '').trim();
  if (!handle) return null;
  if (platform === 'instagram') return `https://instagram.com/${handle}`;
  return `https://www.tiktok.com/@${handle}`;
}

export function humanizeReason(reason: string | null | undefined): string {
  switch (reason) {
    case null:
    case undefined:
    case '':
      return 'Sua posição ainda não está disponível.';
    case 'Ranking ainda não publicado':
      return 'O ranking desta rede ainda não foi publicado.';
    case 'Social account not connected':
    case 'Account not connected':
    case 'Conta não conectada':
      return 'Para entrar na competição, conecte esta rede com a sua conta.';
    case 'Membership not approved':
    case 'Cadastro ainda não aprovado':
    case 'Aguardando aprovação da equipe.':
      return 'Sua participação ainda não foi aprovada.';
    case 'Not eligible for ranking':
    case 'Not eligible':
    case 'Fora do ranking no momento':
      return 'Você ainda não entrou neste ranking.';
    default:
      return reason;
  }
}
