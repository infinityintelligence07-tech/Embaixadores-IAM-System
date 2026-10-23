import { Controller, Get, Param, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { ThumbnailCacheService } from '../../../infrastructure/media/thumbnail-cache.service';

/** Endereço da capa servida pelo nosso domínio. A tag <img> não envia o token, por isso é pública. */
export function thumbnailPath(content: { id: string; thumbnailUrl: string | null }): string | null {
  return content.thumbnailUrl ? `/api/media/thumbnails/${content.id}` : null;
}

@Controller('api/media')
@SkipThrottle()
export class MediaController {
  constructor(private readonly thumbnails: ThumbnailCacheService) {}

  @Get('thumbnails/:contentId')
  async thumbnail(@Param('contentId') contentId: string, @Res() res: Response) {
    const image = await this.thumbnails.get(contentId);
    if (!image) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).json({ message: 'Capa indisponível.' });
    }
    res.setHeader('Content-Type', image.contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(image.body);
  }
}
