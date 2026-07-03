/**
 * Raw response shapes for the TMDB v3 REST API.
 * Field names are kept exactly as TMDB returns them (snake_case) so mapping
 * bugs are easy to spot by diffing against the API docs.
 *
 * Verified against https://developer.themoviedb.org/reference (2026-07-03):
 * - GET /search/tv
 * - GET /tv/{series_id}
 * - GET /tv/{series_id}/season/{season_number}
 * - GET /tv/{series_id}/season/{season_number}/episode/{episode_number}
 */

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbTvSearchResult {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  genre_ids: number[];
  origin_country: string[];
  original_language: string;
  original_name: string;
  popularity: number;
  vote_average: number;
  vote_count: number;
  adult: boolean;
}

export interface TmdbTvSearchResponse {
  page: number;
  results: TmdbTvSearchResult[];
  total_pages: number;
  total_results: number;
}

export interface TmdbSeasonSummary {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  season_number: number;
  air_date: string | null;
  episode_count: number;
  vote_average: number;
}

export interface TmdbEpisodeSummary {
  id: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string | null;
  episode_number: number;
  season_number: number;
  runtime: number | null;
  vote_average: number;
  vote_count: number;
}

export interface TmdbTvDetails {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  last_air_date: string | null;
  genres: TmdbGenre[];
  status: string;
  in_production: boolean;
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time: number[];
  vote_average: number;
  vote_count: number;
  next_episode_to_air: TmdbEpisodeSummary | null;
  last_episode_to_air: TmdbEpisodeSummary | null;
  seasons: TmdbSeasonSummary[];
}

export interface TmdbSeasonDetails {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string | null;
  season_number: number;
  episodes: TmdbEpisodeSummary[];
}

export interface TmdbCastCredit {
  id: number;
  name: string;
  character: string;
  order: number;
  profile_path: string | null;
  credit_id: string;
}

export interface TmdbCrewCredit {
  id: number;
  name: string;
  department: string;
  job: string;
  credit_id: string;
  profile_path: string | null;
}

/**
 * Only the TV "episode details" endpoint (not the season-details episode list)
 * includes `guest_stars`/`crew` directly on the response.
 */
export interface TmdbEpisodeDetails extends TmdbEpisodeSummary {
  production_code: string;
  crew: TmdbCrewCredit[];
  guest_stars: TmdbCastCredit[];
}
