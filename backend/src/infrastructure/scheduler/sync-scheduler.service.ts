import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SyncAccountUseCase } from '../../application/sync/sync-account.use-case';
import { ComputeAndPublishRankingUseCase } from '../../application/rankings/compute-and-publish.use-case';
import {
  SettingsRepository,
  SocialAccountRepository,
  SyncJobRepository,
} from '../../ports/repositories.port';
import { ClockPort } from '../../ports/clock.port';
import { INJECTION_TOKENS } from '../tokens/injection-tokens';
import { RankingCategory, SocialPlatform } from '../../domain/types';
import { SYNC_INTERVAL_MINUTES, SYNC_INTERVAL_MS } from '../../domain/view-metrics';
import { randomUUID } from 'crypto';

@Injectable()
export class SyncSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SyncSchedulerService.name);
  private readonly workerId = `worker-${randomUUID()}`;
  private isProcessing = false;
  private sweepRequested = false;

  constructor(
    @Inject(INJECTION_TOKENS.CLOCK)
    private readonly clock: ClockPort,
    @Inject(INJECTION_TOKENS.SYNC_JOB_REPOSITORY)
    private readonly syncJobRepo: SyncJobRepository,
    @Inject(INJECTION_TOKENS.SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccountRepo: SocialAccountRepository,
    @Inject(INJECTION_TOKENS.SETTINGS_REPOSITORY)
    private readonly settingsRepo: SettingsRepository,
    private readonly syncAccountUseCase: SyncAccountUseCase,
    private readonly computeRankingUseCase: ComputeAndPublishRankingUseCase,
  ) {}

  async onModuleInit() {
    this.logger.log(
      `Coleta e ranking a cada ${SYNC_INTERVAL_MINUTES} minutos. Worker ${this.workerId}`,
    );
    try {
      await this.settingsRepo.set('sync_interval_minutes', SYNC_INTERVAL_MINUTES);
    } catch (error) {
      this.logger.warn(`Não foi possível gravar o intervalo de coleta: ${error}`);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingJobs(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      const ran = await this.drainQueue(3);
      if (ran > 0) await this.publishRankings();
    } finally {
      this.isProcessing = false;
      this.resumeSweep();
    }
  }

  private resumeSweep(): void {
    if (!this.sweepRequested || this.isProcessing) return;
    this.sweepRequested = false;
    void this.runSweep();
  }

  private async runSweep(): Promise<void> {
    if (this.isProcessing) {
      this.sweepRequested = true;
      return;
    }
    this.isProcessing = true;
    try {
      const now = this.clock.now();
      const olderThan = new Date(now.getTime() - SYNC_INTERVAL_MS);
      const due = await this.socialAccountRepo.findDueForSync(olderThan);

      for (const account of due) {
        await this.syncJobRepo.enqueue({
          socialAccountId: account.id,
          priority: 50,
          scheduledAt: now,
        });
      }

      this.logger.log(`Coleta de ${due.length} conta(s) na rodada de 10 minutos`);
      await this.drainQueue(40);
      await this.publishRankings();
    } catch (error) {
      this.logger.error(`Falha na atualização de 10 minutos: ${error}`);
    } finally {
      this.isProcessing = false;
      this.resumeSweep();
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async refreshEveryTenMinutes(): Promise<void> {
    if (this.isProcessing) {
      this.sweepRequested = true;
      return;
    }
    await this.runSweep();
  }

  private async drainQueue(limit: number): Promise<number> {
    let ran = 0;
    while (ran < limit) {
      const job = await this.syncJobRepo.claimNext(this.workerId, this.clock.now());
      if (!job) break;
      try {
        await this.syncAccountUseCase.execute(job.id);
      } catch (error) {
        this.logger.error(`Job ${job.id} failed:`, error);
      }
      ran += 1;
    }
    return ran;
  }

  private async publishRankings(): Promise<void> {
    for (const platform of [SocialPlatform.Instagram, SocialPlatform.TikTok]) {
      for (const category of [RankingCategory.TotalViews, RankingCategory.BestVideo]) {
        await this.computeRankingUseCase.execute(platform, category);
      }
    }
  }
}
