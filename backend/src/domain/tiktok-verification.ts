/** Sem 0/O, 1/I/L: o código é digitado à mão na bio. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const TIKTOK_HANDLE = /^[A-Za-z0-9._]{2,24}$/;

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

/** Tolera caixa, espaços e hífen trocados, que o TikTok e o teclado costumam mexer. */
export function bioHasCode(bio: string, code: string): boolean {
  const target = compact(code);
  return target.length > 0 && compact(bio).includes(target);
}

/** Aceita "@fulano", "fulano" ou o link do perfil. Devolve o @ sem arroba, ou null se inválido. */
export function parseTikTokHandle(raw: string): string | null {
  const handle = raw
    .trim()
    .replace(/^@+/, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.|m\.|vm\.)?tiktok\.com\//i, '')
    .split(/[/?#\s]/)[0]
    .replace(/^@+/, '');
  return TIKTOK_HANDLE.test(handle) ? handle : null;
}
