import { Injectable, signal } from '@angular/core';
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

  /**
   * Adds a series only when it is not already tracked. This deliberately does
   * not overwrite an existing record, so manually tracked series retain their
   * original tracking date and metadata.
   */
  async ensureSeriesTracked(series: TrackedSeries): Promise<void> {
    await this.db.transaction('rw', this.db.trackedSeries, async () => {
      const existing = await this.db.trackedSeries.get(series.tmdbSeriesId);
      if (!existing) {
        await this.db.trackedSeries.add(series);
      }
    });
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

  /**
   * Optimistic local overrides for watched/unwatched state, applied on top of
   * the Dexie liveQuery-backed `watchedEpisodes` signal below. Writing to
   * IndexedDB (especially a bulk season write) can take a noticeably long
   * moment on some devices/browsers (observed on Android when installed as a
   * PWA) — without this, watched marks would visibly disappear and then
   * reappear while waiting for the write to land and the liveQuery to
   * re-emit. Entries self-clear (see `effectiveWatchedKeys`) once the real
   * signal actually agrees with the override, so there's never a visible
   * flicker back to the old state, and on write failure they're cleared
   * immediately to revert to the real (unwritten) state.
   */
  private readonly pendingWatched = signal(new Map<string, boolean>());

  private setPendingWatched(keys: string[], watched: boolean): void {
    this.pendingWatched.update((current) => {
      const next = new Map(current);
      for (const key of keys) {
        next.set(key, watched);
      }
      return next;
    });
  }

  private clearPendingWatched(keys: string[]): void {
    this.pendingWatched.update((current) => {
      const next = new Map(current);
      for (const key of keys) {
        next.delete(key);
      }
      return next;
    });
  }

  /** The set of episodeKeys that are effectively watched right now, real data merged with any pending optimistic overrides. */
  private effectiveWatchedKeys(): Set<string> {
    const rawKeys = new Set(this.watchedEpisodes().map((episode) => episode.episodeKey));
    const pending = this.pendingWatched();
    if (pending.size > 0) {
      const stale: string[] = [];
      for (const [key, watched] of pending) {
        if (rawKeys.has(key) === watched) {
          stale.push(key);
        }
      }
      if (stale.length > 0) {
        // Defer the write so we don't mutate a signal mid-read; safe to clear
        // now since raw data already agrees, so nothing visually changes.
        queueMicrotask(() => this.clearPendingWatched(stale));
      }
      for (const [key, watched] of pending) {
        if (watched) {
          rawKeys.add(key);
        } else {
          rawKeys.delete(key);
        }
      }
    }
    return rawKeys;
  }

  async setEpisodeWatched(
    tmdbSeriesId: number,
    seasonNumber: number,
    episodeNumber: number,
    runtimeMinutes: number | null,
    watched: boolean,
    seriesToTrack?: TrackedSeries,
  ): Promise<void> {
    const episodeKey = `${tmdbSeriesId}:${seasonNumber}:${episodeNumber}`;
    this.setPendingWatched([episodeKey], watched);
    try {
      if (watched) {
        if (seriesToTrack) {
          await this.ensureSeriesTracked(seriesToTrack);
        }
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
    } catch (error) {
      this.clearPendingWatched([episodeKey]);
      throw error;
    }
  }

  isEpisodeWatched(tmdbSeriesId: number, seasonNumber: number, episodeNumber: number): boolean {
    const episodeKey = `${tmdbSeriesId}:${seasonNumber}:${episodeNumber}`;
    return this.effectiveWatchedKeys().has(episodeKey);
  }

  watchedCountFor(tmdbSeriesId: number): number {
    const prefix = `${tmdbSeriesId}:`;
    let count = 0;
    for (const key of this.effectiveWatchedKeys()) {
      if (key.startsWith(prefix)) {
        count++;
      }
    }
    return count;
  }

  watchedCountForSeason(tmdbSeriesId: number, seasonNumber: number): number {
    const prefix = `${tmdbSeriesId}:${seasonNumber}:`;
    let count = 0;
    for (const key of this.effectiveWatchedKeys()) {
      if (key.startsWith(prefix)) {
        count++;
      }
    }
    return count;
  }

  /** Marks every given episode of a season as watched in a single transaction. */
  async setSeasonWatched(
    tmdbSeriesId: number,
    seasonNumber: number,
    episodes: { episodeNumber: number; runtimeMinutes: number | null }[],
  ): Promise<void> {
    const watchedAt = new Date().toISOString();
    const keys = episodes.map(
      ({ episodeNumber }) => `${tmdbSeriesId}:${seasonNumber}:${episodeNumber}`,
    );
    this.setPendingWatched(keys, true);
    try {
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
    } catch (error) {
      this.clearPendingWatched(keys);
      throw error;
    }
  }

  /** Removes every watched-episode record for a season (marks the whole season unwatched). */
  async unwatchSeason(tmdbSeriesId: number, seasonNumber: number): Promise<void> {
    const keysToDelete = this.watchedEpisodes()
      .filter(
        (episode) => episode.tmdbSeriesId === tmdbSeriesId && episode.seasonNumber === seasonNumber,
      )
      .map((episode) => episode.episodeKey);
    this.setPendingWatched(keysToDelete, false);
    try {
      await this.db.watchedEpisodes.bulkDelete(keysToDelete);
    } catch (error) {
      this.clearPendingWatched(keysToDelete);
      throw error;
    }
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

  /**
   * Wipes all tracked series, watch history, and notification history — but
   * deliberately leaves the `settings` record (theme, TMDB access token)
   * alone, since those are app preferences rather than "tracked data" and
   * the user would otherwise have to re-enter their token.
   */
  async deleteAllData(): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.trackedSeries, this.db.watchedEpisodes, this.db.notifications],
      async () => {
        await Promise.all([
          this.db.trackedSeries.clear(),
          this.db.watchedEpisodes.clear(),
          this.db.notifications.clear(),
        ]);
      },
    );
  }
}
