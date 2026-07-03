import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  TmdbEpisodeDetails,
  TmdbSeasonDetails,
  TmdbTvDetails,
  TmdbTvSearchResponse,
} from '../models/tmdb.model';

export type TmdbImageSize = 'w185' | 'w342' | 'w500' | 'original';

/**
 * Thin HttpClient wrapper over the TMDB v3 endpoints this app needs.
 * Authorization header is added by tmdbAuthInterceptor; error toasts are
 * surfaced by tmdbErrorInterceptor. Both are scoped to requests targeting
 * environment.tmdbApiBaseUrl.
 */
@Injectable({ providedIn: 'root' })
export class TmdbApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.tmdbApiBaseUrl;

  searchTv(query: string, page = 1): Observable<TmdbTvSearchResponse> {
    const params = new HttpParams()
      .set('query', query)
      .set('page', page)
      .set('include_adult', 'false');
    return this.http.get<TmdbTvSearchResponse>(`${this.baseUrl}/search/tv`, { params });
  }

  getTvDetails(seriesId: number): Observable<TmdbTvDetails> {
    return this.http.get<TmdbTvDetails>(`${this.baseUrl}/tv/${seriesId}`);
  }

  getSeason(seriesId: number, seasonNumber: number): Observable<TmdbSeasonDetails> {
    return this.http.get<TmdbSeasonDetails>(
      `${this.baseUrl}/tv/${seriesId}/season/${seasonNumber}`,
    );
  }

  getEpisode(
    seriesId: number,
    seasonNumber: number,
    episodeNumber: number,
  ): Observable<TmdbEpisodeDetails> {
    return this.http.get<TmdbEpisodeDetails>(
      `${this.baseUrl}/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}`,
    );
  }

  /** Builds a full poster/backdrop/still image URL, or null when TMDB has no image for this asset. */
  imageUrl(path: string | null, size: TmdbImageSize = 'w342'): string | null {
    if (!path) {
      return null;
    }
    return `${environment.tmdbImageBaseUrl}/${size}${path}`;
  }
}
