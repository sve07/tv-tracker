import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DbService } from './db.service';
import type { TrackedSeries } from '../models/domain.model';

const series: TrackedSeries = {
  tmdbSeriesId: 42,
  name: 'Example Show',
  posterPath: '/poster.jpg',
  status: 'Returning Series',
  genres: ['Drama'],
  numberOfSeasons: 2,
  numberOfEpisodes: 20,
  trackedAt: '2026-07-17T12:00:00.000Z',
};

describe('DbService automatic series tracking', () => {
  let service: DbService;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [DbService] });
    service = TestBed.inject(DbService);
    await service.rawDb.delete();
    await service.rawDb.open();
  });

  it('tracks a complete series before saving its first watched episode', async () => {
    await service.setEpisodeWatched(42, 1, 1, 48, true, series);

    await expect(service.rawDb.trackedSeries.get(42)).resolves.toEqual(series);
    await expect(service.rawDb.watchedEpisodes.get('42:1:1')).resolves.toMatchObject({
      tmdbSeriesId: 42,
      seasonNumber: 1,
      episodeNumber: 1,
    });
  });

  it('does not overwrite an already tracked series', async () => {
    const existing = { ...series, name: 'Original name', trackedAt: '2020-01-01T00:00:00.000Z' };
    await service.trackSeries(existing);

    await service.setEpisodeWatched(42, 1, 1, 48, true, series);

    await expect(service.rawDb.trackedSeries.get(42)).resolves.toEqual(existing);
  });
});