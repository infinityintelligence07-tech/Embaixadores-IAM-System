import { describe, expect, it } from 'vitest';
import { patentFor } from '@/lib/seniority';
import { describeChase } from '@/lib/standing';

describe('patentFor', () => {
  it('começa em Despertar', () => {
    expect(patentFor(0).current.name).toBe('Despertar');
    expect(patentFor(999).current.name).toBe('Despertar');
  });

  it('sobe no limiar exato', () => {
    expect(patentFor(1_000).current.name).toBe('Energia');
    expect(patentFor(25_000).current.name).toBe('Prosperidade');
    expect(patentFor(150_000).current.name).toBe('Governo');
  });

  it('trata Governo como nível máximo', () => {
    const max = patentFor(150_000);
    expect(max.current.name).toBe('Governo');
    expect(max.next).toBeNull();
    expect(max.remaining).toBe(0);
    expect(max.progress).toBe(1);
  });

  it('mede o que falta para o próximo nível', () => {
    const step = patentFor(24_999);
    expect(step.current.name).toBe('Energia');
    expect(step.next?.name).toBe('Prosperidade');
    expect(step.remaining).toBe(1);
  });
});

describe('describeChase', () => {
  it('mostra a distância até quem está acima', () => {
    const copy = describeChase({
      eligible: true,
      reason: null,
      position: 10,
      total: 48,
      gapToAbove: 12400,
      myScore: 156000,
      belowGap: 800,
      category: 'total_views',
      platform: 'instagram',
    });
    expect(copy.detail).toBe('Faltam 12.400 views para a 9ª posição.');
    expect(copy.progress).toBeGreaterThan(0.9);
    expect(copy.context).toContain('10ª de 48');
  });

  it('celebra a liderança com a folga para a segunda', () => {
    const copy = describeChase({
      eligible: true,
      reason: null,
      position: 1,
      total: 20,
      gapToAbove: null,
      myScore: 900000,
      belowGap: 8200,
      category: 'best_video',
      platform: 'tiktok',
    });
    expect(copy.detail).toBe('Você lidera. A 2ª posição está a 8.200 views.');
  });

  it('explica quando a pessoa ainda está fora', () => {
    const copy = describeChase({
      eligible: false,
      reason: 'Conta social não conectada ou com autorização inválida',
      position: null,
      total: 12,
      gapToAbove: null,
      myScore: null,
      belowGap: null,
      category: 'total_views',
      platform: 'tiktok',
    });
    expect(copy.detail).toContain('não conectada');
    expect(copy.progress).toBeNull();
  });
});
