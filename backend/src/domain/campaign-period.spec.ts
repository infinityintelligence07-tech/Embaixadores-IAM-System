import { describe, expect, it } from 'vitest';
import {
  campaignState,
  firstDayOf,
  isStillCounting,
  lastDayOf,
  monthPeriod,
  periodFromDates,
} from './campaign-period';

describe('campaign period', () => {
  it('uses the Brasília month, not the UTC month', () => {
    // 1 de novembro, 01h UTC ainda é 31 de outubro em Brasília.
    const period = monthPeriod(new Date('2026-11-01T01:00:00Z'));
    expect(period.name).toBe('Outubro de 2026');
    expect(period.startsAt.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(period.endsAt.toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });

  it('rolls December into January of the next year', () => {
    const period = monthPeriod(new Date('2026-12-15T12:00:00Z'));
    expect(period.name).toBe('Dezembro de 2026');
    expect(period.endsAt.toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });

  it('counts the last campaign day in full', () => {
    const period = periodFromDates('2026-10-10', '2026-10-20');
    expect(period?.startsAt.toISOString()).toBe('2026-10-10T03:00:00.000Z');
    expect(period?.endsAt.toISOString()).toBe('2026-10-21T03:00:00.000Z');
    expect(firstDayOf(period!)).toBe('2026-10-10');
    expect(lastDayOf(period!)).toBe('2026-10-20');
  });

  it('refuses inverted or impossible dates', () => {
    expect(periodFromDates('2026-10-20', '2026-10-10')).toBeNull();
    expect(periodFromDates('2026-02-30', '2026-03-01')).toBeNull();
    expect(periodFromDates('20/10/2026', '2026-10-21')).toBeNull();
  });

  it('keeps counting for one day after the end, then freezes', () => {
    const period = periodFromDates('2026-10-01', '2026-10-31')!;
    expect(campaignState(period, new Date('2026-09-30T12:00:00Z'))).toBe('scheduled');
    expect(campaignState(period, new Date('2026-10-15T12:00:00Z'))).toBe('active');
    expect(campaignState(period, new Date('2026-11-01T04:00:00Z'))).toBe('finished');
    expect(isStillCounting(period, new Date('2026-11-01T12:00:00Z'))).toBe(true);
    expect(isStillCounting(period, new Date('2026-11-02T04:00:00Z'))).toBe(false);
    expect(isStillCounting(period, new Date('2026-09-30T12:00:00Z'))).toBe(false);
  });
});
