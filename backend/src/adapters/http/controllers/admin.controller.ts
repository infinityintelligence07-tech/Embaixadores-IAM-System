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
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { uuidPipe } from '../pipes/uuid.pipe';
import {
  ExcludeContentDto,
  ReasonDto,
  RequestSyncDto,
  UpdateSettingsDto,
} from '../dto/admin.dto';
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
import { daysWithoutPosting } from '../../../domain/view-metrics';
import {
  ConnectionStatus,
  ProfileId,
  RankingCategory,
  SocialPlatform,
  SyncJobStatus,
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
    const now = this.clock.now();
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const rhythms = await this.contentRepo.summarizePosting(since);
    const rhythmByProfile = new Map(rhythms.map((item) => [item.profileId, item]));
    const users = [];

    for (const membership of memberships) {
      const profile = await this.profileRepo.findById(membership.profileId);
      if (profile && !profile.deletedAt) {
        const rhythm = rhythmByProfile.get(profile.id);
        const lastPublishedAt = rhythm?.lastPublishedAt ?? null;
        users.push({
          id: profile.id,
          email: profile.email,
          fullName: profile.fullName,
          publicName: profile.publicName,
          status: membership.status,
          role: profile.role,
          createdAt: profile.createdAt.toISOString(),
          postsLast30Days: rhythm?.postsLast30Days ?? 0,
          contentCount: rhythm?.contentCount ?? 0,
          lastPublishedAt: lastPublishedAt?.toISOString() ?? null,
          daysWithoutPosting: daysWithoutPosting(lastPublishedAt, now),
        });
      }
    }

    return users;
  }

  @Post('users/:id/approve')
  async approveUser(
    @Req() req: { user: { id: string } },
    @Param('id', uuidPipe('Pessoa inválida.')) userId: string,
  ) {
    const profile = await this.profileRepo.findById(userId as never);
    if (!profile) {
      throw new NotFoundException('Pessoa não encontrada.');
    }

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

    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.fullName,
      publicName: profile.publicName,
      status: membership.status,
      role: profile.role,
      createdAt: profile.createdAt.toISOString(),
    };
  }

  @Post('users/:id/suspend')
  async suspendUser(
    @Req() req: { user: { id: string } },
    @Param('id', uuidPipe('Pessoa inválida.')) userId: string,
    @Body() body?: ReasonDto,
  ) {
    const profile = await this.profileRepo.findById(userId as never);
    if (!profile) {
      throw new NotFoundException('Pessoa não encontrada.');
    }
    if (profile.id === req.user.id) {
      throw new BadRequestException('Você não pode suspender a sua própria conta.');
    }

    const reason = body?.reason?.trim() || 'Suspenso pela administração';
    const membership = await this.membershipRepo.suspend(
      userId as never,
      reason,
      this.clock.now(),
    );

    await this.auditRepo.append({
      actorId: req.user.id as never,
      action: 'suspend_membership',
      entityType: 'membership',
      entityId: membership.id,
      reason,
    });

    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.fullName,
      publicName: profile.publicName,
      status: membership.status,
      role: profile.role,
      createdAt: profile.createdAt.toISOString(),
    };
  }

  @Get('syncs')
  async listSyncs() {
    const jobs = await this.syncJobRepo.findRecent(50);
    const result = [];

    const names = new Map<string, string>();
    const accounts = new Map<string, Awaited<ReturnType<SocialAccountRepository['findById']>>>();
    for (const job of jobs) {
      if (!accounts.has(job.socialAccountId)) {
        accounts.set(job.socialAccountId, await this.socialAccountRepo.findById(job.socialAccountId));
      }
      const account = accounts.get(job.socialAccountId) ?? null;
      // Datas do próprio job: início quando foi reservado, fim na última atualização após concluir ou falhar
      const finished =
        job.status === SyncJobStatus.Succeeded ||
        job.status === SyncJobStatus.Failed ||
        job.status === SyncJobStatus.Cancelled;
      let publicName: string | null = null;
      if (account?.profileId) {
        if (!names.has(account.profileId)) {
          const profile = await this.profileRepo.findById(account.profileId);
          names.set(account.profileId, profile?.publicName ?? '');
        }
        publicName = names.get(account.profileId) || null;
      }
      result.push({
        id: job.id,
        profileId: account?.profileId ?? null,
        publicName,
        username: account?.username ?? null,
        platform: account?.platform ?? null,
        status: job.status,
        startedAt: job.lockedAt?.toISOString() ?? null,
        finishedAt: finished ? job.updatedAt.toISOString() : null,
        errorMessage: job.lastError ?? null,
      });
    }

    return result;
  }

  @Post('syncs')
  async requestSync(
    @Req() req: { user: { id: string } },
    @Body() body: RequestSyncDto,
  ) {
    const account = await this.socialAccountRepo.findByProfileAndPlatform(
      body.userId as never,
      body.platform as SocialPlatform,
    );

    if (!account) {
      throw new NotFoundException('Essa pessoa não tem conta conectada nessa rede.');
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
    @Param('id', uuidPipe('Conteúdo inválido.')) contentId: string,
    @Body() body: ExcludeContentDto,
  ) {
    if (!body.reason.trim()) {
      throw new BadRequestException('Informe a justificativa da exclusão.');
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
      10,
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
    @Body() body: UpdateSettingsDto,
  ) {
    // O intervalo de coleta é fixo (SYNC_INTERVAL_MINUTES); o DTO só aceita o valor atual.

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
      metadata: {
        staleToleranceHours: body.staleToleranceHours,
        manualSyncCooldownSeconds: body.manualSyncCooldownSeconds,
      },
    });

    return this.getSettings();
  }

  @Get('audit')
  async getAuditLogs() {
    const logs = await this.auditRepo.findRecent(100);
    const names = new Map<string, string | null>();
    const nameOf = async (id: string | null): Promise<string | null> => {
      if (!id) return null;
      if (!names.has(id)) {
        const profile = await this.profileRepo.findById(id as ProfileId);
        names.set(id, profile?.publicName ?? null);
      }
      return names.get(id) ?? null;
    };

    const entityNameOf = async (log: { entityType: string; entityId: string | null }) => {
      if (!log.entityId) return null;
      if (log.entityType === 'profile' || log.entityType === 'membership') {
        return nameOf(log.entityId);
      }
      if (log.entityType === 'social_account') {
        const account = await this.socialAccountRepo.findById(log.entityId as never);
        if (!account) return null;
        const platform = account.platform === SocialPlatform.Instagram ? 'Instagram' : 'TikTok';
        const owner = await nameOf(account.profileId);
        return account.username
          ? `${platform} @${account.username}${owner ? ` de ${owner}` : ''}`
          : `${platform}${owner ? ` de ${owner}` : ''}`;
      }
      return null;
    };

    const result = [];
    for (const log of logs) {
      result.push({
        id: log.id,
        action: log.action,
        actorId: log.actorId,
        actorName: await nameOf(log.actorId),
        entityType: log.entityType,
        entityId: log.entityId,
        entityName: await entityNameOf(log),
        reason: log.reason,
        createdAt: log.createdAt.toISOString(),
      });
    }
    return result;
  }
}
