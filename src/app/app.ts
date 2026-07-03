import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';
import { ToastService } from './core/services/toast.service';
import { DbService } from './core/data/db.service';
import { NotificationService } from './core/services/notification.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  protected readonly theme = inject(ThemeService);
  protected readonly toast = inject(ToastService);
  private readonly db = inject(DbService);
  private readonly notificationService = inject(NotificationService);

  protected readonly unreadNotificationCount = computed(
    () => this.db.notifications().filter((notification) => !notification.read).length,
  );

  protected readonly navLinks = [
    { path: '/search', label: 'Search', icon: '🔍' },
    { path: '/watchlist', label: 'Watch List', icon: '📺' },
    { path: '/calendar', label: 'Calendar', icon: '📅' },
    { path: '/stats', label: 'Stats', icon: '📊' },
  ];

  constructor() {
    this.notificationService.start();
  }

  protected toggleTheme(): void {
    this.theme.toggleTheme();
  }

  protected dismissToast(id: number): void {
    this.toast.dismiss(id);
  }
}
