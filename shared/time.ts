/**
 * @file Centralized date/time helpers (§2.6: "time math centralized").
 *
 * Dates are `YYYY-MM-DD` strings and times are `HH:mm` strings. All arithmetic happens in
 * local time on purpose — sessions are scheduled in Charlotte local time, and using UTC would
 * shift late-evening sessions onto the wrong day.
 */

/** Milliseconds in one day. */
export const MS_PER_DAY = 86_400_000;

/**
 * Parses a `YYYY-MM-DD` string to a local-midnight Date.
 * @param iso - Date string.
 * @returns A Date at 00:00 local time.
 */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Formats a Date as `YYYY-MM-DD` in local time.
 * @param date - The date.
 * @returns The ISO-style date string.
 */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns today's date as `YYYY-MM-DD`.
 * @returns Today's local date string.
 */
export function todayIso(): string {
  return toIsoDate(new Date());
}

/**
 * Adds a number of days to an ISO date.
 * @param iso - Starting date.
 * @param days - Days to add (may be negative).
 * @returns The shifted date string.
 */
export function addDays(iso: string, days: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/**
 * Whole days from `a` to `b` (positive when `b` is later).
 * @param a - Start date.
 * @param b - End date.
 * @returns Day difference.
 */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / MS_PER_DAY);
}

/**
 * Converts `HH:mm` to minutes since midnight.
 * @param time - 24-hour time.
 * @returns Minutes since midnight.
 */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Duration of a time range in hours.
 * @param start - Start `HH:mm`.
 * @param end - End `HH:mm`.
 * @returns Hours (may be fractional).
 */
export function durationHours(start: string, end: string): number {
  return (toMinutes(end) - toMinutes(start)) / 60;
}

/**
 * Whether two same-day time ranges overlap (touching ends do not count).
 * @param aStart - First range start.
 * @param aEnd - First range end.
 * @param bStart - Second range start.
 * @param bEnd - Second range end.
 * @returns `true` if the ranges overlap.
 */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

/**
 * Formats `HH:mm` as a friendly 12-hour time, e.g. `3:30 PM`.
 * @param time - 24-hour time.
 * @returns The formatted time.
 */
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * Formats a time range, e.g. `3:00–4:30 PM`.
 * @param start - Start `HH:mm`.
 * @param end - End `HH:mm`.
 * @returns The formatted range.
 */
export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)}–${formatTime(end)}`;
}

/**
 * Formats an ISO date for display, e.g. `Tue, Nov 24, 2026`.
 * @param iso - Date string.
 * @param options - Optional Intl overrides.
 * @returns The formatted date.
 */
export function formatDate(iso: string, options?: Intl.DateTimeFormatOptions): string {
  return parseDate(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  });
}

/**
 * Returns `YYYY-MM` for grouping by month.
 * @param iso - Date string.
 * @returns Month key.
 */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * Formats a `YYYY-MM` key as `Nov 2026`.
 * @param key - Month key.
 * @returns Friendly month label.
 */
export function formatMonthKey(key: string): string {
  return parseDate(`${key}-01`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
