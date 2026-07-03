import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TmdbApiService } from '../../core/api/tmdb-api.service';
import { DbService } from '../../core/data/db.service';
import { toLocalDateKey, todayLocalDateKey } from '../../core/utils/date.util';
import { hideBrokenImage } from '../../core/utils/image.util';
import type { TrackedSeries } from '../../core/models/domain.model';

interface CalendarEntry {
  seriesId: number;
  seriesName: string;
  seriesPosterPath: string | null;
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string;
}

interface CalendarDateGroup {
  dateKey: string;
  label: string;
  isToday: boolean;
  isPast: boolean;
  entries: CalendarEntry[];
}

interface CalendarDay {
  date: Date;
  dateKey: string;
  inCurrentMonth: boolean;
  isToday: boolean;
}

function buildMonthGrid(monthStart: Date): CalendarDay[][] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const todayKey = todayLocalDateKey();

  const weeks: CalendarDay[][] = [];
  let cursor = new Date(year, month, 1 - startWeekday);
  for (let week = 0; week < 6; week++) {
    const days: CalendarDay[] = [];
    for (let day = 0; day < 7; day++) {
      const dateKey = toLocalDateKey(cursor);
      days.push({
        date: new Date(cursor),
        dateKey,
        inCurrentMonth: cursor.getMonth() === month,
        isToday: dateKey === todayKey,
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
    weeks.push(days);
  }
  return weeks;
}

/**
 * Shows the next/most-recent air date TMDB knows about for each tracked
 * series. Desktop gets a full month grid; mobile gets a simple chronological
 * list of only the dates that actually have entries (a 7-column grid is too
 * cramped on small screens) — both views are rendered from the same
 * `entriesByDate` map and toggled purely via CSS (see calendar-page.css),
 * so there's no duplicated data-fetching logic.
 *
 * Fetching every season's full episode list for every tracked series just to
 * populate a calendar would be expensive and rate-limit-prone, so this uses
 * the lightweight `next_episode_to_air` / `last_episode_to_air` fields
 * already returned by the series details endpoint.
 */
@Component({
  selector: 'app-calendar-page',
  imports: [RouterLink],
  templateUrl: './calendar-page.html',
})
export class CalendarPage {
  private readonly db = inject(DbService);
  private readonly tmdb = inject(TmdbApiService);

  protected readonly loading = signal(true);
  private readonly entriesByDate = signal<Map<string, CalendarEntry[]>>(new Map());

  protected readonly dateGroups = computed<CalendarDateGroup[]>(() => {
    const today = todayLocalDateKey();
    return [...this.entriesByDate().entries()]
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([dateKey, entries]) => ({
        dateKey,
        label: this.formatDateLabel(dateKey),
        isToday: dateKey === today,
        isPast: dateKey < today,
        entries,
      }));
  });

  protected readonly viewMonth = signal(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  protected readonly weeks = computed(() => buildMonthGrid(this.viewMonth()));
  protected readonly monthLabel = computed(() =>
    this.viewMonth().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  );
  protected readonly weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  constructor() {
    effect(() => {
      const series = this.db.trackedSeries();
      void this.loadEntries(series);
    });
  }

  protected previousMonth(): void {
    this.viewMonth.update((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  protected nextMonth(): void {
    this.viewMonth.update((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }

  protected entriesFor(dateKey: string): CalendarEntry[] {
    return this.entriesByDate().get(dateKey) ?? [];
  }

  private formatDateLabel(dateKey: string): string {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  private async loadEntries(series: TrackedSeries[]): Promise<void> {
    this.loading.set(true);
    const map = new Map<string, CalendarEntry[]>();

    await Promise.all(
      series.map(async (trackedSeries) => {
        try {
          const details = await firstValueFrom(this.tmdb.getTvDetails(trackedSeries.tmdbSeriesId));
          for (const episode of [details.next_episode_to_air, details.last_episode_to_air]) {
            if (!episode?.air_date) {
              continue;
            }
            const entry: CalendarEntry = {
              seriesId: trackedSeries.tmdbSeriesId,
              seriesName: trackedSeries.name,
              seriesPosterPath: trackedSeries.posterPath,
              seasonNumber: episode.season_number,
              episodeNumber: episode.episode_number,
              episodeName: episode.name,
            };
            const list = map.get(episode.air_date) ?? [];
            list.push(entry);
            map.set(episode.air_date, list);
          }
        } catch {
          // Already toasted by the interceptor; this series is just skipped for this render.
        }
      }),
    );

    this.entriesByDate.set(map);
    this.loading.set(false);
  }

  protected imageUrl(path: string | null): string | null {
    return this.tmdb.imageUrl(path);
  }

  protected readonly hideBrokenImage = hideBrokenImage;
}
