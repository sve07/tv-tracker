import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { TmdbApiService } from '../../core/api/tmdb-api.service';
import { DbService } from '../../core/data/db.service';
import { todayLocalDateKey } from '../../core/utils/date.util';
import { hideBrokenImage } from '../../core/utils/image.util';
import { Icon } from '../../shared/icon';
import type { TrackedSeries } from '../../core/models/domain.model';
import type {
  TmdbEpisodeSummary,
  TmdbSeasonDetails,
  TmdbTvDetails,
} from '../../core/models/tmdb.model';

interface SeasonState {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  expanded: boolean;
  loading: boolean;
  error: boolean;
  details: TmdbSeasonDetails | null;
}

type AirDateStatus = 'past' | 'today' | 'upcoming' | 'unknown';

@Component({
  selector: 'app-series-detail-page',
  imports: [RouterLink, Icon],
  templateUrl: './series-detail-page.html',
})
export class SeriesDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly tmdb = inject(TmdbApiService);
  protected readonly db = inject(DbService);

  private readonly paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly seriesId = computed(() => Number(this.paramMap().get('seriesId')));

  protected readonly details = signal<TmdbTvDetails | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly seasons = signal<SeasonState[]>([]);
  protected readonly timelineEpisodes = signal<TmdbEpisodeSummary[]>([]);
  protected readonly hideBrokenImage = hideBrokenImage;

  constructor() {
    effect(() => {
      const seriesId = this.seriesId();
      if (!Number.isFinite(seriesId)) {
        return;
      }
      void this.loadSeries(seriesId);
    });

    effect(() => {
      const targetId = this.timelineTargetId();
      if (!targetId) {
        return;
      }
      // Wait until Angular has rendered the timeline card, including after an
      // optimistic watched-state update changes which card is next.
      requestAnimationFrame(() => {
        document.getElementById(targetId)?.scrollIntoView({ block: 'nearest', inline: 'center' });
      });
    });
  }

  protected genresText(show: TmdbTvDetails): string {
    return show.genres.map((genre) => genre.name).join(', ') || 'No genres listed';
  }

  protected imageUrl(path: string | null): string | null {
    return this.tmdb.imageUrl(path);
  }

  protected isTracked(): boolean {
    const details = this.details();
    return details ? this.db.isTracked(details.id) : false;
  }

  protected async toggleTrack(): Promise<void> {
    const details = this.details();
    if (!details) {
      return;
    }
    if (this.db.isTracked(details.id)) {
      await this.db.untrackSeries(details.id);
      return;
    }
    await this.db.trackSeries(this.trackedSeriesMetadata(details));
  }

  protected async toggleSeason(season: SeasonState): Promise<void> {
    const seriesId = this.details()?.id;
    if (!seriesId) {
      return;
    }

    if (season.expanded) {
      this.updateSeason(season.seasonNumber, { expanded: false });
      return;
    }

    if (season.details) {
      this.updateSeason(season.seasonNumber, { expanded: true });
      return;
    }

    this.updateSeason(season.seasonNumber, { expanded: true, loading: true, error: false });
    try {
      const seasonDetails = await firstValueFrom(
        this.tmdb.getSeason(seriesId, season.seasonNumber),
      );
      this.updateSeason(season.seasonNumber, { loading: false, details: seasonDetails });
    } catch {
      this.updateSeason(season.seasonNumber, { loading: false, error: true });
    }
  }

  protected isEpisodeWatched(
    seriesId: number,
    seasonNumber: number,
    episodeNumber: number,
  ): boolean {
    return this.db.isEpisodeWatched(seriesId, seasonNumber, episodeNumber);
  }

  /** Episodes that haven't aired yet (or have no announced air date) can't be marked watched. */
  protected isEpisodeReleased(airDate: string | null): boolean {
    const status = this.airDateStatus(airDate);
    return status === 'past' || status === 'today';
  }

  protected async toggleEpisodeWatched(
    seriesId: number,
    seasonNumber: number,
    episodeNumber: number,
    airDate: string | null,
    runtimeMinutes: number | null,
  ): Promise<void> {
    const watched = this.db.isEpisodeWatched(seriesId, seasonNumber, episodeNumber);
    if (!watched && !this.isEpisodeReleased(airDate)) {
      return;
    }
    await this.db.setEpisodeWatched(
      seriesId,
      seasonNumber,
      episodeNumber,
      runtimeMinutes,
      !watched,
      this.details() ? this.trackedSeriesMetadata(this.details()!) : undefined,
    );
  }

  protected seasonWatchedCount(season: SeasonState): number {
    const seriesId = this.details()?.id;
    return seriesId ? this.db.watchedCountForSeason(seriesId, season.seasonNumber) : 0;
  }

  protected isSeasonFullyWatched(season: SeasonState): boolean {
    return season.episodeCount > 0 && this.seasonWatchedCount(season) >= season.episodeCount;
  }

  protected async toggleSeasonWatched(season: SeasonState): Promise<void> {
    const seriesId = this.details()?.id;
    if (!seriesId) {
      return;
    }

    if (this.isSeasonFullyWatched(season)) {
      await this.db.unwatchSeason(seriesId, season.seasonNumber);
      return;
    }

    // Fetch the real episode list (correct episode numbers + runtimes) if we
    // haven't already, rather than assuming episodes are numbered 1..N.
    let seasonDetails = season.details;
    if (!seasonDetails) {
      try {
        seasonDetails = await firstValueFrom(this.tmdb.getSeason(seriesId, season.seasonNumber));
        this.updateSeason(season.seasonNumber, { details: seasonDetails });
      } catch {
        return; // Failure already toasted by tmdbErrorInterceptor.
      }
    }

    await this.db.setSeasonWatched(
      seriesId,
      season.seasonNumber,
      seasonDetails.episodes
        .filter((episode) => this.isEpisodeReleased(episode.air_date))
        .map((episode) => ({
          episodeNumber: episode.episode_number,
          runtimeMinutes: episode.runtime,
        })),
    );
  }

  protected airDateStatus(airDate: string | null): AirDateStatus {
    if (!airDate) {
      return 'unknown';
    }
    const today = todayLocalDateKey();
    if (airDate === today) {
      return 'today';
    }
    return airDate < today ? 'past' : 'upcoming';
  }

  protected daysUntilAir(airDate: string | null): number | null {
    if (!airDate || this.isEpisodeReleased(airDate)) {
      return null;
    }
    const today = new Date(`${todayLocalDateKey()}T00:00:00`);
    const airDay = new Date(`${airDate}T00:00:00`);
    return Math.max(0, Math.ceil((airDay.getTime() - today.getTime()) / 86_400_000));
  }

  protected timelineTargetId(): string | null {
    const show = this.details();
    if (!show) {
      return null;
    }
    const next = this.timelineEpisodes().find(
      (episode) =>
        this.isEpisodeReleased(episode.air_date) &&
        !this.db.isEpisodeWatched(show.id, episode.season_number, episode.episode_number),
    );
    return next ? this.timelineId(next) : null;
  }

  protected timelineId(episode: TmdbEpisodeSummary): string {
    return `episode-${episode.season_number}-${episode.episode_number}`;
  }

  private trackedSeriesMetadata(details: TmdbTvDetails): TrackedSeries {
    return {
      tmdbSeriesId: details.id,
      name: details.name,
      posterPath: details.poster_path,
      status: details.status,
      genres: details.genres.map((genre) => genre.name),
      numberOfSeasons: details.number_of_seasons,
      numberOfEpisodes: details.number_of_episodes,
      trackedAt: new Date().toISOString(),
    };
  }

  private updateSeason(seasonNumber: number, patch: Partial<SeasonState>): void {
    this.seasons.update((seasons) =>
      seasons.map((season) =>
        season.seasonNumber === seasonNumber ? { ...season, ...patch } : season,
      ),
    );
  }

  private async loadSeries(seriesId: number): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const details = await firstValueFrom(this.tmdb.getTvDetails(seriesId));
      this.details.set(details);
      this.seasons.set(
        details.seasons.map((season) => ({
          seasonNumber: season.season_number,
          name: season.name,
          episodeCount: season.episode_count,
          expanded: false,
          loading: false,
          error: false,
          details: null,
        })),
      );
      const timelineSeasons = await Promise.all(
        details.seasons
          .filter((season) => season.season_number > 0)
          .map((season) => firstValueFrom(this.tmdb.getSeason(seriesId, season.season_number))),
      );
      this.timelineEpisodes.set(
        timelineSeasons
          .flatMap((season) => season.episodes)
          .sort((a, b) => (a.air_date ?? '').localeCompare(b.air_date ?? '')),
      );
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
