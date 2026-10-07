import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * O site fica atrás do Cloudflare e de um nginx. O IP de rede que chega ao
 * Node é o do proxy, e o X-Forwarded-For termina em um IP do Cloudflare que
 * muda a cada requisição. Para o limite valer por pessoa, usamos o IP real
 * informado pelo Cloudflare e, sem ele, o primeiro endereço encaminhado.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const headers = (req.headers ?? {}) as Record<string, string | string[] | undefined>;
    const cf = headerValue(headers['cf-connecting-ip']);
    if (cf) return cf;
    const forwarded = headerValue(headers['x-forwarded-for']);
    if (forwarded) return forwarded.split(',')[0].trim();
    const ips: string[] = Array.isArray(req.ips) ? req.ips : [];
    return ips.length ? ips[0] : String(req.ip ?? 'unknown');
  }
}

function headerValue(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first && first.trim() ? first.trim() : null;
}
