import { SocialPlatform } from './types';

/**
 * Só Reels/vídeos contam para views monitoradas e rankings.
 * No Instagram, Reels chegam como media_type VIDEO; fotos (IMAGE) e carrosséis
 * (CAROUSEL_ALBUM) ficam guardados, mas fora da conta. No TikTok tudo é vídeo.
 */
export function countsTowardRanking(platform: SocialPlatform, mediaType: string | null): boolean {
  switch (platform) {
    case SocialPlatform.Instagram:
      return (mediaType ?? '').toUpperCase() === 'VIDEO';
    case SocialPlatform.TikTok:
      return true;
    default: {
      const exhaustive: never = platform;
      return exhaustive;
    }
  }
}

/** Mesma regra de countsTowardRanking, para filtrar `contents` (alias informado) no SQL. */
export function rankedMediaSql(alias: string): string {
  return `(${alias}.platform <> '${SocialPlatform.Instagram}' OR upper(${alias}.media_type) = 'VIDEO')`;
}
