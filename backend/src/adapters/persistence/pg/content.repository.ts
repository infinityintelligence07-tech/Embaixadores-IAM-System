import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import {
  ContentRepository,
  PostingRhythm,
  UpsertContentInput,
} from '../../../ports/repositories.port';
import { ContentItem } from '../../../domain/entities';
import {
  ContentId,
  SocialAccountId,
  SocialPlatform,
  ProfileId,
  asContentId,
  asSocialAccountId,
  asProfileId,
} from '../../../domain/types';
import { getPool } from '../../../infrastructure/db/pool';

@Injectable()
export class PgContentRepository implements ContentRepository {
  private pool: Pool;
  
  constructor() {
    this.pool = getPool();
  }
  
  async findById(id: ContentId): Promise<ContentItem | null> {
    const result = await this.pool.query(
      `SELECT * FROM contents WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }
  
  async findByPlatformContentId(
    platform: SocialPlatform,
    platformContentId: string,
  ): Promise<ContentItem | null> {
    const result = await this.pool.query(
      `SELECT * FROM contents WHERE platform = $1 AND platform_content_id = $2`,
      [platform, platformContentId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }
  
  async findEligibleByAccount(
    socialAccountId: SocialAccountId,
  ): Promise<ContentItem[]> {
    const result = await this.pool.query(
      `SELECT * FROM contents 
       WHERE social_account_id = $1 
         AND eligible = true 
         AND excluded_at IS NULL
         AND removed_on_platform = false
       ORDER BY published_at DESC NULLS LAST`,
      [socialAccountId],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  async summarizePosting(since: Date): Promise<PostingRhythm[]> {
    const result = await this.pool.query(
      `SELECT
         sa.profile_id,
         COUNT(c.id) FILTER (
           WHERE c.published_at >= $1
             AND c.removed_on_platform = false
             AND c.excluded_at IS NULL
         )::int AS posts_last_30_days,
         COUNT(c.id) FILTER (
           WHERE c.removed_on_platform = false
             AND c.excluded_at IS NULL
         )::int AS content_count,
         MAX(c.published_at) FILTER (
           WHERE c.removed_on_platform = false
             AND c.excluded_at IS NULL
         ) AS last_published_at
       FROM social_accounts sa
       LEFT JOIN contents c ON c.social_account_id = sa.id
       GROUP BY sa.profile_id`,
      [since],
    );

    return result.rows.map((row) => ({
      profileId: asProfileId(row.profile_id),
      postsLast30Days: Number(row.posts_last_30_days) || 0,
      contentCount: Number(row.content_count) || 0,
      lastPublishedAt: row.last_published_at ? new Date(row.last_published_at) : null,
    }));
  }
  
  async upsert(input: UpsertContentInput): Promise<ContentItem> {
    // CRITICAL: Never overwrite valid latest_views with null on API failure
    const result = await this.pool.query(
      `INSERT INTO contents (
        social_account_id, platform, platform_content_id, title, thumbnail_url,
        permalink, published_at, media_type, latest_views, latest_views_collected_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (platform, platform_content_id) DO UPDATE SET
        title = COALESCE($4, contents.title),
        thumbnail_url = COALESCE($5, contents.thumbnail_url),
        permalink = COALESCE($6, contents.permalink),
        published_at = COALESCE($7, contents.published_at),
        media_type = COALESCE($8, contents.media_type),
        latest_views = CASE 
          WHEN $9 IS NOT NULL THEN $9
          ELSE contents.latest_views
        END,
        latest_views_collected_at = CASE 
          WHEN $10 IS NOT NULL THEN $10
          ELSE contents.latest_views_collected_at
        END,
        updated_at = NOW()
      RETURNING *`,
      [
        input.socialAccountId,
        input.platform,
        input.platformContentId,
        input.title,
        input.thumbnailUrl,
        input.permalink,
        input.publishedAt,
        input.mediaType,
        input.latestViews,
        input.latestViewsCollectedAt,
      ],
    );
    return this.mapRow(result.rows[0]);
  }
  
  async markRemoved(id: ContentId): Promise<void> {
    await this.pool.query(
      `UPDATE contents SET removed_on_platform = true, updated_at = NOW() WHERE id = $1`,
      [id],
    );
  }
  
  async exclude(
    id: ContentId,
    reason: string,
    excludedBy: ProfileId,
    excludedAt: Date,
  ): Promise<ContentItem> {
    const result = await this.pool.query(
      `UPDATE contents
       SET excluded_at = $2,
           exclusion_reason = $3,
           excluded_by = $4,
           eligible = false,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, excludedAt, reason, excludedBy],
    );
    return this.mapRow(result.rows[0]);
  }
  
  async restore(id: ContentId): Promise<ContentItem> {
    const result = await this.pool.query(
      `UPDATE contents
       SET excluded_at = NULL,
           exclusion_reason = NULL,
           excluded_by = NULL,
           eligible = true,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id],
    );
    return this.mapRow(result.rows[0]);
  }
  
  private mapRow(row: any): ContentItem {
    return {
      id: asContentId(row.id),
      socialAccountId: asSocialAccountId(row.social_account_id),
      platform: row.platform as SocialPlatform,
      platformContentId: row.platform_content_id,
      title: row.title,
      thumbnailUrl: row.thumbnail_url,
      permalink: row.permalink,
      publishedAt: row.published_at ? new Date(row.published_at) : null,
      mediaType: row.media_type,
      eligible: row.eligible,
      excludedAt: row.excluded_at ? new Date(row.excluded_at) : null,
      exclusionReason: row.exclusion_reason,
      excludedBy: row.excluded_by ? asProfileId(row.excluded_by) : null,
      removedOnPlatform: row.removed_on_platform,
      latestViews: row.latest_views,
      latestViewsCollectedAt: row.latest_views_collected_at
        ? new Date(row.latest_views_collected_at)
        : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
