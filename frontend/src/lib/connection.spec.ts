import { describe, expect, it } from 'vitest';
import {
  connectionDuty,
  gateHeadline,
  handleError,
  normalizeHandle,
  statusBadge,
} from '@/lib/connection';

describe('normalizeHandle', () => {
  it('tira o @ e os espaços das pontas do que a pessoa digitou', () => {
    expect(normalizeHandle('  @@seuperfil ')).toBe('seuperfil');
    expect(normalizeHandle('seu perfil')).toBe('seu perfil');
    expect(normalizeHandle(null)).toBe('');
  });

  it('aceita o link do perfil colado do app', () => {
    expect(normalizeHandle('https://www.instagram.com/seuperfil/?hl=pt-br')).toBe('seuperfil');
    expect(normalizeHandle('instagram.com/seu.perfil')).toBe('seu.perfil');
    expect(normalizeHandle('https://www.tiktok.com/@seuperfil?lang=pt-BR')).toBe('seuperfil');
  });

  it('não confunde link de publicação com o @', () => {
    expect(normalizeHandle('https://www.instagram.com/p/C1abc/')).toBe('');
    expect(normalizeHandle('https://www.instagram.com/reel/C1abc/')).toBe('');
  });
});

describe('handleError', () => {
  it('aceita letras, números, ponto e sublinhado', () => {
    expect(handleError('instagram', 'seu.perfil_2')).toBeNull();
    expect(handleError('tiktok', 'seuperfil')).toBeNull();
  });

  it('recusa espaço e caractere especial antes de enviar', () => {
    expect(handleError('instagram', 'perfil com espaco!')).toBe(
      'Use só letras, números, ponto e sublinhado.',
    );
    expect(handleError('tiktok', 'perfil-novo')).toBe('Use só letras, números, ponto e sublinhado.');
  });

  it('respeita o tamanho máximo de cada rede', () => {
    expect(handleError('instagram', 'a'.repeat(30))).toBeNull();
    expect(handleError('instagram', 'a'.repeat(31))).toBe('O @ do Instagram tem no máximo 30 caracteres.');
    expect(handleError('tiktok', 'a'.repeat(25))).toBe('O @ do TikTok tem no máximo 24 caracteres.');
  });
});

describe('statusBadge', () => {
  it('fala a língua de quem participa, sem termo técnico', () => {
    expect(statusBadge('authorization_expired').label).toBe('Conexão expirou');
    expect(statusBadge('integration_unavailable').label).toBe('Indisponível no momento');
    expect(statusBadge('syncing')).toEqual({ label: 'Em coleta', tone: 'neutral' });
  });
});

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
      title: 'Conecte o Instagram ou o TikTok',
      detail: 'Escolha a rede onde você posta e digite o seu @. Não pedimos senha.',
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
