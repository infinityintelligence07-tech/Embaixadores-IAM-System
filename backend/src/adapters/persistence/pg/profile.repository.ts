import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import {
  ProfileRepository,
  CreateProfileInput,
  UpdateProfileInput,
} from '../../../ports/repositories.port';
import { Profile } from '../../../domain/entities';
import { AppRole, ProfileId, asProfileId } from '../../../domain/types';
import { getPool } from '../../../infrastructure/db/pool';

@Injectable()
export class PgProfileRepository implements ProfileRepository {
  private pool: Pool;
  
  constructor() {
    this.pool = getPool();
  }
  
  async findById(id: ProfileId): Promise<Profile | null> {
    const result = await this.pool.query(
      `SELECT * FROM profiles WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }
  
  async findByEmail(email: string): Promise<Profile | null> {
    const result = await this.pool.query(
      `SELECT * FROM profiles WHERE email = $1 AND deleted_at IS NULL`,
      [email],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }
  
  async create(input: CreateProfileInput): Promise<Profile> {
    const result = await this.pool.query(
      `INSERT INTO profiles (id, email, full_name, public_name, avatar_url, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.id,
        input.email,
        input.fullName,
        input.publicName,
        input.avatarUrl || null,
        input.role || AppRole.Ambassador,
      ],
    );
    return this.mapRow(result.rows[0]);
  }
  
  async update(id: ProfileId, input: UpdateProfileInput): Promise<Profile> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (input.fullName !== undefined) {
      setClauses.push(`full_name = $${paramIndex++}`);
      values.push(input.fullName);
    }
    if (input.publicName !== undefined) {
      setClauses.push(`public_name = $${paramIndex++}`);
      values.push(input.publicName);
    }
    if (input.avatarUrl !== undefined) {
      setClauses.push(`avatar_url = $${paramIndex++}`);
      values.push(input.avatarUrl);
    }
    if (input.onboardingCompleted !== undefined) {
      setClauses.push(`onboarding_completed = $${paramIndex++}`);
      values.push(input.onboardingCompleted);
    }
    
    setClauses.push(`updated_at = NOW()`);
    values.push(id);
    
    const result = await this.pool.query(
      `UPDATE profiles
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values,
    );
    
    return this.mapRow(result.rows[0]);
  }
  
  async softDelete(id: ProfileId): Promise<void> {
    await this.pool.query(
      `UPDATE profiles SET deleted_at = NOW() WHERE id = $1`,
      [id],
    );
  }
  
  private mapRow(row: any): Profile {
    return {
      id: asProfileId(row.id),
      email: row.email,
      fullName: row.full_name,
      publicName: row.public_name,
      avatarUrl: row.avatar_url,
      role: row.role as AppRole,
      onboardingCompleted: row.onboarding_completed,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    };
  }
}
