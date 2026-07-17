import { Component, effect, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { ThemeService } from '../../core/services/theme.service';
import { ExportImportService } from '../../core/services/export-import.service';
import { NotificationService } from '../../core/services/notification.service';
import { DbService } from '../../core/data/db.service';
import { ToastService } from '../../core/services/toast.service';
import {
  TmdbApiUsageService,
  type TmdbRateLimit,
} from '../../core/services/tmdb-api-usage.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-settings-page',
  templateUrl: './settings-page.html',
})
export class SettingsPage {
  protected readonly theme = inject(ThemeService);
  private readonly exportImport = inject(ExportImportService);
  private readonly notificationService = inject(NotificationService);
  private readonly db = inject(DbService);
  private readonly toast = inject(ToastService);
  private readonly swUpdate = inject(SwUpdate);
  private readonly tmdbApiUsageService = inject(TmdbApiUsageService);

  protected readonly importing = signal(false);
  protected readonly checkingForUpdate = signal(false);
  protected readonly tmdbAccessTokenInput = signal('');
  protected readonly tmdbApiUsage = this.tmdbApiUsageService.usage;
  private tokenInputInitialized = false;

  /** Human-readable build identifier, shown in Settings so it's possible to
   *  tell which deployed build/version an installed PWA is currently on
   *  (e.g. to confirm a service worker update actually landed). Falls back
   *  to a friendly label for builds not stamped by CI (local dev/builds). */
  protected readonly buildInfo = environment.buildTimestamp
    ? new Date(environment.buildTimestamp).toLocaleString()
    : environment.production
      ? 'Unknown (not built via CI)'
      : 'Development build';

  protected get notificationPermissionRequested(): boolean {
    return this.db.settings()?.notificationPermissionRequested ?? false;
  }

  constructor() {
    effect(() => {
      const stored = this.db.settings()?.tmdbAccessToken;
      // Only seed the draft input once (from whatever is stored when it first
      // loads) — afterwards the input is fully user-driven, so we don't stomp
      // on in-progress typing every time the settings signal re-emits.
      if (!this.tokenInputInitialized && stored !== undefined) {
        this.tmdbAccessTokenInput.set(stored);
        this.tokenInputInitialized = true;
      }
    });
  }

  protected onTmdbAccessTokenInput(event: Event): void {
    this.tmdbAccessTokenInput.set((event.target as HTMLInputElement).value);
  }

  protected rateLimitPercent(rateLimit: TmdbRateLimit): number {
    return rateLimit.limit === 0 ? 0 : Math.round((rateLimit.remaining / rateLimit.limit) * 100);
  }

  protected formatApiTimestamp(value: string | number): string {
    return new Date(value).toLocaleString();
  }

  protected async saveTmdbAccessToken(): Promise<void> {
    await this.db.saveTmdbAccessToken(this.tmdbAccessTokenInput().trim());
    this.toast.show('TMDB access token saved.', 'success');
  }

  protected async exportData(): Promise<void> {
    await this.exportImport.exportAll();
  }

  protected async onImportFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    const confirmed = window.confirm(
      'Importing will replace all current tracked series, watch history, and settings. Continue?',
    );
    if (!confirmed) {
      return;
    }

    this.importing.set(true);
    const result = await this.exportImport.importAll(file);
    this.importing.set(false);

    if (result.success) {
      this.toast.show('Import complete.', 'success');
    } else {
      this.toast.show(result.error, 'error');
    }
  }

  protected async requestNotificationPermission(): Promise<void> {
    const permission = await this.notificationService.requestBrowserPermission();
    if (permission === 'granted') {
      this.toast.show('Notifications enabled.', 'success');
    } else if (permission === 'unsupported') {
      this.toast.show('Notifications are not supported in this browser.', 'info');
    } else {
      this.toast.show('Notification permission was not granted.', 'info');
    }
  }

  protected async deleteAllData(): Promise<void> {
    const confirmed = window.confirm(
      'Are you sure? This will permanently delete all tracked series, watch history, and notifications. This cannot be undone.',
    );
    if (!confirmed) {
      return;
    }

    await this.db.deleteAllData();
    this.toast.show('All data deleted.', 'success');
  }

  /** Manually checks for a new deployed version, and if one is found,
   *  activates and reloads immediately — rather than waiting for the
   *  service worker's own background check/next-navigation activation,
   *  which can otherwise leave an installed PWA on a stale build for a
   *  while after a new one is deployed. */
  protected async checkForUpdate(): Promise<void> {
    if (!this.swUpdate.isEnabled) {
      this.toast.show('Not running as an installed app — nothing to update.', 'info');
      return;
    }

    this.checkingForUpdate.set(true);
    try {
      const updateFound = await this.swUpdate.checkForUpdate();
      if (updateFound) {
        this.toast.show('Update found — reloading…', 'success');
        await this.swUpdate.activateUpdate();
        window.location.reload();
        return;
      }
      this.toast.show("You're on the latest version.", 'info');
    } catch {
      this.toast.show('Could not check for updates. Try again later.', 'error');
    } finally {
      this.checkingForUpdate.set(false);
    }
  }
}
