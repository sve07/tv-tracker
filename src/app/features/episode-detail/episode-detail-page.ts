import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { TmdbApiService } from '../../core/api/tmdb-api.service';
import { DbService } from '../../core/data/db.service';
import { todayLocalDateKey } from '../../core/utils/date.util';
import { hideBrokenImage } from '../../core/utils/image.util';
import { Icon } from '../../shared/icon';
import type { TmdbEpisodeDetails } from '../../core/models/tmdb.model';

const SWIPE_THRESHOLD_PX = 60;

@Component({
  selector: 'app-episode-detail-page',
  imports: [RouterLink, Icon],
  templateUrl: './episode-detail-page.html',
  host: { class: 'block' },
})
export class EpisodeDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tmdb = inject(TmdbApiService);
  private readonly db = inject(DbService);

  private readonly paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  protected readonly seriesId = computed(() => Number(this.paramMap().get('seriesId')));
  protected readonly seasonNumber = computed(() => Number(this.paramMap().get('seasonNumber')));
  protected readonly episodeNumber = computed(() => Number(this.paramMap().get('episodeNumber')));

  protected readonly episode = signal<TmdbEpisodeDetails | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly hideBrokenImage = hideBrokenImage;

  /** Total episode count for the current season, used to bound next/previous navigation. */
  private readonly seasonEpisodeCount = signal<number | null>(null);

  protected readonly isWatched = computed(() =>
    this.db.isEpisodeWatched(this.seriesId(), this.seasonNumber(), this.episodeNumber()),
  );

  protected readonly isReleased = computed(() => {
    const episode = this.episode();
    if (!episode) {
      return false;
    }
    const status = this.airDateStatus(episode.air_date);
    return status === 'past' || status === 'today';
  });

  /** Navigation only moves within the current season (no crossing into adjacent seasons). */
  protected readonly hasPrevious = computed(() => this.episodeNumber() > 1);
  protected readonly hasNext = computed(() => {
    const count = this.seasonEpisodeCount();
    return count !== null && this.episodeNumber() < count;
  });

  /**
   * Drives the slide-in animation on the episode content (see .episode-detail
   * in the CSS). Reset through `null` on a double requestAnimationFrame
   * before being set to the real direction, so the CSS animation reliably
   * restarts even when navigating the same direction twice in a row (simply
   * re-setting the same signal value wouldn't cause the class binding to
   * toggle off/on, and CSS animations only (re)play on that transition).
   */
  protected readonly slideDirection = signal<'next' | 'previous' | null>(null);

  private touchStartX: number | null = null;

  constructor() {
    effect(() => {
      const seriesId = this.seriesId();
      const seasonNumber = this.seasonNumber();
      const episodeNumber = this.episodeNumber();
      if (![seriesId, seasonNumber, episodeNumber].every(Number.isFinite)) {
        return;
      }
      void this.loadEpisode(seriesId, seasonNumber, episodeNumber);
    });
  }

  // Pointer Events (not Touch Events) so this works both on real touchscreens
  // AND when testing via a browser's device-emulation touch mode — both report
  // pointerType 'touch'. Gating on pointerType also means normal mouse drags
  // (e.g. selecting the overview text) never accidentally trigger navigation.
  @HostListener('pointerdown', ['$event'])
  protected onPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
      return;
    }
    this.touchStartX = event.clientX;
  }

  @HostListener('pointerup', ['$event'])
  protected onPointerUp(event: PointerEvent): void {
    if (this.touchStartX === null) {
      return;
    }
    const deltaX = event.clientX - this.touchStartX;
    this.touchStartX = null;

    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) {
      return;
    }
    if (deltaX < 0) {
      this.goToNext();
    } else {
      this.goToPrevious();
    }
  }

  @HostListener('pointercancel')
  protected onPointerCancel(): void {
    this.touchStartX = null;
  }

  protected imageUrl(path: string | null): string | null {
    return this.tmdb.imageUrl(path, 'w500');
  }

  protected airDateStatus(airDate: string | null): 'past' | 'today' | 'upcoming' | 'unknown' {
    if (!airDate) {
      return 'unknown';
    }
    const today = todayLocalDateKey();
    if (airDate === today) {
      return 'today';
    }
    return airDate < today ? 'past' : 'upcoming';
  }

  protected async toggleWatched(): Promise<void> {
    if (!this.isWatched() && !this.isReleased()) {
      return;
    }
    const episode = this.episode();
    await this.db.setEpisodeWatched(
      this.seriesId(),
      this.seasonNumber(),
      this.episodeNumber(),
      episode?.runtime ?? null,
      !this.isWatched(),
    );
  }

  protected goToPrevious(): void {
    if (!this.hasPrevious()) {
      return;
    }
    this.triggerSlide('previous');
    this.navigateToEpisode(this.episodeNumber() - 1);
  }

  protected goToNext(): void {
    if (!this.hasNext()) {
      return;
    }
    this.triggerSlide('next');
    this.navigateToEpisode(this.episodeNumber() + 1);
  }

  private triggerSlide(direction: 'next' | 'previous'): void {
    this.slideDirection.set(null);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this.slideDirection.set(direction));
    });
  }

  private navigateToEpisode(episodeNumber: number): void {
    void this.router.navigate([
      '/series',
      this.seriesId(),
      'season',
      this.seasonNumber(),
      'episode',
      episodeNumber,
    ]);
  }

  private async loadEpisode(
    seriesId: number,
    seasonNumber: number,
    episodeNumber: number,
  ): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const [episode, season] = await Promise.all([
        firstValueFrom(this.tmdb.getEpisode(seriesId, seasonNumber, episodeNumber)),
        firstValueFrom(this.tmdb.getSeason(seriesId, seasonNumber)),
      ]);
      this.episode.set(episode);
      this.seasonEpisodeCount.set(season.episodes.length);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
