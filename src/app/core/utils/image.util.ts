/**
 * Generic <img> (error) handler: hides the broken image and reveals the
 * `.poster-fallback` (or similar) element immediately following it in the
 * DOM. Pair with a template like:
 *
 *   <img [src]="url" (error)="hideBrokenImage($event)" />
 *   <div class="poster-fallback hidden">No image</div>
 */
export function hideBrokenImage(event: Event): void {
  const img = event.target as HTMLImageElement;
  img.style.display = 'none';
  const fallback = img.nextElementSibling as HTMLElement | null;
  fallback?.classList.remove('hidden');
}
