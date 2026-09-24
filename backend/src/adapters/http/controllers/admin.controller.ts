import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { AdminGuard } from '../guards/admin.guard';
import {
  ProfileRepository,
  MembershipRepository,
  ContentRepository,
  AuditRepository,
  SettingsRepository,
  SyncJobRepository,
  SocialAccountRepository,
} from '../../../ports/repositories.port';
import { ClockPort } from '../../../ports/clock.port';
import { INJECTION_TOKENS } from '../../../infrastructure/tokens/injection-tokens';
import { ComputeAndPublishRankingUseCase } from '../../../application/rankings/compute-and-publish.use-case';
import {
  ConnectionStatus,
  RankingCategory,
  SocialPlatform,
} from '../../../domain/types';

@Controller('api/admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(
    @Inject(INJECTION_TOKENS.CLOCK)
    private readonly clock: ClockPort,
    @Inject(INJECTION_TOKENS.PROFILE_REPOSITORY)
    private readonly profileRepo: ProfileRepository,
    @Inject(INJECTION_TOKENS.MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: MembershipRepository,
    @Inject(INJECTION_TOKENS.CONTENT_REPOSITORY)
    private readonly contentRepo: ContentRepository,
    @Inject(INJECTION_TOKENS.AUDIT_REPOSITORY)
    private readonly auditRepo: AuditRepository,
    @Inject(INJECTION_TOKENS.SETTINGS_REPOSITORY)
    private readonly settingsRepo: SettingsRepository,
    @Inject(INJECTION_TOKENS.SYNC_JOB_REPOSITORY)
    private readonly syncJobRepo: SyncJobRepository,
    @Inject(INJECTION_TOKENS.SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccountRepo: SocialAccountRepository,
    private readonly computeRankingUseCase: ComputeAndPublishRankingUseCase,
  ) {}

  @Get('users')
  async listUsers() {
    const memberships = await this.membershipRepo.findAll();
    const users = [];

    for (const membership of memberships) {
      const profile = await this.profileRepo.findById(membership.profileId);
      if (profile && !profile.deletedAt) {
        users.push({
          id: profile.id,
          email: profile.email,
          fullName: profile.fullName,
          publicName: profile.publicName,
          status: membership.status,
          role: profile.role,
          createdAt: profile.createdAt.toISOString(),
        });
      }
    }

    return users;
  }

  @Post('users/:id/approve')
  async approveUser(
    @Req() req: { user: { id: string } },
    @Param('id') userId: string,
  ) {
    const membership = await this.membershipRepo.approve(
      userId as never,
      req.user.id as never,
      this.clock.now(),
    );

    await this.auditRepo.append({
      actorId: req.user.id as never,
      action: 'approve_membership',
      entityType: 'membership',
      entityId: membership.id,
    });

    const profile = await this.profileRepo.findById(userId as never);

    return {
      id: profile!.id,
      email: profile!.email,
      fullName: profile!.fullName,
      publicName: profile!.publicName,
      status: membership.status,
      role: profile!.role,
      createdAt: profile!.createdAt.toISOString(),
    };
  }

  @Post('users/:id/suspend')
  async suspendUser(
    @Req() req: { user: { id: string } },
    @Param('id') userId: string,
    @Body() body?: { reason?: string },
  ) {
    const membership = await this.membershipRepo.suspend(
      userId as never,
      body?.reason || 'Suspenso pela administração',
      this.clock.now(),
    );

    await this.auditRepo.append({
      actorId: req.user.id as never,
      action: 'suspend_membership',
      entityType: 'membership',
      entityId: membership.id,
      reason: body?.reason || 'Suspenso pela administração',
    });

    const profile = await this.profileRepo.findById(userId as never);

    return {
      id: profile!.id,
      email: profile!.email,
      fullName: profile!.fullName,
      publicName: profile!.publicName,
      status: membership.status,
      role: profile!.role,
      createdAt: profile!.createdAt.toISOString(),
    };
  }

  @Get('syncs')
  async listSyncs() {
    const jobs = await this.syncJobRepo.findRecent(50);
    const result = [];

    for (const job of jobs) {
      const account = await this.socialAccountRepo.findById(job.socialAccountId);
      const run = await this.syncJobRepo.findLatestRunByAccount(job.socialAccountId);
      result.push({
        id: job.id,
        profileId: account?.profileId ?? null,
        platform: account?.platform ?? null,
        status: job.status,
        startedAt: run?.startedAt?.toISOString() ?? job.lockedAt?.toISOString() ?? null,
        finishedAt: run?.finishedAt?.toISOString() ?? null,
        errorMessage: job.lastError ?? run?.errorMessage ?? null,
      });
    }

    return result;
  }

  @Post('syncs')
  async requestSync(
    @Req() req: { user: { id: string } },
    @Body() body: { userId: string; platform: string },
  ) {
    if (body.platform !== 'instagram' && body.platform !== 'tiktok') {
      throw new BadRequestException('Plataforma inválida');
    }

    const account = await this.socialAccountRepo.findByProfileAndPlatform(
      body.userId as never,
      body.platform as SocialPlatform,
    );

    if (!account) {
      throw new BadRequestException('Conta social não encontrada');
    }

    const job = await this.syncJobRepo.enqueue({
      socialAccountId: account.id,
      priority: 300,
      scheduledAt: this.clock.now(),
    });

    await this.socialAccountRepo.update(account.id, {
      status: ConnectionStatus.Syncing,
    });

    await this.auditRepo.append({
      actorId: req.user.id as never,
      action: 'request_sync',
      entityType: 'social_account',
      entityId: account.id,
      metadata: { platform: body.platform, profileId: body.userId },
    });

    return {
      id: job.id,
      profileId: account.profileId,
      platform: account.platform,
      status: job.status,
      startedAt: null,
      finishedAt: null,
      errorMessage: null,
    };
  }

  @Post('contents/:id/exclude')
  async excludeContent(
    @Req() req: { user: { id: string } },
    @Param('id') contentId: string,
    @Body() body: { reason: string },
  ) {
    if (!body?.reason?.trim()) {
      throw new BadRequestException('Justificativa obrigatória');
    }

    const content = await this.contentRepo.exclude(
      contentId as never,
      body.reason,
      req.user.id as never,
      this.clock.now(),
    );

    await this.auditRepo.append({
      actorId: req.user.id as never,
      action: 'exclude_content',
      entityType: 'content',
      entityId: contentId,
      reason: body.reason,
    });

    return {
      id: content.id,
      platform: content.platform,
      title: content.title || 'Sem título',
      url: content.permalink || '',
      views: content.latestViews || 0,
      publishedAt: content.publishedAt?.toISOString() || '',
      thumbnailUrl: content.thumbnailUrl,
      excluded: true,
    };
  }

  @Post('rankings/recalculate')
  async recalculateRankings(@Req() req: { user: { id: string } }) {
    for (const platform of [SocialPlatform.Instagram, SocialPlatform.TikTok]) {
      for (const category of [
        RankingCategory.TotalViews,
        RankingCategory.BestVideo,
      ]) {
        await this.computeRankingUseCase.execute(platform, category);
      }
    }

    await this.auditRepo.append({
      actorId: req.user.id as never,
      action: 'recalculate_rankings',
      entityType: 'ranking',
    });

    return { ok: true };
  }

  @Get('settings')
  async getSettings() {
    const syncIntervalMinutes = await this.settingsRepo.getNumber(
      'sync_interval_minutes',
      60,
    );
    const staleToleranceHours = await this.settingsRepo.getNumber(
      'stale_tolerance_hours',
      24,
    );
    const manualSyncCooldownSeconds = await this.settingsRepo.getNumber(
      'manual_sync_cooldown_seconds',
      300,
    );

    return {
      syncIntervalMinutes,
      staleToleranceHours,
      manualSyncCooldownSeconds,
    };
  }

  @Patch('settings')
  async updateSettings(
    @Req() req: { user: { id: string } },
    @Body()
    body: Partial<{
      syncIntervalMinutes: number;
      staleToleranceHours: number;
      manualSyncCooldownSeconds: number;
    }>,
  ) {
    if (body.syncIntervalMinutes !== undefined) {
      await this.settingsRepo.set(
        'sync_interval_minutes',
        body.syncIntervalMinutes,
        req.user.id as never,
      );
    }

    if (body.staleToleranceHours !== undefined) {
      await this.settingsRepo.set(
        'stale_tolerance_hours',
        body.staleToleranceHours,
        req.user.id as never,
      );
    }

    if (body.manualSyncCooldownSeconds !== undefined) {
      await this.settingsRepo.set(
        'manual_sync_cooldown_seconds',
        body.manualSyncCooldownSeconds,
        req.user.id as never,
      );
    }

    await this.auditRepo.append({
      actorId: req.user.id as never,
      action: 'update_settings',
      entityType: 'settings',
      metadata: body,
    });

    return this.getSettings();
  }

  @Get('audit')
  async getAuditLogs() {
    const logs = await this.auditRepo.findRecent(100);

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      actorId: log.actorId,
      entityType: log.entityType,
      entityId: log.entityId,
      reason: log.reason,
      createdAt: log.createdAt.toISOString(),
    }));
  }
}
