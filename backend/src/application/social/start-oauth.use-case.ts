import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { ProfileId, SocialPlatform } from '../../domain/types';
import { OAuthStateRepository } from '../../ports/repositories.port';
import { loadConfig } from '../../infrastructure/config/env';
import { INJECTION_TOKENS } from '../../infrastructure/tokens/injection-tokens';

export interface StartOAuthResult {
  url: string;
}

@Injectable()
export class StartOAuthUseCase {
  private readonly config = loadConfig();
  
  constructor(
    @Inject(INJECTION_TOKENS.OAUTH_STATE_REPOSITORY)
    private readonly oauthStateRepo: OAuthStateRepository,
  ) {}
  
  async execute(
    profileId: ProfileId,
    platform: SocialPlatform,
  ): Promise<StartOAuthResult> {
    const state = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    if (platform === SocialPlatform.Instagram) {
      if (!this.config.social.meta.appId) {
        throw new BadRequestException(
          'Instagram integration is not configured. Please contact support.',
        );
      }
      
      const redirectUri = `${this.config.app.baseUrl}/api/social/oauth/instagram/callback`;
      
      await this.oauthStateRepo.create({
        profileId,
        platform,
        state,
        expiresAt,
      });
      
      const url = new URL('https://www.instagram.com/oauth/authorize');
      url.searchParams.set('client_id', this.config.social.meta.appId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('scope', 'instagram_business_basic,instagram_business_manage_insights');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('state', state);
      
      return { url: url.toString() };
    }
    
    if (platform === SocialPlatform.TikTok) {
      if (!this.config.social.tiktok.clientKey) {
        throw new BadRequestException(
          'TikTok integration is not configured. Please contact support.',
        );
      }
      
      // PKCE for TikTok
      const codeVerifier = randomBytes(32).toString('base64url');
      const codeChallenge = createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
      
      const redirectUri = `${this.config.app.baseUrl}/api/social/oauth/tiktok/callback`;
      
      await this.oauthStateRepo.create({
        profileId,
        platform,
        state,
        codeVerifier,
        expiresAt,
      });
      
      const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
      url.searchParams.set('client_key', this.config.social.tiktok.clientKey);
      url.searchParams.set('scope', 'user.info.basic,video.list');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      
      return { url: url.toString() };
    }
    
    throw new BadRequestException('Unsupported platform');
  }
}
