import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PgRankingRepository } from './ranking.repository';
import { closePool } from '../../../infrastructure/db/pool';
import { RankingCategory, SocialPlatform } from '../../../domain/types';

const ENV = {
  DATABASE_URL: 'postgres://user:pass@127.0.0.1:1/none',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  JWT_SECRET: 'secret',
  TOKEN_ENCRYPTION_KEY: 'key',
  APP_BASE_URL: 'https://example.com',
};

describe('PgRankingRepository.publishAtomic', () => {
  beforeAll(() => {
    for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await closePool();
  });

  it('trava o quadro antes de substituir a versão publicada', async () => {
    const queries: { sql: string; params?: unknown[] }[] = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes('INSERT INTO ranking_versions')) {
          return { rows: [{ id: 'v1', platform: 'tiktok', category: 'total_views', status: 'published' }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const repo = new PgRankingRepository();
    (repo as unknown as { pool: unknown }).pool = { connect: async () => client };

    await repo.publishAtomic({
      platform: SocialPlatform.TikTok,
      category: RankingCategory.TotalViews,
      campaignId: null,
      staleToleranceHours: 24,
      computedAt: new Date('2026-10-30T12:00:00Z'),
      entries: [],
    });

    const lockIndex = queries.findIndex(({ sql }) => sql.includes('pg_advisory_xact_lock'));
    const supersedeIndex = queries.findIndex(({ sql }) => sql.includes("SET status = 'superseded'"));
    expect(queries[0].sql).toBe('BEGIN');
    expect(lockIndex).toBe(1);
    expect(queries[lockIndex].params).toEqual(['ranking:tiktok:total_views:geral']);
    expect(supersedeIndex).toBeGreaterThan(lockIndex);
    expect(queries.at(-1)?.sql).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('o quadro geral (todas as redes) usa platform nulo e trava separado dos quadros por rede', async () => {
    const queries: { sql: string; params?: unknown[] }[] = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes('INSERT INTO ranking_versions')) {
          return { rows: [{ id: 'v2', platform: null, category: 'best_video', status: 'published' }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const repo = new PgRankingRepository();
    (repo as unknown as { pool: unknown }).pool = { connect: async () => client };

    const result = await repo.publishAtomic({
      platform: null,
      category: RankingCategory.BestVideo,
      campaignId: null,
      staleToleranceHours: 24,
      computedAt: new Date('2026-10-30T12:00:00Z'),
      entries: [],
    });

    expect(result.version.platform).toBeNull();
    expect(queries[1].params).toEqual(['ranking:todas:best_video:geral']);
    const supersede = queries.find(({ sql }) => sql.includes("SET status = 'superseded'"));
    expect(supersede?.sql).toContain('platform IS NOT DISTINCT FROM');
    expect(supersede?.params?.[0]).toBeNull();
  });
});
