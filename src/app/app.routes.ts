import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'watchlist' },
  {
    path: 'search',
    loadComponent: () => import('./features/search/search-page').then((m) => m.SearchPage),
  },
  {
    path: 'watchlist',
    loadComponent: () => import('./features/watchlist/watchlist-page').then((m) => m.WatchlistPage),
  },
  {
    path: 'series/:seriesId',
    loadComponent: () =>
      import('./features/series-detail/series-detail-page').then((m) => m.SeriesDetailPage),
  },
  {
    path: 'series/:seriesId/season/:seasonNumber/episode/:episodeNumber',
    loadComponent: () =>
      import('./features/episode-detail/episode-detail-page').then((m) => m.EpisodeDetailPage),
  },
  {
    path: 'calendar',
    loadComponent: () => import('./features/calendar/calendar-page').then((m) => m.CalendarPage),
  },
  {
    path: 'notifications',
    loadComponent: () =>
      import('./features/notifications-history/notifications-history-page').then(
        (m) => m.NotificationsHistoryPage,
      ),
  },
  {
    path: 'stats',
    loadComponent: () => import('./features/stats/stats-page').then((m) => m.StatsPage),
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings-page').then((m) => m.SettingsPage),
  },
  { path: '**', redirectTo: 'watchlist' },
];
