import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '../guards/auth.guard';
import { ConnectionStatus, SocialPlatform } from '../../../domain/types';
import {
  SettingsRepository,
  SocialAccountRepository,
  SyncJobRepository,
} from '../../../ports/repositories.port';
import { ClockPort } from '../../../ports/clock.port';
import { StartOAuthUseCase } from '../../../application/social/start-oauth.use-case';
import { OAuthCallbackUseCase } from '../../../application/social/oauth-callback.use-case';
import { INJECTION_TOKENS } from '../../../infrastructure/tokens/injection-tokens';

@Controller('api/social')
export class SocialController {
  constructor(
    @Inject(INJECTION_TOKENS.CLOCK)
    private readonly clock: ClockPort,
    @Inject(INJECTION_TOKENS.SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccountRepo: SocialAccountRepository,
    @Inject(INJECTION_TOKENS.SYNC_JOB_REPOSITORY)
    private readonly syncJobRepo: SyncJobRepository,
    @Inject(INJECTION_TOKENS.SETTINGS_REPOSITORY)
    private readonly settingsRepo: SettingsRepository,
    private readonly startOAuthUseCase: StartOAuthUseCase,
    private readonly oauthCallbackUseCase: OAuthCallbackUseCase,
  ) {}

  @Get('accounts')
  @UseGuards(AuthGuard)
  async listAccounts(@Req() req: { user: { id: string } }) {
    const accounts = await Promise.all([
      this.socialAccountRepo.findByProfileAndPlatform(
        req.user.id as never,
        SocialPlatform.Instagram,
      ),
      this.socialAccountRepo.findByProfileAndPlatform(
        req.user.id as never,
        SocialPlatform.TikTok,
      ),
    ]);

    return accounts.filter(Boolean).map((account) => ({
      id: account!.id,
      platform: account!.platform,
      username: account!.username,
      status: account!.status,
      transport: account!.transport,
      lastSyncAt: account!.lastSyncedAt?.toISOString() || null,
      syncMessage: account!.syncMessage,
    }));
  }

  @Post('oauth/:platform/start')
  @UseGuards(AuthGuard)
  async startOAuth(
    @Req() req: { user: { id: string } },
    @Param('platform') platform: string,
  ) {
    if (platform !== 'instagram' && platform !== 'tiktok') {
      throw new BadRequestException('Plataforma inválida');
    }

    const result = await this.startOAuthUseCase.execute(
      req.user.id as never,
      platform as SocialPlatform,
    );

    return { url: result.url };
  }

  /** Callback sem AuthGuard — a plataforma redireciona sem Bearer JWT. */
  @Get('oauth/:platform/callback')
  async oauthCallback(
    @Param('platform') platform: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      return res.redirect('/conexoes?error=missing_parameters');
    }

    if (platform !== 'instagram' && platform !== 'tiktok') {
      return res.redirect('/conexoes?error=invalid_platform');
    }

    try {
      await this.oauthCallbackUseCase.execute(
        platform as SocialPlatform,
        code,
        state,
      );
      return res.redirect('/conexoes?connected=true');
    } catch (error) {
      console.error('OAuth callback error:', error);
      return res.redirect('/conexoes?error=connection_failed');
    }
  }

  @Delete('accounts/:id')
  @UseGuards(AuthGuard)
  async disconnect(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const account = await this.socialAccountRepo.findById(id as never);

    if (!account || account.profileId !== req.user.id) {
      throw new BadRequestException('Conta não encontrada');
    }

    await this.socialAccountRepo.update(id as never, {
      status: ConnectionStatus.Disconnected,
      disconnectedAt: this.clock.now(),
    });

    await this.socialAccountRepo.deleteCredentials(id as never);
  }

  @Post('accounts/:id/sync')
  @UseGuards(AuthGuard)
  async syncAccount(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const account = await this.socialAccountRepo.findById(id as never);

    if (!account || account.profileId !== req.user.id) {
      throw new BadRequestException('Conta não encontrada');
    }

    const cooldownSeconds = await this.settingsRepo.getNumber(
      'manual_sync_cooldown_seconds',
      300,
    );
    const now = this.clock.now();

    if (account.lastSyncedAt) {
      const elapsedMs = now.getTime() - account.lastSyncedAt.getTime();
      if (elapsedMs < cooldownSeconds * 1000) {
        const waitSec = Math.ceil(
          (cooldownSeconds * 1000 - elapsedMs) / 1000,
        );
        throw new HttpException(
          `Aguarde ${waitSec}s antes de solicitar nova sincronização`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    await this.syncJobRepo.enqueue({
      socialAccountId: account.id,
      priority: 200,
      scheduledAt: now,
    });

    await this.socialAccountRepo.update(account.id, {
      status: ConnectionStatus.Syncing,
    });

    return { ok: true };
  }
}
