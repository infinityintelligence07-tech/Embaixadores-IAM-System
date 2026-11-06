import { describe, expect, it } from 'vitest';
import { citesMarcos, countsTowardRanking, rankedMediaSql } from './ranked-media';
import { SocialPlatform } from './types';

const post = (mediaType: string | null, title: string | null, permalink: string | null = null) => ({
  mediaType,
  title,
  permalink,
});

describe('countsTowardRanking', () => {
  it('counts only Reels/videos on Instagram', () => {
    expect(countsTowardRanking(SocialPlatform.Instagram, post('VIDEO', '#MarcosFiel'))).toBe(true);
    expect(countsTowardRanking(SocialPlatform.Instagram, post('video', '#MarcosFiel'))).toBe(true);
    expect(countsTowardRanking(SocialPlatform.Instagram, post('IMAGE', '#MarcosFiel'))).toBe(false);
    expect(countsTowardRanking(SocialPlatform.Instagram, post('CAROUSEL_ALBUM', '#MarcosFiel'))).toBe(false);
    expect(countsTowardRanking(SocialPlatform.Instagram, post(null, '#MarcosFiel'))).toBe(false);
  });

  it('counts TikTok videos but not TikTok photo posts', () => {
    expect(
      countsTowardRanking(
        SocialPlatform.TikTok,
        post('video', '#marcosfiel', 'https://www.tiktok.com/@a/video/1'),
      ),
    ).toBe(true);
    expect(
      countsTowardRanking(
        SocialPlatform.TikTok,
        post('video', '#marcosfiel', 'https://www.tiktok.com/@a/photo/1'),
      ),
    ).toBe(false);
  });

  it('counts only videos whose caption cites Marcos', () => {
    expect(countsTowardRanking(SocialPlatform.TikTok, post('video', 'Inteligência emocional #fyp'))).toBe(false);
    expect(countsTowardRanking(SocialPlatform.TikTok, post('video', null))).toBe(false);
  });
});

describe('citesMarcos', () => {
  it('accepts the hashtag, the @, the full name and Acorde Sua Mente', () => {
    for (const title of [
      '#MarcosFiel',
      '#marcosfiel',
      'Corte do @marcosfiel',
      'Palavra de Marcos Fiel hoje',
      'marcos.fiel',
      '#AcordeSuaMente',
      'acorde sua mente',
    ]) {
      expect(citesMarcos(title)).toBe(true);
    }
  });

  it('rejects captions that do not cite Marcos', () => {
    expect(citesMarcos('#mindset #fyp')).toBe(false);
    expect(citesMarcos('Marcos Silva')).toBe(false);
  });
});

describe('rankedMediaSql', () => {
  it('applies the same three rules in SQL', () => {
    const sql = rankedMediaSql('c');
    expect(sql).toContain("upper(c.media_type) = 'VIDEO'");
    expect(sql).toContain("NOT LIKE '%/photo/%'");
    expect(sql).toContain('~*');
  });
});
