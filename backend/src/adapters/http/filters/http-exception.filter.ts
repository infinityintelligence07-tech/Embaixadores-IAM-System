import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Toda resposta de erro da API sai em português e sem detalhe técnico.
 * Mensagens de domínio (já em português) passam intactas; o restante vira
 * uma frase curta que diz o que a pessoa pode fazer.
 */
const STATUS_MESSAGES: Record<number, string> = {
  400: 'Os dados enviados não são válidos. Revise e tente de novo.',
  401: 'Sua sessão expirou. Entre de novo para continuar.',
  403: 'Você não tem permissão para fazer isso.',
  404: 'Não encontramos o que você procurava.',
  409: 'Essa ação conflita com o estado atual. Atualize a página e tente de novo.',
  413: 'O conteúdo enviado é grande demais.',
  422: 'Os dados enviados não são válidos. Revise e tente de novo.',
  429: 'Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo.',
  500: 'Algo deu errado do nosso lado. Tente de novo em instantes.',
  502: 'O serviço está indisponível no momento. Tente de novo em instantes.',
  503: 'O serviço está indisponível no momento. Tente de novo em instantes.',
  504: 'O serviço demorou para responder. Tente de novo em instantes.',
};

// Textos padrão do Nest/Express que nunca devem chegar à interface.
const GENERIC_ENGLISH = new Set([
  'internal server error',
  'bad request',
  'unauthorized',
  'forbidden',
  'not found',
  'conflict',
  'unprocessable entity',
  'too many requests',
  'bad gateway',
  'service unavailable',
  'gateway timeout',
  'payload too large',
  'cannot get',
  'cannot post',
]);

function looksEnglishGeneric(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (GENERIC_ENGLISH.has(normalized)) return true;
  for (const prefix of ['cannot ', 'property ', 'each value in', 'must be', 'should not']) {
    if (normalized.startsWith(prefix)) return true;
  }
  return false;
}

function translateValidation(messages: string[]): string {
  // class-validator devolve frases em inglês como "email must be an email".
  const first = messages[0] ?? '';
  const field = first.split(' ')[0];
  if (/should not exist/.test(first)) {
    return 'Foram enviados campos que não existem neste formulário.';
  }
  if (/must be an email/.test(first)) return 'Informe um e-mail válido.';
  if (/must be a URL|must be an URL/.test(first)) return 'Informe um endereço (URL) válido.';
  if (/should not be empty|must be longer/.test(first)) {
    return field ? `O campo "${field}" é obrigatório.` : 'Preencha os campos obrigatórios.';
  }
  if (/must be shorter/.test(first)) {
    return field ? `O campo "${field}" é longo demais.` : 'Um dos campos é longo demais.';
  }
  if (/must be a (string|number|boolean)|must be one of/.test(first)) {
    return field ? `O campo "${field}" tem um valor inválido.` : 'Um dos campos tem valor inválido.';
  }
  return STATUS_MESSAGES[400];
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = STATUS_MESSAGES[500];
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const raw = (body as { message?: unknown; code?: unknown }).message;
        code = typeof (body as { code?: unknown }).code === 'string'
          ? ((body as { code: string }).code)
          : undefined;
        if (Array.isArray(raw)) {
          message = translateValidation(raw.map(String));
        } else if (typeof raw === 'string') {
          message = raw;
        } else {
          message = STATUS_MESSAGES[status] ?? STATUS_MESSAGES[500];
        }
      }
      // O ThrottlerGuard devolve "ThrottlerException: Too Many Requests"
      if (status === HttpStatus.TOO_MANY_REQUESTS && /throttler|too many/i.test(message)) {
        message = STATUS_MESSAGES[429];
      }
      if (looksEnglishGeneric(message)) {
        message = STATUS_MESSAGES[status] ?? STATUS_MESSAGES[500];
      }
    } else {
      const detail = exception instanceof Error ? exception.stack ?? exception.message : String(exception);
      this.logger.error(`${request.method} ${request.originalUrl} falhou: ${detail}`);
    }

    if (status >= 500 && exception instanceof HttpException) {
      this.logger.error(`${request.method} ${request.originalUrl} -> ${status}: ${exception.message}`);
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(code ? { code } : {}),
    });
  }
}
