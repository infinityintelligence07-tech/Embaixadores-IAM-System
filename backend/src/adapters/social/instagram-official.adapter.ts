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
 * Instagram Official API adapter (Graph API).
 * 
 * OAuth flow:
 * 1. Redirect to https://www.instagram.com/oauth/authorize with scopes:
 *    instagram_business_basic,instagram_business_manage_insights
 * 2. Exchange code at https://graph.instagram.com/v22.0/oauth/access_token
 * 3. Get long-lived token
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
    // Get IG user ID first
    const meResponse = await fetch(`${this.baseUrl}/me?access_token=${creds.accessToken}`);
    
    if (!meResponse.ok) {
      const error = await meResponse.text();
      this.logger.error('Failed to get Instagram user:', error);
      throw new Error('Failed to get Instagram profile');
    }
    
    const meData = await meResponse.json();
    const igUserId = meData.id;
    
    // Get business account details
    const profileResponse = await fetch(
      `${this.baseUrl}/${igUserId}?fields=username,name,profile_picture_url&access_token=${creds.accessToken}`,
    );
    
    if (!profileResponse.ok) {
      const error = await profileResponse.text();
      this.logger.error('Failed to get Instagram profile:', error);
      throw new Error('Failed to get Instagram profile');
    }
    
    const profile = await profileResponse.json();
    
    return {
      platformUserId: igUserId,
      username: profile.username || null,
      displayName: profile.name || profile.username || 'Instagram User',
      avatarUrl: profile.profile_picture_url || null,
      profileUrl: profile.username ? `https://instagram.com/${profile.username}` : null,
    };
  }
  
  async listContents(
    creds: SocialCredentials,
    cursor?: string | null,
  ): Promise<SocialContentPage> {
    const meResponse = await fetch(`${this.baseUrl}/me?access_token=${creds.accessToken}`);
    if (!meResponse.ok) {
      throw new Error('Failed to get Instagram user');
    }
    
    const meData = await meResponse.json();
    const igUserId = meData.id;
    
    const url = cursor || 
      `${this.baseUrl}/${igUserId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=100&access_token=${creds.accessToken}`;
    
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
          const insightsUrl = `${this.baseUrl}/${item.id}/insights?metric=impressions&access_token=${creds.accessToken}`;
          const insightsResponse = await fetch(insightsUrl);
          
          if (insightsResponse.ok) {
            const insightsData = await insightsResponse.json();
            if (insightsData.data && insightsData.data.length > 0) {
              views = insightsData.data[0].values[0]?.value || null;
              viewsAvailable = true;
            }
          }
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
      const meResponse = await fetch(`${this.baseUrl}/me?access_token=${creds.accessToken}`);
      if (!meResponse.ok) {
        throw new Error('Failed to get Instagram user');
      }
      
      const meData = await meResponse.json();
      const igUserId = meData.id;
      
      // Try to get account insights (impressions)
      const insightsUrl = `${this.baseUrl}/${igUserId}/insights?metric=impressions&period=lifetime&access_token=${creds.accessToken}`;
      const insightsResponse = await fetch(insightsUrl);
      
      if (insightsResponse.ok) {
        const insightsData = await insightsResponse.json();
        if (insightsData.data && insightsData.data.length > 0) {
          const impressions = insightsData.data[0].values[0]?.value || null;
          return {
            officialViews: impressions,
            availability: 'available',
            periodLabel: 'lifetime',
            definitionLabel: 'total_impressions',
          };
        }
      }
      
      // Account insights unavailable (requires business account or app review)
      return {
        officialViews: null,
        availability: 'unavailable',
        periodLabel: 'lifetime',
        definitionLabel: 'Account insights require Instagram Business account',
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
      const insightsUrl = `${this.baseUrl}/${platformContentId}/insights?metric=impressions&access_token=${creds.accessToken}`;
      const response = await fetch(insightsUrl);
      
      if (!response.ok) {
        return { views: null, viewsAvailable: false };
      }
      
      const data = await response.json();
      if (data.data && data.data.length > 0) {
        const views = data.data[0].values[0]?.value || null;
        return { views, viewsAvailable: true };
      }
      
      return { views: null, viewsAvailable: false };
    } catch (error) {
      this.logger.warn(`Failed to get content metrics for ${platformContentId}:`, error);
      return { views: null, viewsAvailable: false };
    }
  }
  
  async disconnect(_creds: SocialCredentials): Promise<void> {
    // Instagram doesn't require explicit revocation on our end
    // Token will be invalidated when user revokes in Instagram settings
  }
}
