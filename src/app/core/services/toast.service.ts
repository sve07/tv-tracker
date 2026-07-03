import { Injectable, signal } from '@angular/core';

export type ToastType = 'error' | 'info' | 'success';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

let nextId = 1;

/**
 * Lightweight in-app toast/banner notifications for error handling
 * (rate limits, offline, generic failures). Rendered by AppComponent.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  show(message: string, type: ToastType = 'info', durationMs = 6000): void {
    const toast: Toast = { id: nextId++, message, type };
    this.toasts.update((current) => [...current, toast]);
    if (durationMs > 0) {
      setTimeout(() => this.dismiss(toast.id), durationMs);
    }
  }

  dismiss(id: number): void {
    this.toasts.update((current) => current.filter((t) => t.id !== id));
  }
}
