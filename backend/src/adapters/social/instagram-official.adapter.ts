import { Injectable, Logger } from '@nestjs/common';
import { readInstagramViews } from '../../domain/view-metrics';
import {
  SocialMetricsProvider,
  SocialCredentials,
  AuthorizedProfile,
  SocialContentPage,
  AccountMetricsResult,
  ContentMetricsResult,
  SocialAuthError,
  SocialRateLimitError,
} from '../../ports/social-metrics.port';

interface GraphErrorInfo {
  status: number;
  code: number | null;
  subcode: number | null;
  type: string | null;
  message: string;
}

const MEDIA_FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
const MEDIA_PAGE_SIZE = 100;
const INSIGHTS_CONCURRENCY = 5;
const GRAPH_AUTH_CODES = new Set([190]);
const GRAPH_OAUTH_CODES = new Set([102, 190]);
const GRAPH_RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

/** Runs `fn` over `items` with at most `limit` promises in flight. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await fn(items[current], current);
    }
  };

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/**
 * Instagram Official API adapter (Graph API).
 * 
 * OAuth flow:
 * 1. Redirect to https://www.instagram.com/oauth/authorize with scopes:
 *    instagram_business_basic,instagram_business_manage_insights
 * 2. Exchange code at https://api.instagram.com/oauth/access_token
 * 3. Get long-lived token at https://graph.instagram.com/access_token
 * 
 * IMPORTANT: Requires app review from Meta to access insights in production.
 * Without review, only test users can connect.
 */
@Injectable()
export class InstagramOfficialAdapter implements SocialMetricsProvider {
  readonly platform = 'instagram' as const;
  readonly transport = 'official_api' as const;
  
  private readonly logger = new Logger(InstagramOfficialAdapter.name);
  private readonly baseUrl = 'https://graph.instagram.com/v22.0';
  
  async getAuthorizedProfile(creds: SocialCredentials): Promise<AuthorizedProfile> {
    const profile = await this.fetchMe(creds.accessToken);

    return {
      platformUserId: profile.id,
      username: profile.username || '',
      displayName: profile.name || profile.username || 'Instagram',
      avatarUrl: profile.avatarUrl,
      profileUrl: profile.username ? `https://instagram.com/${profile.username}` : null,
    };
  }
  
  async listContents(
    creds: SocialCredentials,
    cursor?: string | null,
  ): Promise<SocialContentPage> {
    // Legacy checkpoints stored the full `paging.next` URL (which embeds the
    // access token). Accept it for one more run so in-flight jobs finish;
    // new cursors are only the opaque `after` value.
    const url =
      cursor && cursor.startsWith('http')
        ? cursor
        : this.buildMediaUrl(creds.accessToken, cursor ?? null);

    const response = await fetch(url);
    const data = await response.json().catch(() => null);

    if (!response.ok || data?.error) {
      const info = this.parseGraphError(data, response.status);
      this.logGraphError('list media', info);
      throw this.mapGraphError(info, 'Failed to list Instagram content');
    }

    const media: any[] = Array.isArray(data?.data) ? data.data : [];

    // Once the API throttles us, stop asking for insights on the remaining
    // media of this page instead of hammering it with more calls.
    let rateLimited = false;

    const items = await mapWithConcurrency(media, INSIGHTS_CONCURRENCY, async (item: any) => {
      let views: number | null = null;
      let viewsAvailable = false;

      if (!rateLimited) {
        try {
          views = await this.fetchMediaViews(creds.accessToken, item.id);
          viewsAvailable = views !== null;
        } catch (error) {
          if (error instanceof SocialAuthError) throw error;
          if (error instanceof SocialRateLimitError) {
            rateLimited = true;
            this.logger.warn(
              `Instagram rate limit while fetching insights (code=${error.code}); skipping the rest of this page`,
            );
          } else {
            this.logger.warn(`Failed to fetch insights for media ${item.id}: ${error}`);
          }
        }
      }

      return {
        platformContentId: item.id,
        title: item.caption || null,
        thumbnailUrl: item.thumbnail_url || item.media_url || null,
        permalink: item.permalink || null,
        publishedAt: item.timestamp ? new Date(item.timestamp) : null,
        mediaType: item.media_type || null,
        views,
        viewsAvailable,
      };
    });

    // Only advance when Graph says there is a next page; the `after` cursor
    // is also present on the last page and would cause an empty extra fetch.
    const nextCursor: string | null =
      media.length > 0 && data.paging?.next
        ? data.paging?.cursors?.after ?? null
        : null;

    return { items, nextCursor };
  }

  private buildMediaUrl(accessToken: string, after: string | null): string {
    const url = new URL(`${this.baseUrl}/me/media`);
    url.searchParams.set('fields', MEDIA_FIELDS);
    url.searchParams.set('limit', String(MEDIA_PAGE_SIZE));
    if (after) url.searchParams.set('after', after);
    url.searchParams.set('access_token', accessToken);
    return url.toString();
  }

  private parseGraphError(data: any, status: number): GraphErrorInfo {
    const error = data && typeof data === 'object' ? data.error : null;
    const code = Number(error?.code);
    const subcode = Number(error?.error_subcode);
    return {
      status,
      code: Number.isFinite(code) ? code : null,
      subcode: Number.isFinite(subcode) ? subcode : null,
      type: typeof error?.type === 'string' ? error.type : null,
      message: typeof error?.message === 'string' ? error.message : '',
    };
  }

  private isGraphAuthError(info: GraphErrorInfo): boolean {
    if (info.code !== null && GRAPH_AUTH_CODES.has(info.code)) return true;
    return info.type === 'OAuthException' && info.code !== null && GRAPH_OAUTH_CODES.has(info.code);
  }

  private isGraphRateLimit(info: GraphErrorInfo): boolean {
    return info.code !== null && GRAPH_RATE_LIMIT_CODES.has(info.code);
  }

  /** Logs status/code/subcode only. Never logs the URL or the token. */
  private logGraphError(context: string, info: GraphErrorInfo, level: 'warn' | 'error' = 'error'): void {
    const line = `Instagram ${context} failed status=${info.status} code=${info.code ?? '-'} subcode=${info.subcode ?? '-'} type=${info.type ?? '-'} ${info.message.slice(0, 180)}`;
    if (level === 'warn') this.logger.warn(line);
    else this.logger.error(line);
  }

  private mapGraphError(info: GraphErrorInfo, fallback: string): Error {
    if (this.isGraphAuthError(info)) {
      return new SocialAuthError(undefined, info.code);
    }
    if (this.isGraphRateLimit(info)) {
      return new SocialRateLimitError(undefined, info.code);
    }
    return new Error(fallback);
  }
  
  async getAccountMetrics(creds: SocialCredentials): Promise<AccountMetricsResult> {
    try {
      const insightsUrl = `${this.baseUrl}/me/insights?metric=views&period=days_28&metric_type=total_value&access_token=${encodeURIComponent(creds.accessToken)}`;
      const insightsResponse = await fetch(insightsUrl);
      
      if (insightsResponse.ok) {
        const insightsData = await insightsResponse.json();
        const views = readInstagramViews(insightsData);
        if (views !== null) {
          return {
            officialViews: views,
            availability: 'available',
            periodLabel: 'days_28',
            definitionLabel: 'Views da conta nos últimos 28 dias',
          };
        }
      }
      
      return {
        officialViews: null,
        availability: 'unavailable',
        periodLabel: 'days_28',
        definitionLabel: 'Views da conta indisponíveis',
      };
    } catch (error) {
      this.logger.warn('Failed to get Instagram account metrics:', error);
      return {
        officialViews: null,
        availability: 'unavailable',
      };
    }
  }
  
  async getContentMetrics(
    creds: SocialCredentials,
    platformContentId: string,
  ): Promise<ContentMetricsResult> {
    try {
      const views = await this.fetchMediaViews(creds.accessToken, platformContentId);
      return { views, viewsAvailable: views !== null };
    } catch (error) {
      if (error instanceof SocialAuthError) throw error;
      this.logger.warn(`Failed to get content metrics for ${platformContentId}: ${error}`);
      return { views: null, viewsAvailable: false };
    }
  }
  
  private async fetchMe(accessToken: string): Promise<{
    id: string;
    username: string | null;
    name: string | null;
    avatarUrl: string | null;
  }> {
    const primary = await this.requestMe(accessToken, 'user_id,username', true);
    if (!primary) {
      throw new Error('Failed to get Instagram profile');
    }

    const extra = await this.requestMe(accessToken, 'name,profile_picture_url', false);
    return {
      id: primary.id,
      username: primary.username,
      name: extra?.name ?? null,
      avatarUrl: extra?.avatarUrl ?? null,
    };
  }

  private async requestMe(
    accessToken: string,
    fields: string,
    required: boolean,
  ): Promise<{
    id: string;
    username: string | null;
    name: string | null;
    avatarUrl: string | null;
  } | null> {
    const needsId = fields.includes('user_id');
    let lastDetail = 'sem resposta';

    for (const version of ['v25.0', 'v22.0']) {
      const url = new URL(`https://graph.instagram.com/${version}/me`);
      url.searchParams.set('fields', fields);
      url.searchParams.set('access_token', accessToken);

      const response = await fetch(url);
      const data = await response.json().catch(() => null);
      if (response.ok && data && !data.error) {
        const id = String(data.user_id || data.id || '');
        if (needsId && !id) {
          lastDetail = 'perfil sem identificador';
          continue;
        }
        return {
          id,
          username: data.username ? String(data.username) : null,
          name: data.name ? String(data.name) : null,
          avatarUrl: data.profile_picture_url ? String(data.profile_picture_url) : null,
        };
      }

      const graphMessage = typeof data?.error?.message === 'string' ? data.error.message : '';
      const graphCode = data?.error?.code ?? '';
      lastDetail = graphMessage || `HTTP ${response.status}`;
      const line = `Instagram profile ${version} fields=${fields} status=${response.status} code=${graphCode} ${graphMessage.slice(0, 180)}`;
      if (required) this.logger.error(line);
      else this.logger.warn(line);
    }

    if (needsId && /unsupported request - method type: get/i.test(lastDetail)) {
      throw new Error('instagram_review_required');
    }

    if (needsId && /professional|business account|creator account|not eligible|personal account/i.test(lastDetail)) {
      throw new Error('instagram_not_professional');
    }

    return null;
  }

  async refreshCredentials(creds: SocialCredentials): Promise<SocialCredentials> {
    const url = new URL('https://graph.instagram.com/refresh_access_token');
    url.searchParams.set('grant_type', 'ig_refresh_token');
    url.searchParams.set('access_token', creds.accessToken);

    const response = await fetch(url);
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.error || !data?.access_token) {
      const info = this.parseGraphError(data, response.status);
      this.logGraphError('token refresh', info);
      throw this.mapGraphError(info, 'Failed to refresh Instagram credentials');
    }

    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 5_184_000) * 1000),
      scopes: creds.scopes,
    };
  }

  /**
   * Single insights call per media. Media insights reject `period`, so there
   * is no lifetime fallback. Auth and rate limit errors are thrown; anything
   * else resolves to null so one bad media does not fail the whole page.
   */
  private async fetchMediaViews(accessToken: string, mediaId: string): Promise<number | null> {
    const url = new URL(`${this.baseUrl}/${mediaId}/insights`);
    url.searchParams.set('metric', 'views');
    url.searchParams.set('access_token', accessToken);

    const response = await fetch(url);
    const data = await response.json().catch(() => null);

    if (!response.ok || data?.error) {
      const info = this.parseGraphError(data, response.status);
      if (this.isGraphAuthError(info) || this.isGraphRateLimit(info)) {
        this.logGraphError(`media insights ${mediaId}`, info);
        throw this.mapGraphError(info, 'Failed to fetch Instagram media insights');
      }
      this.logGraphError(`media insights ${mediaId}`, info, 'warn');
      return null;
    }

    return readInstagramViews(data);
  }

  async disconnect(_creds: SocialCredentials): Promise<void> {
    // Instagram doesn't require explicit revocation on our end
    // Token will be invalidated when user revokes in Instagram settings
  }
}
