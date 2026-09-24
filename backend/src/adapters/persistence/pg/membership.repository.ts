import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { MembershipRepository } from '../../../ports/repositories.port';
import { AmbassadorMembership } from '../../../domain/entities';
import { 
  MembershipId, 
  MembershipStatus, 
  ProfileId, 
  asMembershipId, 
  asProfileId 
} from '../../../domain/types';
import { getPool } from '../../../infrastructure/db/pool';

@Injectable()
export class PgMembershipRepository implements MembershipRepository {
  private pool: Pool;
  
  constructor() {
    this.pool = getPool();
  }
  
  async findByProfileId(profileId: ProfileId): Promise<AmbassadorMembership | null> {
    const result = await this.pool.query(
      `SELECT * FROM ambassador_memberships WHERE profile_id = $1`,
      [profileId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }
  
  async findById(id: MembershipId): Promise<AmbassadorMembership | null> {
    const result = await this.pool.query(
      `SELECT * FROM ambassador_memberships WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }
  
  async findApproved(): Promise<AmbassadorMembership[]> {
    const result = await this.pool.query(
      `SELECT * FROM ambassador_memberships WHERE status = 'approved' ORDER BY approved_at DESC`,
    );
    return result.rows.map(row => this.mapRow(row));
  }

  async findAll(): Promise<AmbassadorMembership[]> {
    const result = await this.pool.query(
      `SELECT * FROM ambassador_memberships ORDER BY created_at DESC`,
    );
    return result.rows.map((row) => this.mapRow(row));
  }
  
  async approve(
    profileId: ProfileId,
    approvedBy: ProfileId,
    approvedAt: Date,
  ): Promise<AmbassadorMembership> {
    const result = await this.pool.query(
      `INSERT INTO ambassador_memberships (profile_id, status, approved_at, approved_by)
       VALUES ($1, 'approved', $2, $3)
       ON CONFLICT (profile_id) DO UPDATE SET
         status = 'approved',
         approved_at = $2,
         approved_by = $3,
         suspended_at = NULL,
         suspension_reason = NULL,
         updated_at = NOW()
       RETURNING *`,
      [profileId, approvedAt, approvedBy],
    );
    return this.mapRow(result.rows[0]);
  }
  
  async suspend(
    profileId: ProfileId,
    reason: string,
    suspendedAt: Date,
  ): Promise<AmbassadorMembership> {
    const result = await this.pool.query(
      `UPDATE ambassador_memberships
       SET status = 'suspended',
           suspended_at = $2,
           suspension_reason = $3,
           updated_at = NOW()
       WHERE profile_id = $1
       RETURNING *`,
      [profileId, suspendedAt, reason],
    );
    return this.mapRow(result.rows[0]);
  }
  
  async reinstate(profileId: ProfileId): Promise<AmbassadorMembership> {
    const result = await this.pool.query(
      `UPDATE ambassador_memberships
       SET status = 'approved',
           suspended_at = NULL,
           suspension_reason = NULL,
           updated_at = NOW()
       WHERE profile_id = $1
       RETURNING *`,
      [profileId],
    );
    return this.mapRow(result.rows[0]);
  }
  
  private mapRow(row: any): AmbassadorMembership {
    return {
      id: asMembershipId(row.id),
      profileId: asProfileId(row.profile_id),
      status: row.status as MembershipStatus,
      approvedAt: row.approved_at ? new Date(row.approved_at) : null,
      approvedBy: row.approved_by ? asProfileId(row.approved_by) : null,
      suspendedAt: row.suspended_at ? new Date(row.suspended_at) : null,
      suspensionReason: row.suspension_reason,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
