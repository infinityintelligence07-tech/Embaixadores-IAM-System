import { SocialPlatform } from './types';

/** Sem 0/O, 1/I/L: o código é digitado à mão na bio. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const TIKTOK_HANDLE = /^[A-Za-z0-9._]{2,24}$/;
const INSTAGRAM_HANDLE = /^[A-Za-z0-9._]{1,30}$/;

export function generateVerificationCode(randomIndex: (max: number) => number): string {
  let suffix = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    suffix += CODE_ALPHABET[randomIndex(CODE_ALPHABET.length)];
  }
  return `IAM-${suffix}`;
}

function compact(value: string): string {
  return value.normalize('NFKC').toUpperCase().replace(/[\s\-_.]/g, '');
}

/** Tolera caixa, espaços e hífen trocados, que a rede e o teclado costumam mexer. */
export function bioHasCode(bio: string, code: string): boolean {
  const target = compact(code);
  return target.length > 0 && compact(bio).includes(target);
}

/** Aceita "@fulano", "fulano" ou o link do perfil. Devolve o @ sem arroba, ou null se inválido. */
export function parseHandle(platform: SocialPlatform, raw: string): string | null {
  const handle = raw
    .trim()
    .replace(/^@+/, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.|m\.|vm\.)?(tiktok|instagram)\.com\//i, '')
    .split(/[/?#\s]/)[0]
    .replace(/^@+/, '');

  switch (platform) {
    case SocialPlatform.TikTok:
      return TIKTOK_HANDLE.test(handle) ? handle : null;
    case SocialPlatform.Instagram:
      return INSTAGRAM_HANDLE.test(handle) ? handle : null;
    default: {
      const exhaustive: never = platform;
      return exhaustive;
    }
  }
}
