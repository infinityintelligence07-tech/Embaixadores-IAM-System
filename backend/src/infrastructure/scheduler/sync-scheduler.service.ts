import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SyncAccountUseCase } from '../../application/sync/sync-account.use-case';
import { SyncJobRepository } from '../../ports/repositories.port';
import { ClockPort } from '../../ports/clock.port';
import { INJECTION_TOKENS } from '../tokens/injection-tokens';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';

@Injectable()
export class SyncSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SyncSchedulerService.name);
  private readonly workerId = `worker-${randomUUID()}`;
  private isProcessing = false;
  
  constructor(
    @Inject(INJECTION_TOKENS.CLOCK)
    private readonly clock: ClockPort,
    @Inject(INJECTION_TOKENS.SYNC_JOB_REPOSITORY)
    private readonly syncJobRepo: SyncJobRepository,
    private readonly syncAccountUseCase: SyncAccountUseCase,
  ) {}
  
  onModuleInit() {
    this.logger.log(`Sync scheduler initialized with worker ID: ${this.workerId}`);
  }
  
  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingJobs(): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      const now = this.clock.now();
      
      // Claim next job (uses SKIP LOCKED internally)
      const job = await this.syncJobRepo.claimNext(this.workerId, now);
      
      if (!job) {
        return;
      }
      
      this.logger.log(`Processing sync job ${job.id} for account ${job.socialAccountId}`);
      
      try {
        await this.syncAccountUseCase.execute(job.id);
      } catch (error) {
        this.logger.error(`Job ${job.id} failed:`, error);
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
