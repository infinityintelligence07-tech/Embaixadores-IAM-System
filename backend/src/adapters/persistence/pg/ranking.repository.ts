import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import {
  RankingRepository,
  PublishRankingInput,
} from '../../../ports/repositories.port';
import { RankingVersion, RankingEntry } from '../../../domain/entities';
import {
  RankingVersionId,
  SocialPlatform,
  RankingCategory,
  RankingVersionStatus,
  asRankingVersionId,
  asRankingEntryId,
  asProfileId,
  asContentId,
} from '../../../domain/types';
import { getPool } from '../../../infrastructure/db/pool';

@Injectable()
export class PgRankingRepository implements RankingRepository {
  private pool: Pool;
  
  constructor() {
    this.pool = getPool();
  }
  
  async findPublished(
    platform: SocialPlatform,
    category: RankingCategory,
  ): Promise<{ version: RankingVersion; entries: RankingEntry[] } | null> {
    const versionResult = await this.pool.query(
      `SELECT * FROM ranking_versions 
       WHERE platform = $1 AND category = $2 AND status = 'published'
       ORDER BY published_at DESC 
       LIMIT 1`,
      [platform, category],
    );
    
    if (!versionResult.rows[0]) {
      return null;
    }
    
    const version = this.mapVersionRow(versionResult.rows[0]);
    
    const entriesResult = await this.pool.query(
      `SELECT * FROM ranking_entries 
       WHERE ranking_version_id = $1 
       ORDER BY position ASC`,
      [version.id],
    );
    
    const entries = entriesResult.rows.map(row => this.mapEntryRow(row));
    
    return { version, entries };
  }
  
  async findVersionById(id: RankingVersionId): Promise<RankingVersion | null> {
    const result = await this.pool.query(
      `SELECT * FROM ranking_versions WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapVersionRow(result.rows[0]) : null;
  }
  
  async publishAtomic(input: PublishRankingInput): Promise<{
    version: RankingVersion;
    entries: RankingEntry[];
  }> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Supersede current published version
      await client.query(
        `UPDATE ranking_versions 
         SET status = 'superseded' 
         WHERE platform = $1 AND category = $2 AND status = 'published'`,
        [input.platform, input.category],
      );
      
      // Create new version
      const versionResult = await client.query(
        `INSERT INTO ranking_versions (
          platform, category, status, computed_at, published_at,
          participant_count, stale_tolerance_hours, notes
        )
        VALUES ($1, $2, 'published', $3, NOW(), $4, $5, $6)
        RETURNING *`,
        [
          input.platform,
          input.category,
          input.computedAt,
          input.entries.length,
          input.staleToleranceHours,
          input.notes,
        ],
      );
      
      const version = this.mapVersionRow(versionResult.rows[0]);
      
      // Insert entries
      const entries: RankingEntry[] = [];
      
      for (const entry of input.entries) {
        const entryResult = await client.query(
          `INSERT INTO ranking_entries (
            ranking_version_id, position, profile_id, public_name, avatar_url,
            total_views, best_video_views, best_content_id, score, last_synced_at, is_stale
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *`,
          [
            version.id,
            entry.position,
            entry.profileId,
            entry.publicName,
            entry.avatarUrl,
            entry.totalViews,
            entry.bestVideoViews,
            entry.bestContentId,
            entry.score,
            entry.lastSyncedAt,
            entry.isStale,
          ],
        );
        
        entries.push(this.mapEntryRow(entryResult.rows[0]));
      }
      
      await client.query('COMMIT');
      
      return { version, entries };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  private mapVersionRow(row: any): RankingVersion {
    return {
      id: asRankingVersionId(row.id),
      platform: row.platform as SocialPlatform,
      category: row.category as RankingCategory,
      status: row.status as RankingVersionStatus,
      computedAt: row.computed_at ? new Date(row.computed_at) : null,
      publishedAt: row.published_at ? new Date(row.published_at) : null,
      participantCount: row.participant_count,
      staleToleranceHours: row.stale_tolerance_hours,
      notes: row.notes,
      createdAt: new Date(row.created_at),
    };
  }
  
  private mapEntryRow(row: any): RankingEntry {
    return {
      id: asRankingEntryId(row.id),
      rankingVersionId: asRankingVersionId(row.ranking_version_id),
      position: row.position,
      profileId: asProfileId(row.profile_id),
      publicName: row.public_name,
      avatarUrl: row.avatar_url,
      totalViews: row.total_views,
      bestVideoViews: row.best_video_views,
      bestContentId: row.best_content_id ? asContentId(row.best_content_id) : null,
      score: row.score,
      lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at) : null,
      isStale: row.is_stale,
    };
  }
}
