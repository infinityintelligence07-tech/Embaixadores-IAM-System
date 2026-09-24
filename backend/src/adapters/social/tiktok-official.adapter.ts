import { Injectable, Logger } from '@nestjs/common';
import {
  SocialMetricsProvider,
  SocialCredentials,
  AuthorizedProfile,
  SocialContentPage,
  AccountMetricsResult,
  ContentMetricsResult,
} from '../../ports/social-metrics.port';

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
    
    if (!response.ok) {
      const error = await response.text();
      this.logger.error('Failed to get TikTok user:', error);
      throw new Error('Failed to get TikTok profile');
    }
    
    const data = await response.json();
    const user = data.data?.user;
    
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
    
    if (!response.ok) {
      const error = await response.text();
      this.logger.error('Failed to list TikTok videos:', error);
      throw new Error('Failed to list TikTok content');
    }
    
    const data = await response.json();
    
    if (data.error?.code) {
      this.logger.error('TikTok API error:', data.error);
      throw new Error(`TikTok API error: ${data.error.message}`);
    }
    
    const videos = data.data?.videos || [];
    
    const items = videos.map((video: any) => ({
      platformContentId: video.id,
      title: video.title || null,
      thumbnailUrl: video.cover_image_url || null,
      permalink: video.share_url || null,
      publishedAt: video.create_time ? new Date(video.create_time * 1000) : null,
      mediaType: 'video',
      views: video.view_count || null,
      viewsAvailable: true,
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
      definitionLabel: 'Account views unavailable in TikTok Display API',
    };
  }
  
  async getContentMetrics(
    creds: SocialCredentials,
    platformContentId: string,
  ): Promise<ContentMetricsResult> {
    try {
      // Fetch single video details
      const url = `${this.baseUrl}/v2/video/list/?fields=id,view_count`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ max_count: 20 }),
      });
      
      if (!response.ok) {
        return { views: null, viewsAvailable: false };
      }
      
      const data = await response.json();
      const videos = data.data?.videos || [];
      const video = videos.find((v: any) => v.id === platformContentId);
      
      if (video) {
        return {
          views: video.view_count || null,
          viewsAvailable: true,
        };
      }
      
      return { views: null, viewsAvailable: false };
    } catch (error) {
      this.logger.warn(`Failed to get TikTok content metrics for ${platformContentId}:`, error);
      return { views: null, viewsAvailable: false };
    }
  }
  
  async refreshCredentials(creds: SocialCredentials): Promise<SocialCredentials> {
    if (!creds.refreshToken) {
      throw new Error('No refresh token available');
    }
    
    const response = await fetch(`${this.baseUrl}/v2/oauth/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: creds.refreshToken,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      this.logger.error('Failed to refresh TikTok token:', error);
      throw new Error('Failed to refresh TikTok credentials');
    }
    
    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      refreshExpiresAt: data.refresh_expires_in
        ? new Date(Date.now() + data.refresh_expires_in * 1000)
        : undefined,
      scopes: data.scope?.split(',') || [],
    };
  }
  
  async disconnect(creds: SocialCredentials): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/v2/oauth/revoke/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token: creds.accessToken,
        }),
      });
    } catch (error) {
      this.logger.warn('Failed to revoke TikTok token:', error);
    }
  }
}
