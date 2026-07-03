import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { DbService } from '../data/db.service';

/**
 * Attaches the TMDB "API Read Access Token" as a Bearer header to TMDB
 * requests only. Using the Authorization header (rather than the v3
 * `api_key` query param) keeps the token out of URLs/logs.
 *
 * The token the user enters in Settings (stored locally in IndexedDB, never
 * committed to source control) always takes priority over the build-time
 * `environment.tmdbAccessToken` — which only exists as a fallback for anyone
 * running their own CI build with the token injected as a secret.
 */
export const tmdbAuthInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.tmdbApiBaseUrl)) {
    return next(req);
  }

  const db = inject(DbService);
  const accessToken = db.settings()?.tmdbAccessToken || environment.tmdbAccessToken;

  const authorizedRequest = req.clone({
    setHeaders: { Authorization: `Bearer ${accessToken}` },
  });
  return next(authorizedRequest);
};
