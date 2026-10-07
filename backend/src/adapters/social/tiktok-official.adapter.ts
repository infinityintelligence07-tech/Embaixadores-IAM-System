import { Injectable, Logger } from '@nestjs/common';
import { readTikTokViewCount, isTikTokFailure } from '../../domain/view-metrics';
import { loadConfig } from '../../infrastructure/config/env';
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

const TIKTOK_AUTH_ERROR_CODES = new Set([
  'access_token_invalid',
  'invalid_grant',
  'token_expired',
  'access_token_expired',
]);
const TIKTOK_RATE_LIMIT_CODES = new Set(['rate_limit_exceeded', 'too_many_requests']);

function readTikTokErrorCode(error: unknown): string | null {
  if (typeof error === 'string') return error || null;
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code !== '' ? code : null;
}

/**
 * TikTok Official API adapter (Display API v2).
 * 
 * OAuth flow with PKCE:
 * 1. Generate code_verifier and code_challenge
 * 2. Redirect to https://www.tiktok.com/v2/auth/authorize/
 * 3. Exchange code at https://open.tiktokapis.com/v2/oauth/token/ with code_verifier
 * 
 * Supports token refresh via refresh_token.
 * 
 * LIMITATION: Display API does not provide account-level official views.
 * Only individual video view counts are available via video.list endpoint.
 */
@Injectable()
export class TikTokOfficialAdapter implements SocialMetricsProvider {
  readonly platform = 'tiktok' as const;
  readonly transport = 'official_api' as const;
  
  private readonly logger = new Logger(TikTokOfficialAdapter.name);
  private readonly baseUrl = 'https://open.tiktokapis.com';
  
  async getAuthorizedProfile(creds: SocialCredentials): Promise<AuthorizedProfile> {
    const response = await fetch(`${this.baseUrl}/v2/user/info/?fields=open_id,union_id,avatar_url,display_name`, {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
      },
    });
    
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      this.throwIfAuthFailure(data?.error, response.status, 'user info');
      this.logger.error(`Failed to get TikTok user: status=${response.status} code=${readTikTokErrorCode(data?.error) ?? '-'}`);
      throw new Error('Failed to get TikTok profile');
    }

    if (isTikTokFailure(data?.error)) {
      this.throwIfAuthFailure(data.error, response.status, 'user info');
      this.logger.error(`TikTok profile error code=${readTikTokErrorCode(data.error)}`);
      throw new Error('Failed to get TikTok profile');
    }
    const user = data?.data?.user;
    
    if (!user) {
      throw new Error('Invalid TikTok profile response');
    }
    
    return {
      platformUserId: user.open_id,
      username: user.display_name || null,
      displayName: user.display_name || 'TikTok User',
      avatarUrl: user.avatar_url || null,
      profileUrl: null, // Display API doesn't provide profile URL
    };
  }
  
  async listContents(
    creds: SocialCredentials,
    cursor?: string | null,
  ): Promise<SocialContentPage> {
    const url = `${this.baseUrl}/v2/video/list/?fields=id,title,cover_image_url,share_url,create_time,duration,view_count`;
    
    const body: any = {
      max_count: 20,
    };
    
    if (cursor) {
      body.cursor = parseInt(cursor, 10);
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      this.throwIfAuthFailure(data?.error, response.status, 'video list');
      this.logger.error(`Failed to list TikTok videos: status=${response.status} code=${readTikTokErrorCode(data?.error) ?? '-'}`);
      throw new Error('Failed to list TikTok content');
    }

    if (isTikTokFailure(data?.error)) {
      this.throwIfAuthFailure(data.error, response.status, 'video list');
      const code = readTikTokErrorCode(data.error);
      this.logger.error(`TikTok API error code=${code} ${String(data.error?.message ?? '').slice(0, 180)}`);
      throw new Error(`TikTok API error: ${data.error?.message ?? code}`);
    }
    
    const videos = data?.data?.videos || [];
    
    const items = videos.map((video: any) => ({
      platformContentId: video.id,
      title: video.title || null,
      thumbnailUrl: video.cover_image_url || null,
      permalink: video.share_url || null,
      publishedAt: video.create_time ? new Date(video.create_time * 1000) : null,
      mediaType: 'video',
      views: readTikTokViewCount(video.view_count),
      viewsAvailable: video.view_count !== undefined && video.view_count !== null,
    }));
    
    return {
      items,
      nextCursor: data.data?.has_more ? String(data.data.cursor) : null,
    };
  }
  
  async getAccountMetrics(_creds: SocialCredentials): Promise<AccountMetricsResult> {
    // Display API limitation: account-level views are not available
    return {
      officialViews: null,
      availability: 'unavailable',
      definitionLabel: 'Views da conta indisponíveis no TikTok',
    };
  }
  
  async getContentMetrics(
    creds: SocialCredentials,
    platformContentId: string,
  ): Promise<ContentMetricsResult> {
    try {
      // Fetch single video details
      const url = `${this.baseUrl}/v2/video/query/?fields=id,view_count`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filters: { video_ids: [platformContentId] },
        }),
      });
      
      if (!response.ok) {
        return { views: null, viewsAvailable: false };
      }
      
      const data = await response.json();
      if (isTikTokFailure(data.error)) {
        return { views: null, viewsAvailable: false };
      }
      const video = (data.data?.videos || []).find(
        (item: { id?: string }) => item.id === platformContentId,
      );
      const views = readTikTokViewCount(video?.view_count);
      return { views, viewsAvailable: views !== null };
    } catch (error) {
      this.logger.warn(`Failed to get TikTok content metrics for ${platformContentId}:`, error);
      return { views: null, viewsAvailable: false };
    }
  }
  
  async refreshCredentials(creds: SocialCredentials): Promise<SocialCredentials> {
    if (!creds.refreshToken) {
      throw new Error('No refresh token available');
    }

    const config = loadConfig();
    const clientKey = config.social.tiktok.clientKey;
    const clientSecret = config.social.tiktok.clientSecret;
    if (!clientKey || !clientSecret) {
      throw new Error('TikTok integration not configured');
    }
    
    const response = await fetch(`${this.baseUrl}/v2/oauth/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: creds.refreshToken,
      }),
    });
    
    const data = await response.json().catch(() => null);
    const tokenError = typeof data?.error === 'string' ? data.error : data?.error?.code;
    if (!response.ok || (tokenError && tokenError !== 'ok') || !data?.access_token) {
      this.throwIfAuthFailure(data?.error, response.status, 'token refresh');
      this.logger.error(`Failed to refresh TikTok token status=${response.status} code=${tokenError ?? '-'}`);
      throw new Error('Failed to refresh TikTok credentials');
    }
    
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 86_400;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || creds.refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      refreshExpiresAt: data.refresh_expires_in
        ? new Date(Date.now() + data.refresh_expires_in * 1000)
        : creds.refreshExpiresAt,
      scopes: data.scope?.split(',') || creds.scopes,
    };
  }
  
  async disconnect(creds: SocialCredentials): Promise<void> {
    try {
      const config = loadConfig();
      const clientKey = config.social.tiktok.clientKey;
      const clientSecret = config.social.tiktok.clientSecret;
      if (!clientKey || !clientSecret) {
        this.logger.warn('TikTok revoke skipped: integration not configured');
        return;
      }

      // The revoke endpoint requires the app credentials along with the token.
      const response = await fetch(`${this.baseUrl}/v2/oauth/revoke/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          token: creds.accessToken,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        this.logger.warn(
          `TikTok revoke failed status=${response.status} code=${readTikTokErrorCode(data?.error) ?? '-'}`,
        );
      }
    } catch (error) {
      this.logger.warn(`Failed to revoke TikTok token: ${error}`);
    }
  }

  /**
   * Converts TikTok auth and throttling failures into typed errors so the
   * sync pipeline can stop retrying or back off accordingly.
   */
  private throwIfAuthFailure(error: unknown, status: number, context: string): void {
    const code = readTikTokErrorCode(error);
    if (status === 401 || (code && TIKTOK_AUTH_ERROR_CODES.has(code))) {
      this.logger.error(`TikTok ${context} authorization failed status=${status} code=${code ?? '-'}`);
      throw new SocialAuthError(undefined, code);
    }
    if (status === 429 || (code && TIKTOK_RATE_LIMIT_CODES.has(code))) {
      this.logger.warn(`TikTok ${context} rate limited status=${status} code=${code ?? '-'}`);
      throw new SocialRateLimitError(undefined, code);
    }
  }
}
