import { Inject, Injectable, Logger } from '@nestjs/common';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ContentId } from '../../domain/types';
import { ContentRepository } from '../../ports/repositories.port';
import { INJECTION_TOKENS } from '../tokens/injection-tokens';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;
const WARM_CONCURRENCY = 3;
const WARM_QUEUE_LIMIT = 500;

/** CDNs de onde as capas vêm. Qualquer outro endereço é recusado. */
const ALLOWED_HOST_SUFFIXES = [
  'cdninstagram.com',
  'fbcdn.net',
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktokcdn-eu.com',
  'ibyteimg.com',
  'byteimg.com',
  'muscdn.com',
  'picsum.photos',
];

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  gif: 'image/gif',
};

export interface CachedThumbnail {
  body: Buffer;
  contentType: string;
}

export function isAllowedThumbnailUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** Formato pelos primeiros bytes: o content-type das CDNs nem sempre bate com o arquivo. */
export function sniffImageType(body: Buffer): keyof typeof TYPES | null {
  if (body.length < 12) return null;
  if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return 'jpg';
  if (body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'webp';
  }
  if (body.subarray(0, 3).toString('ascii') === 'GIF') return 'gif';
  if (body.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = body.subarray(8, 12).toString('ascii');
    if (brand.startsWith('avi')) return 'avif';
    if (brand.startsWith('hei') || brand.startsWith('mif')) return 'heic';
  }
  return null;
}

/**
 * As capas do Instagram e do TikTok não abrem em outro site (o Instagram envia
 * Cross-Origin-Resource-Policy: same-origin) e os links assinados vencem em dias.
 * O servidor baixa a capa uma vez, guarda em disco e entrega pelo nosso domínio.
 */
@Injectable()
export class ThumbnailCacheService {
  private readonly logger = new Logger(ThumbnailCacheService.name);
  private readonly dir = process.env.THUMBNAIL_CACHE_DIR || join(tmpdir(), 'embaixadores-thumbnails');
  private readonly inFlight = new Map<string, Promise<CachedThumbnail | null>>();
  private readonly warmQueue: { id: string; url: string }[] = [];
  private readonly queued = new Set<string>();
  private warming = 0;
  private dirReady: Promise<void> | null = null;

  constructor(
    @Inject(INJECTION_TOKENS.CONTENT_REPOSITORY)
    private readonly contentRepo: ContentRepository,
  ) {}

  /** Capa do conteúdo: do disco, ou baixada agora do endereço gravado na coleta. */
  async get(contentId: string): Promise<CachedThumbnail | null> {
    if (!UUID.test(contentId)) return null;
    const cached = await this.read(contentId);
    if (cached) return cached;
    const content = await this.contentRepo.findById(contentId as ContentId);
    if (!content?.thumbnailUrl) return null;
    return this.download(contentId, content.thumbnailUrl);
  }

  /** Guarda a capa enquanto o link da coleta ainda vale. Não bloqueia a coleta. */
  warm(contentId: string, url: string | null): void {
    if (!url || !UUID.test(contentId) || this.queued.has(contentId)) return;
    if (this.warmQueue.length >= WARM_QUEUE_LIMIT) return;
    this.queued.add(contentId);
    this.warmQueue.push({ id: contentId, url });
    this.pump();
  }

  private pump(): void {
    while (this.warming < WARM_CONCURRENCY && this.warmQueue.length > 0) {
      const next = this.warmQueue.shift()!;
      this.warming += 1;
      void this.read(next.id)
        .then((cached) => (cached ? cached : this.download(next.id, next.url)))
        .catch(() => null)
        .finally(() => {
          this.warming -= 1;
          this.queued.delete(next.id);
          this.pump();
        });
    }
  }

  private download(contentId: string, url: string): Promise<CachedThumbnail | null> {
    const running = this.inFlight.get(contentId);
    if (running) return running;
    const task = this.fetchAndStore(contentId, url).finally(() => this.inFlight.delete(contentId));
    this.inFlight.set(contentId, task);
    return task;
  }

  private async fetchAndStore(contentId: string, url: string): Promise<CachedThumbnail | null> {
    if (!isAllowedThumbnailUrl(url)) return null;
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: 'image/avif,image/webp,image/jpeg,image/*;q=0.8' },
      });
      if (!response.ok) {
        this.logger.debug(`Capa ${contentId} indisponível na CDN (status ${response.status})`);
        return null;
      }
      const declared = Number(response.headers.get('content-length') ?? 0);
      if (declared > MAX_BYTES) return null;
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length === 0 || body.length > MAX_BYTES) return null;
      const ext = sniffImageType(body);
      if (!ext) return null;
      await this.write(contentId, ext, body);
      return { body, contentType: TYPES[ext] };
    } catch (error) {
      this.logger.debug(`Falha ao baixar a capa ${contentId}: ${error}`);
      return null;
    }
  }

  private async read(contentId: string): Promise<CachedThumbnail | null> {
    for (const ext of Object.keys(TYPES)) {
      try {
        const body = await readFile(join(this.dir, `${contentId}.${ext}`));
        return { body, contentType: TYPES[ext] };
      } catch {
        // Tenta o próximo formato.
      }
    }
    return null;
  }

  private async write(contentId: string, ext: string, body: Buffer): Promise<void> {
    try {
      this.dirReady ??= mkdir(this.dir, { recursive: true }).then(() => undefined);
      await this.dirReady;
      const target = join(this.dir, `${contentId}.${ext}`);
      const partial = `${target}.${process.pid}.tmp`;
      await writeFile(partial, body);
      await rename(partial, target);
    } catch (error) {
      this.dirReady = null;
      this.logger.warn(`Não foi possível guardar a capa ${contentId}: ${error}`);
    }
  }
}
