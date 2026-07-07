import { HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { tmdbAuthInterceptor } from './tmdb-auth.interceptor';
import { DbService } from '../data/db.service';
import { APP_SETTINGS_KEY, type AppSettingsRecord } from '../models/domain.model';

const AUTHORIZATION_HEADER = 'Authorization';
const BEARER_PREFIX = 'Bearer ';

function createSettings(token: string): AppSettingsRecord {
  return {
    key: APP_SETTINGS_KEY,
    theme: 'dark',
    notificationPermissionRequested: false,
    tmdbAccessToken: token,
  };
}

describe('tmdbAuthInterceptor', () => {
  it('hydrates token from IndexedDB when settings signal is not ready yet', async () => {
    const getSettings = vi.fn().mockResolvedValue(createSettings('db-token'));
    const dbMock = {
      settings: () => undefined,
      rawDb: {
        settings: {
          get: getSettings,
        },
      },
    } as unknown as DbService;

    await TestBed.configureTestingModule({
      providers: [{ provide: DbService, useValue: dbMock }],
    }).compileComponents();

    const req = new HttpRequest('GET', 'https://api.themoviedb.org/3/tv/1');
    const next = vi.fn((forwardedReq: HttpRequest<unknown>) =>
      of(new HttpResponse({ status: 200, body: forwardedReq })),
    );

    await firstValueFrom(TestBed.runInInjectionContext(() => tmdbAuthInterceptor(req, next)));

    expect(next).toHaveBeenCalledTimes(1);
    const forwardedReq = next.mock.calls[0][0] as HttpRequest<unknown>;
    expect(forwardedReq.headers.get(AUTHORIZATION_HEADER)).toBe(BEARER_PREFIX + 'db-token');
    expect(getSettings).toHaveBeenCalledWith(APP_SETTINGS_KEY);
  });

  it('does not send a bogus Authorization header when no token exists', async () => {
    const getSettings = vi.fn().mockResolvedValue(undefined);
    const dbMock = {
      settings: () => undefined,
      rawDb: {
        settings: {
          get: getSettings,
        },
      },
    } as unknown as DbService;

    await TestBed.configureTestingModule({
      providers: [{ provide: DbService, useValue: dbMock }],
    }).compileComponents();

    const req = new HttpRequest('GET', 'https://api.themoviedb.org/3/tv/1');
    const next = vi.fn((forwardedReq: HttpRequest<unknown>) =>
      of(new HttpResponse({ status: 200, body: forwardedReq })),
    );

    await firstValueFrom(TestBed.runInInjectionContext(() => tmdbAuthInterceptor(req, next)));

    expect(next).toHaveBeenCalledTimes(1);
    const forwardedReq = next.mock.calls[0][0] as HttpRequest<unknown>;
    expect(forwardedReq.headers.has(AUTHORIZATION_HEADER)).toBe(false);
    expect(getSettings).toHaveBeenCalledWith(APP_SETTINGS_KEY);
  });
});
