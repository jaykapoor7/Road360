import { HOUR, MINUTE, SECOND } from './time';

/** Road360 is metric-only: kilometres and km/h throughout. */

export function formatDistance(metres: number): { value: string; unit: string } {
  if (metres < 1000) return { value: String(Math.round(metres)), unit: 'm' };
  const km = metres / 1000;
  return { value: km < 10 ? km.toFixed(1) : String(Math.round(km)), unit: 'km' };
}

export function formatDistanceLong(metres: number): string {
  const { value, unit } = formatDistance(metres);
  return `${value} ${unit}`;
}

export const metresToKm = (metres: number): number => metres / 1000;
export const mpsToKmh = (mps: number): number => mps * 3.6;

export function formatSpeed(mps: number): string {
  return `${Math.round(mpsToKmh(mps))} km/h`;
}

/** mm:ss, or h:mm:ss past an hour. Used for live timers and durations. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / SECOND));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Human phrasing for prose: "12 minutes", "1 hour 4 minutes". */
export function formatDurationWords(ms: number): string {
  if (ms < MINUTE) return `${Math.round(ms / SECOND)} seconds`;
  if (ms < HOUR) {
    const m = Math.round(ms / MINUTE);
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
  const h = Math.floor(ms / HOUR);
  const m = Math.round((ms % HOUR) / MINUTE);
  const hPart = `${h} hour${h === 1 ? '' : 's'}`;
  return m > 0 ? `${hPart} ${m} minute${m === 1 ? '' : 's'}` : hPart;
}

/** Compact phrasing for tiles: "31s", "4m 12s", "1h 4m". */
export function formatDurationCompact(ms: number): string {
  if (ms < MINUTE) return `${Math.round(ms / SECOND)}s`;
  if (ms < HOUR) {
    const m = Math.floor(ms / MINUTE);
    const s = Math.round((ms % MINUTE) / SECOND);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(ms / HOUR);
  const m = Math.round((ms % HOUR) / MINUTE);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatDb(db: number): string {
  return `${Math.round(db)} dB`;
}

export function formatPercent(fraction: number, places = 0): string {
  return `${(fraction * 100).toFixed(places)}%`;
}

/** "one horn every 4.7 seconds" — the headline phrasing. */
export function formatSecondsPrecise(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s > 0 ? `${m} minute${m === 1 ? '' : 's'} ${s} second${s === 1 ? '' : 's'}` : `${m} minute${m === 1 ? '' : 's'}`;
  }
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} seconds`;
}

export function formatTimeOfDay(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDateShort(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDateLong(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/** "July 2026" for a Date — the label used by Wrapped and the stats header. */
export function monthKeyLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** "Morning commute" style greeting used on the home screen. */
export function greetingFor(ts: number = Date.now()): string {
  const h = new Date(ts).getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Late night';
}

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}
