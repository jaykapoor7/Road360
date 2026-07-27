import type { Millis } from '@/lib/domain/schema';

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/**
 * Period keys are computed in the *local* timezone of the device at the time of
 * the trip. A commute that starts at 23:40 belongs to that evening, not to
 * tomorrow in UTC.
 */

export function dayKey(ts: Millis): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthKey(ts: Millis): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** ISO-8601 week key, e.g. 2026-W30. Weeks start Monday. */
export function weekKey(ts: Millis): string {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  // Shift to the Thursday of this week — ISO weeks are defined by which year
  // that Thursday falls in, which is what makes year boundaries come out right.
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * DAY));
  return `${d.getFullYear()}-W${pad(week)}`;
}

export function yearKey(ts: Millis): string {
  return String(new Date(ts).getFullYear());
}

/** 0..167, Monday 00:00 = 0. The temporal bucket for anonymous contributions. */
export function hourOfWeek(ts: Millis): number {
  const d = new Date(ts);
  const dow = (d.getDay() + 6) % 7; // Monday-first
  return dow * 24 + d.getHours();
}

export function startOfWeek(ts: Millis): Millis {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function startOfMonth(ts: Millis): Millis {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function endOfMonth(ts: Millis): Millis {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1;
}

export function startOfYear(ts: Millis): Millis {
  return new Date(new Date(ts).getFullYear(), 0, 1).getTime();
}

export function endOfYear(ts: Millis): Millis {
  return new Date(new Date(ts).getFullYear() + 1, 0, 1).getTime() - 1;
}

export function addDays(ts: Millis, days: number): Millis {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}
