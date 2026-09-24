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
 * Demo social adapter - returns deterministic fake data for local testing.
 * Data is clearly labeled as demo/simulated.
 */
@Injectable()
export class DemoSocialAdapter implements SocialMetricsProvider {
  readonly platform: 'instagram' | 'tiktok';
  readonly transport = 'demo' as const;
  
  private readonly logger = new Logger(DemoSocialAdapter.name);
  
  constructor(platform: 'instagram' | 'tiktok') {
    this.platform = platform;
  }
  
  async getAuthorizedProfile(creds: SocialCredentials): Promise<AuthorizedProfile> {
    this.logger.log(`Demo ${this.platform} adapter: getAuthorizedProfile`);
    
    // Use access token as seed for deterministic data
    const seed = this.hashString(creds.accessToken);
    const username = `demo_user_${seed % 1000}`;
    
    return {
      platformUserId: `demo_${this.platform}_${seed}`,
      username,
      displayName: `Demo ${this.platform} User ${seed % 100}`,
      avatarUrl: `https://i.pravatar.cc/150?u=${seed}`,
      profileUrl: this.platform === 'instagram' 
        ? `https://instagram.com/${username}`
        : `https://tiktok.com/@${username}`,
    };
  }
  
  async listContents(
    creds: SocialCredentials,
    cursor?: string | null,
  ): Promise<SocialContentPage> {
    this.logger.log(`Demo ${this.platform} adapter: listContents`);
    
    const seed = this.hashString(creds.accessToken);
    const page = cursor ? parseInt(cursor, 10) : 0;
    const itemsPerPage = 10;
    const maxItems = 25;
    
    if (page * itemsPerPage >= maxItems) {
      return { items: [], nextCursor: null };
    }
    
    const items = [];
    const remaining = maxItems - page * itemsPerPage;
    const count = Math.min(itemsPerPage, remaining);
    
    for (let i = 0; i < count; i++) {
      const index = page * itemsPerPage + i;
      const contentSeed = seed + index;
      
      items.push({
        platformContentId: `demo_content_${contentSeed}`,
        title: `Demo ${this.platform} content #${index + 1} (simulated)`,
        thumbnailUrl: `https://picsum.photos/seed/${contentSeed}/400/400`,
        permalink: `https://${this.platform}.com/p/${contentSeed}`,
        publishedAt: new Date(Date.now() - (index + 1) * 86400000 * 3),
        mediaType: this.platform === 'tiktok' ? 'video' : 'photo',
        views: Math.floor(5000 + (contentSeed % 50000)),
        viewsAvailable: true,
      });
    }
    
    const hasMore = (page + 1) * itemsPerPage < maxItems;
    
    return {
      items,
      nextCursor: hasMore ? String(page + 1) : null,
    };
  }
  
  async getAccountMetrics(creds: SocialCredentials): Promise<AccountMetricsResult> {
    this.logger.log(`Demo ${this.platform} adapter: getAccountMetrics`);
    
    const seed = this.hashString(creds.accessToken);
    
    return {
      officialViews: Math.floor(100000 + (seed % 900000)),
      availability: 'available',
      periodLabel: 'lifetime_demo',
      definitionLabel: 'Simulated total account views',
    };
  }
  
  async getContentMetrics(
    creds: SocialCredentials,
    platformContentId: string,
  ): Promise<ContentMetricsResult> {
    this.logger.log(`Demo ${this.platform} adapter: getContentMetrics`);
    
    const seed = this.hashString(creds.accessToken + platformContentId);
    
    return {
      views: Math.floor(1000 + (seed % 49000)),
      viewsAvailable: true,
    };
  }
  
  async disconnect(_creds: SocialCredentials): Promise<void> {
    this.logger.log(`Demo ${this.platform} adapter: disconnect`);
    // No-op for demo
  }
  
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}
