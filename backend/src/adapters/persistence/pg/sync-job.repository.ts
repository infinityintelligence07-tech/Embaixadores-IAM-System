import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import {
  SyncJobRepository,
  EnqueueSyncJobInput,
  UpdateSyncJobInput,
  CreateSyncRunInput,
  FinishSyncRunInput,
} from '../../../ports/repositories.port';
import { SyncJob, SyncRun } from '../../../domain/entities';
import {
  SyncJobId,
  SocialAccountId,
  SyncJobStatus,
  SyncRunId,
  asSyncJobId,
  asSocialAccountId,
  asSyncRunId,
} from '../../../domain/types';
import { getPool } from '../../../infrastructure/db/pool';

@Injectable()
export class PgSyncJobRepository implements SyncJobRepository {
  private pool: Pool;
  
  constructor() {
    this.pool = getPool();
  }
  
  async findById(id: SyncJobId): Promise<SyncJob | null> {
    const result = await this.pool.query(
      `SELECT * FROM sync_jobs WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapJobRow(result.rows[0]) : null;
  }
  
  async findActiveByAccount(
    socialAccountId: SocialAccountId,
  ): Promise<SyncJob | null> {
    const result = await this.pool.query(
      `SELECT * FROM sync_jobs 
       WHERE social_account_id = $1 
         AND status IN ('pending', 'running')
       ORDER BY priority DESC, scheduled_at ASC
       LIMIT 1`,
      [socialAccountId],
    );
    return result.rows[0] ? this.mapJobRow(result.rows[0]) : null;
  }
  
  async enqueue(input: EnqueueSyncJobInput): Promise<SyncJob> {
    const existing = await this.findActiveByAccount(input.socialAccountId);
    if (existing) {
      return existing;
    }

    const result = await this.pool.query(
      `INSERT INTO sync_jobs (
        social_account_id, job_type, priority, scheduled_at
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [
        input.socialAccountId,
        input.jobType || 'full_sync',
        input.priority || 100,
        input.scheduledAt || new Date(),
      ],
    );
    return this.mapJobRow(result.rows[0]);
  }
  
  async claimNext(workerId: string, now: Date): Promise<SyncJob | null> {
    const client = await this.pool.connect();
    
    try {
      // Use SKIP LOCKED to avoid contention between workers
      const result = await client.query(
        `UPDATE sync_jobs
         SET status = 'running',
             locked_at = $1,
             locked_by = $2,
             attempts = attempts + 1,
             updated_at = NOW()
         WHERE id = (
           SELECT id FROM sync_jobs
           WHERE status = 'pending'
             AND scheduled_at <= $1
             AND (next_attempt_at IS NULL OR next_attempt_at <= $1)
           ORDER BY priority DESC, scheduled_at ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING *`,
        [now, workerId],
      );
      
      return result.rows[0] ? this.mapJobRow(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }
  
  async update(id: SyncJobId, input: UpdateSyncJobInput): Promise<SyncJob> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (input.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }
    if (input.lockedAt !== undefined) {
      setClauses.push(`locked_at = $${paramIndex++}`);
      values.push(input.lockedAt);
    }
    if (input.lockedBy !== undefined) {
      setClauses.push(`locked_by = $${paramIndex++}`);
      values.push(input.lockedBy);
    }
    if (input.checkpoint !== undefined) {
      setClauses.push(`checkpoint = $${paramIndex++}`);
      values.push(JSON.stringify(input.checkpoint));
    }
    if (input.attempts !== undefined) {
      setClauses.push(`attempts = $${paramIndex++}`);
      values.push(input.attempts);
    }
    if (input.nextAttemptAt !== undefined) {
      setClauses.push(`next_attempt_at = $${paramIndex++}`);
      values.push(input.nextAttemptAt);
    }
    if (input.lastError !== undefined) {
      setClauses.push(`last_error = $${paramIndex++}`);
      values.push(input.lastError);
    }
    
    setClauses.push(`updated_at = NOW()`);
    values.push(id);
    
    const result = await this.pool.query(
      `UPDATE sync_jobs
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values,
    );
    
    return this.mapJobRow(result.rows[0]);
  }
  
  async createRun(input: CreateSyncRunInput): Promise<SyncRun> {
    const result = await this.pool.query(
      `INSERT INTO sync_runs (sync_job_id, social_account_id, started_at, status)
       VALUES ($1, $2, $3, 'running')
       RETURNING *`,
      [input.syncJobId, input.socialAccountId, input.startedAt],
    );
    return this.mapRunRow(result.rows[0]);
  }
  
  async finishRun(runId: SyncRunId, input: FinishSyncRunInput): Promise<SyncRun> {
    const result = await this.pool.query(
      `UPDATE sync_runs
       SET status = $2,
           finished_at = $3,
           items_fetched = $4,
           items_upserted = $5,
           coverage_ratio = $6,
           error_message = $7,
           metadata = $8
       WHERE id = $1
       RETURNING *`,
      [
        runId,
        input.status,
        input.finishedAt,
        input.itemsFetched,
        input.itemsUpserted,
        input.coverageRatio,
        input.errorMessage || null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );
    return this.mapRunRow(result.rows[0]);
  }
  
  async findLatestRunByAccount(
    socialAccountId: SocialAccountId,
  ): Promise<SyncRun | null> {
    const result = await this.pool.query(
      `SELECT * FROM sync_runs 
       WHERE social_account_id = $1 
       ORDER BY started_at DESC 
       LIMIT 1`,
      [socialAccountId],
    );
    return result.rows[0] ? this.mapRunRow(result.rows[0]) : null;
  }

  async findRecent(limit: number): Promise<SyncJob[]> {
    const result = await this.pool.query(
      `SELECT * FROM sync_jobs
       ORDER BY updated_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => this.mapJobRow(row));
  }
  
  private mapJobRow(row: any): SyncJob {
    return {
      id: asSyncJobId(row.id),
      socialAccountId: asSocialAccountId(row.social_account_id),
      jobType: row.job_type,
      status: row.status as SyncJobStatus,
      priority: row.priority,
      scheduledAt: new Date(row.scheduled_at),
      lockedAt: row.locked_at ? new Date(row.locked_at) : null,
      lockedBy: row.locked_by,
      checkpoint: row.checkpoint ? JSON.parse(row.checkpoint) : null,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      nextAttemptAt: row.next_attempt_at ? new Date(row.next_attempt_at) : null,
      lastError: row.last_error,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
  
  private mapRunRow(row: any): SyncRun {
    return {
      id: asSyncRunId(row.id),
      syncJobId: asSyncJobId(row.sync_job_id),
      socialAccountId: asSocialAccountId(row.social_account_id),
      startedAt: new Date(row.started_at),
      finishedAt: row.finished_at ? new Date(row.finished_at) : null,
      status: row.status as SyncJobStatus,
      itemsFetched: row.items_fetched,
      itemsUpserted: row.items_upserted,
      coverageRatio: row.coverage_ratio,
      errorMessage: row.error_message,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    };
  }
}
