import { SocialPlatform } from './types';

/**
 * O ranking mede a divulgação do Marcos: só conta vídeo cuja legenda cita #MarcosFiel,
 * @marcosfiel, "Marcos Fiel" ou #AcordeSuaMente. A equipe ainda pode retirar um vídeo
 * que fuja do tema mesmo citando.
 */
export const MARCOS_PATTERN = /marcos[\s_.]*fiel|acorde[\s_.]*sua[\s_.]*mente/i;
const MARCOS_PATTERN_SQL = 'marcos[[:space:]_.]*fiel|acorde[[:space:]_.]*sua[[:space:]_.]*mente';

export interface RankedMediaInput {
  mediaType: string | null;
  title: string | null;
  permalink: string | null;
}

/**
 * Só Reels e vídeos contam. No Instagram, Reels chegam como media_type VIDEO; fotos (IMAGE)
 * e carrosséis (CAROUSEL_ALBUM) ficam guardados, mas fora da conta. No TikTok, os posts de
 * fotos chegam como vídeo e só se distinguem pelo endereço /photo/.
 */
export function isVideoPost(platform: SocialPlatform, content: RankedMediaInput): boolean {
  switch (platform) {
    case SocialPlatform.Instagram:
      return (content.mediaType ?? '').toUpperCase() === 'VIDEO';
    case SocialPlatform.TikTok:
      return !(content.permalink ?? '').includes('/photo/');
    default: {
      const exhaustive: never = platform;
      return exhaustive;
    }
  }
}

export function citesMarcos(title: string | null): boolean {
  return MARCOS_PATTERN.test(title ?? '');
}

export function countsTowardRanking(platform: SocialPlatform, content: RankedMediaInput): boolean {
  return isVideoPost(platform, content) && citesMarcos(content.title);
}

/** Mesma regra de countsTowardRanking, para filtrar `contents` (alias informado) no SQL. */
export function rankedMediaSql(alias: string): string {
  return `((${alias}.platform <> '${SocialPlatform.Instagram}' OR upper(${alias}.media_type) = 'VIDEO')
    AND coalesce(${alias}.permalink, '') NOT LIKE '%/photo/%'
    AND coalesce(${alias}.title, '') ~* '${MARCOS_PATTERN_SQL}')`;
}
