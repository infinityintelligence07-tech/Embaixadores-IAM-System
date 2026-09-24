import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import {
  AuditRepository,
  AppendAuditLogInput,
} from '../../../ports/repositories.port';
import { AuditLog } from '../../../domain/entities';
import { asAuditLogId, asProfileId } from '../../../domain/types';
import { getPool } from '../../../infrastructure/db/pool';

@Injectable()
export class PgAuditRepository implements AuditRepository {
  private pool: Pool;
  
  constructor() {
    this.pool = getPool();
  }
  
  async append(input: AppendAuditLogInput): Promise<AuditLog> {
    const result = await this.pool.query(
      `INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id, reason, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        input.actorId,
        input.action,
        input.entityType,
        input.entityId || null,
        input.reason || null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.createdAt || new Date(),
      ],
    );
    return this.mapRow(result.rows[0]);
  }
  
  async findRecent(limit: number): Promise<AuditLog[]> {
    const result = await this.pool.query(
      `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map(row => this.mapRow(row));
  }
  
  async findByEntity(entityType: string, entityId: string): Promise<AuditLog[]> {
    const result = await this.pool.query(
      `SELECT * FROM audit_logs 
       WHERE entity_type = $1 AND entity_id = $2 
       ORDER BY created_at DESC`,
      [entityType, entityId],
    );
    return result.rows.map(row => this.mapRow(row));
  }
  
  private mapRow(row: any): AuditLog {
    return {
      id: asAuditLogId(row.id),
      actorId: row.actor_id ? asProfileId(row.actor_id) : null,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      reason: row.reason,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: new Date(row.created_at),
    };
  }
}
