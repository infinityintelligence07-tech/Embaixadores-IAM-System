import { bioHasCode, generateVerificationCode, parseHandle } from './social-handle';
import { SocialPlatform } from './types';

describe('generateVerificationCode', () => {
  it('builds an IAM code without ambiguous characters', () => {
    const code = generateVerificationCode(() => 0);
    expect(code).toBe('IAM-AAAAA');
    for (let i = 0; i < 50; i += 1) {
      expect(generateVerificationCode((max) => Math.floor(Math.random() * max))).toMatch(
        /^IAM-[A-HJKMNP-Z2-9]{5}$/,
      );
    }
  });
});

describe('bioHasCode', () => {
  it('finds the code anywhere in the bio', () => {
    expect(bioHasCode('Cortes sobre decisão. IAM-7K3QX', 'IAM-7K3QX')).toBe(true);
  });

  it('ignores case, spaces and the hyphen', () => {
    expect(bioHasCode('iam 7k3qx', 'IAM-7K3QX')).toBe(true);
    expect(bioHasCode('IAM7K3QX', 'IAM-7K3QX')).toBe(true);
  });

  it('rejects a different or missing code', () => {
    expect(bioHasCode('IAM-7K3QY', 'IAM-7K3QX')).toBe(false);
    expect(bioHasCode('', 'IAM-7K3QX')).toBe(false);
    expect(bioHasCode('qualquer coisa', '')).toBe(false);
  });
});

describe('parseHandle', () => {
  it.each([
    ['@vamosprosperar.br', 'vamosprosperar.br'],
    ['vamosprosperar.br', 'vamosprosperar.br'],
    ['https://www.tiktok.com/@iam.proposito?lang=pt', 'iam.proposito'],
    ['@www.tiktok.com/@voce.precisaouvir', 'voce.precisaouvir'],
    ['  @cortes_IAM  ', 'cortes_IAM'],
  ])('reads the TikTok handle %s', (raw, expected) => {
    expect(parseHandle(SocialPlatform.TikTok, raw)).toBe(expected);
  });

  it.each([
    ['@mateuscarddoso', 'mateuscarddoso'],
    ['https://www.instagram.com/mateuscarddoso/', 'mateuscarddoso'],
    ['instagram.com/mateuscarddoso?igsh=abc', 'mateuscarddoso'],
    ['@a', 'a'],
  ])('reads the Instagram handle %s', (raw, expected) => {
    expect(parseHandle(SocialPlatform.Instagram, raw)).toBe(expected);
  });

  it.each(['', '@', 'a', '@inválido!', 'https://www.tiktok.com/'])('rejects the TikTok handle %s', (raw) => {
    expect(parseHandle(SocialPlatform.TikTok, raw)).toBeNull();
  });

  it.each(['', '@inválido!', 'x'.repeat(31)])('rejects the Instagram handle %s', (raw) => {
    expect(parseHandle(SocialPlatform.Instagram, raw)).toBeNull();
  });
});
