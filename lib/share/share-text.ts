import type { TripRecord } from '@/lib/domain/trip';
import { bandFor } from '@/lib/score/labels';
import { formatDistanceLong, formatDurationCompact } from '@/lib/utils/format';

/**
 * Post text for a drive.
 *
 * Every line is a measurement the report can be checked against. A share that
 * overstates the drive is the fastest way to make the whole score look made up,
 * so nothing here is generated — it is the same numbers the user just read,
 * reformatted.
 */
export function buildShareText(trip: TripRecord): string {
  const score = trip.score?.value ?? 0;
  const band = bandFor(score);
  const stats = trip.stats;

  const parts = [`Road360 Score: ${score}/100 — ${band.label}.`];

  if (stats) {
    const detail: string[] = [];
    if (stats.soundCounts.horn > 0) {
      detail.push(`${stats.soundCounts.horn} horn${stats.soundCounts.horn === 1 ? '' : 's'}`);
    }
    if (stats.hardBrakes > 0) {
      detail.push(`${stats.hardBrakes} hard brake${stats.hardBrakes === 1 ? '' : 's'}`);
    }
    detail.push(`${Math.round(stats.noise.avgDb)} dB average`);
    if (stats.distanceM > 0) detail.push(formatDistanceLong(stats.distanceM));
    detail.push(formatDurationCompact(stats.durationMs));
    parts.push(detail.join(' · '));
  }

  return parts.join('\n');
}

/** The X (Twitter) web composer, prefilled. */
export function buildXIntentUrl(text: string, url: string): string {
  const params = new URLSearchParams({ text });
  if (url) params.set('url', url);
  return `https://x.com/intent/post?${params.toString()}`;
}

/**
 * The public URL to attach to a post. Falls back to the current origin so a
 * self-hosted deployment links to itself rather than to somebody else's copy.
 */
export function shareOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}
