import { Component, effect, inject, signal } from '@angular/core';
import { ThemeService } from '../../core/services/theme.service';
import { ExportImportService } from '../../core/services/export-import.service';
import { NotificationService } from '../../core/services/notification.service';
import { DbService } from '../../core/data/db.service';
import { ToastService } from '../../core/services/toast.service';

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

  protected readonly importing = signal(false);
  protected readonly tmdbAccessTokenInput = signal('');
  private tokenInputInitialized = false;

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
}
