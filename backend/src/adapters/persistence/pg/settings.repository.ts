import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { SettingsRepository } from '../../../ports/repositories.port';
import { ProfileId } from '../../../domain/types';
import { getPool } from '../../../infrastructure/db/pool';

@Injectable()
export class PgSettingsRepository implements SettingsRepository {
  private pool: Pool;
  
  constructor() {
    this.pool = getPool();
  }
  
  async get<T = unknown>(key: string): Promise<T | null> {
    const result = await this.pool.query(
      `SELECT value FROM app_settings WHERE key = $1`,
      [key],
    );
    
    if (!result.rows[0]) {
      return null;
    }
    
    const value = result.rows[0].value;
    return typeof value === 'string' ? JSON.parse(value) : value;
  }
  
  async set(key: string, value: unknown, updatedBy?: ProfileId): Promise<void> {
    await this.pool.query(
      `INSERT INTO app_settings (key, value, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET
         value = $2,
         updated_by = $3,
         updated_at = NOW()`,
      [key, JSON.stringify(value), updatedBy || null],
    );
  }
  
  async getNumber(key: string, defaultValue: number): Promise<number> {
    const value = await this.get<number>(key);
    return value !== null ? value : defaultValue;
  }
}
