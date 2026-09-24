import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import {
  SocialAccountRepository,
  CreateSocialAccountInput,
  UpdateSocialAccountInput,
  StoredSocialCredentials,
} from '../../../ports/repositories.port';
import { SocialAccount } from '../../../domain/entities';
import {
  SocialAccountId,
  ProfileId,
  SocialPlatform,
  ConnectionStatus,
  SocialTransport,
  asSocialAccountId,
  asProfileId,
} from '../../../domain/types';
import { SocialCredentials } from '../../../ports/social-metrics.port';
import { TokenEncryptionPort } from '../../../ports/tokens.port';
import { getPool } from '../../../infrastructure/db/pool';

@Injectable()
export class PgSocialAccountRepository implements SocialAccountRepository {
  private pool: Pool;
  
  constructor(private readonly encryption: TokenEncryptionPort) {
    this.pool = getPool();
  }
  
  async findById(id: SocialAccountId): Promise<SocialAccount | null> {
    const result = await this.pool.query(
      `SELECT * FROM social_accounts WHERE id = $1 AND disconnected_at IS NULL`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }
  
  async findByProfileAndPlatform(
    profileId: ProfileId,
    platform: SocialPlatform,
  ): Promise<SocialAccount | null> {
    const result = await this.pool.query(
      `SELECT * FROM social_accounts WHERE profile_id = $1 AND platform = $2 AND disconnected_at IS NULL`,
      [profileId, platform],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }
  
  async findByPlatformUserId(
    platform: SocialPlatform,
    platformUserId: string,
  ): Promise<SocialAccount | null> {
    const result = await this.pool.query(
      `SELECT * FROM social_accounts WHERE platform = $1 AND platform_user_id = $2 AND disconnected_at IS NULL`,
      [platform, platformUserId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }
  
  async findConnectedByPlatform(platform: SocialPlatform): Promise<SocialAccount[]> {
    const result = await this.pool.query(
      `SELECT * FROM social_accounts 
       WHERE platform = $1 AND status = 'connected' AND disconnected_at IS NULL
       ORDER BY last_synced_at ASC NULLS FIRST`,
      [platform],
    );
    return result.rows.map(row => this.mapRow(row));
  }
  
  async create(input: CreateSocialAccountInput): Promise<SocialAccount> {
    const result = await this.pool.query(
      `INSERT INTO social_accounts (
        profile_id, platform, platform_user_id, username, display_name,
        avatar_url, profile_url, status, transport
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'connected', $8)
      RETURNING *`,
      [
        input.profileId,
        input.platform,
        input.platformUserId,
        input.username,
        input.displayName,
        input.avatarUrl,
        input.profileUrl,
        input.transport,
      ],
    );
    return this.mapRow(result.rows[0]);
  }
  
  async update(
    id: SocialAccountId,
    input: UpdateSocialAccountInput,
  ): Promise<SocialAccount> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (input.username !== undefined) {
      setClauses.push(`username = $${paramIndex++}`);
      values.push(input.username);
    }
    if (input.displayName !== undefined) {
      setClauses.push(`display_name = $${paramIndex++}`);
      values.push(input.displayName);
    }
    if (input.avatarUrl !== undefined) {
      setClauses.push(`avatar_url = $${paramIndex++}`);
      values.push(input.avatarUrl);
    }
    if (input.profileUrl !== undefined) {
      setClauses.push(`profile_url = $${paramIndex++}`);
      values.push(input.profileUrl);
    }
    if (input.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }
    if (input.lastSyncedAt !== undefined) {
      setClauses.push(`last_synced_at = $${paramIndex++}`);
      values.push(input.lastSyncedAt);
    }
    if (input.lastSuccessfulSyncAt !== undefined) {
      setClauses.push(`last_successful_sync_at = $${paramIndex++}`);
      values.push(input.lastSuccessfulSyncAt);
    }
    if (input.syncCoverageRatio !== undefined) {
      setClauses.push(`sync_coverage_ratio = $${paramIndex++}`);
      values.push(input.syncCoverageRatio);
    }
    if (input.syncMessage !== undefined) {
      setClauses.push(`sync_message = $${paramIndex++}`);
      values.push(input.syncMessage);
    }
    if (input.disconnectedAt !== undefined) {
      setClauses.push(`disconnected_at = $${paramIndex++}`);
      values.push(input.disconnectedAt);
    }
    
    setClauses.push(`updated_at = NOW()`);
    values.push(id);
    
    const result = await this.pool.query(
      `UPDATE social_accounts
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values,
    );
    
    return this.mapRow(result.rows[0]);
  }
  
  async saveCredentials(
    socialAccountId: SocialAccountId,
    creds: StoredSocialCredentials,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO social_credentials (
        social_account_id, access_token_ciphertext, refresh_token_ciphertext,
        token_expires_at, refresh_expires_at, scopes, encryption_kid
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (social_account_id) DO UPDATE SET
        access_token_ciphertext = $2,
        refresh_token_ciphertext = $3,
        token_expires_at = $4,
        refresh_expires_at = $5,
        scopes = $6,
        encryption_kid = $7,
        updated_at = NOW()`,
      [
        socialAccountId,
        creds.accessTokenCiphertext,
        creds.refreshTokenCiphertext,
        creds.tokenExpiresAt,
        creds.refreshExpiresAt,
        creds.scopes,
        creds.encryptionKid,
      ],
    );
  }
  
  async getCredentials(
    socialAccountId: SocialAccountId,
  ): Promise<StoredSocialCredentials | null> {
    const result = await this.pool.query(
      `SELECT * FROM social_credentials WHERE social_account_id = $1`,
      [socialAccountId],
    );
    
    if (!result.rows[0]) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      socialAccountId: asSocialAccountId(row.social_account_id),
      accessTokenCiphertext: row.access_token_ciphertext,
      refreshTokenCiphertext: row.refresh_token_ciphertext,
      tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null,
      refreshExpiresAt: row.refresh_expires_at ? new Date(row.refresh_expires_at) : null,
      scopes: row.scopes || [],
      encryptionKid: row.encryption_kid,
    };
  }
  
  async deleteCredentials(socialAccountId: SocialAccountId): Promise<void> {
    await this.pool.query(
      `DELETE FROM social_credentials WHERE social_account_id = $1`,
      [socialAccountId],
    );
  }
  
  async getDecryptedCredentials(
    socialAccountId: SocialAccountId,
  ): Promise<SocialCredentials | null> {
    const stored = await this.getCredentials(socialAccountId);
    if (!stored) {
      return null;
    }
    
    const accessToken = await this.encryption.decrypt(stored.accessTokenCiphertext);
    const refreshToken = stored.refreshTokenCiphertext
      ? await this.encryption.decrypt(stored.refreshTokenCiphertext)
      : undefined;
    
    return {
      accessToken,
      refreshToken,
      expiresAt: stored.tokenExpiresAt || undefined,
      refreshExpiresAt: stored.refreshExpiresAt || undefined,
      scopes: stored.scopes,
    };
  }
  
  private mapRow(row: any): SocialAccount {
    return {
      id: asSocialAccountId(row.id),
      profileId: asProfileId(row.profile_id),
      platform: row.platform as SocialPlatform,
      platformUserId: row.platform_user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      profileUrl: row.profile_url,
      status: row.status as ConnectionStatus,
      transport: row.transport as SocialTransport,
      lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at) : null,
      lastSuccessfulSyncAt: row.last_successful_sync_at
        ? new Date(row.last_successful_sync_at)
        : null,
      syncCoverageRatio: row.sync_coverage_ratio,
      syncMessage: row.sync_message,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      disconnectedAt: row.disconnected_at ? new Date(row.disconnected_at) : null,
    };
  }
}
