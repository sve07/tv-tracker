import { HttpHeaders } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { tmdbRateLimitFromHeaders } from './tmdb-api-usage.service';

describe('tmdbRateLimitFromHeaders', () => {
  it('parses server-reported rate-limit headers', () => {
    const rateLimit = tmdbRateLimitFromHeaders(
      new HttpHeaders({
        'x-ratelimit-limit': '40',
        'x-ratelimit-remaining': '12',
        'x-ratelimit-reset': '1',
      }),
    );

    expect(rateLimit).toEqual({ limit: 40, remaining: 12, resetAt: 1_000 });
  });

  it('does not invent limit information for absent or invalid headers', () => {
    expect(tmdbRateLimitFromHeaders(new HttpHeaders())).toBeNull();
    expect(
      tmdbRateLimitFromHeaders(
        new HttpHeaders({ 'x-ratelimit-limit': 'many', 'x-ratelimit-remaining': '12' }),
      ),
    ).toBeNull();
  });

  it('caps a malformed remaining value at the server-reported limit', () => {
    expect(
      tmdbRateLimitFromHeaders(
        new HttpHeaders({ 'x-ratelimit-limit': '40', 'x-ratelimit-remaining': '50' }),
      ),
    ).toEqual({ limit: 40, remaining: 40, resetAt: null });
  });
});
