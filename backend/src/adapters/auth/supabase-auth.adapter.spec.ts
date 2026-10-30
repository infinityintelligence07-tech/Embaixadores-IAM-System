import { describe, expect, it } from 'vitest';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from '@supabase/supabase-js';
import { sessionErrorToException } from './supabase-auth.adapter';

describe('sessionErrorToException', () => {
  it('token recusado pelo Supabase encerra a sessão (401)', () => {
    expect(sessionErrorToException(new AuthApiError('invalid JWT', 401, 'bad_jwt'))).toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sessionErrorToException(new AuthApiError('forbidden', 403, 'bad_jwt'))).toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sessionErrorToException(new AuthSessionMissingError())).toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('Supabase fora do ar não derruba a sessão (503)', () => {
    expect(sessionErrorToException(new AuthRetryableFetchError('fetch failed', 0))).toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(sessionErrorToException(new AuthApiError('upstream', 502, undefined))).toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(sessionErrorToException(new TypeError('fetch failed'))).toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('responde em português', () => {
    expect(sessionErrorToException(new TypeError('fetch failed')).message).toBe(
      'Não conseguimos confirmar sua sessão agora. Tente de novo em instantes.',
    );
  });
});
