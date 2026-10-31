import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import {
  SocialPlatform,
  SocialAccountId,
  SyncJobStatus,
  ConnectionStatus,
  SocialTransport,
} from '../../domain/types';
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
  SocialProfileNotFoundError,
  SocialRateLimitError,
  SocialContentItem,
} from '../../ports/social-metrics.port';
import { TokenEncryptionPort } from '../../ports/tokens.port';
import { ClockPort } from '../../ports/clock.port';
import { INJECTION_TOKENS } from '../../infrastructure/tokens/injection-tokens';
import { ThumbnailCacheService } from '../../infrastructure/media/thumbnail-cache.service';

// Cada página lida custa um crédito no fornecedor de dados. 20 páginas cobrem centenas de
// vídeos; perfis maiores que isso param aqui em vez de esvaziar o saldo.
const MAX_PAGES = 20;
const SNAPSHOT_MIN_INTERVAL_MS = 60 * 60 * 1000; // Skip duplicate snapshots within 1 hour
const RATE_LIMIT_BACKOFF_MS = 30 * 60 * 1000; // At least 30 minutes
const ASSUMED_TOKEN_LIFETIME_MS = 60 * 60 * 1000; // Credentials without expiresAt
/** Com MAX_CONTINUATIONS acima de zero, contas maiores seguem em rodadas seguidas a partir do cursor salvo. */
const CONTINUE_DELAY_MS = 60 * 1000;
const MAX_CONTINUATIONS = 0;

interface RunCounters {
  itemsFetched: number;
  itemsUpserted: number;
}

const MESSAGES = {
  authExpired: 'A autorização expirou. Conecte a conta de novo para voltar ao ranking.',
  rateLimited: 'A rede limitou as consultas. A coleta continua em breve.',
  failed: 'A coleta falhou. Tente sincronizar de novo.',
  notFound: (network: string, handle: string | null) =>
    `Não encontramos ${handle ? `@${handle.replace(/^@+/, '')}` : 'a conta'} no ${network}. Se você trocou o @, informe o novo em Conexões.`,
  emptyComplete: 'Coleta concluída. Nenhum conteúdo encontrado ainda.',
  complete: (total: number) => `Coleta concluída. ${total} conteúdos.`,
  partial: (total: number) => `Coleta parcial. ${total} conteúdos até agora.`,
};

function networkName(platform: SocialPlatform): string {
  return platform === SocialPlatform.Instagram ? 'Instagram' : 'TikTok';
}

/** A coleta perdeu a vez: o job foi cancelado, reassumido por outro worker ou a conta mudou. */
class SyncSupersededError extends Error {
  constructor() {
    super('Coleta interrompida: a conta mudou ou outra coleta assumiu.');
    this.name = 'SyncSupersededError';
  }
}

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
    private readonly thumbnails: ThumbnailCacheService,
  ) {}
  
  async execute(jobId: string): Promise<void> {
    const job = await this.syncJobRepo.findById(jobId as any);
    if (!job) {
      throw new NotFoundException('Coleta não encontrada.');
    }
    
    const account = await this.socialAccountRepo.findById(job.socialAccountId);
    if (!account) {
      // claimNext already marked the job as running; close it so it is not
      // reclaimed forever for an account that no longer exists.
      await this.syncJobRepo.update(job.id, {
        status: SyncJobStatus.Cancelled,
        nextAttemptAt: null,
        lastError: 'Conta desconectada antes da coleta.',
      });
      throw new NotFoundException('Conta não encontrada.');
    }

    // Sem a confirmação pela bio a conta não é coletada; uma falha aqui a marcaria como conectada.
    if (account.transport === SocialTransport.PublicApi && !account.verifiedAt) {
      await this.syncJobRepo.update(job.id, {
        status: SyncJobStatus.Cancelled,
        nextAttemptAt: null,
        lastError: 'Conta aguardando confirmação pela bio.',
      });
      return;
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
      const creds = await this.loadCredentials(account);
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
      
      const checkpoint =
        job.checkpoint && typeof job.checkpoint === 'object'
          ? (job.checkpoint as Record<string, unknown>)
          : null;
      let cursor: string | null =
        checkpoint && typeof checkpoint.cursor === 'string' && checkpoint.cursor
          ? checkpoint.cursor
          : null;
      const resumedFromCheckpoint = cursor !== null;
      const continuations = resumedFromCheckpoint ? Number(checkpoint?.continuations) || 0 : 0;
      if (resumedFromCheckpoint) {
        // Carry the counters of the interrupted run so the final message
        // reflects everything collected, not only the pages after resume.
        totalFetched = Number(checkpoint?.totalFetched) || 0;
        totalUpserted = Number(checkpoint?.totalUpserted) || 0;
      }
      const seenPlatformIds = new Set<string>();
      let pagesFetched = 0;
      let completed = false;
      let reachedEnd = false;
      
      // Fetch all content with pagination
      while (pagesFetched < MAX_PAGES) {
        const page = await provider.listContents(freshCreds, cursor);
        pagesFetched++;
        await this.assertStillOwned(job, account);
        
        for (const item of page.items) {
          seenPlatformIds.add(item.platformContentId);
          await this.storeItem(account, run, item, now);
          totalUpserted++;
        }
        
        totalFetched += page.items.length;
        
        if (!page.nextCursor) {
          completed = true;
          reachedEnd = true;
          break;
        }
        
        cursor = page.nextCursor;
        
        // Checkpoint e lock renovado: sem isso, uma coleta longa passaria de 30 minutos
        // e outro worker reassumiria o mesmo job em paralelo.
        await this.syncJobRepo.update(job.id, {
          checkpoint: { cursor, totalFetched, totalUpserted, continuations },
          lockedAt: this.clock.now(),
        });
      }

      // Conta enorme: depois de algumas rodadas seguidas, o que já foi lido basta para classificar.
      const continueLater = !completed && cursor !== null && continuations < MAX_CONTINUATIONS;
      if (!completed && !continueLater) {
        this.logger.warn(
          `Account ${account.id} still has pages after ${continuations} continuations; treating as complete`,
        );
        completed = true;
      }

      // Deleted posts: only after a full pass that started from the first
      // page, otherwise a partial run would mark everything as removed.
      if (reachedEnd && !resumedFromCheckpoint && totalFetched > 0) {
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

      await this.assertStillOwned(job, account);
      
      // Finish run
      await this.syncJobRepo.finishRun(run.id, {
        status: SyncJobStatus.Succeeded,
        finishedAt: this.clock.now(),
        itemsFetched: totalFetched,
        itemsUpserted: totalUpserted,
        coverageRatio,
        metadata: { pagesFetched, completed, resumedFromCheckpoint },
      });
      
      // Update job: a conta com mais páginas continua daqui a pouco, do cursor salvo.
      if (continueLater) {
        await this.syncJobRepo.update(job.id, {
          status: SyncJobStatus.Pending,
          checkpoint: { cursor, totalFetched, totalUpserted, continuations: continuations + 1 },
          attempts: 0,
          lockedAt: null,
          lockedBy: null,
          nextAttemptAt: new Date(this.clock.now().getTime() + CONTINUE_DELAY_MS),
        });
      } else {
        await this.syncJobRepo.update(job.id, {
          status: SyncJobStatus.Succeeded,
        });
      }
      
      // Update account
      let syncMessage: string;
      if (!completed) {
        syncMessage = MESSAGES.partial(totalFetched);
      } else if (totalFetched === 0) {
        syncMessage = MESSAGES.emptyComplete;
      } else {
        syncMessage = MESSAGES.complete(totalFetched);
      }

      // Enquanto as rodadas seguintes leem o resto, uma conta que já tinha cobertura completa
      // não sai do ranking por causa da rodada parcial.
      const keepPreviousCoverage =
        !completed && (account.syncCoverageRatio ?? 0) >= 0.99;

      await this.socialAccountRepo.update(account.id, {
        status: ConnectionStatus.Connected,
        lastSyncedAt: now,
        lastSuccessfulSyncAt: now,
        ...(keepPreviousCoverage ? {} : { syncCoverageRatio: coverageRatio }),
        syncMessage,
      });
      
      this.logger.log(
        `Sync completed: ${account.platform} account ${account.id}, fetched ${totalFetched} items in ${pagesFetched} pages (completed=${completed})`,
      );
    } catch (error) {
      const counters = { itemsFetched: totalFetched, itemsUpserted: totalUpserted };

      // Um job cancelado (conta desconectada ou @ trocado) não pode voltar à fila nem
      // devolver a conta para "conectada" ao registrar a própria falha.
      const superseded =
        error instanceof SyncSupersededError || !(await this.isStillOwned(job, account));
      if (superseded) {
        const reason = new SyncSupersededError().message;
        this.logger.warn(`Sync ${job.id} for account ${account.id} stopped: ${reason}`);
        await this.syncJobRepo.finishRun(run.id, {
          status: SyncJobStatus.Cancelled,
          finishedAt: this.clock.now(),
          itemsFetched: totalFetched,
          itemsUpserted: totalUpserted,
          coverageRatio: null,
          errorMessage: reason,
        });
        return;
      }

      if (error instanceof SocialAuthError) {
        await this.handleAuthExpired(job, run, account, error, counters);
        return;
      }

      if (error instanceof SocialRateLimitError) {
        await this.handleRateLimited(job, run, account, error, now, counters);
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
      
      // @ apagado ou trocado: a pessoa precisa saber o que fazer, não só que falhou.
      const userMessage =
        error instanceof SocialProfileNotFoundError
          ? MESSAGES.notFound(networkName(account.platform), account.username)
          : MESSAGES.failed;

      // lastError is shown in the admin UI: keep it in Portuguese. The
      // technical message stays in the logs and in sync_runs.error_message.
      await this.syncJobRepo.update(job.id, {
        status: newStatus,
        lastError: userMessage,
        nextAttemptAt: newStatus === SyncJobStatus.Pending ? nextAttemptAt : null,
      });
      
      // Update account
      await this.socialAccountRepo.update(account.id, {
        status: ConnectionStatus.Connected,
        lastSyncedAt: now,
        syncMessage: userMessage,
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
    this.thumbnails.warm(content.id, item.thumbnailUrl);
    
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

  private async isStillOwned(job: SyncJob, account: SocialAccount): Promise<boolean> {
    try {
      const [currentJob, currentAccount] = await Promise.all([
        this.syncJobRepo.findById(job.id),
        this.socialAccountRepo.findById(account.id),
      ]);
      if (!currentJob || currentJob.status !== SyncJobStatus.Running) return false;
      if (job.lockedBy && currentJob.lockedBy && currentJob.lockedBy !== job.lockedBy) return false;
      if (!currentAccount) return false;
      return (
        currentAccount.platformUserId === account.platformUserId &&
        currentAccount.transport === account.transport
      );
    } catch (error) {
      // Sem como conferir (banco instável), segue o fluxo normal de falha.
      this.logger.warn(`Could not confirm sync ownership for job ${job.id}: ${error}`);
      return true;
    }
  }

  private async assertStillOwned(job: SyncJob, account: SocialAccount): Promise<void> {
    if (!(await this.isStillOwned(job, account))) throw new SyncSupersededError();
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
    counters: RunCounters,
  ): Promise<void> {
    this.logger.warn(
      `Authorization expired for ${account.platform} account ${account.id} (code=${error.code ?? '-'}): ${error.message}`,
    );

    await this.syncJobRepo.finishRun(run.id, {
      status: SyncJobStatus.Failed,
      finishedAt: this.clock.now(),
      itemsFetched: counters.itemsFetched,
      itemsUpserted: counters.itemsUpserted,
      coverageRatio: null,
      errorMessage: error.message,
    });

    // No further retries: the user has to reconnect.
    await this.syncJobRepo.update(job.id, {
      status: SyncJobStatus.Failed,
      attempts: Math.max(job.attempts, job.maxAttempts),
      nextAttemptAt: null,
      lastError: MESSAGES.authExpired,
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
    counters: RunCounters,
  ): Promise<void> {
    this.logger.warn(
      `Rate limited on ${account.platform} account ${account.id} (code=${error.code ?? '-'}): ${error.message}`,
    );

    // Longer backoff than regular failures: at least 30 minutes, growing
    // with the attempt count plus jitter.
    const jitter = Math.random() * 5 * 60 * 1000;
    const backoffDelay = RATE_LIMIT_BACKOFF_MS * Math.max(1, job.attempts) + jitter;
    const nextAttemptAt = new Date(now.getTime() + backoffDelay);

    await this.syncJobRepo.finishRun(run.id, {
      status: SyncJobStatus.Failed,
      finishedAt: this.clock.now(),
      itemsFetched: counters.itemsFetched,
      itemsUpserted: counters.itemsUpserted,
      coverageRatio: null,
      errorMessage: error.message,
    });

    const exhausted = job.attempts >= job.maxAttempts;
    await this.syncJobRepo.update(job.id, {
      status: exhausted ? SyncJobStatus.Failed : SyncJobStatus.Pending,
      nextAttemptAt: exhausted ? null : nextAttemptAt,
      lastError: MESSAGES.rateLimited,
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

  /** Contas lidas pelo @ não têm token: a credencial é o próprio @. */
  private async loadCredentials(account: SocialAccount): Promise<SocialCredentials | null> {
    if (account.transport === SocialTransport.PublicApi) {
      if (!account.username) return null;
      return {
        accessToken: '',
        scopes: [],
        handle: account.username,
        platformUserId: account.platformUserId,
      };
    }
    return this.socialAccountRepo.getDecryptedCredentials(account.id);
  }
}
