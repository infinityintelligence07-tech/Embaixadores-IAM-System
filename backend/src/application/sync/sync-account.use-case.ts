import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { SocialPlatform, SocialAccountId, SyncJobStatus, ConnectionStatus } from '../../domain/types';
import { SocialAccount, SyncJob, SyncRun } from '../../domain/entities';
import {
  SocialAccountRepository,
  SyncJobRepository,
  ContentRepository,
  MetricsRepository,
  UpsertContentInput,
} from '../../ports/repositories.port';
import {
  SocialMetricsProvider,
  SocialCredentials,
  SocialAuthError,
  SocialRateLimitError,
  SocialContentItem,
} from '../../ports/social-metrics.port';
import { TokenEncryptionPort } from '../../ports/tokens.port';
import { ClockPort } from '../../ports/clock.port';
import { INJECTION_TOKENS } from '../../infrastructure/tokens/injection-tokens';

const MAX_PAGES = 100; // Safety limit per run
const SNAPSHOT_MIN_INTERVAL_MS = 60 * 60 * 1000; // Skip duplicate snapshots within 1 hour
const RATE_LIMIT_BACKOFF_MS = 30 * 60 * 1000; // At least 30 minutes
const ASSUMED_TOKEN_LIFETIME_MS = 60 * 60 * 1000; // Credentials without expiresAt

const MESSAGES = {
  authExpired: 'A autorização expirou. Conecte a conta de novo para voltar ao ranking.',
  rateLimited: 'A rede limitou as consultas. A coleta continua em breve.',
  failed: 'A coleta falhou. Tente sincronizar de novo.',
  emptyComplete: 'Coleta concluída. Nenhum conteúdo encontrado ainda.',
  complete: (total: number) => `Coleta concluída. ${total} conteúdos.`,
  partial: (total: number) => `Coleta parcial. ${total} conteúdos até agora.`,
};

/**
 * Syncs a social account: fetches all content with pagination,
 * stores metrics snapshots, updates sync coverage, and handles failures gracefully.
 * 
 * CRITICAL: Never overwrites valid latest_views with null on API failure.
 */
@Injectable()
export class SyncAccountUseCase {
  private readonly logger = new Logger(SyncAccountUseCase.name);
  
  constructor(
    @Inject(INJECTION_TOKENS.CLOCK)
    private readonly clock: ClockPort,
    @Inject(INJECTION_TOKENS.TOKEN_ENCRYPTION)
    private readonly encryption: TokenEncryptionPort,
    @Inject(INJECTION_TOKENS.SOCIAL_PROVIDER_FACTORY)
    private readonly providerFactory: any,
    @Inject(INJECTION_TOKENS.SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccountRepo: SocialAccountRepository,
    @Inject(INJECTION_TOKENS.SYNC_JOB_REPOSITORY)
    private readonly syncJobRepo: SyncJobRepository,
    @Inject(INJECTION_TOKENS.CONTENT_REPOSITORY)
    private readonly contentRepo: ContentRepository,
    @Inject(INJECTION_TOKENS.METRICS_REPOSITORY)
    private readonly metricsRepo: MetricsRepository,
  ) {}
  
  async execute(jobId: string): Promise<void> {
    const job = await this.syncJobRepo.findById(jobId as any);
    if (!job) {
      throw new NotFoundException('Coleta não encontrada.');
    }
    
    const account = await this.socialAccountRepo.findById(job.socialAccountId);
    if (!account) {
      throw new NotFoundException('Conta não encontrada.');
    }
    
    const now = this.clock.now();
    
    // Create sync run
    const run = await this.syncJobRepo.createRun({
      syncJobId: job.id,
      socialAccountId: account.id,
      startedAt: now,
    });

    let totalFetched = 0;
    let totalUpserted = 0;
    
    try {
      // Get credentials
      const creds = await this.socialAccountRepo.getDecryptedCredentials(account.id);
      if (!creds) {
        throw new Error('No credentials found for account');
      }
      
      // Get provider
      const provider: SocialMetricsProvider = this.providerFactory.getProvider(
        account.platform,
        account.transport,
      );

      // May throw SocialAuthError when the platform rejects the refresh.
      const freshCreds = await this.refreshIfNeeded(account.platform, account.id, provider, creds);
      
      // Update account status
      await this.socialAccountRepo.update(account.id, {
        status: ConnectionStatus.Syncing,
      });
      
      let cursor: string | null = 
        (job.checkpoint && typeof job.checkpoint === 'object' && 'cursor' in job.checkpoint)
          ? (job.checkpoint as any).cursor || null
          : null;
      const resumedFromCheckpoint = cursor !== null;
      const seenPlatformIds = new Set<string>();
      let pagesFetched = 0;
      let completed = false;
      
      // Fetch all content with pagination
      while (pagesFetched < MAX_PAGES) {
        const page = await provider.listContents(freshCreds, cursor);
        pagesFetched++;
        
        for (const item of page.items) {
          seenPlatformIds.add(item.platformContentId);
          await this.storeItem(account, run, item, now);
          totalUpserted++;
        }
        
        totalFetched += page.items.length;
        
        if (!page.nextCursor) {
          completed = true;
          break;
        }
        
        cursor = page.nextCursor;
        
        // Update checkpoint
        await this.syncJobRepo.update(job.id, {
          checkpoint: { cursor, totalFetched, totalUpserted },
        });
      }

      // Deleted posts: only after a full pass that started from the first
      // page, otherwise a partial run would mark everything as removed.
      if (completed && !resumedFromCheckpoint && totalFetched > 0) {
        await this.markMissingAsRemoved(account.id, seenPlatformIds);
      }
      
      // Fetch account metrics
      try {
        const accountMetrics = await provider.getAccountMetrics(freshCreds);
        await this.metricsRepo.insertAccountSnapshot({
          socialAccountId: account.id,
          collectedAt: now,
          officialViews: accountMetrics.officialViews,
          availability: accountMetrics.availability as any,
          periodLabel: accountMetrics.periodLabel,
          definitionLabel: accountMetrics.definitionLabel,
          source: `${account.platform}_${account.transport}`,
          syncRunId: run.id,
        });
      } catch (error) {
        if (error instanceof SocialAuthError) throw error;
        this.logger.warn(`Failed to fetch account metrics: ${error}`);
      }
      
      // Coverage: 1.0 when pagination finished (zero posts is full coverage
      // too); otherwise the fraction of the page budget we managed to read.
      const coverageRatio = completed
        ? 1.0
        : Math.min(pagesFetched / MAX_PAGES, 0.99);
      
      // Finish run
      await this.syncJobRepo.finishRun(run.id, {
        status: SyncJobStatus.Succeeded,
        finishedAt: this.clock.now(),
        itemsFetched: totalFetched,
        itemsUpserted: totalUpserted,
        coverageRatio,
        metadata: { pagesFetched, completed, resumedFromCheckpoint },
      });
      
      // Update job
      await this.syncJobRepo.update(job.id, {
        status: SyncJobStatus.Succeeded,
      });
      
      // Update account
      let syncMessage: string;
      if (!completed) {
        syncMessage = MESSAGES.partial(totalFetched);
      } else if (totalFetched === 0) {
        syncMessage = MESSAGES.emptyComplete;
      } else {
        syncMessage = MESSAGES.complete(totalFetched);
      }

      await this.socialAccountRepo.update(account.id, {
        status: ConnectionStatus.Connected,
        lastSyncedAt: now,
        lastSuccessfulSyncAt: now,
        syncCoverageRatio: coverageRatio,
        syncMessage,
      });
      
      this.logger.log(
        `Sync completed: ${account.platform} account ${account.id}, fetched ${totalFetched} items in ${pagesFetched} pages (completed=${completed})`,
      );
    } catch (error) {
      if (error instanceof SocialAuthError) {
        await this.handleAuthExpired(job, run, account, error);
        return;
      }

      if (error instanceof SocialRateLimitError) {
        await this.handleRateLimited(job, run, account, error, now);
        return;
      }

      this.logger.error(`Sync failed: ${error}`, error instanceof Error ? error.stack : undefined);
      
      // Calculate backoff
      const baseDelay = 60000; // 1 minute
      const jitter = Math.random() * 30000; // 0-30 seconds
      const backoffDelay = baseDelay * Math.pow(2, job.attempts) + jitter;
      const nextAttemptAt = new Date(now.getTime() + backoffDelay);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Finish run with failure
      await this.syncJobRepo.finishRun(run.id, {
        status: SyncJobStatus.Failed,
        finishedAt: this.clock.now(),
        itemsFetched: totalFetched,
        itemsUpserted: totalUpserted,
        coverageRatio: null,
        errorMessage,
      });
      
      // Update job
      const newStatus =
        job.attempts >= job.maxAttempts ? SyncJobStatus.Failed : SyncJobStatus.Pending;
      
      await this.syncJobRepo.update(job.id, {
        status: newStatus,
        lastError: errorMessage,
        nextAttemptAt: newStatus === SyncJobStatus.Pending ? nextAttemptAt : null,
      });
      
      // Update account
      await this.socialAccountRepo.update(account.id, {
        status: ConnectionStatus.Connected,
        lastSyncedAt: now,
        syncMessage: MESSAGES.failed,
      });
      
      throw error;
    }
  }

  /**
   * Upserts the content and records a metric snapshot. The snapshot is
   * skipped when the views are unchanged and the previous snapshot is less
   * than an hour old, so the metrics table does not grow with duplicates.
   * The content row (latest_views, latest_views_collected_at) is always updated.
   */
  private async storeItem(
    account: SocialAccount,
    run: SyncRun,
    item: SocialContentItem,
    now: Date,
  ): Promise<void> {
    const input: UpsertContentInput = {
      socialAccountId: account.id,
      platform: account.platform,
      platformContentId: item.platformContentId,
      title: item.title,
      thumbnailUrl: item.thumbnailUrl,
      permalink: item.permalink,
      publishedAt: item.publishedAt,
      mediaType: item.mediaType,
      latestViews: item.views,
      latestViewsCollectedAt: item.views !== null ? now : null,
    };
    
    const content = await this.contentRepo.upsert(input);
    
    if (!item.viewsAvailable) return;

    const latest = await this.metricsRepo.getLatestContentSnapshot(content.id);
    if (
      latest &&
      latest.views === item.views &&
      now.getTime() - latest.collectedAt.getTime() < SNAPSHOT_MIN_INTERVAL_MS
    ) {
      return;
    }

    await this.metricsRepo.insertContentSnapshot({
      contentId: content.id,
      collectedAt: now,
      views: item.views,
      viewsAvailable: true,
      source: `${account.platform}_${account.transport}`,
      syncRunId: run.id,
    });
  }

  private async markMissingAsRemoved(
    accountId: SocialAccountId,
    seenPlatformIds: Set<string>,
  ): Promise<void> {
    const stored = await this.contentRepo.findEligibleByAccount(accountId);
    const missing = stored.filter((content) => !seenPlatformIds.has(content.platformContentId));
    for (const content of missing) {
      await this.contentRepo.markRemoved(content.id);
    }
    if (missing.length > 0) {
      this.logger.log(`Marked ${missing.length} contents as removed for account ${accountId}`);
    }
  }

  private async handleAuthExpired(
    job: SyncJob,
    run: SyncRun,
    account: SocialAccount,
    error: SocialAuthError,
  ): Promise<void> {
    this.logger.warn(
      `Authorization expired for ${account.platform} account ${account.id} (code=${error.code ?? '-'})`,
    );

    await this.syncJobRepo.finishRun(run.id, {
      status: SyncJobStatus.Failed,
      finishedAt: this.clock.now(),
      itemsFetched: 0,
      itemsUpserted: 0,
      coverageRatio: null,
      errorMessage: error.message,
    });

    // No further retries: the user has to reconnect.
    await this.syncJobRepo.update(job.id, {
      status: SyncJobStatus.Failed,
      attempts: Math.max(job.attempts, job.maxAttempts),
      nextAttemptAt: null,
      lastError: error.message,
    });

    await this.socialAccountRepo.update(account.id, {
      status: ConnectionStatus.AuthorizationExpired,
      lastSyncedAt: this.clock.now(),
      syncMessage: MESSAGES.authExpired,
    });
  }

  private async handleRateLimited(
    job: SyncJob,
    run: SyncRun,
    account: SocialAccount,
    error: SocialRateLimitError,
    now: Date,
  ): Promise<void> {
    this.logger.warn(
      `Rate limited on ${account.platform} account ${account.id} (code=${error.code ?? '-'})`,
    );

    // Longer backoff than regular failures: at least 30 minutes, growing
    // with the attempt count plus jitter.
    const jitter = Math.random() * 5 * 60 * 1000;
    const backoffDelay = RATE_LIMIT_BACKOFF_MS * Math.max(1, job.attempts) + jitter;
    const nextAttemptAt = new Date(now.getTime() + backoffDelay);

    await this.syncJobRepo.finishRun(run.id, {
      status: SyncJobStatus.Failed,
      finishedAt: this.clock.now(),
      itemsFetched: 0,
      itemsUpserted: 0,
      coverageRatio: null,
      errorMessage: error.message,
    });

    const exhausted = job.attempts >= job.maxAttempts;
    await this.syncJobRepo.update(job.id, {
      status: exhausted ? SyncJobStatus.Failed : SyncJobStatus.Pending,
      nextAttemptAt: exhausted ? null : nextAttemptAt,
      lastError: error.message,
    });

    await this.socialAccountRepo.update(account.id, {
      status: ConnectionStatus.Connected,
      lastSyncedAt: now,
      syncMessage: MESSAGES.rateLimited,
    });
  }

  private async refreshIfNeeded(
    platform: SocialPlatform,
    accountId: SocialAccountId,
    provider: SocialMetricsProvider,
    creds: SocialCredentials,
  ): Promise<SocialCredentials> {
    if (!provider.refreshCredentials) return creds;

    const nowMs = this.clock.now().getTime();
    // Credentials without a known expiry are treated as short-lived (1 hour)
    // so a refresh is attempted instead of silently running with a stale token.
    const expiresAtMs = creds.expiresAt
      ? creds.expiresAt.getTime()
      : nowMs + ASSUMED_TOKEN_LIFETIME_MS;

    const leadMs =
      platform === SocialPlatform.TikTok
        ? 2 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;
    if (expiresAtMs - nowMs > leadMs) {
      return creds;
    }

    try {
      const next = await provider.refreshCredentials(creds);
      await this.socialAccountRepo.saveCredentials(accountId, {
        socialAccountId: accountId,
        accessTokenCiphertext: await this.encryption.encrypt(next.accessToken),
        refreshTokenCiphertext: next.refreshToken
          ? await this.encryption.encrypt(next.refreshToken)
          : null,
        tokenExpiresAt: next.expiresAt || null,
        refreshExpiresAt: next.refreshExpiresAt || null,
        scopes: next.scopes,
        encryptionKid: 'default',
      });
      return next;
    } catch (error) {
      // The platform rejected the token itself: stop here and ask to reconnect.
      if (error instanceof SocialAuthError) throw error;
      this.logger.warn(`Token refresh failed: ${error}`);
      return creds;
    }
  }
}
