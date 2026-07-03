import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withHashLocation } from '@angular/router';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { tmdbAuthInterceptor } from './core/api/tmdb-auth.interceptor';
import { tmdbErrorInterceptor } from './core/api/tmdb-error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Hash-based routing is required for GitHub Pages, which has no server-side
    // rewrite rules to support deep-linked path-based SPA routes.
    provideRouter(routes, withHashLocation()),
    provideHttpClient(withInterceptors([tmdbAuthInterceptor, tmdbErrorInterceptor])),
    // combined-sw.js importScripts()'s the Angular-generated ngsw-worker.js
    // (unaltered caching/update behavior) and layers best-effort background
    // notification support (Periodic Background Sync) on top of it.
    provideServiceWorker('combined-sw.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
