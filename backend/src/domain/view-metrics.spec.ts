import { describe, expect, it } from 'vitest';
import {
  daysWithoutPosting,
  isSyncDue,
  isTikTokFailure,
  readInstagramViews,
  readTikTokViewCount,
  SYNC_INTERVAL_MS,
} from './view-metrics';

describe('readInstagramViews', () => {
  it('lê views no formato total_value', () => {
    expect(
      readInstagramViews({
        data: [{ name: 'views', period: 'lifetime', total_value: { value: 1500 } }],
      }),
    ).toBe(1500);
  });

  it('lê views no formato values e conserva zero', () => {
    expect(
      readInstagramViews({
        data: [{ name: 'views', values: [{ value: 0 }] }],
      }),
    ).toBe(0);
  });

  it('ignora impressões', () => {
    expect(
      readInstagramViews({
        data: [{ name: 'impressions', values: [{ value: 9000 }] }],
      }),
    ).toBeNull();
  });
});

describe('readTikTokViewCount', () => {
  it('conserva zero', () => {
    expect(readTikTokViewCount(0)).toBe(0);
  });

  it('rejeita ausência', () => {
    expect(readTikTokViewCount(null)).toBeNull();
    expect(readTikTokViewCount(undefined)).toBeNull();
  });
});

describe('isSyncDue', () => {
  const now = new Date('2026-10-05T15:00:00.000Z');

  it('pede coleta quando ainda não houve sucesso', () => {
    expect(isSyncDue(null, now)).toBe(true);
  });

  it('espera os dez minutos', () => {
    const recent = new Date(now.getTime() - 9 * 60 * 1000);
    const due = new Date(now.getTime() - SYNC_INTERVAL_MS);
    expect(isSyncDue(recent, now)).toBe(false);
    expect(isSyncDue(due, now)).toBe(true);
  });
});

describe('isTikTokFailure', () => {
  it('aceita a resposta ok da lista de vídeos', () => {
    expect(isTikTokFailure({ code: 'ok', message: '' })).toBe(false);
  });

  it('acusa erro real', () => {
    expect(isTikTokFailure({ code: 'access_token_invalid' })).toBe(true);
    expect(isTikTokFailure('invalid_grant')).toBe(true);
  });
});
describe('daysWithoutPosting', () => {
  it('conta dias civis desde o último post', () => {
    const now = new Date('2026-10-02T15:00:00.000Z');
    const last = new Date('2026-09-28T15:00:00.000Z');
    expect(daysWithoutPosting(last, now)).toBe(4);
  });

  it('fica vazio quando nunca houve post', () => {
    expect(daysWithoutPosting(null, new Date())).toBeNull();
  });
});
