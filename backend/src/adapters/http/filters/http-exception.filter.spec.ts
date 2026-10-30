import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { looksTechnicalEnglish, toErrorBody, translateValidation } from './http-exception.filter';

describe('toErrorBody', () => {
  it('troca a mensagem do parser de JSON por uma frase em português', () => {
    const body = toErrorBody(
      new BadRequestException("Expected property name or '}' in JSON at position 1 (line 1 column 2)"),
    );
    expect(body.statusCode).toBe(400);
    expect(body.message).toBe(
      'Os dados chegaram em um formato inválido. Atualize a página e tente de novo.',
    );
  });

  it('responde 413 em português quando o corpo passa do limite', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      type: 'entity.too.large',
      expose: true,
    });
    const body = toErrorBody(tooLarge);
    expect(body.statusCode).toBe(413);
    expect(body.message).toContain('grande demais');
  });

  it('mantém as mensagens de domínio, com ou sem acento', () => {
    expect(toErrorBody(new BadRequestException('Informe o @ do TikTok.')).message).toBe(
      'Informe o @ do TikTok.',
    );
    expect(toErrorBody(new ConflictException('Seu cadastro já está completo.')).message).toBe(
      'Seu cadastro já está completo.',
    );
  });

  it('preserva o código e o status de exceções com corpo próprio', () => {
    const body = toErrorBody(
      new HttpException({ message: 'Aguarde 5 minutos.', code: 'cooldown' }, HttpStatus.TOO_MANY_REQUESTS),
    );
    expect(body).toEqual({ statusCode: 429, message: 'Aguarde 5 minutos.', code: 'cooldown' });
  });

  it('traduz o texto padrão do limitador de requisições', () => {
    const body = toErrorBody(new HttpException('ThrottlerException: Too Many Requests', 429));
    expect(body.message).toBe('Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo.');
  });

  it('esconde erros inesperados atrás de um 500 genérico', () => {
    const body = toErrorBody(new Error('duplicate key value violates unique constraint'));
    expect(body).toEqual({
      statusCode: 500,
      message: 'Algo deu errado do nosso lado. Tente de novo em instantes.',
    });
  });

  it('não confunde um erro comum com status com erro do body-parser', () => {
    const body = toErrorBody(Object.assign(new Error('boom'), { status: 404 }));
    expect(body.statusCode).toBe(500);
  });
});

describe('translateValidation', () => {
  it('devolve a mensagem em português escrita no DTO', () => {
    expect(translateValidation(['O nome no ranking pode ter até 60 caracteres.'])).toBe(
      'O nome no ranking pode ter até 60 caracteres.',
    );
    expect(translateValidation(['Informe o nome completo.'])).toBe('Informe o nome completo.');
  });

  it('traduz mensagens padrão do class-validator sem expor o nome técnico do campo', () => {
    expect(translateValidation(['fullName must be a string'])).toBe(
      'O campo nome completo tem um valor inválido.',
    );
    expect(translateValidation(['somethingElse must be a string'])).toBe(
      'Um dos campos tem um valor inválido.',
    );
    expect(translateValidation(['property hacker should not exist'])).toContain(
      'campos que não existem',
    );
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('mensagens de erro do servidor', () => {
  const root = join(__dirname, '../../..');
  const httpException =
    /new (?:BadRequest|Conflict|NotFound|Forbidden|Unauthorized|ServiceUnavailable|UnprocessableEntity|OAuthStateExpired|Http)Exception\(\s*(['`])((?:(?!\1).)+)\1/gs;
  const messages = sourceFiles(root).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(httpException)].map((match) => ({
      file: file.slice(root.length),
      text: match[2],
    })),
  );

  it('encontra mensagens para conferir', () => {
    expect(messages.length).toBeGreaterThan(30);
  });

  it('não usam travessão nem meia-risca', () => {
    expect(messages.filter(({ text }) => /[\u2014\u2013]/.test(text))).toEqual([]);
  });

  it('não parecem texto técnico em inglês', () => {
    expect(messages.filter(({ text }) => looksTechnicalEnglish(text))).toEqual([]);
  });
});
