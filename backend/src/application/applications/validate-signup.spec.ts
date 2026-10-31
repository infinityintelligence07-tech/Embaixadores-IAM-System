import { describe, expect, it } from 'vitest';
import { validateSignupDetails } from './applications.service';

const valid = { whatsapp: '(11) 98765-4321', ranking_consent: true };

describe('validateSignupDetails', () => {
  it('normaliza o telefone e não pede redes', () => {
    expect(validateSignupDetails(valid)).toEqual({ whatsapp: '11987654321' });
  });

  it('ignora redes e @ que um app antigo ainda mande', () => {
    expect(
      validateSignupDetails({
        ...valid,
        redes_sociais: ['orkut'],
        instagram_handle: '!!!',
      } as typeof valid),
    ).toEqual({ whatsapp: '11987654321' });
  });

  it('recusa WhatsApp curto ou longo demais', () => {
    expect(() => validateSignupDetails({ ...valid, whatsapp: '1234' })).toThrow(/WhatsApp válido/);
    expect(() => validateSignupDetails({ ...valid, whatsapp: '1'.repeat(16) })).toThrow(
      /dígitos demais/,
    );
  });

  it('exige autorização para o ranking', () => {
    expect(() => validateSignupDetails({ ...valid, ranking_consent: false })).toThrow(/autorize/);
  });
});
