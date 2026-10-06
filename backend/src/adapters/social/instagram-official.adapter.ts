import { Injectable, Logger } from '@nestjs/common';
import { readInstagramViews } from '../../domain/view-metrics';
import {
  SocialMetricsProvider,
  SocialCredentials,
  AuthorizedProfile,
  SocialContentPage,
  AccountMetricsResult,
  ContentMetricsResult,
} from '../../ports/social-metrics.port';

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
    const url = cursor ||
      `${this.baseUrl}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=100&access_token=${encodeURIComponent(creds.accessToken)}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const error = await response.text();
      this.logger.error('Failed to list Instagram media:', error);
      throw new Error('Failed to list Instagram content');
    }
    
    const data = await response.json();
    
    const items = await Promise.all(
      (data.data || []).map(async (item: any) => {
        // Fetch insights for each media item
        let views: number | null = null;
        let viewsAvailable = false;
        
        try {
          views = await this.fetchMediaViews(creds.accessToken, item.id);
          viewsAvailable = views !== null;
        } catch (error) {
          this.logger.warn(`Failed to fetch insights for media ${item.id}:`, error);
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
      }),
    );
    
    return {
      items,
      nextCursor: data.paging?.next || null,
    };
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
      this.logger.warn(`Failed to get content metrics for ${platformContentId}:`, error);
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
    if (!response.ok || !data?.access_token) {
      this.logger.error('Failed to refresh Instagram token', data?.error?.message);
      throw new Error('Failed to refresh Instagram credentials');
    }

    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 5_184_000) * 1000),
      scopes: creds.scopes,
    };
  }

  private async fetchMediaViews(accessToken: string, mediaId: string): Promise<number | null> {
    const primary = await this.requestMediaInsights(accessToken, mediaId, false);
    if (primary !== null) return primary;
    return this.requestMediaInsights(accessToken, mediaId, true);
  }

  private async requestMediaInsights(
    accessToken: string,
    mediaId: string,
    withLifetime: boolean,
  ): Promise<number | null> {
    const url = new URL(`${this.baseUrl}/${mediaId}/insights`);
    url.searchParams.set('metric', 'views');
    if (withLifetime) url.searchParams.set('period', 'lifetime');
    url.searchParams.set('access_token', accessToken);

    const response = await fetch(url);
    if (!response.ok) return null;
    return readInstagramViews(await response.json());
  }

  async disconnect(_creds: SocialCredentials): Promise<void> {
    // Instagram doesn't require explicit revocation on our end
    // Token will be invalidated when user revokes in Instagram settings
  }
}
