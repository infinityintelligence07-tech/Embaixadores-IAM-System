import { describe, expect, it } from 'vitest';
import { isAllowedThumbnailUrl, sniffImageType } from './thumbnail-cache.service';

describe('isAllowedThumbnailUrl', () => {
  it('aceita as CDNs do Instagram e do TikTok', () => {
    expect(
      isAllowedThumbnailUrl('https://scontent-phl2-1.cdninstagram.com/v/t51.71878-15/x.jpg?oe=6AE10D25'),
    ).toBe(true);
    expect(isAllowedThumbnailUrl('https://p16-sign-va.tiktokcdn.com/obj/cover.jpeg')).toBe(true);
    expect(isAllowedThumbnailUrl('https://p19-common-sign.tiktokcdn-us.com/cover.webp')).toBe(true);
  });

  it('recusa outros hosts, http e endereços inválidos', () => {
    expect(isAllowedThumbnailUrl('https://evil.example.com/cdninstagram.com.jpg')).toBe(false);
    expect(isAllowedThumbnailUrl('https://cdninstagram.com.evil.example/x.jpg')).toBe(false);
    expect(isAllowedThumbnailUrl('http://scontent.cdninstagram.com/x.jpg')).toBe(false);
    expect(isAllowedThumbnailUrl('http://127.0.0.1/x.jpg')).toBe(false);
    expect(isAllowedThumbnailUrl('não é url')).toBe(false);
  });
});

describe('sniffImageType', () => {
  const pad = (bytes: number[]) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(16)]);

  it('reconhece jpeg, png e webp pelos primeiros bytes', () => {
    expect(sniffImageType(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(sniffImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(sniffImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary'))).toBe('webp');
  });

  it('recusa o que não é imagem', () => {
    expect(sniffImageType(Buffer.from('<html><body>erro</body></html>'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(4))).toBeNull();
  });
});
