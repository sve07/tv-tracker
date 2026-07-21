import { Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DbService } from '../../core/data/db.service';
import { TmdbApiService } from '../../core/api/tmdb-api.service';
import { hideBrokenImage } from '../../core/utils/image.util';
import type { TrackedSeries } from '../../core/models/domain.model';

export interface SeriesProgress {
  series: TrackedSeries;
  watchedCount: number;
  releasedCount: number;
  activityAt: string;
}

export type WatchlistCategory =
  | 'currentlyWatching'
  | 'notStarted'
  | 'upToDate'
  | 'watchedEnded'
  | 'watchedCanceled';

const PAGE_SIZE = 8;
const THREE_MONTHS_IN_MS = 90 * 24 * 60 * 60 * 1_000;
const TWO_WEEKS_IN_MS = 14 * 24 * 60 * 60 * 1_000;

/** True once every cached released episode has been watched. */
export function isCaughtUp(item: SeriesProgress): boolean {
  return item.releasedCount > 0 && item.watchedCount >= item.releasedCount;
}

function isWithin(date: string | null | undefined, duration: number, now: number): boolean {
  if (!date) {
    return false;
  }
  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) && timestamp <= now && timestamp >= now - duration;
}

/**
 * Categorize from IndexedDB metadata only. Opening the watch list must not
 * fetch TV or season details for every tracked show. The optional cached
 * fields are refreshed when a user visits a series; legacy records fall back
 * to the metadata stored when tracking began.
 */
export function categoryFor(item: SeriesProgress, now = Date.now()): WatchlistCategory | null {
  if (item.watchedCount === 0) {
    return 'notStarted';
  }
  if (isCaughtUp(item)) {
    if (item.series.status === 'Ended') {
      return 'watchedEnded';
    }
    if (item.series.status === 'Canceled') {
      return 'watchedCanceled';
    }
    return 'upToDate';
  }
  if (
    isWithin(item.activityAt, THREE_MONTHS_IN_MS, now) ||
    isWithin(item.series.lastEpisodeAirDate, TWO_WEEKS_IN_MS, now)
  ) {
    return 'currentlyWatching';
  }
  return null;
}

@Component({
  selector: 'app-watchlist-page',
  imports: [RouterLink, NgTemplateOutlet],
  templateUrl: './watchlist-page.html',
})
export class WatchlistPage {
  private readonly db = inject(DbService);
  private readonly tmdb = inject(TmdbApiService);
  protected readonly hideBrokenImage = hideBrokenImage;

  protected readonly expandedCategories = signal<Set<WatchlistCategory>>(
    new Set(['currentlyWatching']),
  );
  private readonly visibleCounts = signal<Record<WatchlistCategory, number>>({
    currentlyWatching: PAGE_SIZE,
    notStarted: PAGE_SIZE,
    upToDate: PAGE_SIZE,
    watchedEnded: PAGE_SIZE,
    watchedCanceled: PAGE_SIZE,
  });

  private readonly seriesWithProgress = computed<SeriesProgress[]>(() =>
    this.db
      .trackedSeries()
      .map((series) => {
        const watched = this.db
          .watchedEpisodes()
          .filter((episode) => episode.tmdbSeriesId === series.tmdbSeriesId);
        return {
          series,
          watchedCount: watched.length,
          releasedCount: series.releasedEpisodeCount ?? series.numberOfEpisodes,
          activityAt:
            [series.lastEpisodeAirDate, ...watched.map((episode) => episode.watchedAt)]
              .filter(Boolean)
              .sort()
              .at(-1) ?? series.trackedAt,
        };
      })
      .sort((a, b) => b.activityAt.localeCompare(a.activityAt)),
  );

  protected readonly categorizedSeries = computed(() => {
    const categories: Record<WatchlistCategory, SeriesProgress[]> = {
      currentlyWatching: [],
      notStarted: [],
      upToDate: [],
      watchedEnded: [],
      watchedCanceled: [],
    };
    for (const item of this.seriesWithProgress()) {
      const category = categoryFor(item);
      if (category) {
        categories[category].push(item);
      }
    }
    return categories;
  });

  protected readonly hasSeries = computed(() => this.db.trackedSeries().length > 0);

  protected categoryCount(category: WatchlistCategory): number {
    return this.categorizedSeries()[category].length;
  }

  protected itemsFor(category: WatchlistCategory): SeriesProgress[] {
    return this.categorizedSeries()[category].slice(0, this.visibleCounts()[category]);
  }

  protected hasMore(category: WatchlistCategory): boolean {
    return this.categorizedSeries()[category].length > this.visibleCounts()[category];
  }

  protected isExpanded(category: WatchlistCategory): boolean {
    return this.expandedCategories().has(category);
  }

  protected toggleCategory(category: WatchlistCategory): void {
    this.expandedCategories.update((current) => {
      const next = new Set(current);
      next.has(category) ? next.delete(category) : next.add(category);
      return next;
    });
  }

  protected loadMore(category: WatchlistCategory): void {
    this.visibleCounts.update((current) => ({ ...current, [category]: current[category] + PAGE_SIZE }));
  }

  protected imageUrl(path: string | null): string | null {
    return this.tmdb.imageUrl(path);
  }

  protected progressPercent(watchedCount: number, totalEpisodes: number): number {
    if (!totalEpisodes) {
      return 0;
    }
    return Math.min(100, Math.round((watchedCount / totalEpisodes) * 100));
  }
}
