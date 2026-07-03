import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DbService } from '../data/db.service';
import { TmdbApiService } from '../api/tmdb-api.service';
import { toLocalDateKey, todayLocalDateKey } from '../utils/date.util';

/** How often to re-check tracked series for upcoming episodes while the app is open. */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Only notify for episodes airing within this many days from today. */
const LOOKAHEAD_DAYS = 7;

const PERIODIC_SYNC_TAG = 'tv-tracker-episode-check';

/**
 * Detects upcoming episodes for tracked series and records them in the
 * `notifications` table (read by the header badge and Notifications History
 * page). This only runs while the app tab is open/foregrounded.
 *
 * Best-effort background coverage (Chrome-only, requires an installed PWA,
 * not guaranteed) is handled separately by public/combined-sw.js via the
 * Periodic Background Sync API — that service worker reads the same
 * `notifications` table directly via raw IndexedDB and surfaces unseen
 * entries as OS notifications. registerPeriodicSync() below just registers
 * the periodic sync tag; it silently no-ops where unsupported/not granted.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly db = inject(DbService);
  private readonly tmdb = inject(TmdbApiService);
  private started = false;

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    void this.checkForUpcomingEpisodes();
    setInterval(() => void this.checkForUpcomingEpisodes(), CHECK_INTERVAL_MS);
    void this.registerPeriodicSync();
  }

  async checkForUpcomingEpisodes(): Promise<void> {
    const trackedSeries = this.db.trackedSeries();
    const todayStr = todayLocalDateKey();
    const lookaheadStr = toLocalDateKey(
      new Date(Date.now() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000),
    );

    for (const series of trackedSeries) {
      try {
        const details = await firstValueFrom(this.tmdb.getTvDetails(series.tmdbSeriesId));
        const next = details.next_episode_to_air;
        if (!next?.air_date || next.air_date < todayStr || next.air_date > lookaheadStr) {
          continue;
        }

        const alreadyRecorded = this.db
          .notifications()
          .some(
            (entry) =>
              entry.tmdbSeriesId === series.tmdbSeriesId &&
              entry.seasonNumber === next.season_number &&
              entry.episodeNumber === next.episode_number,
          );
        if (alreadyRecorded) {
          continue;
        }

        await this.db.addNotification({
          tmdbSeriesId: series.tmdbSeriesId,
          seasonNumber: next.season_number,
          episodeNumber: next.episode_number,
          seriesName: series.name,
          episodeName: next.name,
          airDate: next.air_date,
          createdAt: new Date().toISOString(),
          read: false,
          osNotified: false,
        });
      } catch {
        // Network/API error for this series — already toasted by the interceptor; try again next interval.
      }
    }
  }

  /** Prompts for OS Notification permission. Call only from an explicit user action (e.g. a Settings toggle). */
  async requestBrowserPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (!('Notification' in window)) {
      return 'unsupported';
    }
    const permission = await Notification.requestPermission();
    await this.db.setNotificationPermissionRequested(true);
    return permission;
  }

  /**
   * Registers the periodic background sync tag, if the browser supports it
   * and has silently granted the 'periodic-background-sync' permission
   * (Chrome only grants this heuristically for installed, engaged PWAs —
   * there is no user-facing prompt for it). No-ops everywhere else.
   */
  private async registerPeriodicSync(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      return;
    }
    try {
      const registration = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
        periodicSync?: { register(tag: string, options: { minInterval: number }): Promise<void> };
      };
      if (!registration.periodicSync) {
        return;
      }
      const status = await navigator.permissions.query({
        name: 'periodic-background-sync' as PermissionName,
      });
      if (status.state !== 'granted') {
        return;
      }
      await registration.periodicSync.register(PERIODIC_SYNC_TAG, {
        minInterval: 12 * 60 * 60 * 1000,
      });
    } catch {
      // Periodic Background Sync isn't supported/permitted here — best-effort only.
    }
  }
}
