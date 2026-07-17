import { Component, computed, effect, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DbService } from '../../core/data/db.service';
import { TmdbApiService } from '../../core/api/tmdb-api.service';
import { todayLocalDateKey } from '../../core/utils/date.util';
import { hideBrokenImage } from '../../core/utils/image.util';
import type { TrackedSeries } from '../../core/models/domain.model';
import type { TmdbEpisodeSummary, TmdbSeasonDetails } from '../../core/models/tmdb.model';

interface SeriesProgress {
  series: TrackedSeries;
  watchedCount: number;
  nextEpisode: TmdbEpisodeSummary | null;
  /** How many non-special episodes have actually aired so far, per live TMDB
   *  data — NOT the same as `series.numberOfEpisodes`, which is a snapshot
   *  from whenever the series was tracked and may already include episodes
   *  that hadn't aired yet at that time (or may now be stale if new episodes
   *  have aired since). Falls back to `series.numberOfEpisodes` while the
   *  live fetch is still in flight or failed, so nothing flashes into the
   *  wrong bucket before real data is available. */
  releasedCount: number;
}

interface EpisodeSnapshot {
  releasedEpisodes: TmdbEpisodeSummary[];
}

/** True once every episode that has actually aired has been watched — the
 *  basis for "is there anything released left to watch right now". */
function isCaughtUp(item: SeriesProgress): boolean {
  return item.releasedCount > 0 && item.watchedCount >= item.releasedCount;
}

/** How many non-special episodes TMDB says have aired so far for a series,
 *  derived from `last_episode_to_air` + the season summaries (both already
 *  returned by the single `/tv/{id}` details call) rather than trusting the
 *  show-level `number_of_episodes` total, which can already include
 *  episodes scheduled but not yet aired. */
function releasedEpisodes(seasons: TmdbSeasonDetails[]): TmdbEpisodeSummary[] {
  const today = todayLocalDateKey();
  return seasons
    .flatMap((season) => season.episodes)
    .filter((episode) => !!episode.air_date && episode.air_date <= today)
    .sort((a, b) => (a.air_date ?? '').localeCompare(b.air_date ?? ''));
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

  /** Released episode details, cached per series after the asynchronous TMDB season fetch. */
  private readonly snapshots = signal<Map<number, EpisodeSnapshot>>(new Map());

  constructor() {
    effect(() => {
      const series = this.db.trackedSeries();
      void this.loadSnapshots(series);
    });
  }

  private async loadSnapshots(series: TrackedSeries[]): Promise<void> {
    const entries = await Promise.all(
      series.map(async (trackedSeries): Promise<[number, EpisodeSnapshot] | null> => {
        try {
          const details = await firstValueFrom(this.tmdb.getTvDetails(trackedSeries.tmdbSeriesId));
          const seasons = await Promise.all(
            details.seasons
              .filter((season) => season.season_number > 0)
              .map((season) => firstValueFrom(this.tmdb.getSeason(trackedSeries.tmdbSeriesId, season.season_number))),
          );
          return [trackedSeries.tmdbSeriesId, { releasedEpisodes: releasedEpisodes(seasons) }];
        } catch {
          // Already toasted by the interceptor; this series just keeps its previous/fallback count.
          return null;
        }
      }),
    );
    this.snapshots.update((current) => {
      const next = new Map(current);
      for (const entry of entries) {
        if (entry) {
          next.set(entry[0], entry[1]);
        }
      }
      return next;
    });
  }

  private readonly seriesWithProgress = computed<SeriesProgress[]>(() =>
    this.db
      .trackedSeries()
      .map((series) => ({
        series, watchedCount: this.db.watchedCountFor(series.tmdbSeriesId),
        releasedCount: this.snapshots().get(series.tmdbSeriesId)?.releasedEpisodes.length ?? series.numberOfEpisodes,
        nextEpisode: this.snapshots().get(series.tmdbSeriesId)?.releasedEpisodes.find(
          (episode) => !this.db.isEpisodeWatched(series.tmdbSeriesId, episode.season_number, episode.episode_number),
        ) ?? null,
      }))
      .sort((a, b) => b.series.trackedAt.localeCompare(a.series.trackedAt)),
  );

  /** Series with released episodes still to watch — the actual "Watch List". */
  protected readonly inProgress = computed(() =>
    this.seriesWithProgress().filter((item) => item.releasedCount > 0 && !isCaughtUp(item)),
  );

  /** Fully caught-up series whose run has ended. */
  protected readonly watchedEnded = computed(() =>
    this.seriesWithProgress().filter((item) => isCaughtUp(item) && item.series.status === 'Ended'),
  );

  /** Fully caught-up series that were canceled. */
  protected readonly watchedCanceled = computed(() =>
    this.seriesWithProgress().filter(
      (item) => isCaughtUp(item) && item.series.status === 'Canceled',
    ),
  );

  /** Fully caught-up series that are still ongoing (all released episodes seen). */
  protected readonly watchedUpToDate = computed(() =>
    this.seriesWithProgress().filter(
      (item) =>
        isCaughtUp(item) && item.series.status !== 'Ended' && item.series.status !== 'Canceled',
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
