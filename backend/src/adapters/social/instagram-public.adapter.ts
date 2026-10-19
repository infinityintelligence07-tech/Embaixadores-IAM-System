import { readViewCount } from '../../domain/view-metrics';
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
} from '../../ports/social-metrics.port';
import { ScrapeCreatorsClient } from './scrape-creators.client';
import { handleOf } from './tiktok-public.adapter';

interface ScrapeCreatorsReel {
  id?: string;
  code?: string;
  taken_at?: number;
  url?: string;
  caption?: { text?: string } | null;
  play_count?: number | string;
  ig_play_count?: number | string;
  display_uri?: string;
  image_versions2?: { candidates?: { url?: string }[] };
  user?: { pk?: number | string; id?: string; username?: string };
}

/**
 * Instagram por dados públicos (ScrapeCreators), lido pelo @ sem login na Meta.
 * Só traz Reels, e só os publicados no próprio perfil: colaborações em perfis
 * de outras pessoas ficam de fora, como na API oficial.
 */
export class InstagramPublicAdapter implements SocialMetricsProvider, PublicProfileLookup {
  readonly platform = 'instagram' as const;
  readonly transport = 'public_api' as const;

  private readonly client: ScrapeCreatorsClient;

  constructor(apiKey: string | null) {
    this.client = new ScrapeCreatorsClient(apiKey);
  }

  get enabled(): boolean {
    return this.client.enabled;
  }

  async lookupProfile(handle: string): Promise<PublicSocialProfile> {
    const clean = handle.replace(/^@+/, '').trim();
    const data = await this.client.get('/v1/instagram/profile', { handle: clean });
    const user = data?.data?.user;
    if (!user?.id || !user?.username) {
      throw new SocialProfileNotFoundError();
    }
    const username = String(user.username);
    return {
      platformUserId: String(user.id),
      username,
      displayName: String(user.full_name || username),
      avatarUrl: user.profile_pic_url_hd || user.profile_pic_url || null,
      profileUrl: `https://www.instagram.com/${username}/`,
      bio: String(user.biography ?? ''),
      isPrivate: Boolean(user.is_private),
      aliasUserIds: user.fbid ? [String(user.fbid)] : [],
    };
  }

  async getAuthorizedProfile(creds: SocialCredentials): Promise<AuthorizedProfile> {
    const profile = await this.lookupProfile(handleOf(creds));
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
    const params: Record<string, string> = { trim: 'true' };
    if (creds.platformUserId) params.user_id = creds.platformUserId;
    else params.handle = handleOf(creds);
    if (cursor) params.max_id = cursor;

    const data = await this.client.get('/v1/instagram/user/reels', params);
    const reels: ScrapeCreatorsReel[] = Array.isArray(data?.items) ? data.items : [];
    const ownerId = creds.platformUserId ?? null;
    const ownerName = creds.handle?.replace(/^@+/, '').toLowerCase() ?? null;

    const items: SocialContentItem[] = reels
      .filter((reel) => reel.code && isOwnReel(reel, ownerId, ownerName))
      .map((reel) => {
        const views = readViewCount(reel.ig_play_count ?? reel.play_count);
        return {
          platformContentId: String(reel.code),
          title: reel.caption?.text?.trim() || null,
          thumbnailUrl: reel.display_uri ?? reel.image_versions2?.candidates?.[0]?.url ?? null,
          permalink: reel.url ?? `https://www.instagram.com/reel/${reel.code}/`,
          publishedAt: reel.taken_at ? new Date(reel.taken_at * 1000) : null,
          mediaType: 'VIDEO',
          views,
          viewsAvailable: views !== null,
        };
      });

    // A API não informa se há mais páginas: segue enquanto vier conteúdo e um max_id novo.
    const next = typeof data?.max_id === 'string' && data.max_id ? data.max_id : null;
    const nextCursor = reels.length > 0 && next && next !== cursor ? next : null;
    return { items, nextCursor };
  }

  async getAccountMetrics(_creds: SocialCredentials): Promise<AccountMetricsResult> {
    return {
      officialViews: null,
      availability: 'unavailable',
      definitionLabel: 'Views da conta indisponíveis na leitura pelo @',
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
}

function isOwnReel(
  reel: ScrapeCreatorsReel,
  ownerId: string | null,
  ownerName: string | null,
): boolean {
  const id = reel.user?.pk ?? reel.user?.id;
  if (ownerId && id != null) return String(id) === ownerId;
  const name = reel.user?.username?.toLowerCase();
  if (ownerName && name) return name === ownerName;
  return false;
}
