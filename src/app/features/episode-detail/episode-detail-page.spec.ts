import { describe, expect, it } from 'vitest';
import { episodeReturnTarget } from './episode-detail-page';

describe('episodeReturnTarget', () => {
  it('keeps the watchlist return target', () => {
    expect(episodeReturnTarget('/watchlist', 42)).toBe('/watchlist');
  });

  it('keeps a return target for the current series only', () => {
    expect(episodeReturnTarget('/series/42', 42)).toBe('/series/42');
    expect(episodeReturnTarget('/series/99', 42)).toBe('/series/42');
  });

  it('falls back safely for missing or unrecognized return targets', () => {
    expect(episodeReturnTarget(null, 42)).toBe('/series/42');
    expect(episodeReturnTarget('https://example.test', 42)).toBe('/series/42');
  });
});