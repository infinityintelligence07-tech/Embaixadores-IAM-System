import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { SocialAccountId, SyncJobStatus, ConnectionStatus } from '../../domain/types';
import {
  SocialAccountRepository,
  SyncJobRepository,
  ContentRepository,
  MetricsRepository,
  UpsertContentInput,
} from '../../ports/repositories.port';
import { SocialMetricsProvider } from '../../ports/social-metrics.port';
import { ClockPort } from '../../ports/clock.port';
import { INJECTION_TOKENS } from '../../infrastructure/tokens/injection-tokens';

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
      throw new NotFoundException('Sync job not found');
    }
    
    const account = await this.socialAccountRepo.findById(job.socialAccountId);
    if (!account) {
      throw new NotFoundException('Social account not found');
    }
    
    const now = this.clock.now();
    
    // Create sync run
    const run = await this.syncJobRepo.createRun({
      syncJobId: job.id,
      socialAccountId: account.id,
      startedAt: now,
    });
    
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
      
      // Update account status
      await this.socialAccountRepo.update(account.id, {
        status: ConnectionStatus.Syncing,
      });
      
      let cursor: string | null = 
        (job.checkpoint && typeof job.checkpoint === 'object' && 'cursor' in job.checkpoint)
          ? (job.checkpoint as any).cursor || null
          : null;
      let totalFetched = 0;
      let totalUpserted = 0;
      const maxPages = 100; // Safety limit
      let pageCount = 0;
      
      // Fetch all content with pagination
      while (pageCount < maxPages) {
        const page = await provider.listContents(creds, cursor);
        
        for (const item of page.items) {
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
          totalUpserted++;
          
          // Store snapshot
          if (item.viewsAvailable) {
            await this.metricsRepo.insertContentSnapshot({
              contentId: content.id,
              collectedAt: now,
              views: item.views,
              viewsAvailable: true,
              source: `${account.platform}_${account.transport}`,
              syncRunId: run.id,
            });
          }
        }
        
        totalFetched += page.items.length;
        
        if (!page.nextCursor) {
          break;
        }
        
        cursor = page.nextCursor;
        pageCount++;
        
        // Update checkpoint
        await this.syncJobRepo.update(job.id, {
          checkpoint: { cursor, totalFetched, totalUpserted },
        });
      }
      
      // Fetch account metrics
      try {
        const accountMetrics = await provider.getAccountMetrics(creds);
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
        this.logger.warn(`Failed to fetch account metrics: ${error}`);
      }
      
      // Calculate coverage ratio
      const coverageRatio = totalFetched > 0 ? 1.0 : null;
      
      // Finish run
      await this.syncJobRepo.finishRun(run.id, {
        status: SyncJobStatus.Succeeded,
        finishedAt: this.clock.now(),
        itemsFetched: totalFetched,
        itemsUpserted: totalUpserted,
        coverageRatio,
      });
      
      // Update job
      await this.syncJobRepo.update(job.id, {
        status: SyncJobStatus.Succeeded,
      });
      
      // Update account
      await this.socialAccountRepo.update(account.id, {
        status: ConnectionStatus.Connected,
        lastSyncedAt: now,
        lastSuccessfulSyncAt: now,
        syncCoverageRatio: coverageRatio,
        syncMessage: `Synced ${totalFetched} items successfully`,
      });
      
      this.logger.log(
        `Sync completed: ${account.platform} account ${account.id}, fetched ${totalFetched} items`,
      );
    } catch (error) {
      this.logger.error(`Sync failed: ${error}`, error instanceof Error ? error.stack : undefined);
      
      // Calculate backoff
      const baseDelay = 60000; // 1 minute
      const jitter = Math.random() * 30000; // 0-30 seconds
      const backoffDelay = baseDelay * Math.pow(2, job.attempts) + jitter;
      const nextAttemptAt = new Date(now.getTime() + backoffDelay);
      
      // Finish run with failure
      await this.syncJobRepo.finishRun(run.id, {
        status: SyncJobStatus.Failed,
        finishedAt: this.clock.now(),
        itemsFetched: 0,
        itemsUpserted: 0,
        coverageRatio: null,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Update job
      const newStatus =
        job.attempts >= job.maxAttempts ? SyncJobStatus.Failed : SyncJobStatus.Pending;
      
      await this.syncJobRepo.update(job.id, {
        status: newStatus,
        lastError: error instanceof Error ? error.message : 'Unknown error',
        nextAttemptAt: newStatus === SyncJobStatus.Pending ? nextAttemptAt : null,
      });
      
      // Update account
      await this.socialAccountRepo.update(account.id, {
        status: ConnectionStatus.Connected,
        syncMessage: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      
      throw error;
    }
  }
}
