import { describe, expect, it } from 'vitest';
import { categoryFor, isCaughtUp, type SeriesProgress } from './watchlist-page';

const now = Date.parse('2026-07-21T12:00:00.000Z');

function item(overrides: Partial<SeriesProgress> = {}): SeriesProgress {
  return {
    series: {
      tmdbSeriesId: 1,
      name: 'Example',
      posterPath: null,
      status: 'Returning Series',
      genres: [],
      numberOfSeasons: 1,
      numberOfEpisodes: 10,
      trackedAt: '2026-01-01T00:00:00.000Z',
    },
    watchedCount: 3,
    releasedCount: 10,
    activityAt: '2026-07-20T12:00:00.000Z',
    ...overrides,
  };
}

describe('watchlist categories', () => {
  it('places unstarted shows in Not started yet', () => {
    expect(categoryFor(item({ watchedCount: 0 }), now)).toBe('notStarted');
  });

  it('places recently watched incomplete shows in Currently watching', () => {
    expect(categoryFor(item(), now)).toBe('currentlyWatching');
  });

  it('places a show with a recently released episode in Currently watching', () => {
    const progress = item({
      activityAt: '2026-01-01T00:00:00.000Z',
      series: { ...item().series, lastEpisodeAirDate: '2026-07-14' },
    });

    expect(categoryFor(progress, now)).toBe('currentlyWatching');
  });

  it('separates caught-up shows by their final status', () => {
    expect(categoryFor(item({ watchedCount: 10, releasedCount: 10 }), now)).toBe('upToDate');
    expect(
      categoryFor(
        item({
          watchedCount: 10,
          releasedCount: 10,
          series: { ...item().series, status: 'Ended' },
        }),
        now,
      ),
    ).toBe('watchedEnded');
    expect(
      categoryFor(
        item({
          watchedCount: 10,
          releasedCount: 10,
          series: { ...item().series, status: 'Canceled' },
        }),
        now,
      ),
    ).toBe('watchedCanceled');
  });

  it('does not classify an inactive incomplete show as currently watching', () => {
    expect(categoryFor(item({ activityAt: '2026-01-01T00:00:00.000Z' }), now)).toBeNull();
  });

  it('requires at least one released episode before considering a show caught up', () => {
    expect(isCaughtUp(item({ watchedCount: 0, releasedCount: 0 }))).toBe(false);
  });
});
