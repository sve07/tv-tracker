import { Injectable, inject } from '@angular/core';
import { DbService } from '../data/db.service';
import type {
  AppSettingsRecord,
  NotificationEntry,
  TrackedSeries,
  WatchedEpisode,
} from '../models/domain.model';

interface ExportPayload {
  version: 1;
  exportedAt: string;
  trackedSeries: TrackedSeries[];
  watchedEpisodes: WatchedEpisode[];
  settings: AppSettingsRecord[];
  notifications: NotificationEntry[];
}

export type ImportResult = { success: true } | { success: false; error: string };

function isExportPayload(value: unknown): value is ExportPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate['trackedSeries']) &&
    Array.isArray(candidate['watchedEpisodes']) &&
    Array.isArray(candidate['settings']) &&
    Array.isArray(candidate['notifications'])
  );
}

/**
 * Exports/imports the full IndexedDB tracking state as a single JSON file.
 * Uses plain Dexie table iteration (no `dexie-export-import` addon) since
 * the schema is simple and holds no blob data.
 */
@Injectable({ providedIn: 'root' })
export class ExportImportService {
  private readonly db = inject(DbService);

  async exportAll(): Promise<void> {
    const rawDb = this.db.rawDb;
    const payload: ExportPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      trackedSeries: await rawDb.trackedSeries.toArray(),
      watchedEpisodes: await rawDb.watchedEpisodes.toArray(),
      settings: await rawDb.settings.toArray(),
      notifications: await rawDb.notifications.toArray(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = `tv-tracker-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async importAll(file: File): Promise<ImportResult> {
    let payload: unknown;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      return { success: false, error: 'That file is not valid JSON.' };
    }

    if (!isExportPayload(payload)) {
      return { success: false, error: 'That file does not look like a TV Tracker export.' };
    }

    const rawDb = this.db.rawDb;
    await rawDb.transaction(
      'rw',
      [rawDb.trackedSeries, rawDb.watchedEpisodes, rawDb.settings, rawDb.notifications],
      async () => {
        await Promise.all([
          rawDb.trackedSeries.clear(),
          rawDb.watchedEpisodes.clear(),
          rawDb.settings.clear(),
          rawDb.notifications.clear(),
        ]);
        await Promise.all([
          rawDb.trackedSeries.bulkPut(payload.trackedSeries),
          rawDb.watchedEpisodes.bulkPut(payload.watchedEpisodes),
          rawDb.settings.bulkPut(payload.settings),
          rawDb.notifications.bulkPut(payload.notifications),
        ]);
      },
    );

    return { success: true };
  }
}
