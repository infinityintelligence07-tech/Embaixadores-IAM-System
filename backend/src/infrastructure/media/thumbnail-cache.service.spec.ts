import { describe, expect, it, vi } from 'vitest';
import {
  fetchAllowedImage,
  isAllowedThumbnailUrl,
  readLimited,
  sniffImageType,
} from './thumbnail-cache.service';

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

describe('fetchAllowedImage', () => {
  it('não segue redirecionamento para fora das CDNs', async () => {
    const fetcher = vi.fn().mockResolvedValue(redirect('http://169.254.169.254/latest/meta-data'));
    const result = await fetchAllowedImage('https://scontent.cdninstagram.com/x.jpg', fetcher);
    expect(result).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('segue redirecionamento entre CDNs permitidas', async () => {
    const image = new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200 });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(redirect('https://p16.tiktokcdn.com/cover.jpg'))
      .mockResolvedValueOnce(image);
    const result = await fetchAllowedImage('https://p19.tiktokcdn.com/cover.jpg', fetcher);
    expect(result).toBe(image);
    expect(fetcher.mock.calls[1][0]).toBe('https://p16.tiktokcdn.com/cover.jpg');
  });

  it('desiste depois de muitos redirecionamentos', async () => {
    const fetcher = vi.fn().mockImplementation(async () => redirect('https://a.cdninstagram.com/loop.jpg'));
    expect(await fetchAllowedImage('https://a.cdninstagram.com/loop.jpg', fetcher)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('nem tenta buscar um endereço fora da lista', async () => {
    const fetcher = vi.fn();
    expect(await fetchAllowedImage('https://127.0.0.1/x.jpg', fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('readLimited', () => {
  it('lê o corpo inteiro dentro do limite', async () => {
    const body = await readLimited(new Response(new Uint8Array(10)), 100);
    expect(body?.length).toBe(10);
  });

  it('para de ler quando passa do limite, mesmo sem content-length', async () => {
    expect(await readLimited(new Response(new Uint8Array(200)), 100)).toBeNull();
  });
});

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
