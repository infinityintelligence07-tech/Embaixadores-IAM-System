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
  405: 'Essa ação não está disponível.',
  409: 'Essa ação conflita com o estado atual. Atualize a página e tente de novo.',
  413: 'O conteúdo enviado é grande demais. Para a foto, use uma imagem de até 2 MB.',
  415: 'O formato enviado não é aceito. Atualize a página e tente de novo.',
  422: 'Os dados enviados não são válidos. Revise e tente de novo.',
  429: 'Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo.',
  500: 'Algo deu errado do nosso lado. Tente de novo em instantes.',
  502: 'O serviço está indisponível no momento. Tente de novo em instantes.',
  503: 'O serviço está indisponível no momento. Tente de novo em instantes.',
  504: 'O serviço demorou para responder. Tente de novo em instantes.',
};

const MALFORMED_BODY = 'Os dados chegaram em um formato inválido. Atualize a página e tente de novo.';

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

// Palavras que só aparecem em mensagens técnicas em inglês (parser de JSON, class-validator, Node).
const ENGLISH_WORDS = new Set([
  'the', 'is', 'in', 'at', 'of', 'not', 'must', 'should', 'be', 'expected', 'unexpected',
  'invalid', 'failed', 'cannot', 'error', 'property', 'value', 'token', 'json', 'position',
  'request', 'missing', 'undefined', 'null', 'to', 'and', 'for', 'with', 'an', 'exist',
  'string', 'number', 'boolean', 'array', 'object', 'malformed', 'uri', 'end', 'input',
  'validation', 'empty', 'longer', 'shorter', 'than', 'equal', 'characters', 'one', 'following',
]);

/** Nomes dos campos dos formulários, para a mensagem não expor o nome técnico. */
const FIELD_LABELS: Record<string, string> = {
  fullName: 'nome completo',
  publicName: 'nome no ranking',
  onboardingCompleted: 'cadastro concluído',
  image: 'foto',
  reason: 'justificativa',
  note: 'recado',
  status: 'status',
  decision: 'decisão',
  name: 'nome',
  startDate: 'data de início',
  endDate: 'data de fim',
  mode: 'modo do ranking',
  userId: 'pessoa',
  platform: 'rede',
  staleToleranceHours: 'tolerância',
  manualSyncCooldownSeconds: 'intervalo entre coletas manuais',
  syncIntervalMinutes: 'intervalo de coleta',
};

export function looksTechnicalEnglish(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return true;
  if (GENERIC_ENGLISH.has(normalized)) return true;
  for (const prefix of ['cannot ', 'property ', 'each value in', 'must be', 'should not']) {
    if (normalized.startsWith(prefix)) return true;
  }
  if (/[áàâãéêíóôõúç]/.test(normalized)) return false;
  const words = normalized.match(/[a-z]+/g) ?? [];
  const english = words.filter((word) => ENGLISH_WORDS.has(word)).length;
  return english >= 2;
}

function fieldLabel(field: string): string | null {
  return FIELD_LABELS[field] ?? null;
}

export function translateValidation(messages: string[]): string {
  const first = messages[0] ?? '';
  // Mensagens escritas nos DTOs já estão em português e dizem o que fazer.
  if (first && !looksTechnicalEnglish(first)) return first;

  // class-validator sem mensagem própria devolve frases como "email must be an email".
  const label = fieldLabel(first.split(' ')[0]);
  if (/should not exist/.test(first)) {
    return 'Foram enviados campos que não existem neste formulário. Atualize a página e tente de novo.';
  }
  if (/must be an email/.test(first)) return 'Informe um e-mail válido.';
  if (/must be a URL|must be an URL/.test(first)) return 'Informe um endereço (URL) válido.';
  if (/should not be empty|must be longer/.test(first)) {
    return label ? `Preencha o campo ${label}.` : 'Preencha os campos obrigatórios.';
  }
  if (/must be shorter/.test(first)) {
    return label ? `O campo ${label} é longo demais.` : 'Um dos campos é longo demais.';
  }
  if (/must be (a|an) (string|number|integer|boolean)|must be one of|must not be (less|greater)/.test(first)) {
    return label ? `O campo ${label} tem um valor inválido.` : 'Um dos campos tem um valor inválido.';
  }
  return STATUS_MESSAGES[400];
}

/** Erros do body-parser (JSON quebrado, corpo grande demais) chegam fora do HttpException. */
function bodyParserStatus(exception: unknown): number | null {
  if (!exception || typeof exception !== 'object') return null;
  const error = exception as { status?: unknown; statusCode?: unknown; type?: unknown };
  const status = typeof error.status === 'number' ? error.status : error.statusCode;
  if (typeof status !== 'number' || status < 400 || status >= 500) return null;
  return typeof error.type === 'string' ? status : null;
}

export interface ErrorBody {
  statusCode: number;
  message: string;
  code?: string;
}

export function toErrorBody(exception: unknown): ErrorBody {
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
    if (looksTechnicalEnglish(message)) {
      // O Nest converte o JSON quebrado do body-parser em 400 com a mensagem do parser.
      message = status === HttpStatus.BAD_REQUEST
        ? MALFORMED_BODY
        : STATUS_MESSAGES[status] ?? (status >= 500 ? STATUS_MESSAGES[500] : STATUS_MESSAGES[400]);
    }
  } else {
    const parserStatus = bodyParserStatus(exception);
    if (parserStatus !== null) {
      status = parserStatus;
      message = parserStatus === HttpStatus.BAD_REQUEST
        ? MALFORMED_BODY
        : STATUS_MESSAGES[parserStatus] ?? STATUS_MESSAGES[400];
    }
  }

  return { statusCode: status, message, ...(code ? { code } : {}) };
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const body = toErrorBody(exception);

    if (!(exception instanceof HttpException) && body.statusCode >= 500) {
      const detail = exception instanceof Error ? exception.stack ?? exception.message : String(exception);
      this.logger.error(`${request.method} ${request.originalUrl} falhou: ${detail}`);
    } else if (body.statusCode >= 500 && exception instanceof HttpException) {
      this.logger.error(`${request.method} ${request.originalUrl} -> ${body.statusCode}: ${exception.message}`);
    }

    if (response.headersSent) return;
    response.status(body.statusCode).json(body);
  }
}
