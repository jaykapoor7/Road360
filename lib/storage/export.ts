import type { TripRecord } from '@/lib/domain/trip';
import type { TripSample } from '@/lib/domain/samples';
import type { TripEvent } from '@/lib/domain/events';
import { SCHEMA_VERSION } from '@/lib/domain/schema';
import { APP_VERSION } from '@/lib/config/constants';

/**
 * Users own their data before any cloud exists. JSON is full fidelity; GPX is
 * the route alone, for anything that reads standard track files.
 */

export interface TripExport {
  format: 'road360-trip';
  schemaVersion: number;
  appVersion: string;
  exportedAt: number;
  trip: TripRecord;
  samples: TripSample[];
  events: TripEvent[];
}

export function buildTripExport(
  trip: TripRecord,
  samples: TripSample[],
  events: TripEvent[],
): TripExport {
  return {
    format: 'road360-trip',
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: Date.now(),
    trip,
    samples,
    events,
  };
}

export interface ArchiveExport {
  format: 'road360-archive';
  schemaVersion: number;
  appVersion: string;
  exportedAt: number;
  trips: TripExport[];
}

const escapeXml = (value: string): string =>
  value.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      default:
        return '&quot;';
    }
  });

export function buildGpx(trip: TripRecord, samples: readonly TripSample[]): string {
  const points = samples
    .filter((s) => s.lat !== null && s.lon !== null)
    .map((s) => {
      const time = new Date(trip.startedAt + s.t).toISOString();
      return `      <trkpt lat="${s.lat}" lon="${s.lon}"><time>${time}</time></trkpt>`;
    })
    .join('\n');

  const name = escapeXml(trip.title ?? `Road360 drive ${new Date(trip.startedAt).toISOString()}`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Road360 ${APP_VERSION}" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>`;
}
