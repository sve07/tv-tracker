/**
 * TMDB `air_date` values are plain calendar dates (YYYY-MM-DD) with no
 * timezone attached. Comparing them against `new Date().toISOString()`
 * (which is UTC-based) can be off by a day depending on the user's local
 * timezone offset. These helpers always compare against the user's local
 * calendar day instead.
 */
export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayLocalDateKey(): string {
  return toLocalDateKey(new Date());
}
