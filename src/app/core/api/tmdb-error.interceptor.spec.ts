import { HttpErrorResponse, HttpHeaders, HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ToastService } from '../services/toast.service';
import { TmdbApiUsageService } from '../services/tmdb-api-usage.service';
import { tmdbErrorInterceptor } from './tmdb-error.interceptor';

describe('tmdbErrorInterceptor', () => {
  async function configure() {
    const toast = { show: vi.fn() } as unknown as ToastService;
    const usage = { recordResponse: vi.fn() } as unknown as TmdbApiUsageService;
    await TestBed.configureTestingModule({
      providers: [
        { provide: ToastService, useValue: toast },
        { provide: TmdbApiUsageService, useValue: usage },
      ],
    }).compileComponents();
    return { toast, usage };
  }

  it('records accessible limit data from successful TMDB responses', async () => {
    const { usage } = await configure();
    const headers = new HttpHeaders({
      'x-ratelimit-limit': '40',
      'x-ratelimit-remaining': '39',
    });
    const request = new HttpRequest('GET', 'https://api.themoviedb.org/3/tv/1');

    await firstValueFrom(
      TestBed.runInInjectionContext(() =>
        tmdbErrorInterceptor(request, () => of(new HttpResponse({ headers }))),
      ),
    );

    expect(usage.recordResponse).toHaveBeenCalledWith('success', headers);
  });

  it('records a rate-limited response while preserving the existing toast and error', async () => {
    const { toast, usage } = await configure();
    const headers = new HttpHeaders({ 'x-ratelimit-limit': '40', 'x-ratelimit-remaining': '0' });
    const error = new HttpErrorResponse({ status: 429, headers });
    const request = new HttpRequest('GET', 'https://api.themoviedb.org/3/tv/1');

    await expect(
      firstValueFrom(
        TestBed.runInInjectionContext(() =>
          tmdbErrorInterceptor(request, () => throwError(() => error)),
        ),
      ),
    ).rejects.toBe(error);

    expect(usage.recordResponse).toHaveBeenCalledWith('rate-limited', headers);
    expect(toast.show).toHaveBeenCalledWith(
      'TMDB rate limit reached. Please wait a moment and try again.',
      'error',
    );
  });

  it('does not track non-TMDB requests', async () => {
    const { usage } = await configure();
    const request = new HttpRequest('GET', 'https://example.test/data');

    await firstValueFrom(
      TestBed.runInInjectionContext(() =>
        tmdbErrorInterceptor(request, () => of(new HttpResponse({ status: 200 }))),
      ),
    );

    expect(usage.recordResponse).not.toHaveBeenCalled();
  });
});
