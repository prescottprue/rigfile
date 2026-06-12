/**
 * Date-only fields (service start/close, project target dates) are stored
 * as UTC-midnight timestamps — the string from an `<input type="date">` or
 * a receipt's `YYYY-MM-DD` parsed with `new Date(...)`. Rendering those with
 * the viewer's local timezone shifts them a day west of Greenwich (a
 * 2026-06-11 receipt reads "6/10/2026" in the US), so format them in UTC.
 *
 * True timestamps (created/updated) should keep using plain
 * `toLocaleDateString()` — they're real moments, not calendar dates.
 */
export function formatDateOnly(date: Date): string {
  return date.toLocaleDateString(undefined, { timeZone: "UTC" });
}
