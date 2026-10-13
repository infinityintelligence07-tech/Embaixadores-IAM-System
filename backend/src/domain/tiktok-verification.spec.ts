import { bioHasCode, generateVerificationCode, parseTikTokHandle } from './tiktok-verification';

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

describe('parseTikTokHandle', () => {
  it.each([
    ['@vamosprosperar.br', 'vamosprosperar.br'],
    ['vamosprosperar.br', 'vamosprosperar.br'],
    ['https://www.tiktok.com/@iam.proposito?lang=pt', 'iam.proposito'],
    ['@www.tiktok.com/@voce.precisaouvir', 'voce.precisaouvir'],
    ['  @cortes_IAM  ', 'cortes_IAM'],
  ])('reads %s', (raw, expected) => {
    expect(parseTikTokHandle(raw)).toBe(expected);
  });

  it.each(['', '@', 'a', '@inválido!', 'https://www.tiktok.com/'])('rejects %s', (raw) => {
    expect(parseTikTokHandle(raw)).toBeNull();
  });
});
