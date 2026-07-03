import { Injectable, effect, inject, signal } from '@angular/core';
import { DbService } from '../data/db.service';
import type { Theme } from '../models/domain.model';

const LOCAL_STORAGE_KEY = 'tv-tracker-theme';

/**
 * Signal-based current theme. Defaults to dark. The `data-theme` attribute on
 * `<html>` (read by styles.css custom properties) is also set synchronously
 * in index.html on page load to avoid a flash-of-wrong-theme before this
 * service/Dexie have initialized.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly db = inject(DbService);

  readonly theme = signal<Theme>(this.readInitialTheme());

  constructor() {
    effect(() => {
      const theme = this.theme();
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem(LOCAL_STORAGE_KEY, theme);
    });

    // Dexie is the persisted source of truth; reconcile once settings load
    // (e.g. a value saved from another tab, or on first app start after import).
    effect(() => {
      const settings = this.db.settings();
      if (settings && settings.theme !== this.theme()) {
        this.theme.set(settings.theme);
      }
    });
  }

  toggleTheme(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    void this.db.saveTheme(next);
  }

  private readInitialTheme(): Theme {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    return stored === 'light' ? 'light' : 'dark';
  }
}
