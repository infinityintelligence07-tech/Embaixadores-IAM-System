import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { sniffImageType } from './thumbnail-cache.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const DATA_URL = /^data:image\/(jpeg|jpg|png|webp);base64,([a-z0-9+/=\s]+)$/i;

export interface StoredAvatar {
  body: Buffer;
  contentType: string;
}

/** Foto de perfil enviada pelo próprio embaixador, guardada no disco do servidor. */
@Injectable()
export class AvatarStoreService {
  private readonly logger = new Logger(AvatarStoreService.name);
  private readonly dir = process.env.AVATAR_DIR || join(tmpdir(), 'embaixadores-avatars');

  /** Valida a imagem enviada como data URL e devolve o endereço público com versão. */
  async save(profileId: string, dataUrl: string, now: Date): Promise<string> {
    if (!UUID.test(profileId)) throw new BadRequestException('Perfil inválido.');
    const match = DATA_URL.exec(dataUrl?.trim() ?? '');
    if (!match) {
      throw new BadRequestException('Envie uma foto em JPG, PNG ou WEBP.');
    }
    const body = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
    if (body.length === 0) throw new BadRequestException('A foto chegou vazia. Tente de novo.');
    if (body.length > MAX_BYTES) {
      throw new BadRequestException('A foto passou de 2 MB. Escolha uma imagem menor.');
    }
    const ext = sniffImageType(body);
    if (!ext || !(ext in ACCEPTED)) {
      throw new BadRequestException('Esse arquivo não é uma foto em JPG, PNG ou WEBP.');
    }

    await mkdir(this.dir, { recursive: true });
    await this.removeFiles(profileId);
    const target = join(this.dir, `${profileId}.${ext}`);
    const partial = `${target}.${process.pid}.tmp`;
    await writeFile(partial, body);
    await rename(partial, target);
    return `/api/media/avatars/${profileId}?v=${now.getTime()}`;
  }

  async read(profileId: string): Promise<StoredAvatar | null> {
    if (!UUID.test(profileId)) return null;
    for (const [ext, contentType] of Object.entries(ACCEPTED)) {
      try {
        return { body: await readFile(join(this.dir, `${profileId}.${ext}`)), contentType };
      } catch {
        // Tenta o próximo formato.
      }
    }
    return null;
  }

  async remove(profileId: string): Promise<void> {
    if (!UUID.test(profileId)) return;
    await this.removeFiles(profileId);
  }

  private async removeFiles(profileId: string): Promise<void> {
    for (const ext of Object.keys(ACCEPTED)) {
      await unlink(join(this.dir, `${profileId}.${ext}`)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') this.logger.warn(`Não foi possível apagar a foto antiga: ${error}`);
      });
    }
  }
}
