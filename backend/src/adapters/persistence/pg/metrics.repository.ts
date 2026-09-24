import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import {
  MetricsRepository,
  InsertContentSnapshotInput,
  InsertAccountSnapshotInput,
  AmbassadorMetricAggregate,
} from '../../../ports/repositories.port';
import { ContentMetricSnapshot, AccountMetricSnapshot } from '../../../domain/entities';
import {
  ContentId,
  SocialAccountId,
  MetricAvailability,
  ProfileId,
  asContentId,
  asSocialAccountId,
  asSyncRunId,
  asProfileId,
} from '../../../domain/types';
import { getPool } from '../../../infrastructure/db/pool';

@Injectable()
export class PgMetricsRepository implements MetricsRepository {
  private pool: Pool;
  
  constructor() {
    this.pool = getPool();
  }
  
  async insertContentSnapshot(
    input: InsertContentSnapshotInput,
  ): Promise<ContentMetricSnapshot> {
    const result = await this.pool.query(
      `INSERT INTO content_metric_snapshots (
        content_id, collected_at, views, views_available, source, period_label, payload, sync_run_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        input.contentId,
        input.collectedAt,
        input.views,
        input.viewsAvailable,
        input.source,
        input.periodLabel || null,
        input.payload ? JSON.stringify(input.payload) : null,
        input.syncRunId || null,
      ],
    );
    return this.mapContentRow(result.rows[0]);
  }
  
  async insertAccountSnapshot(
    input: InsertAccountSnapshotInput,
  ): Promise<AccountMetricSnapshot> {
    const result = await this.pool.query(
      `INSERT INTO account_metric_snapshots (
        social_account_id, collected_at, official_views, availability,
        period_label, definition_label, source, payload, sync_run_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        input.socialAccountId,
        input.collectedAt,
        input.officialViews,
        input.availability,
        input.periodLabel || null,
        input.definitionLabel || null,
        input.source,
        input.payload ? JSON.stringify(input.payload) : null,
        input.syncRunId || null,
      ],
    );
    return this.mapAccountRow(result.rows[0]);
  }
  
  async getLatestContentSnapshot(
    contentId: ContentId,
  ): Promise<ContentMetricSnapshot | null> {
    const result = await this.pool.query(
      `SELECT * FROM content_metric_snapshots 
       WHERE content_id = $1 
       ORDER BY collected_at DESC 
       LIMIT 1`,
      [contentId],
    );
    return result.rows[0] ? this.mapContentRow(result.rows[0]) : null;
  }
  
  async getLatestAccountSnapshot(
    socialAccountId: SocialAccountId,
  ): Promise<AccountMetricSnapshot | null> {
    const result = await this.pool.query(
      `SELECT * FROM account_metric_snapshots 
       WHERE social_account_id = $1 
       ORDER BY collected_at DESC 
       LIMIT 1`,
      [socialAccountId],
    );
    return result.rows[0] ? this.mapAccountRow(result.rows[0]) : null;
  }
  
  async aggregateEligibleMetricsByAccount(
    socialAccountId: SocialAccountId,
  ): Promise<AmbassadorMetricAggregate | null> {
    const result = await this.pool.query(
      `SELECT 
         sa.profile_id,
         COALESCE(SUM(c.latest_views), 0) AS total_views,
         COALESCE(MAX(c.latest_views), 0) AS best_video_views,
         (
           SELECT id 
           FROM content_items 
           WHERE social_account_id = sa.id 
             AND eligible = true 
             AND excluded_at IS NULL
             AND removed_on_platform = false
             AND latest_views IS NOT NULL
           ORDER BY latest_views DESC 
           LIMIT 1
         ) AS best_content_id
       FROM social_accounts sa
       LEFT JOIN content_items c ON c.social_account_id = sa.id
         AND c.eligible = true
         AND c.excluded_at IS NULL
         AND c.removed_on_platform = false
       WHERE sa.id = $1
       GROUP BY sa.profile_id, sa.id`,
      [socialAccountId],
    );
    
    if (!result.rows[0]) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      profileId: asProfileId(row.profile_id),
      totalViews: parseInt(row.total_views, 10) || 0,
      bestVideoViews: parseInt(row.best_video_views, 10) || 0,
      bestContentId: row.best_content_id ? asContentId(row.best_content_id) : null,
    };
  }
  
  private mapContentRow(row: any): ContentMetricSnapshot {
    return {
      id: row.id,
      contentId: asContentId(row.content_id),
      collectedAt: new Date(row.collected_at),
      views: row.views,
      viewsAvailable: row.views_available,
      source: row.source,
      periodLabel: row.period_label,
      payload: row.payload ? JSON.parse(row.payload) : null,
      syncRunId: row.sync_run_id ? asSyncRunId(row.sync_run_id) : null,
    };
  }
  
  private mapAccountRow(row: any): AccountMetricSnapshot {
    return {
      id: row.id,
      socialAccountId: asSocialAccountId(row.social_account_id),
      collectedAt: new Date(row.collected_at),
      officialViews: row.official_views,
      availability: row.availability as MetricAvailability,
      periodLabel: row.period_label,
      definitionLabel: row.definition_label,
      source: row.source,
      payload: row.payload ? JSON.parse(row.payload) : null,
      syncRunId: row.sync_run_id ? asSyncRunId(row.sync_run_id) : null,
    };
  }
}
