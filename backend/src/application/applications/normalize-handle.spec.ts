import { describe, expect, it } from 'vitest';
import { normalizeHandle } from './applications.service';

describe('normalizeHandle', () => {
  it('keeps a plain handle with a single @', () => {
    expect(normalizeHandle('fulano')).toBe('@fulano');
    expect(normalizeHandle('@@fulano ')).toBe('@fulano');
  });

  it('extracts the handle from a pasted profile URL', () => {
    expect(normalizeHandle('https://www.instagram.com/fulano/?hl=pt')).toBe('@fulano');
    expect(normalizeHandle('www.tiktok.com/@voce.precisaouvir')).toBe('@voce.precisaouvir');
    expect(normalizeHandle('instagram.com/fulano')).toBe('@fulano');
    expect(normalizeHandle('@www.tiktok.com/@voce.precisaouvir')).toBe('@voce.precisaouvir');
  });

  it('returns empty for blank input', () => {
    expect(normalizeHandle('   ')).toBe('');
  });
});
