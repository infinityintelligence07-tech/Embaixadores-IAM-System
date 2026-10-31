import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import {
  MetricsRepository,
  InsertContentSnapshotInput,
  InsertAccountSnapshotInput,
  AmbassadorMetricAggregate,
  DailyViews,
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
import { rankedMediaSql } from '../../../domain/ranked-media';
import { getPool } from '../../../infrastructure/db/pool';
import { readJson } from './read-json';

const lastViewsBefore = (bound: string) => `
  SELECT cs.views FROM content_metric_snapshots cs
  WHERE cs.content_id = e.id AND cs.views IS NOT NULL AND cs.collected_at < ${bound}
  ORDER BY cs.collected_at DESC LIMIT 1`;

/**
 * Views ganhas dentro do período ($2 a $3) por vídeo da conta $1: a última medição antes do fim
 * menos a última antes do início. Vídeo publicado no período parte de zero. Vídeo antigo que só
 * passamos a medir depois do início (embaixador que entrou no meio) parte da primeira medição,
 * para o histórico de antes não entrar como se fosse do período.
 */
const GAINS_IN_WINDOW = `
  WITH eligible AS (
    SELECT c.id, c.published_at
    FROM contents c
    WHERE c.social_account_id = $1
      AND c.eligible = true
      AND c.excluded_at IS NULL
      AND c.removed_on_platform = false
      AND ${rankedMediaSql('c')}
  ),
  watched_since AS (
    SELECT MIN(cs.collected_at) AS at
    FROM content_metric_snapshots cs
    JOIN eligible e ON e.id = cs.content_id
    WHERE cs.views IS NOT NULL
  ),
  gains AS (
    SELECT e.id,
           GREATEST(
             COALESCE(final.views, 0) - CASE
               WHEN e.published_at >= $2 THEN 0
               WHEN before.views IS NOT NULL THEN before.views
               WHEN e.published_at >= (SELECT at FROM watched_since) THEN 0
               ELSE COALESCE(first_seen.views, 0)
             END,
             0
           ) AS gained
    FROM eligible e
    LEFT JOIN LATERAL (${lastViewsBefore('$3')}) final ON true
    LEFT JOIN LATERAL (${lastViewsBefore('$2')}) before ON true
    LEFT JOIN LATERAL (
      SELECT cs.views FROM content_metric_snapshots cs
      WHERE cs.content_id = e.id AND cs.views IS NOT NULL AND cs.collected_at >= $2
      ORDER BY cs.collected_at ASC LIMIT 1
    ) first_seen ON true
  )`;

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
  
  async dailyViewsByAccount(socialAccountId: SocialAccountId, days: number): Promise<DailyViews[]> {
    const result = await this.pool.query(
      `WITH days AS (
         SELECT generate_series(
                  (now() AT TIME ZONE 'America/Sao_Paulo')::date - ($2::int - 1),
                  (now() AT TIME ZONE 'America/Sao_Paulo')::date,
                  interval '1 day'
                )::date AS day
       )
       SELECT d.day::text AS day,
              COALESCE(SUM(s.views), 0)::bigint AS views,
              COUNT(s.views) > 0 AS measured
       FROM days d
       LEFT JOIN LATERAL (
         SELECT DISTINCT ON (cs.content_id) cs.views
         FROM content_metric_snapshots cs
         JOIN contents c ON c.id = cs.content_id
         WHERE c.social_account_id = $1
           AND c.eligible = true
           AND c.excluded_at IS NULL
           AND c.removed_on_platform = false
           AND ${rankedMediaSql('c')}
           AND cs.views IS NOT NULL
           AND cs.collected_at < ((d.day + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
         ORDER BY cs.content_id, cs.collected_at DESC
       ) s ON true
       GROUP BY d.day
       ORDER BY d.day`,
      [socialAccountId, days],
    );
    return result.rows.map((row) => ({
      day: String(row.day),
      views: Number(row.views) || 0,
      measured: Boolean(row.measured),
    }));
  }

  async aggregateEligibleMetricsByAccount(
    socialAccountId: SocialAccountId,
    window: { from: Date; to: Date } | null = null,
  ): Promise<AmbassadorMetricAggregate | null> {
    if (window) return this.aggregateGainedInWindow(socialAccountId, window);
    const result = await this.pool.query(
      `SELECT 
         sa.profile_id,
         COALESCE(SUM(c.latest_views), 0) AS total_views,
         COALESCE(MAX(c.latest_views), 0) AS best_video_views,
         (
           SELECT id 
           FROM contents 
           WHERE social_account_id = sa.id
             AND eligible = true
             AND excluded_at IS NULL
             AND removed_on_platform = false
             AND latest_views IS NOT NULL
             AND ${rankedMediaSql('contents')}
           ORDER BY latest_views DESC
           LIMIT 1
         ) AS best_content_id
       FROM social_accounts sa
       LEFT JOIN contents c ON c.social_account_id = sa.id
         AND c.eligible = true
         AND c.excluded_at IS NULL
         AND c.removed_on_platform = false
         AND ${rankedMediaSql('c')}
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

  async gainedViewsByContent(
    socialAccountId: SocialAccountId,
    window: { from: Date; to: Date },
  ): Promise<Map<ContentId, number>> {
    const result = await this.pool.query(
      `${GAINS_IN_WINDOW} SELECT id, gained FROM gains WHERE gained > 0`,
      [socialAccountId, window.from, window.to],
    );
    return new Map(
      result.rows.map((row) => [asContentId(row.id), parseInt(row.gained, 10) || 0]),
    );
  }

  private async aggregateGainedInWindow(
    socialAccountId: SocialAccountId,
    window: { from: Date; to: Date },
  ): Promise<AmbassadorMetricAggregate | null> {
    const result = await this.pool.query(
      `${GAINS_IN_WINDOW}
       SELECT (SELECT profile_id FROM social_accounts WHERE id = $1) AS profile_id,
              COALESCE(SUM(gained), 0) AS total_views,
              COALESCE(MAX(gained), 0) AS best_video_views,
              (SELECT id FROM gains WHERE gained > 0 ORDER BY gained DESC LIMIT 1) AS best_content_id
       FROM gains`,
      [socialAccountId, window.from, window.to],
    );

    const row = result.rows[0];
    if (!row?.profile_id) return null;
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
      payload: readJson(row.payload),
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
      payload: readJson(row.payload),
      syncRunId: row.sync_run_id ? asSyncRunId(row.sync_run_id) : null,
    };
  }
}
