import { Injectable, BadRequestException, ConflictException, Inject } from '@nestjs/common';
import { ProfileId, SocialPlatform, SocialTransport, ConnectionStatus } from '../../domain/types';
import {
  SocialAccountRepository,
  OAuthStateRepository,
  SyncJobRepository,
  AuditRepository,
} from '../../ports/repositories.port';
import { SocialMetricsProvider } from '../../ports/social-metrics.port';
import { TokenEncryptionPort } from '../../ports/tokens.port';
import { ClockPort } from '../../ports/clock.port';
import { INJECTION_TOKENS } from '../../infrastructure/tokens/injection-tokens';
import { loadConfig } from '../../infrastructure/config/env';

@Injectable()
export class OAuthCallbackUseCase {
  private readonly config = loadConfig();
  
  constructor(
    @Inject(INJECTION_TOKENS.CLOCK)
    private readonly clock: ClockPort,
    @Inject(INJECTION_TOKENS.TOKEN_ENCRYPTION)
    private readonly encryption: TokenEncryptionPort,
    @Inject(INJECTION_TOKENS.SOCIAL_PROVIDER_FACTORY)
    private readonly providerFactory: any,
    @Inject(INJECTION_TOKENS.OAUTH_STATE_REPOSITORY)
    private readonly oauthStateRepo: OAuthStateRepository,
    @Inject(INJECTION_TOKENS.SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccountRepo: SocialAccountRepository,
    @Inject(INJECTION_TOKENS.SYNC_JOB_REPOSITORY)
    private readonly syncJobRepo: SyncJobRepository,
    @Inject(INJECTION_TOKENS.AUDIT_REPOSITORY)
    private readonly auditRepo: AuditRepository,
  ) {}
  
  async execute(
    platform: SocialPlatform,
    code: string,
    state: string,
  ): Promise<{ profileId: ProfileId; accountId: string }> {
    const now = this.clock.now();
    
    // Consume state
    const oauthState = await this.oauthStateRepo.consume(state, now);
    if (!oauthState) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }
    
    // Exchange code for tokens
    const tokens = await this.exchangeCode(platform, code, oauthState.codeVerifier);
    
    // Get provider
    const provider: SocialMetricsProvider = this.providerFactory.getProvider(
      platform,
      SocialTransport.OfficialApi,
    );
    
    // Get profile
    const authorizedProfile = await provider.getAuthorizedProfile(tokens);
    
    // Check for existing account with same platform_user_id (enforce UNIQUE)
    const existingByPlatformUser = await this.socialAccountRepo.findByPlatformUserId(
      platform,
      authorizedProfile.platformUserId,
    );
    
    if (existingByPlatformUser && existingByPlatformUser.profileId !== oauthState.profileId) {
      throw new ConflictException(
        'This social account is already connected to another user',
      );
    }
    
    // Check if this profile already has an account for this platform
    const existingByProfile = await this.socialAccountRepo.findByProfileAndPlatform(
      oauthState.profileId,
      platform,
    );
    
    let accountId: string;
    
    if (existingByProfile) {
      // Update existing
      await this.socialAccountRepo.update(existingByProfile.id, {
        username: authorizedProfile.username,
        displayName: authorizedProfile.displayName,
        avatarUrl: authorizedProfile.avatarUrl,
        profileUrl: authorizedProfile.profileUrl,
        status: ConnectionStatus.Connected,
        disconnectedAt: null,
      });
      accountId = existingByProfile.id;
    } else if (existingByPlatformUser) {
      // Reconnect
      await this.socialAccountRepo.update(existingByPlatformUser.id, {
        status: ConnectionStatus.Connected,
        disconnectedAt: null,
      });
      accountId = existingByPlatformUser.id;
    } else {
      // Create new
      const newAccount = await this.socialAccountRepo.create({
        profileId: oauthState.profileId,
        platform,
        platformUserId: authorizedProfile.platformUserId,
        username: authorizedProfile.username,
        displayName: authorizedProfile.displayName,
        avatarUrl: authorizedProfile.avatarUrl,
        profileUrl: authorizedProfile.profileUrl,
        transport: SocialTransport.OfficialApi,
      });
      accountId = newAccount.id;
    }
    
    // Encrypt and store credentials
    const accessTokenCiphertext = await this.encryption.encrypt(tokens.accessToken);
    const refreshTokenCiphertext = tokens.refreshToken
      ? await this.encryption.encrypt(tokens.refreshToken)
      : null;
    
    await this.socialAccountRepo.saveCredentials(accountId as any, {
      socialAccountId: accountId as any,
      accessTokenCiphertext,
      refreshTokenCiphertext,
      tokenExpiresAt: tokens.expiresAt || null,
      refreshExpiresAt: tokens.refreshExpiresAt || null,
      scopes: tokens.scopes,
      encryptionKid: 'default',
    });
    
    // Enqueue initial sync
    await this.syncJobRepo.enqueue({
      socialAccountId: accountId as any,
      priority: 10,
    });
    
    // Audit log
    await this.auditRepo.append({
      actorId: oauthState.profileId,
      action: 'connect_social_account',
      entityType: 'social_account',
      entityId: accountId,
      metadata: { platform },
    });
    
    return { profileId: oauthState.profileId, accountId };
  }
  
  private async exchangeCode(
    platform: SocialPlatform,
    code: string,
    codeVerifier?: string | null,
  ): Promise<any> {
    if (platform === SocialPlatform.Instagram) {
      const redirectUri = `${this.config.app.baseUrl}/api/social/oauth/instagram/callback`;
      
      const body = new FormData();
      body.set('client_id', this.config.social.meta.appId!);
      body.set('client_secret', this.config.social.meta.appSecret!);
      body.set('grant_type', 'authorization_code');
      body.set('redirect_uri', redirectUri);
      body.set('code', code.replace(/#_$/, '').trim());

      const response = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        body,
      });

      const data = await response.json().catch(() => null);
      const tokenPayload = data?.data?.[0] ?? data;
      const shortToken = tokenPayload?.access_token as string | undefined;

      if (!response.ok || !shortToken) {
        console.error('Instagram token exchange failed', {
          status: response.status,
          error: tokenPayload?.error_message || tokenPayload?.error || data?.error_message,
        });
        throw new BadRequestException('Não foi possível concluir a entrada no Instagram.');
      }

      const longLivedUrl = new URL('https://graph.instagram.com/access_token');
      longLivedUrl.searchParams.set('grant_type', 'ig_exchange_token');
      longLivedUrl.searchParams.set('client_secret', this.config.social.meta.appSecret!);
      longLivedUrl.searchParams.set('access_token', shortToken);
      const longLivedResponse = await fetch(longLivedUrl);

      if (!longLivedResponse.ok) {
        return {
          accessToken: shortToken,
          scopes: [],
        };
      }

      const longLivedData = await longLivedResponse.json();
      if (!longLivedData?.access_token) {
        return {
          accessToken: shortToken,
          scopes: [],
        };
      }

      return {
        accessToken: longLivedData.access_token,
        expiresAt: new Date(Date.now() + (longLivedData.expires_in || 5184000) * 1000),
        scopes: [],
      };
    }
    
    if (platform === SocialPlatform.TikTok) {
      const redirectUri = `${this.config.app.baseUrl}/api/social/oauth/tiktok/callback`;
      
      const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: this.config.social.tiktok.clientKey!,
          client_secret: this.config.social.tiktok.clientSecret!,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code_verifier: codeVerifier || '',
        }),
      });
      
      const data = await response.json().catch(() => null);

      const tokenError = typeof data?.error === 'string' ? data.error : data?.error?.code;
      if (!response.ok || (tokenError && tokenError !== 'ok') || !data?.access_token) {
        console.error('TikTok token exchange failed', {
          status: response.status,
          error: data?.error,
          description: data?.error_description,
        });
        throw new BadRequestException('Não foi possível concluir a entrada no TikTok.');
      }

      const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 86_400;

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
        refreshExpiresAt: data.refresh_expires_in
          ? new Date(Date.now() + data.refresh_expires_in * 1000)
          : undefined,
        scopes: data.scope?.split(',') || [],
      };
    }

    throw new BadRequestException('Essa rede não está disponível.');
  }
}
