import { describe, expect, it } from 'vitest';
import { countsTowardRanking } from './ranked-media';
import { SocialPlatform } from './types';

describe('countsTowardRanking', () => {
  it('counts only Reels/videos on Instagram', () => {
    expect(countsTowardRanking(SocialPlatform.Instagram, 'VIDEO')).toBe(true);
    expect(countsTowardRanking(SocialPlatform.Instagram, 'video')).toBe(true);
    expect(countsTowardRanking(SocialPlatform.Instagram, 'IMAGE')).toBe(false);
    expect(countsTowardRanking(SocialPlatform.Instagram, 'CAROUSEL_ALBUM')).toBe(false);
    expect(countsTowardRanking(SocialPlatform.Instagram, null)).toBe(false);
  });

  it('counts every TikTok post', () => {
    expect(countsTowardRanking(SocialPlatform.TikTok, 'video')).toBe(true);
    expect(countsTowardRanking(SocialPlatform.TikTok, null)).toBe(true);
  });
});
