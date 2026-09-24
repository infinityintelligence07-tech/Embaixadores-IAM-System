import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import {
  ContentRepository,
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
      `SELECT * FROM content_items WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }
  
  async findByPlatformContentId(
    platform: SocialPlatform,
    platformContentId: string,
  ): Promise<ContentItem | null> {
    const result = await this.pool.query(
      `SELECT * FROM content_items WHERE platform = $1 AND platform_content_id = $2`,
      [platform, platformContentId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }
  
  async findEligibleByAccount(
    socialAccountId: SocialAccountId,
  ): Promise<ContentItem[]> {
    const result = await this.pool.query(
      `SELECT * FROM content_items 
       WHERE social_account_id = $1 
         AND eligible = true 
         AND excluded_at IS NULL
         AND removed_on_platform = false
       ORDER BY published_at DESC NULLS LAST`,
      [socialAccountId],
    );
    return result.rows.map(row => this.mapRow(row));
  }
  
  async upsert(input: UpsertContentInput): Promise<ContentItem> {
    // CRITICAL: Never overwrite valid latest_views with null on API failure
    const result = await this.pool.query(
      `INSERT INTO content_items (
        social_account_id, platform, platform_content_id, title, thumbnail_url,
        permalink, published_at, media_type, latest_views, latest_views_collected_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (platform, platform_content_id) DO UPDATE SET
        title = COALESCE($4, content_items.title),
        thumbnail_url = COALESCE($5, content_items.thumbnail_url),
        permalink = COALESCE($6, content_items.permalink),
        published_at = COALESCE($7, content_items.published_at),
        media_type = COALESCE($8, content_items.media_type),
        latest_views = CASE 
          WHEN $9 IS NOT NULL THEN $9
          ELSE content_items.latest_views
        END,
        latest_views_collected_at = CASE 
          WHEN $10 IS NOT NULL THEN $10
          ELSE content_items.latest_views_collected_at
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
      `UPDATE content_items SET removed_on_platform = true, updated_at = NOW() WHERE id = $1`,
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
      `UPDATE content_items
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
      `UPDATE content_items
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
