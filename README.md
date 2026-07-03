# TV Tracker

A single-user, frontend-only Angular app for tracking TV series using the [TMDB](https://www.themoviedb.org/) API. All data (tracked series, watch history, settings, notification history) is stored locally in the browser via IndexedDB ([Dexie.js](https://dexie.org/)) — there is no backend and no multi-user support.

Built with Angular 22 (standalone components, signals, the new control-flow syntax), TypeScript, and plain CSS custom properties for dark/light theming — no UI component library.

## Features

- **Search** TMDB for TV series and track/untrack them.
- **Watch List** dashboard with per-series episode progress.
- **Series Detail** page with seasons/episodes and watched toggles.
- **Episode Detail** page with plot, runtime, guest stars, and air date.
- **Calendar** view of upcoming/last known air dates for tracked series.
- **Notifications**: in-app badge/history for episodes airing today or this week, plus best-effort background notifications (Chromium browsers, installed as a PWA, not guaranteed) via the Periodic Background Sync API.
- **Stats** page with total watch time, episodes watched, and completed shows.
- **Settings**: dark/light mode toggle, JSON export/import of all local data.

## Getting a TMDB API access token

1. Create a free account at [themoviedb.org](https://www.themoviedb.org/) and go to **Settings → API**.
2. Copy your **API Read Access Token** (not the shorter v3 "API Key").
3. Open the running app's **Settings** page and paste it into the "TMDB API Access Token" field, then click Save.

The token is stored locally in the browser (IndexedDB) only — it's never written to a file, never committed to source control, and never sent anywhere except TMDB itself.

## Development server

```bash
npm install
ng serve
```

Then open `http://localhost:4200/`.

## Running unit tests

```bash
ng test
```

Uses [Vitest](https://vitest.dev/), the Angular CLI v22 default test runner.

## Building

```bash
ng build --configuration production
```

Output is written to `dist/tv-tracker/browser/`.

## Deployment (GitHub Pages)

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) builds and deploys the app to GitHub Pages on every push to `main`. Before it will work, set up:

1. **Repository setting**: Settings → Pages → Source → **GitHub Actions**.
2. **Repository secret**: Settings → Secrets and variables → Actions → New repository secret named `TMDB_ACCESS_TOKEN` with your TMDB API Read Access Token.

The workflow injects the token into `src/environments/environment.ts` only within the CI run (never committed) and builds with `--base-href "/<repo-name>/"` to match GitHub Pages' project-site URL structure. Routing uses `withHashLocation()` since GitHub Pages has no server-side SPA rewrite rules.

## Notes & limitations

- Background notifications rely on the Periodic Background Sync API, which today only Chromium-based browsers support, only for installed PWAs, and only after the browser silently decides the site is "engaged" enough — there is no way to guarantee delivery while the app is fully closed. In-app notifications (badge + history) work reliably whenever the app is open.
- The TMDB access token is bundled into the client (this is a frontend-only app with no backend proxy), so it is visible to anyone inspecting network requests from a deployed build.
