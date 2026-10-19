import { afterEach, describe, expect, it, vi } from 'vitest';
import { SocialProfileNotFoundError } from '../../ports/social-metrics.port';
import { InstagramPublicAdapter } from './instagram-public.adapter';

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

const creds = {
  accessToken: '',
  scopes: [],
  handle: 'mateuscarddoso',
  platformUserId: '51253505801',
};

function reel(code: string, ownerPk: number, ownerName: string, plays: number) {
  return {
    id: `401_${ownerPk}`,
    code,
    taken_at: 1792259149,
    url: `https://www.instagram.com/reel/${code}/`,
    caption: { text: ' Legenda do reel ' },
    play_count: plays,
    ig_play_count: plays,
    display_uri: 'https://cdn/thumb.jpg',
    user: { pk: ownerPk, id: String(ownerPk), username: ownerName },
  };
}

describe('InstagramPublicAdapter', () => {
  const adapter = new InstagramPublicAdapter('test-key');

  it('reads the public profile and its bio', async () => {
    const fetchMock = respond({
      success: true,
      data: {
        user: {
          id: '51253505801',
          username: 'mateuscarddoso',
          full_name: 'Mateus Cardoso',
          biography: 'Head de MKT. IAM-7K3QX',
          is_private: false,
          profile_pic_url: 'https://cdn/pic.jpg',
          fbid: '17841451174046688',
        },
      },
    });

    const profile = await adapter.lookupProfile('@mateuscarddoso');

    expect(profile).toEqual({
      platformUserId: '51253505801',
      username: 'mateuscarddoso',
      displayName: 'Mateus Cardoso',
      avatarUrl: 'https://cdn/pic.jpg',
      profileUrl: 'https://www.instagram.com/mateuscarddoso/',
      bio: 'Head de MKT. IAM-7K3QX',
      isPrivate: false,
      aliasUserIds: ['17841451174046688'],
    });
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('handle')).toBe('mateuscarddoso');
  });

  it('treats a 404 as a missing profile', async () => {
    respond(
      { success: true, error: 'not_found', message: 'Profile is unavailable on Instagram' },
      404,
    );
    await expect(adapter.lookupProfile('ninguem')).rejects.toBeInstanceOf(
      SocialProfileNotFoundError,
    );
  });

  it('keeps only reels published on the own profile', async () => {
    const fetchMock = respond({
      success: true,
      max_id: 'NEXT==',
      items: [
        reel('Demqr4CPa_O', 51253505801, 'mateuscarddoso', 3306),
        reel('DXVcrbkjSYi', 999, 'djeniwur', 5000),
      ],
    });

    const page = await adapter.listContents(creds, null);

    expect(page.nextCursor).toBe('NEXT==');
    expect(page.items).toEqual([
      {
        platformContentId: 'Demqr4CPa_O',
        title: 'Legenda do reel',
        thumbnailUrl: 'https://cdn/thumb.jpg',
        permalink: 'https://www.instagram.com/reel/Demqr4CPa_O/',
        publishedAt: new Date(1792259149 * 1000),
        mediaType: 'VIDEO',
        views: 3306,
        viewsAvailable: true,
      },
    ]);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/v1/instagram/user/reels');
    expect(url.searchParams.get('user_id')).toBe('51253505801');
    expect(url.searchParams.has('max_id')).toBe(false);
  });

  it('stops on an empty page or a repeated cursor', async () => {
    respond({ success: true, max_id: 'SAME', items: [] });
    expect((await adapter.listContents(creds, 'SAME')).nextCursor).toBeNull();

    respond({ success: true, max_id: 'SAME', items: [reel('A1', 51253505801, 'x', 1)] });
    expect((await adapter.listContents(creds, 'SAME')).nextCursor).toBeNull();
  });
});
