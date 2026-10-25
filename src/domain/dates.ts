// Date helpers and the late-night day rule (GAUNTLET-BRIEF §7.2). No React here.

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function ymd(d: Date): string {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
}

export function fmtDay(key: string): string {
  return parseKey(key).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function fmtDate(key: string): string {
  return parseKey(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

export function isoDaysAgo(now: Date, n: number): string {
  return new Date(now.getTime() - n * 86400000).toISOString();
}

export function daysSince(iso: string | null): number | null {
  return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;
}

export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((parseKey(toKey).getTime() - parseKey(fromKey).getTime()) / 86400000);
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/** App day = the date of (now − dayBoundary). At 01:00 during the shift it is still "yesterday". */
export function appDayKey(now: Date, boundary: string): string {
  return ymd(new Date(now.getTime() - minutesOf(boundary) * 60000));
}

/** The moment the current app day began (the day boundary on the app day's date), in ms. */
export function appDayStartMs(now: Date, boundary: string): number {
  return parseKey(appDayKey(now, boundary)).getTime() + minutesOf(boundary) * 60000;
}

/** "45 min", "1 h 05 min" */
export function fmtMinutes(ms: number): string {
  const m = Math.round(ms / 60000);
  return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + pad(m % 60) + ' min';
}

/** From the user's night plan time until the day boundary, Today pushes "Plan tomorrow". */
export function isEvening(now: Date, planTime: string, boundary: string): boolean {
  const m = now.getHours() * 60 + now.getMinutes();
  const from = minutesOf(planTime);
  const to = minutesOf(boundary);
  return from > to ? m >= from || m < to : m >= from && m < to;
}

/** A saved "20:30" in the phone's own clock style ("8:30 PM" or "20:30"), the same style the time pickers show. */
export function fmtTimeOfDay(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "09:05" */
export function fmtClockTime(d: Date): string {
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
}
