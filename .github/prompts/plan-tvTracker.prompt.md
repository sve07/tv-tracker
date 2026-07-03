# Plan: TV Tracker — Angular v22 + TMDB + Dexie

## Decisions locked in with user

- TMDB key: baked into an environment file at build time (acceptable, personal-use app). Implementation must still keep the _real_ key out of git (gitignore environment.prod.ts, inject via GitHub Actions secret at CI build time) — satisfies user's choice without committing a secret.
- Tooling: Angular CLI (`ng new`), standalone components, npm.
- Testing: whatever Angular v22 CLI defaults to — MUST verify via `ng version`/scaffold output at implementation start, do not assume Karma/Jasmine vs Jest/Vitest.
- Hosting: GitHub Pages → use hash-based routing (`withHashLocation`) + standard `ng deploy`/gh-pages workflow. No SPA rewrite rules available on GH Pages.
- Notifications: in-app (foreground) is the reliable baseline. Also implement best-effort service worker `periodicsync` (Chrome-only, requires installed PWA) — user explicitly accepted this is not guaranteed background delivery (no backend push server exists).
- PWA: yes — manifest + icons for installability (`ng add @angular/pwa`), needed as the vehicle for the service worker anyway.
- Signal Forms: Angular v22 Signal Forms API surface is NOT confirmed from training data (post-cutoff feature) — plan explicitly calls out verifying the real API at implementation time, with typed Reactive Forms as fallback if Signal Forms isn't stable/available for the needed form (TMDB key entry not needed since key is env-baked; forms needed are minor: dark-mode toggle is not a form, import file picker is not a form — the main form use case is any settings text field, low risk).

## Steps / Phases

### Phase 0: Scaffolding & environment verification (blocking, first)

1. Run `ng version` to confirm actual Angular CLI version and default test runner/builder before assuming anything.
2. `ng new tv-tracker` — standalone components, routing enabled, CSS stylesheets (not SCSS, since spec says vanilla CSS), npm.
3. `ng add @angular/pwa` — scaffolds manifest.webmanifest, icons placeholders, ngsw-config.json, registers ServiceWorkerModule/provider.
4. Add `dexie` dependency (`npm install dexie`).
5. Set up `environment.ts` (placeholder key) / `environment.prod.ts` (gitignored, populated by CI secret) with `tmdbApiKey`, `tmdbApiBaseUrl: 'https://api.themoviedb.org/3'`, `tmdbImageBaseUrl: 'https://image.tmdb.org/t/p'`.
6. Configure Angular Router with `withHashLocation()` for GitHub Pages compatibility.

### Phase 1: Core data & API layer (_depends on Phase 0_)

1. Define models: `Series`, `Season`, `Episode`, `TrackedSeries` (join of series + watched episode ids + progress), `AppSettings` (theme, etc.), `NotificationEntry`.
2. `TmdbApiService` (HttpClient-based): `searchTv(query)`, `getTvDetails(id)`, `getSeason(tvId, seasonNumber)`, `getEpisode(tvId, seasonNumber, episodeNumber)`. TMDB v3 endpoints: `/search/tv`, `/tv/{id}`, `/tv/{id}/season/{season_number}`, `/tv/{id}/season/{season_number}/episode/{episode_number}`. Auth via `api_key` query param added by a functional `HttpInterceptorFn`.
3. Functional error-handling interceptor: catch 429 (rate limit) and network/offline errors, surface via a shared `ToastService`/banner (no library — custom component).
4. `TvTrackerDb` (Dexie class): tables — `trackedSeries`, `watchedEpisodes`, `settings`, `notifications`. Define schema/indexes (e.g. by `tmdbSeriesId`, `airDate`).
5. `DbService` wrapping Dexie CRUD for tracked series, watched-episode toggling, settings read/write, notification log read/write.
6. `ThemeService`: signal-based current theme, persists to `settings` table + mirrors to `localStorage` (avoids flash-of-wrong-theme before Dexie loads), applies `data-theme` attribute on `<html>`, defaults to dark.

### Phase 2: App shell & theming (_depends on Phase 1_)

1. Root `styles.css`: `:root` CSS custom properties (colors, spacing) + `[data-theme="light"]` overrides; dark values are the default `:root` set.
2. `AppComponent` shell: header/nav (Search, Watch List, Calendar, Notifications, Stats, Settings), theme toggle button, notification badge count (signal from `NotificationService`), `router-outlet`.
3. Lazy-loaded routes (`loadComponent`) for each page under `src/app/features/*`.
4. Skeleton/placeholder CSS classes (`.skeleton`, `.poster-fallback`) reusable across pages for loading/missing-asset states.

### Phase 3: Search & Watch List pages (_depends on Phase 2_; parallel with Phase 4/5)

1. `SearchPageComponent`: search input (debounced signal-driven query), calls `TmdbApiService.searchTv`, renders grid of poster/title/summary/rating cards; "Track" action writing into `trackedSeries` via `DbService`.
2. `WatchlistPageComponent`: signal-based store listing tracked series with computed `watchedCount/totalCount` progress per series (e.g. "12/24 episodes watched"), links to Series Detail.
3. Poster image `onerror` fallback → CSS placeholder; empty states for no results / empty watchlist.

### Phase 4: Series Detail & Episode Detail pages (_depends on Phase 2_; parallel with Phase 3)

1. `SeriesDetailPageComponent`: fetch `getTvDetails`, show summary/poster/genres/status, list seasons → lazily fetch each season's episodes via `getSeason`, track/untrack toggle button wired to `DbService`.
2. Episode list item shows watched checkbox (toggles `watchedEpisodes` table) and air-date badge (past/today/upcoming).
3. `EpisodeDetailPageComponent`: fetch single episode via `getEpisode`, show title/runtime/plot/guest stars/air date, "Watched" toggle synced with `DbService`.

### Phase 5: Notification system (_depends on Phase 1_; parallel with Phase 3/4)

1. `NotificationService` (signal-based): on app init (and periodically while app open, e.g. every few minutes via `setInterval`/`effect`), diff tracked series' upcoming episode `air_date` values against "today" and "this week"; write new matches into `notifications` table (dedupe by series+episode id), expose `unreadCount` signal for the header badge.
2. ~~Custom service worker addition: add a small custom script (e.g. `custom-sw.js`) registered via `ngsw-config.json`'s `importScripts`~~ **Corrected during implementation**: `ngsw-config.json` has no `importScripts` option (verified against the installed schema). Actual approach: `public/combined-sw.js` does `importScripts('./ngsw-worker.js')` (Angular's generated SW, untouched) then adds its own `periodicsync`/`notificationclick` listeners reading/writing the Dexie `notifications` store via raw IndexedDB, and is registered via `provideServiceWorker('combined-sw.js', ...)` instead of `ngsw-worker.js` directly. Explicitly best-effort/Chrome-only — documented in-app (Settings).
3. Request `Notification` permission from a Settings toggle (not auto-prompt on load, to follow browser UX best practice and avoid unwanted prompts).

### Phase 6: Calendar & Notifications History pages (_depends on Phase 5_)

1. `CalendarPageComponent`: month/week grid view computed from all tracked series' episodes with `air_date` in range; click a day to see episodes airing that day, link to Episode Detail.
2. `NotificationsHistoryPageComponent`: list all `notifications` table entries (past alerts / missed episodes), mark-as-read action, clear history action.

### Phase 7: Profile Statistics page (_depends on Phase 1, benefits from Phase 3/4 data existing_)

1. `StatsPageComponent`: derive metrics from `watchedEpisodes` + episode runtimes (total watch time = sum of runtimes of watched episodes), completed shows count (all episodes watched), total episodes watched.
2. Visualize with hand-rolled CSS/SVG bar or donut elements (no charting library, keeps with "vanilla CSS / no component libraries" spirit) — see Further Considerations if a lightweight charting lib is preferred instead.

### Phase 8: Settings page — export/import + dark mode toggle (_depends on Phase 1, 2_)

1. `SettingsPageComponent`: dark mode toggle bound to `ThemeService`.
2. Export: `ExportImportService.exportAll()` reads all Dexie tables, serializes to a single JSON blob, triggers browser download (`<a download>` + `Blob`/`URL.createObjectURL`).
3. Import: file `<input type="file">`, parse JSON, validate shape (basic runtime checks — reject/report malformed files), `db.transaction('rw', ..., () => bulkPut into each table)`, confirm-before-overwrite prompt.
4. Note in UI about the best-effort nature of background notifications (from Phase 5).

### Phase 9: Cross-cutting error handling & fallback polish (_depends on all feature phases_)

1. Verify `ToastService`/banner surfaces interceptor errors consistently across all pages (rate limit, offline, generic 5xx).
2. Sweep all TMDB-sourced images/summaries/air-dates for missing-data fallbacks (already-added skeleton classes from Phase 2, apply consistently).

### Phase 10: Deployment (_depends on all above_)

1. GitHub Actions workflow: build with `environment.prod.ts` populated from a repo secret (`TMDB_API_KEY`) written into the file (or via `sed`/`envsubst`) before `ng build --configuration production`, then deploy `dist/` to `gh-pages` branch (e.g. `angular-cli-ghpages` or `peaceiris/actions-gh-pages`).
2. Confirm hash-routing works correctly on GH Pages (deep link to e.g. `/#/series/123` reloads fine).

## Relevant files (to be created — greenfield repo, only README.md exists today)

- `src/environments/environment.ts`, `environment.prod.ts` — TMDB key/base URLs.
- `src/app/core/models/*.ts` — Series, Season, Episode, TrackedSeries, AppSettings, NotificationEntry.
- `src/app/core/data/tv-tracker-db.ts` — Dexie schema definition.
- `src/app/core/data/db.service.ts` — Dexie CRUD wrapper.
- `src/app/core/api/tmdb-api.service.ts`, `src/app/core/api/tmdb-api.interceptor.ts` — TMDB HTTP client + key injection.
- `src/app/core/services/theme.service.ts`, `notification.service.ts`, `toast.service.ts`, `export-import.service.ts`.
- `src/app/app.component.ts` — shell/nav/theme toggle/badge.
- `src/app/app.routes.ts` — lazy routes, `withHashLocation()`.
- `src/app/features/search/*`, `watchlist/*`, `series-detail/*`, `episode-detail/*`, `calendar/*`, `notifications-history/*`, `stats/*`, `settings/*`.
- `src/styles.css` — CSS custom properties/theme.
- `ngsw-config.json`, `src/custom-sw.js` — PWA + periodicsync notification best-effort.
- `.github/workflows/deploy.yml` — CI build+deploy to GitHub Pages.

## Verification

1. `ng build --configuration production` succeeds with no TS errors.
2. Unit tests for: `DbService` (Dexie CRUD via fake-indexeddb or Dexie's test mode), `ThemeService` default-dark + persistence, `NotificationService` air-date diffing logic (today/this-week matching), `TmdbApiService` request shaping (mocked HttpClient).
3. Manual: search → track a real show → verify watchlist progress updates as episodes toggled watched → verify calendar shows correct upcoming episodes → verify export produces valid JSON → import it into a fresh IndexedDB (clear site data) and confirm state restored → toggle theme and reload, confirm persists → simulate offline (devtools) and confirm friendly error banner, not a crash.
4. Confirm GitHub Pages deployment loads correctly and deep links (hash routes) survive a hard refresh.

## Decisions (recap)

- Manual JSON export/import via Dexie table iteration (no `dexie-export-import` addon) — schema is simple, no blob data to preserve.
- v3 TMDB REST API with `api_key` query-param auth (not v4 bearer token) for simplicity, matches "bake key into env" approach.
- No NgRx/state library — per-feature signal-based services are sufficient at this scale and match the "signal-based state handling" requirement.

## Further Considerations

1. Stats page charts: hand-rolled CSS/SVG visuals proposed to avoid adding a charting library. If you'd rather use a lightweight charting lib (e.g. Chart.js) for nicer visuals, let me know — it's not a "component library" in the Angular Material sense, but it is an extra dependency.
2. Angular v22 Signal Forms: real API surface must be confirmed at implementation time (post-training-cutoff feature). Plan assumes minimal form usage (mostly toggles/inputs, not complex forms), so risk of this blocking progress is low, but flagging explicitly per your "no guessing" preference.
