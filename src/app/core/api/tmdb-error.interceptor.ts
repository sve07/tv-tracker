import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';
import { environment } from '../../../environments/environment';

/**
 * Surfaces TMDB request failures (rate limiting, offline, auth, generic
 * errors) as user-friendly toasts instead of letting them fail silently or
 * crash a page.
 */
export const tmdbErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);

  if (!req.url.startsWith(environment.tmdbApiBaseUrl)) {
    return next(req);
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 0) {
        toast.show('You appear to be offline. Some data may be out of date.', 'error');
      } else if (error.status === 429) {
        toast.show('TMDB rate limit reached. Please wait a moment and try again.', 'error');
      } else if (error.status === 401) {
        toast.show(
          'TMDB authentication failed. Check the API access token configuration.',
          'error',
        );
      } else {
        toast.show('Something went wrong talking to TMDB. Please try again.', 'error');
      }
      return throwError(() => error);
    }),
  );
};
