import { describe, expect, it } from 'vitest';
import { validateSignupDetails } from './applications.service';

const valid = {
  whatsapp: '(11) 98765-4321',
  redes_sociais: ['Instagram', 'tiktok', 'orkut'],
  instagram_handle: 'https://www.instagram.com/fulano.oficial/',
  tiktok_handle: '@fulano_tt',
  ranking_consent: true,
};

describe('validateSignupDetails', () => {
  it('normaliza telefone, redes e @', () => {
    expect(validateSignupDetails(valid)).toEqual({
      whatsapp: '11987654321',
      redes: ['instagram', 'tiktok'],
      instagramHandle: '@fulano.oficial',
      tiktokHandle: '@fulano_tt',
    });
  });

  it('recusa @ com caracteres que a rede não aceita', () => {
    expect(() => validateSignupDetails({ ...valid, instagram_handle: '@fulano!' })).toThrow(
      /@ do Instagram não é válido/,
    );
    expect(() => validateSignupDetails({ ...valid, tiktok_handle: '@x' + 'a'.repeat(30) })).toThrow(
      /@ do TikTok não é válido/,
    );
  });

  it('só confere o @ das redes escolhidas', () => {
    expect(() =>
      validateSignupDetails({ ...valid, redes_sociais: ['tiktok'], instagram_handle: '!!!' }),
    ).not.toThrow();
  });

  it('recusa WhatsApp curto ou longo demais', () => {
    expect(() => validateSignupDetails({ ...valid, whatsapp: '1234' })).toThrow(/WhatsApp válido/);
    expect(() => validateSignupDetails({ ...valid, whatsapp: '1'.repeat(16) })).toThrow(
      /dígitos demais/,
    );
  });

  it('exige rede e autorização para o ranking', () => {
    expect(() => validateSignupDetails({ ...valid, redes_sociais: [] })).toThrow(/Selecione/);
    expect(() => validateSignupDetails({ ...valid, ranking_consent: false })).toThrow(/autorize/);
  });
});
