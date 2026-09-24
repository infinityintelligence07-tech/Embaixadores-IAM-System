import { Injectable, Logger } from '@nestjs/common';
import { SocialMetricsProvider } from '../../ports/social-metrics.port';
import { SocialPlatform, SocialTransport } from '../../domain/types';
import { InstagramOfficialAdapter } from './instagram-official.adapter';
import { TikTokOfficialAdapter } from './tiktok-official.adapter';
import { McpSocialAdapter } from './mcp-social.adapter';
import { DemoSocialAdapter } from './demo-social.adapter';
import { loadConfig } from '../../infrastructure/config/env';

@Injectable()
export class SocialProviderFactory {
  private readonly logger = new Logger(SocialProviderFactory.name);
  private readonly config = loadConfig();
  
  private instagramOfficial?: InstagramOfficialAdapter;
  private tiktokOfficial?: TikTokOfficialAdapter;
  
  getProvider(
    platform: SocialPlatform,
    transport: SocialTransport,
  ): SocialMetricsProvider {
    if (transport === SocialTransport.Demo || this.config.demo.enabled) {
      this.logger.log(`Using demo adapter for ${platform}`);
      return new DemoSocialAdapter(platform);
    }
    
    if (transport === SocialTransport.Mcp) {
      this.logger.log(`Using MCP adapter for ${platform} (always unavailable)`);
      return new McpSocialAdapter(platform);
    }
    
    if (transport === SocialTransport.OfficialApi) {
      if (platform === SocialPlatform.Instagram) {
        if (!this.config.social.meta.appId || !this.config.social.meta.appSecret) {
          this.logger.warn('META_APP_ID or META_APP_SECRET not configured');
          throw new Error('Instagram integration not configured');
        }
        
        if (!this.instagramOfficial) {
          this.instagramOfficial = new InstagramOfficialAdapter();
        }
        return this.instagramOfficial;
      }
      
      if (platform === SocialPlatform.TikTok) {
        if (!this.config.social.tiktok.clientKey || !this.config.social.tiktok.clientSecret) {
          this.logger.warn('TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET not configured');
          throw new Error('TikTok integration not configured');
        }
        
        if (!this.tiktokOfficial) {
          this.tiktokOfficial = new TikTokOfficialAdapter();
        }
        return this.tiktokOfficial;
      }
    }
    
    throw new Error(`Unsupported provider: ${platform} / ${transport}`);
  }
}
