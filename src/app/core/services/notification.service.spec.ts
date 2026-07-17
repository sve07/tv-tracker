import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DbService } from '../data/db.service';
import type { NotificationEntry, TrackedSeries } from '../models/domain.model';
import type { TmdbEpisodeSummary, TmdbTvDetails } from '../models/tmdb.model';
import { todayLocalDateKey } from '../utils/date.util';
import { TmdbApiService } from '../api/tmdb-api.service';
import { NotificationService } from './notification.service';

const trackedSeries: TrackedSeries = {
  tmdbSeriesId: 42,
  name: 'Example Show',
  posterPath: null,
  status: 'Returning Series',
  genres: [],
  numberOfSeasons: 1,
  numberOfEpisodes: 10,
  trackedAt: '2026-07-17T12:00:00.000Z',
};

function episode(airDate: string): TmdbEpisodeSummary {
  return {
    id: 1,
    name: 'Episode one',
    overview: '',
    still_path: null,
    air_date: airDate,
    episode_number: 1,
    season_number: 1,
    runtime: 45,
    vote_average: 0,
    vote_count: 0,
  };
}

describe('NotificationService aired episode persistence', () => {
  let notifications: NotificationEntry[];
  let addNotification: ReturnType<typeof vi.fn>;
  let tmdb: { getTvDetails: ReturnType<typeof vi.fn> };
  let service: NotificationService;

  beforeEach(() => {
    notifications = [];
    addNotification = vi.fn(async (entry: Omit<NotificationEntry, 'id'>) => {
      notifications.push({ ...entry, id: notifications.length + 1 });
    });
    tmdb = { getTvDetails: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        NotificationService,
        {
          provide: DbService,
          useValue: {
            trackedSeries: () => [trackedSeries],
            notifications: () => notifications,
            addNotification,
          },
        },
        { provide: TmdbApiService, useValue: tmdb },
      ],
    });
    service = TestBed.inject(NotificationService);
  });

  it('persists an episode that airs today', async () => {
    tmdb.getTvDetails.mockReturnValue(of({ last_episode_to_air: episode(todayLocalDateKey()) } as TmdbTvDetails));

    await service.checkForUpcomingEpisodes();

    expect(addNotification).toHaveBeenCalledOnce();
    expect(notifications[0]).toMatchObject({ airDate: todayLocalDateKey(), episodeNumber: 1 });
  });

  it('does not persist an episode with a future air date', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const airDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    tmdb.getTvDetails.mockReturnValue(of({ last_episode_to_air: episode(airDate) } as TmdbTvDetails));

    await service.checkForUpcomingEpisodes();

    expect(addNotification).not.toHaveBeenCalled();
  });

  it('does not persist a duplicate aired episode', async () => {
    notifications.push({
      id: 1,
      tmdbSeriesId: 42,
      seasonNumber: 1,
      episodeNumber: 1,
      seriesName: 'Example Show',
      episodeName: 'Episode one',
      airDate: todayLocalDateKey(),
      createdAt: '2026-07-17T12:00:00.000Z',
      read: false,
      osNotified: false,
    });
    tmdb.getTvDetails.mockReturnValue(of({ last_episode_to_air: episode(todayLocalDateKey()) } as TmdbTvDetails));

    await service.checkForUpcomingEpisodes();

    expect(addNotification).not.toHaveBeenCalled();
  });
});