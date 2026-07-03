export const environment = {
  production: true,
  // Populated by the GitHub Actions build step from the TMDB_ACCESS_TOKEN repo secret.
  // Left empty here so no real token is ever committed to source control.
  // This is the TMDB "API Read Access Token" (sent as an Authorization: Bearer header),
  // not the shorter v3 api_key. Get one at https://www.themoviedb.org/settings/api.
  tmdbAccessToken: '',
  tmdbApiBaseUrl: 'https://api.themoviedb.org/3',
  tmdbImageBaseUrl: 'https://image.tmdb.org/t/p',
  // Populated by the GitHub Actions build step with the UTC time of the build.
  // Shown in Settings so it's possible to tell which deployed build/version an
  // installed PWA is currently running (useful since service worker updates
  // can lag behind a new deploy). Empty for any build not produced by CI.
  buildTimestamp: '',
};
