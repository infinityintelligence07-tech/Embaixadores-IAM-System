import { Logger } from '@nestjs/common';
import { readTikTokViewCount } from '../../domain/view-metrics';
import {
  AccountMetricsResult,
  AuthorizedProfile,
  ContentMetricsResult,
  PublicProfileLookup,
  PublicSocialProfile,
  SocialContentItem,
  SocialContentPage,
  SocialCredentials,
  SocialMetricsProvider,
  SocialProfileNotFoundError,
  SocialRateLimitError,
} from '../../ports/social-metrics.port';

const BASE_URL = 'https://api.scrapecreators.com';
const REQUEST_TIMEOUT_MS = 60_000;

interface ScrapeCreatorsVideo {
  aweme_id?: string;
  desc?: string;
  create_time?: number;
  url?: string;
  statistics?: { play_count?: number | string };
  video?: { cover?: { url_list?: string[] }; origin_cover?: { url_list?: string[] } };
}

/**
 * TikTok por dados públicos (ScrapeCreators), lido pelo @ sem login na rede.
 * Cada chamada custa um crédito, por isso a coleta destas contas é diária.
 * A posse da conta é confirmada à parte, por um código na bio.
 */
export class TikTokPublicAdapter implements SocialMetricsProvider, PublicProfileLookup {
  readonly platform = 'tiktok' as const;
  readonly transport = 'public_api' as const;

  private readonly logger = new Logger(TikTokPublicAdapter.name);

  constructor(private readonly apiKey: string | null) {}

  get enabled(): boolean {
    return Boolean(this.apiKey);
  }

  async lookupProfile(handle: string): Promise<PublicSocialProfile> {
    const clean = handle.replace(/^@+/, '').trim();
    const data = await this.request('/v1/tiktok/profile', { handle: clean });
    const user = data?.user;
    if (data?.account_deactivated || !user?.id || !user?.uniqueId) {
      throw new SocialProfileNotFoundError();
    }
    const username = String(user.uniqueId);
    return {
      platformUserId: String(user.id),
      username,
      displayName: String(user.nickname || username),
      avatarUrl: user.avatarMedium || user.avatarThumb || null,
      profileUrl: `https://www.tiktok.com/@${username}`,
      bio: String(user.signature ?? ''),
      isPrivate: Boolean(user.privateAccount || user.secret),
    };
  }

  async getAuthorizedProfile(creds: SocialCredentials): Promise<AuthorizedProfile> {
    const profile = await this.lookupProfile(this.handleOf(creds));
    return {
      platformUserId: profile.platformUserId,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      profileUrl: profile.profileUrl,
    };
  }

  async listContents(
    creds: SocialCredentials,
    cursor?: string | null,
  ): Promise<SocialContentPage> {
    const params: Record<string, string> = { handle: this.handleOf(creds), trim: 'true' };
    if (creds.platformUserId) params.user_id = creds.platformUserId;
    if (cursor) params.max_cursor = cursor;

    const data = await this.request('/v3/tiktok/profile/videos', params);
    const videos: ScrapeCreatorsVideo[] = Array.isArray(data?.aweme_list) ? data.aweme_list : [];

    const items: SocialContentItem[] = videos
      .filter((video) => video.aweme_id)
      .map((video) => {
        const views = readTikTokViewCount(video.statistics?.play_count);
        return {
          platformContentId: String(video.aweme_id),
          title: video.desc?.trim() || null,
          thumbnailUrl:
            video.video?.cover?.url_list?.[0] ?? video.video?.origin_cover?.url_list?.[0] ?? null,
          permalink: video.url ?? null,
          publishedAt: video.create_time ? new Date(video.create_time * 1000) : null,
          mediaType: 'video',
          views,
          viewsAvailable: views !== null,
        };
      });

    // Um cursor ausente ou repetido faria o loop pedir a mesma página para sempre.
    const hasMore = Boolean(data?.has_more);
    const next = data?.max_cursor != null ? String(data.max_cursor) : null;
    const nextCursor = hasMore && next && next !== '0' && next !== cursor ? next : null;
    if (hasMore && nextCursor === null) {
      this.logger.error('ScrapeCreators reported has_more without a usable max_cursor');
      throw new Error('TikTok paging cursor missing');
    }

    return { items, nextCursor };
  }

  async getAccountMetrics(_creds: SocialCredentials): Promise<AccountMetricsResult> {
    return {
      officialViews: null,
      availability: 'unavailable',
      definitionLabel: 'Views da conta indisponíveis no TikTok',
    };
  }

  async getContentMetrics(
    _creds: SocialCredentials,
    _platformContentId: string,
  ): Promise<ContentMetricsResult> {
    return { views: null, viewsAvailable: false };
  }

  async disconnect(_creds: SocialCredentials): Promise<void> {
    // Não há autorização a revogar: a leitura é pública.
  }

  private handleOf(creds: SocialCredentials): string {
    const handle = creds.handle?.replace(/^@+/, '').trim();
    if (!handle) throw new Error('TikTok handle missing for public transport');
    return handle;
  }

  private async request(path: string, params: Record<string, string>): Promise<any> {
    if (!this.apiKey) throw new Error('TikTok public data not configured');

    const url = new URL(path, BASE_URL);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    const response = await fetch(url, {
      headers: { 'x-api-key': this.apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => null);

    if (response.status === 429) {
      throw new SocialRateLimitError('A leitura do TikTok está limitada. A coleta continua em breve.', 429);
    }
    if (response.status === 404) {
      throw new SocialProfileNotFoundError();
    }
    if (!response.ok || data?.success === false) {
      // 401 e 402 aqui são da nossa chave (inválida ou sem créditos), não da conta do embaixador.
      this.logger.error(
        `ScrapeCreators ${path} failed status=${response.status} message=${String(data?.message ?? '').slice(0, 160)}`,
      );
      throw new Error(`TikTok public data request failed (${response.status})`);
    }
    return data;
  }
}
