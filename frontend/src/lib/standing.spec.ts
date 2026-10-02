import { describe, expect, it } from 'vitest';
import { patentFor } from '@/lib/seniority';
import { describeChase } from '@/lib/standing';

describe('patentFor', () => {
  it('começa em Recruta', () => {
    expect(patentFor(0).current.name).toBe('Recruta');
    expect(patentFor(2_499).current.name).toBe('Recruta');
  });

  it('sobe no limiar exato', () => {
    expect(patentFor(2_500).current.name).toBe('Voz');
    expect(patentFor(15_000).current.name).toBe('Embaixador');
    expect(patentFor(60_000).current.name).toBe('Referência');
    expect(patentFor(200_000).current.name).toBe('Ícone');
  });

  it('trata Lenda como patente máxima', () => {
    const max = patentFor(750_000);
    expect(max.current.name).toBe('Lenda');
    expect(max.next).toBeNull();
    expect(max.remaining).toBe(0);
    expect(max.progress).toBe(1);
  });

  it('mede o que falta para a próxima patente', () => {
    const step = patentFor(749_999);
    expect(step.current.name).toBe('Ícone');
    expect(step.next?.name).toBe('Lenda');
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
