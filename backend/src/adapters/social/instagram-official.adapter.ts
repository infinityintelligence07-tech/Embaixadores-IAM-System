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
  // Once one call rejects, the other workers stop picking up new items so
  // Promise.all settles without a burst of pointless requests.
  let failed = false;

  const worker = async (): Promise<void> => {
    while (!failed && nextIndex < items.length) {
      const current = nextIndex++;
      try {
        results[current] = await fn(items[current], current);
      } catch (error) {
        failed = true;
        throw error;
      }
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
    const profile = await this.fetchMe(creds.accessToken, creds.platformUserId);

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
    // Legacy checkpoints stored the full `paging.next` URL (which embeds an
    // old access token). Only its `after` value is reused, with the current
    // token; new cursors are only the opaque `after` value.
    const after =
      cursor && cursor.startsWith('http')
        ? this.extractAfterParam(cursor)
        : cursor ?? null;
    const url = this.buildMediaUrl(after);

    const response = await this.fetchGraph(url, creds.accessToken);
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
    let nextCursor: string | null = null;
    if (media.length > 0 && typeof data.paging?.next === 'string') {
      nextCursor =
        data.paging?.cursors?.after ?? this.extractAfterParam(data.paging.next);
      if (!nextCursor) {
        // Completing here would look like a full pass and wrongly mark the
        // remaining posts as removed.
        throw new Error('Instagram paging cursor missing');
      }
    }

    return { items, nextCursor };
  }

  /** Reads the `after` query param of a Graph paging URL. Never logs the URL. */
  private extractAfterParam(pagingUrl: string): string | null {
    try {
      return new URL(pagingUrl).searchParams.get('after') || null;
    } catch {
      return null;
    }
  }

  private buildMediaUrl(after: string | null): string {
    const url = new URL(`${this.baseUrl}/me/media`);
    url.searchParams.set('fields', MEDIA_FIELDS);
    url.searchParams.set('limit', String(MEDIA_PAGE_SIZE));
    if (after) url.searchParams.set('after', after);
    return url.toString();
  }

  /**
   * Conta comum recusa o token na query ("unsupported request - method type: get").
   * O cabeçalho Bearer é o caminho que a Meta aceita fora do modo de teste.
   * Se o Bearer falhar por outro motivo, a query antiga continua como reserva.
   */
  private async fetchGraph(url: URL | string, accessToken: string): Promise<Response> {
    const bearerUrl = new URL(typeof url === 'string' ? url : url.toString());
    bearerUrl.searchParams.delete('access_token');
    const bearerResponse = await fetch(bearerUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (bearerResponse.ok) return bearerResponse;

    const preview = await bearerResponse.clone().json().catch(() => null);
    const message = typeof preview?.error?.message === 'string' ? preview.error.message : '';
    if (!/unsupported request - method type: get/i.test(message)) return bearerResponse;

    const queryUrl = new URL(bearerUrl.toString());
    queryUrl.searchParams.set('access_token', accessToken);
    return fetch(queryUrl);
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
      const insightsUrl = `${this.baseUrl}/me/insights?metric=views&period=days_28&metric_type=total_value`;
      const insightsResponse = await this.fetchGraph(insightsUrl, creds.accessToken);
      
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
  
  private async fetchMe(
    accessToken: string,
    knownUserId?: string,
  ): Promise<{
    id: string;
    username: string | null;
    name: string | null;
    avatarUrl: string | null;
  }> {
    // `user_id` na URL versionada devolve "unsupported request - method type: get"
    // para conta comum, mesmo depois que a Meta aceita a permissão. `id` é o campo
    // que a leitura do perfil aceita. O identificador da troca do código entra por último.
    const attempts = [
      { path: 'v21.0/me', fields: 'user_id,username' },
      { path: 'v22.0/me', fields: 'id,username' },
      { path: 'me', fields: 'id,username' },
      { path: 'v22.0/me', fields: 'user_id,username' },
      ...(knownUserId
        ? [
            {
              path: `v22.0/${knownUserId}`,
              fields: 'id,username,name,account_type,profile_picture_url',
            },
            { path: knownUserId, fields: 'id,username,account_type' },
          ]
        : []),
    ];

    let lastDetail = 'sem resposta';
    let sawUnsupportedGet = false;

    for (const attempt of attempts) {
      const result = await this.requestProfile(accessToken, attempt.path, attempt.fields);
      if (result.profile) {
        if (result.profile.accountType === 'PERSONAL') {
          throw new Error('instagram_not_professional');
        }
        const extra = result.profile.name
          ? null
          : await this.requestProfile(accessToken, attempt.path, 'name,profile_picture_url');
        return {
          id: result.profile.id,
          username: result.profile.username,
          name: result.profile.name ?? extra?.profile?.name ?? null,
          avatarUrl: result.profile.avatarUrl ?? extra?.profile?.avatarUrl ?? null,
        };
      }
      lastDetail = result.detail;
      if (/unsupported request - method type: get/i.test(result.detail)) {
        sawUnsupportedGet = true;
      }
      if (/professional|business account|creator account|not eligible|personal account/i.test(result.detail)) {
        throw new Error('instagram_not_professional');
      }
    }

    if (sawUnsupportedGet) {
      throw new Error('instagram_review_required');
    }
    this.logger.error(`Instagram profile failed: ${lastDetail.slice(0, 180)}`);
    throw new Error('Failed to get Instagram profile');
  }

  private async requestProfile(
    accessToken: string,
    path: string,
    fields: string,
  ): Promise<{
    profile: {
      id: string;
      username: string | null;
      name: string | null;
      avatarUrl: string | null;
      accountType: string | null;
    } | null;
    detail: string;
  }> {
    const url = new URL(`https://graph.instagram.com/${path}`);
    url.searchParams.set('fields', fields);

    const response = await this.fetchGraph(url, accessToken);
    const data = await response.json().catch(() => null);
    if (response.ok && data && !data.error) {
      const id = String(data.user_id || data.id || '');
      if (!id) return { profile: null, detail: 'perfil sem identificador' };
      return {
        profile: {
          id,
          username: data.username ? String(data.username) : null,
          name: data.name ? String(data.name) : null,
          avatarUrl: data.profile_picture_url ? String(data.profile_picture_url) : null,
          accountType: data.account_type ? String(data.account_type) : null,
        },
        detail: '',
      };
    }

    const graphMessage = typeof data?.error?.message === 'string' ? data.error.message : '';
    const graphCode = data?.error?.code ?? '';
    const detail = graphMessage || `HTTP ${response.status}`;
    this.logger.warn(
      `Instagram profile ${path} fields=${fields} status=${response.status} code=${graphCode} ${graphMessage.slice(0, 180)}`,
    );
    return { profile: null, detail };
  }

  async refreshCredentials(creds: SocialCredentials): Promise<SocialCredentials> {
    const url = new URL('https://graph.instagram.com/refresh_access_token');
    url.searchParams.set('grant_type', 'ig_refresh_token');

    const response = await this.fetchGraph(url, creds.accessToken);
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

    const response = await this.fetchGraph(url, accessToken);
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
