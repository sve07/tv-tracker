// Wraps Angular's generated ngsw-worker.js (caching/update logic, untouched)
// and adds best-effort background notification support on top of it via the
// Periodic Background Sync API (Chrome-only, requires an installed PWA, not
// guaranteed to run — see NotificationService.registerPeriodicSync).
//
// This script reads the same `notifications` object store that Dexie (the
// main app's IndexedDB wrapper) writes to, using raw IndexedDB — service
// workers can't import the app's TypeScript/Dexie code, and this only ever
// needs read/write access to plain records, so no dependency is needed here.
importScripts('./ngsw-worker.js');

const DB_NAME = 'tv-tracker';
const STORE_NAME = 'notifications';
const PERIODIC_SYNC_TAG = 'tv-tracker-episode-check';

function openDb() {
  return new Promise((resolve, reject) => {
    // No explicit version: opens the existing database as-is without
    // triggering an upgrade. Dexie (main thread) owns schema creation.
    const request = indexedDB.open(DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAll(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function put(store, value) {
  return new Promise((resolve, reject) => {
    const request = store.put(value);
    request.onsuccess = () => resolve(undefined);
    request.onerror = () => reject(request.error);
  });
}

async function showPendingNotifications() {
  let db;
  try {
    db = await openDb();
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      return;
    }

    const readTx = db.transaction(STORE_NAME, 'readonly');
    const pending = (await getAll(readTx.objectStore(STORE_NAME))).filter(
      (entry) => !entry.osNotified,
    );

    for (const entry of pending) {
      await self.registration.showNotification(`${entry.seriesName} — new episode`, {
        body: `${entry.episodeName} airs ${entry.airDate}`,
        tag: `tv-tracker-${entry.tmdbSeriesId}-${entry.seasonNumber}-${entry.episodeNumber}`,
      });

      const writeTx = db.transaction(STORE_NAME, 'readwrite');
      await put(writeTx.objectStore(STORE_NAME), { ...entry, osNotified: true });
    }
  } catch {
    // Best-effort only (e.g. DB not created yet on first install) — ignore.
  } finally {
    db?.close();
  }
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === PERIODIC_SYNC_TAG) {
    event.waitUntil(showPendingNotifications());
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) {
        return clients[0].focus();
      }
      return self.clients.openWindow('/');
    }),
  );
});
