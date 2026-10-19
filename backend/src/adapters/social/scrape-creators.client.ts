import { Logger } from '@nestjs/common';
import { SocialProfileNotFoundError, SocialRateLimitError } from '../../ports/social-metrics.port';

const BASE_URL = 'https://api.scrapecreators.com';
const REQUEST_TIMEOUT_MS = 60_000;

/** Cliente HTTP do ScrapeCreators. Cada chamada que responde dados custa um crédito. */
export class ScrapeCreatorsClient {
  private readonly logger = new Logger(ScrapeCreatorsClient.name);

  constructor(private readonly apiKey: string | null) {}

  get enabled(): boolean {
    return Boolean(this.apiKey);
  }

  async get(path: string, params: Record<string, string>): Promise<any> {
    if (!this.apiKey) throw new Error('Public social data not configured');

    const url = new URL(path, BASE_URL);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    const response = await fetch(url, {
      headers: { 'x-api-key': this.apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => null);

    if (response.status === 429) {
      throw new SocialRateLimitError('A leitura da rede está limitada. A coleta continua em breve.', 429);
    }
    if (response.status === 404) {
      throw new SocialProfileNotFoundError();
    }
    if (!response.ok || data?.success === false) {
      // 401 e 402 aqui são da nossa chave (inválida ou sem créditos), não da conta do embaixador.
      this.logger.error(
        `ScrapeCreators ${path} failed status=${response.status} message=${String(data?.message ?? '').slice(0, 160)}`,
      );
      throw new Error(`Public social data request failed (${response.status})`);
    }
    return data;
  }
}
