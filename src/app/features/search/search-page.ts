import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  firstValueFrom,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';
import { RouterLink } from '@angular/router';
import { TmdbApiService } from '../../core/api/tmdb-api.service';
import { Icon } from '../../shared/icon';
import { DbService } from '../../core/data/db.service';
import { hideBrokenImage } from '../../core/utils/image.util';
import type { TmdbTvSearchResult } from '../../core/models/tmdb.model';

@Component({
  selector: 'app-search-page',
  imports: [RouterLink, DecimalPipe, Icon, NgTemplateOutlet],
  templateUrl: './search-page.html',
})
export class SearchPage {
  private readonly tmdb = inject(TmdbApiService);
  private readonly db = inject(DbService);

  protected readonly query = signal('');
  protected readonly loading = signal(false);
  protected readonly hideBrokenImage = hideBrokenImage;

  private readonly query$ = toObservable(this.query);

  protected readonly results = toSignal(
    this.query$.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      switchMap((query) => {
        const trimmed = query.trim();
        if (!trimmed) {
          this.loading.set(false);
          return of<TmdbTvSearchResult[]>([]);
        }
        this.loading.set(true);
        return this.tmdb.searchTv(trimmed).pipe(
          map((response) => response.results),
          catchError(() => of<TmdbTvSearchResult[]>([])),
          tap(() => this.loading.set(false)),
        );
      }),
    ),
    { initialValue: [] as TmdbTvSearchResult[] },
  );

  /** Popular shows fetched once up front, shown as recommendations before
   *  the user has typed anything (instead of a blank "start typing" state). */
  private readonly recommended = toSignal(
    this.tmdb.getPopularTv().pipe(
      map((response) => response.results),
      catchError(() => of<TmdbTvSearchResult[]>([])),
    ),
    { initialValue: [] as TmdbTvSearchResult[] },
  );

  /** Recommended shows, excluding anything already tracked. */
  protected readonly recommendedResults = computed(() =>
    this.recommended().filter((result) => !this.db.isTracked(result.id)),
  );

  protected onQueryInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
  }

  protected imageUrl(path: string | null): string | null {
    return this.tmdb.imageUrl(path);
  }

  protected isTracked(seriesId: number): boolean {
    return this.db.isTracked(seriesId);
  }

  protected async toggleTrack(result: TmdbTvSearchResult): Promise<void> {
    if (this.db.isTracked(result.id)) {
      await this.db.untrackSeries(result.id);
      return;
    }

    try {
      const details = await firstValueFrom(this.tmdb.getTvDetails(result.id));
      await this.db.trackSeries({
        tmdbSeriesId: details.id,
        name: details.name,
        posterPath: details.poster_path,
        status: details.status,
        genres: details.genres.map((genre) => genre.name),
        numberOfSeasons: details.number_of_seasons,
        numberOfEpisodes: details.number_of_episodes,
        trackedAt: new Date().toISOString(),
      });
    } catch {
      // Failure already surfaced as a toast by tmdbErrorInterceptor.
    }
  }
}
