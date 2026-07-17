import { Injectable, signal } from '@angular/core';
import { HttpHeaders } from '@angular/common/http';

export type TmdbApiResponseStatus = 'success' | 'rate-limited' | 'error';

export interface TmdbRateLimit {
  limit: number;
  remaining: number;
  resetAt: number | null;
}

export interface TmdbApiUsage {
  lastResponseAt: string;
  status: TmdbApiResponseStatus;
  rateLimit: TmdbRateLimit | null;
}

function parseNonNegativeInteger(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Extracts optional, server-reported TMDB rate-limit details without assuming a fixed quota. */
export function tmdbRateLimitFromHeaders(headers: HttpHeaders): TmdbRateLimit | null {
  const limit = parseNonNegativeInteger(headers.get('x-ratelimit-limit'));
  const remaining = parseNonNegativeInteger(headers.get('x-ratelimit-remaining'));
  if (limit === null || remaining === null) {
    return null;
  }

  const resetSeconds = parseNonNegativeInteger(headers.get('x-ratelimit-reset'));
  return {
    limit,
    remaining: Math.min(remaining, limit),
    resetAt: resetSeconds === null ? null : resetSeconds * 1_000,
  };
}

/**
 * Holds the latest observable TMDB API activity for Settings. This is purposefully
 * in-memory: it is a current limit/status overview, not a request history.
 */
@Injectable({ providedIn: 'root' })
export class TmdbApiUsageService {
  readonly usage = signal<TmdbApiUsage | null>(null);

  recordResponse(status: TmdbApiResponseStatus, headers: HttpHeaders): void {
    this.usage.set({
      lastResponseAt: new Date().toISOString(),
      status,
      rateLimit: tmdbRateLimitFromHeaders(headers),
    });
  }
}
