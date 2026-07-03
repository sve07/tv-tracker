import { Component, computed, inject } from '@angular/core';
import { DbService } from '../../core/data/db.service';

@Component({
  selector: 'app-stats-page',
  templateUrl: './stats-page.html',
})
export class StatsPage {
  private readonly db = inject(DbService);

  protected readonly totalEpisodesWatched = computed(() => this.db.watchedEpisodes().length);

  protected readonly totalWatchMinutes = computed(() =>
    this.db.watchedEpisodes().reduce((sum, episode) => sum + (episode.runtimeMinutes ?? 0), 0),
  );

  protected readonly totalWatchHours = computed(
    () => Math.round((this.totalWatchMinutes() / 60) * 10) / 10,
  );

  protected readonly trackedShowsCount = computed(() => this.db.trackedSeries().length);

  protected readonly completedShowsCount = computed(
    () =>
      this.db
        .trackedSeries()
        .filter(
          (series) =>
            series.numberOfEpisodes > 0 &&
            this.db.watchedCountFor(series.tmdbSeriesId) >= series.numberOfEpisodes,
        ).length,
  );

  protected readonly perSeriesProgress = computed(() =>
    this.db
      .trackedSeries()
      .map((series) => {
        const watched = this.db.watchedCountFor(series.tmdbSeriesId);
        const percent = series.numberOfEpisodes
          ? Math.min(100, Math.round((watched / series.numberOfEpisodes) * 100))
          : 0;
        return { name: series.name, watched, total: series.numberOfEpisodes, percent };
      })
      .sort((a, b) => b.percent - a.percent),
  );
}
