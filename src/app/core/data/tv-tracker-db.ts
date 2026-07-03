import Dexie, { type Table } from 'dexie';
import type {
  AppSettingsRecord,
  NotificationEntry,
  TrackedSeries,
  WatchedEpisode,
} from '../models/domain.model';

/**
 * IndexedDB schema for the app, accessed via Dexie.
 * Only DbService (db.service.ts) should import this directly — components
 * should go through DbService for all persistence.
 */
export class TvTrackerDb extends Dexie {
  trackedSeries!: Table<TrackedSeries, number>;
  watchedEpisodes!: Table<WatchedEpisode, string>;
  settings!: Table<AppSettingsRecord, string>;
  notifications!: Table<NotificationEntry, number>;

  constructor() {
    super('tv-tracker');
    this.version(1).stores({
      trackedSeries: 'tmdbSeriesId, name',
      watchedEpisodes: 'episodeKey, tmdbSeriesId',
      settings: 'key',
      notifications: '++id, tmdbSeriesId, airDate, read',
    });
    // v2: DbService.notifications sorts via `.orderBy('createdAt')`, which
    // Dexie requires to be an indexed keyPath — v1 didn't index it, causing
    // a SchemaError on every read. Bumping the version lets Dexie add the
    // missing index for anyone who already created a v1 database.
    this.version(2).stores({
      trackedSeries: 'tmdbSeriesId, name',
      watchedEpisodes: 'episodeKey, tmdbSeriesId',
      settings: 'key',
      notifications: '++id, tmdbSeriesId, airDate, read, createdAt',
    });
  }
}
