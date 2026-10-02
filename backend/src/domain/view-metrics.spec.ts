import { describe, expect, it } from 'vitest';
import {
  daysWithoutPosting,
  readInstagramViews,
  readTikTokViewCount,
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
