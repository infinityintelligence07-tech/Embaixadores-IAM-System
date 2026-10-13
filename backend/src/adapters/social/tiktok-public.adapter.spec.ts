import { afterEach, describe, expect, it, vi } from 'vitest';
import { SocialProfileNotFoundError } from '../../ports/social-metrics.port';
import { TikTokPublicAdapter } from './tiktok-public.adapter';

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TikTokPublicAdapter', () => {
  const adapter = new TikTokPublicAdapter('test-key');

  it('reads the public profile and its bio', async () => {
    const fetchMock = respond({
      success: true,
      user: {
        id: '7656840780338676744',
        uniqueId: 'vamosprosperar.br',
        nickname: 'Vamos Prosperar',
        avatarMedium: 'https://cdn/avatar.jpg',
        signature: 'Cortes sobre decisão. IAM-7K3QX',
        privateAccount: false,
      },
    });

    const profile = await adapter.lookupProfile('@vamosprosperar.br');

    expect(profile).toEqual({
      platformUserId: '7656840780338676744',
      username: 'vamosprosperar.br',
      displayName: 'Vamos Prosperar',
      avatarUrl: 'https://cdn/avatar.jpg',
      profileUrl: 'https://www.tiktok.com/@vamosprosperar.br',
      bio: 'Cortes sobre decisão. IAM-7K3QX',
      isPrivate: false,
    });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/v1/tiktok/profile');
    expect(url.searchParams.get('handle')).toBe('vamosprosperar.br');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'x-api-key': 'test-key' });
  });

  it('treats a deactivated account as not found', async () => {
    respond({ success: true, account_deactivated: true, message: "Account doesn't exist" });
    await expect(adapter.lookupProfile('ninguem')).rejects.toBeInstanceOf(SocialProfileNotFoundError);
  });

  it('maps videos with play_count and pages with max_cursor', async () => {
    const fetchMock = respond({
      success: true,
      has_more: 1,
      max_cursor: 1791496909021,
      aweme_list: [
        {
          aweme_id: '7696168060474084660',
          desc: 'Seu copo está pronto? ',
          create_time: 1791903757,
          url: 'https://www.tiktok.com/@vamosprosperar.br/video/7696168060474084660',
          statistics: { play_count: 167 },
          video: { cover: { url_list: ['https://cdn/cover.heic'] } },
        },
      ],
    });

    const page = await adapter.listContents(
      { accessToken: '', scopes: [], handle: 'vamosprosperar.br', platformUserId: '765' },
      '1791900000000',
    );

    expect(page.nextCursor).toBe('1791496909021');
    expect(page.items).toEqual([
      {
        platformContentId: '7696168060474084660',
        title: 'Seu copo está pronto?',
        thumbnailUrl: 'https://cdn/cover.heic',
        permalink: 'https://www.tiktok.com/@vamosprosperar.br/video/7696168060474084660',
        publishedAt: new Date(1791903757 * 1000),
        mediaType: 'video',
        views: 167,
        viewsAvailable: true,
      },
    ]);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('max_cursor')).toBe('1791900000000');
    expect(url.searchParams.get('user_id')).toBe('765');
  });

  it('stops when there are no more pages', async () => {
    respond({ success: true, has_more: 0, max_cursor: 0, aweme_list: [] });
    const page = await adapter.listContents({ accessToken: '', scopes: [], handle: 'x' });
    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it('refuses to loop on a repeated cursor', async () => {
    respond({ success: true, has_more: 1, max_cursor: 55, aweme_list: [] });
    await expect(
      adapter.listContents({ accessToken: '', scopes: [], handle: 'x' }, '55'),
    ).rejects.toThrow('cursor');
  });

  it('is disabled without an API key', async () => {
    const off = new TikTokPublicAdapter(null);
    expect(off.enabled).toBe(false);
    await expect(off.lookupProfile('x')).rejects.toThrow('not configured');
  });
});
