import type { TripEvent } from '@/lib/domain/events';
import type { Tone } from '@/lib/domain/summary';
import { formatDb, formatDurationCompact } from '@/lib/utils/format';

/**
 * Turn any timeline event into display fields.
 *
 * The UI layer resolves `icon` to a component; keeping the mapping here (as a
 * lucide icon name plus plain strings) keeps it framework-agnostic and testable,
 * and means a new event type is described in one place.
 */
export interface TimelineItemView {
  icon: string;
  label: string;
  detail: string;
  tone: Tone;
  color: string;
}

export function presentEvent(event: TripEvent): TimelineItemView {
  switch (event.type) {
    case 'sound': {
      const label =
        event.sound === 'horn'
          ? 'Horn'
          : event.sound === 'siren'
            ? 'Siren'
            : event.sound === 'whistle'
              ? 'Whistle'
              : 'Loud sound';
      const blasts = event.blasts > 1 ? ` ×${event.blasts}` : '';
      return {
        icon: event.sound === 'siren' ? 'Siren' : 'Megaphone',
        label: `${label}${blasts}`,
        detail: `${formatDb(event.db)} · ${(event.confidence * 100).toFixed(0)}% sure`,
        tone: 'negative',
        color: event.sound === 'siren' ? '#fb923c' : '#fbbf24',
      };
    }
    case 'brake':
      return {
        icon: 'ShieldAlert',
        label: event.severity === 'severe' ? 'Severe brake' : 'Hard brake',
        detail: `${event.peakDecel.toFixed(1)} m/s²`,
        tone: 'negative',
        color: '#fb7185',
      };
    case 'accel':
      return {
        icon: 'Zap',
        label: event.severity === 'aggressive' ? 'Aggressive launch' : 'Rapid acceleration',
        detail: `+${event.peakAccel.toFixed(1)} m/s²`,
        tone: 'negative',
        color: '#fb923c',
      };
    case 'stop':
      return {
        icon: 'Clock',
        label: 'Stopped',
        detail: formatDurationCompact(event.durationMs),
        tone: 'neutral',
        color: '#6b7186',
      };
    case 'peakDb':
      return {
        icon: 'Volume2',
        label: 'Loudest moment',
        detail: formatDb(event.db),
        tone: 'negative',
        color: '#f43f5e',
      };
    case 'gap':
      return {
        icon: 'PauseCircle',
        label: 'Tracking paused',
        detail: formatDurationCompact(event.durationMs),
        tone: 'neutral',
        color: '#6b7186',
      };
  }
}

/**
 * Build the chronological, display-ready timeline.
 *
 * Gaps are bookkeeping, not moments, so they are dropped. A synthetic
 * "loudest moment" marker is inserted at the peak-dB sample when the trip had
 * meaningful noise, since that instant rarely coincides with a discrete event
 * but is exactly what a reader looks for.
 */
export interface TimelineEntry {
  t: number;
  view: TimelineItemView;
  event: TripEvent;
}

export function buildTimeline(events: readonly TripEvent[]): TimelineEntry[] {
  return events
    .filter((e) => e.type !== 'gap')
    .map((event) => ({ t: event.t, view: presentEvent(event), event }))
    .sort((a, b) => a.t - b.t);
}
