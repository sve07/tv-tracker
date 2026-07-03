/**
 * App-owned domain models persisted in IndexedDB via Dexie.
 * Kept independent from the raw TMDB DTOs (see tmdb.model.ts) so TMDB response
 * shape changes don't ripple into stored data / UI code.
 */

export type Theme = 'dark' | 'light';

export interface TrackedSeries {
  /** TMDB tv series id — primary key. */
  tmdbSeriesId: number;
  name: string;
  posterPath: string | null;
  status: string;
  genres: string[];
  numberOfSeasons: number;
  numberOfEpisodes: number;
  /** ISO date the user started tracking this series. */
  trackedAt: string;
}

export interface WatchedEpisode {
  /** Composite primary key: `${tmdbSeriesId}:${seasonNumber}:${episodeNumber}`. */
  episodeKey: string;
  tmdbSeriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  /** ISO date the episode was marked watched. */
  watchedAt: string;
  /** Captured at watch-time so stats don't depend on refetching TMDB later. */
  runtimeMinutes: number | null;
}

export interface AppSettingsRecord {
  key: string;
  theme: Theme;
  /** Whether the user has been asked for Notification permission already. */
  notificationPermissionRequested: boolean;
  /**
   * User-supplied TMDB "API Read Access Token", stored locally only (never
   * sent anywhere except TMDB itself). Preferred over any build-time env
   * token — lets each user bring their own key without ever needing to put
   * a real secret in source control or CI.
   */
  tmdbAccessToken: string;
}

export const APP_SETTINGS_KEY = 'app-settings';

export interface NotificationEntry {
  /** Auto-incremented by Dexie. */
  id?: number;
  tmdbSeriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  seriesName: string;
  episodeName: string;
  /** ISO air date of the episode that triggered this notification. */
  airDate: string;
  /** ISO date this notification entry was created/detected. */
  createdAt: string;
  read: boolean;
  /**
   * Whether the best-effort background service worker (periodicsync) has
   * already surfaced this as an OS-level notification. Set by the service
   * worker itself (custom-sw.js), read directly via raw IndexedDB there.
   */
  osNotified: boolean;
}
