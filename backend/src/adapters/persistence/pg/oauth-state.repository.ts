import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import {
  OAuthStateRepository,
  CreateOAuthStateInput,
  OAuthStateRecord,
} from '../../../ports/repositories.port';
import { SocialPlatform, asProfileId, asOAuthStateId } from '../../../domain/types';
import { getPool } from '../../../infrastructure/db/pool';

@Injectable()
export class PgOAuthStateRepository implements OAuthStateRepository {
  private pool: Pool;
  
  constructor() {
    this.pool = getPool();
  }
  
  async create(input: CreateOAuthStateInput): Promise<OAuthStateRecord> {
    const result = await this.pool.query(
      `INSERT INTO oauth_states (
        profile_id, platform, state, code_verifier, redirect_path, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        input.profileId,
        input.platform,
        input.state,
        input.codeVerifier || null,
        input.redirectPath || null,
        input.expiresAt,
      ],
    );
    return this.mapRow(result.rows[0]);
  }
  
  async consume(state: string, now: Date): Promise<OAuthStateRecord | null> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `DELETE FROM oauth_states 
         WHERE state = $1 AND expires_at > $2
         RETURNING *`,
        [state, now],
      );
      
      await client.query('COMMIT');
      
      return result.rows[0] ? this.mapRow(result.rows[0]) : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  async deleteExpired(before: Date): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM oauth_states WHERE expires_at < $1`,
      [before],
    );
    return result.rowCount || 0;
  }
  
  private mapRow(row: any): OAuthStateRecord {
    return {
      id: asOAuthStateId(row.id),
      profileId: asProfileId(row.profile_id),
      platform: row.platform as SocialPlatform,
      state: row.state,
      codeVerifier: row.code_verifier,
      redirectPath: row.redirect_path,
      expiresAt: new Date(row.expires_at),
      createdAt: new Date(row.created_at),
    };
  }
}
