import type { HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DbService } from '../data/db.service';
import { APP_SETTINGS_KEY } from '../models/domain.model';

const AUTHORIZATION_HEADER = 'Authorization';
const BEARER_PREFIX = 'Bearer ';

function withAccessToken(req: HttpRequest<unknown>, accessToken: string): HttpRequest<unknown> {
  return req.clone({
    setHeaders: { [AUTHORIZATION_HEADER]: BEARER_PREFIX + accessToken },
  });
}

/**
 * Attaches the TMDB "API Read Access Token" as an Authorization header to
 * TMDB requests only. Using a header (rather than the v3 `api_key` query
 * param) keeps the token out of URLs/logs.
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
  const settings = db.settings();
  const accessToken = settings?.tmdbAccessToken || environment.tmdbAccessToken;

  if (accessToken) {
    return next(withAccessToken(req, accessToken));
  }

  if (settings !== undefined) {
    return next(req);
  }

  return from(db.rawDb.settings.get(APP_SETTINGS_KEY)).pipe(
    switchMap((storedSettings) => {
      const hydratedToken = storedSettings?.tmdbAccessToken || environment.tmdbAccessToken;
      if (!hydratedToken) {
        return next(req);
      }
      return next(withAccessToken(req, hydratedToken));
    }),
  );
};
