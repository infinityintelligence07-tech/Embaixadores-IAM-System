import { describe, expect, it } from 'vitest';
import { connectionDuty, gateHeadline } from '@/lib/connection';

describe('connectionDuty', () => {
  it('trata conta conectada ou sincronizando como pronta', () => {
    expect(connectionDuty('connected')).toBe('ready');
    expect(connectionDuty('syncing')).toBe('ready');
  });

  it('pede a autorização da pessoa quando a rede não foi conectada', () => {
    expect(connectionDuty(null)).toBe('connect');
    expect(connectionDuty(undefined)).toBe('connect');
    expect(connectionDuty('disconnected')).toBe('connect');
  });

  it('separa expiração, permissão, conta pessoal e falha nossa', () => {
    expect(connectionDuty('authorization_expired')).toBe('reconnect');
    expect(connectionDuty('insufficient_permission')).toBe('permission');
    expect(connectionDuty('incompatible_account')).toBe('incompatible');
    expect(connectionDuty('integration_unavailable')).toBe('unavailable');
  });

  it('pede para confirmar o @ de contas antigas que ficaram sem confirmação', () => {
    expect(connectionDuty('pending_verification')).toBe('verify');
  });
});

describe('gateHeadline', () => {
  it('pede as duas redes quando nenhuma está pronta', () => {
    expect(gateHeadline([])).toEqual({
      title: 'Para entrar na competição',
      detail: 'Informe o @ do Instagram, do TikTok ou dos dois. Basta o @, sem senha.',
    });
  });

  it('nomeia só a rede que falta', () => {
    expect(
      gateHeadline([
        { platform: 'instagram', status: 'connected' },
        { platform: 'tiktok', status: 'disconnected' },
      ])?.title,
    ).toBe('Quer disputar também no TikTok?');
  });

  it('some quando as duas redes estão autorizadas', () => {
    expect(
      gateHeadline([
        { platform: 'instagram', status: 'connected' },
        { platform: 'tiktok', status: 'syncing' },
      ]),
    ).toBeNull();
  });
});
