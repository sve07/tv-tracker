import { Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { liveQuery } from 'dexie';
import { from } from 'rxjs';
import { TvTrackerDb } from './tv-tracker-db';
import {
  APP_SETTINGS_KEY,
  type AppSettingsRecord,
  type NotificationEntry,
  type Theme,
  type TrackedSeries,
  type WatchedEpisode,
} from '../models/domain.model';

/**
 * Single point of access to IndexedDB (via Dexie). Components/feature services
 * should depend on this instead of importing TvTrackerDb directly.
 *
 * Reactive collections are exposed as signals backed by Dexie's `liveQuery`,
 * so any write made here (or from another browser tab) is reflected
 * automatically without manual refetching.
 */
@Injectable({ providedIn: 'root' })
export class DbService {
  private readonly db = new TvTrackerDb();

  // Dexie's `liveQuery` returns Dexie's own minimal Observable type, not an
  // rxjs Observable, which confuses toSignal's type inference — wrapping in
  // rxjs's `from()` normalizes it to a proper rxjs Observable<T>.
  readonly trackedSeries = toSignal(
    from(liveQuery<TrackedSeries[]>(() => this.db.trackedSeries.toArray())),
    { initialValue: [] as TrackedSeries[] },
  );

  readonly watchedEpisodes = toSignal(
    from(liveQuery<WatchedEpisode[]>(() => this.db.watchedEpisodes.toArray())),
    { initialValue: [] as WatchedEpisode[] },
  );

  readonly notifications = toSignal(
    from(
      liveQuery<NotificationEntry[]>(() =>
        this.db.notifications.orderBy('createdAt').reverse().toArray(),
      ),
    ),
    { initialValue: [] as NotificationEntry[] },
  );

  readonly settings = toSignal(
    from(liveQuery<AppSettingsRecord | undefined>(() => this.db.settings.get(APP_SETTINGS_KEY))),
    { initialValue: undefined as AppSettingsRecord | undefined },
  );

  /** Raw Dexie instance — only for ExportImportService, which needs to iterate all tables generically. */
  get rawDb(): TvTrackerDb {
    return this.db;
  }

  async trackSeries(series: TrackedSeries): Promise<void> {
    await this.db.trackedSeries.put(series);
  }

  async untrackSeries(tmdbSeriesId: number): Promise<void> {
    await this.db.transaction('rw', this.db.trackedSeries, this.db.watchedEpisodes, async () => {
      await this.db.trackedSeries.delete(tmdbSeriesId);
      await this.db.watchedEpisodes.where('tmdbSeriesId').equals(tmdbSeriesId).delete();
    });
  }

  isTracked(tmdbSeriesId: number): boolean {
    return this.trackedSeries().some((series) => series.tmdbSeriesId === tmdbSeriesId);
  }

  async setEpisodeWatched(
    tmdbSeriesId: number,
    seasonNumber: number,
    episodeNumber: number,
    runtimeMinutes: number | null,
    watched: boolean,
  ): Promise<void> {
    const episodeKey = `${tmdbSeriesId}:${seasonNumber}:${episodeNumber}`;
    if (watched) {
      await this.db.watchedEpisodes.put({
        episodeKey,
        tmdbSeriesId,
        seasonNumber,
        episodeNumber,
        watchedAt: new Date().toISOString(),
        runtimeMinutes,
      });
    } else {
      await this.db.watchedEpisodes.delete(episodeKey);
    }
  }

  isEpisodeWatched(tmdbSeriesId: number, seasonNumber: number, episodeNumber: number): boolean {
    const episodeKey = `${tmdbSeriesId}:${seasonNumber}:${episodeNumber}`;
    return this.watchedEpisodes().some((episode) => episode.episodeKey === episodeKey);
  }

  watchedCountFor(tmdbSeriesId: number): number {
    return this.watchedEpisodes().filter((episode) => episode.tmdbSeriesId === tmdbSeriesId).length;
  }

  watchedCountForSeason(tmdbSeriesId: number, seasonNumber: number): number {
    return this.watchedEpisodes().filter(
      (episode) => episode.tmdbSeriesId === tmdbSeriesId && episode.seasonNumber === seasonNumber,
    ).length;
  }

  /** Marks every given episode of a season as watched in a single transaction. */
  async setSeasonWatched(
    tmdbSeriesId: number,
    seasonNumber: number,
    episodes: { episodeNumber: number; runtimeMinutes: number | null }[],
  ): Promise<void> {
    const watchedAt = new Date().toISOString();
    await this.db.watchedEpisodes.bulkPut(
      episodes.map(({ episodeNumber, runtimeMinutes }) => ({
        episodeKey: `${tmdbSeriesId}:${seasonNumber}:${episodeNumber}`,
        tmdbSeriesId,
        seasonNumber,
        episodeNumber,
        watchedAt,
        runtimeMinutes,
      })),
    );
  }

  /** Removes every watched-episode record for a season (marks the whole season unwatched). */
  async unwatchSeason(tmdbSeriesId: number, seasonNumber: number): Promise<void> {
    const keysToDelete = this.watchedEpisodes()
      .filter(
        (episode) => episode.tmdbSeriesId === tmdbSeriesId && episode.seasonNumber === seasonNumber,
      )
      .map((episode) => episode.episodeKey);
    await this.db.watchedEpisodes.bulkDelete(keysToDelete);
  }

  async saveTheme(theme: Theme): Promise<void> {
    const current: AppSettingsRecord = this.settings() ?? {
      key: APP_SETTINGS_KEY,
      theme,
      notificationPermissionRequested: false,
      tmdbAccessToken: '',
    };
    await this.db.settings.put({ ...current, theme });
  }

  async setNotificationPermissionRequested(requested: boolean): Promise<void> {
    const current: AppSettingsRecord = this.settings() ?? {
      key: APP_SETTINGS_KEY,
      theme: 'dark',
      notificationPermissionRequested: requested,
      tmdbAccessToken: '',
    };
    await this.db.settings.put({ ...current, notificationPermissionRequested: requested });
  }

  async saveTmdbAccessToken(tmdbAccessToken: string): Promise<void> {
    const current: AppSettingsRecord = this.settings() ?? {
      key: APP_SETTINGS_KEY,
      theme: 'dark',
      notificationPermissionRequested: false,
      tmdbAccessToken,
    };
    await this.db.settings.put({ ...current, tmdbAccessToken });
  }

  async addNotification(entry: Omit<NotificationEntry, 'id'>): Promise<void> {
    await this.db.notifications.add(entry as NotificationEntry);
  }

  async markNotificationRead(id: number): Promise<void> {
    await this.db.notifications.update(id, { read: true });
  }

  async clearNotifications(): Promise<void> {
    await this.db.notifications.clear();
  }
}
