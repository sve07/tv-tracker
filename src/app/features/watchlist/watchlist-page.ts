import { Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DbService } from '../../core/data/db.service';
import { TmdbApiService } from '../../core/api/tmdb-api.service';
import { hideBrokenImage } from '../../core/utils/image.util';
import type { TrackedSeries } from '../../core/models/domain.model';

interface SeriesProgress {
  series: TrackedSeries;
  watchedCount: number;
}

function isFullyWatched(item: SeriesProgress): boolean {
  return item.series.numberOfEpisodes > 0 && item.watchedCount >= item.series.numberOfEpisodes;
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

  /** Off by default — up-to-date-but-still-ongoing shows are hidden unless the user opts in. */
  protected readonly showUpToDate = signal(false);

  private readonly seriesWithProgress = computed<SeriesProgress[]>(() =>
    this.db
      .trackedSeries()
      .map((series) => ({
        series,
        watchedCount: this.db.watchedCountFor(series.tmdbSeriesId),
      }))
      .sort((a, b) => b.series.trackedAt.localeCompare(a.series.trackedAt)),
  );

  /** Series still being worked through — the actual "Watch List". */
  protected readonly inProgress = computed(() =>
    this.seriesWithProgress().filter((item) => !isFullyWatched(item)),
  );

  /** Fully caught-up series whose run has ended. */
  protected readonly watchedEnded = computed(() =>
    this.seriesWithProgress().filter(
      (item) => isFullyWatched(item) && item.series.status === 'Ended',
    ),
  );

  /** Fully caught-up series that were canceled. */
  protected readonly watchedCanceled = computed(() =>
    this.seriesWithProgress().filter(
      (item) => isFullyWatched(item) && item.series.status === 'Canceled',
    ),
  );

  /** Fully caught-up series that are still ongoing (all released episodes seen). */
  protected readonly watchedUpToDate = computed(() =>
    this.seriesWithProgress().filter(
      (item) =>
        isFullyWatched(item) && item.series.status !== 'Ended' && item.series.status !== 'Canceled',
    ),
  );

  /** Used to decide whether the "Watched" section (and its filter toggle) should render at all
   *  — deliberately ignores the up-to-date filter, since the toggle itself must stay reachable. */
  protected readonly anyWatched = computed(
    () =>
      this.watchedEnded().length > 0 ||
      this.watchedCanceled().length > 0 ||
      this.watchedUpToDate().length > 0,
  );

  protected toggleShowUpToDate(): void {
    this.showUpToDate.update((current) => !current);
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
