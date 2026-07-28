import type { RoadSegmentContribution } from '@/lib/domain/sync';
import type { Road360Repository } from '@/lib/storage/repository';
import { anonymizeTrip } from '@/lib/sync/anonymize';
import { isCountable } from '@/lib/analytics/aggregate';
import type { CommunitySource } from './types';

/**
 * Where community data comes from.
 *
 * Today: the user's own trips, anonymised through exactly the same pipeline
 * that would upload them. That is deliberate — the heatmap you see locally is
 * built from the identical cell structure the server would receive, so the
 * privacy transform is exercised on every render rather than only on upload.
 *
 * When sync is switched on, `RemoteCommunitySource` replaces this and the
 * aggregation, the UI and the colour scales are unchanged.
 */
export class LocalCommunitySource implements CommunitySource {
  readonly id = 'local';

  constructor(private readonly repository: Road360Repository) {}

  async fetchContributions(): Promise<RoadSegmentContribution[]> {
    const trips = await this.repository.trips.listRecords({
      limit: 500,
      includeSimulated: true,
    });

    const contributions: RoadSegmentContribution[] = [];

    for (const trip of trips) {
      // Demo trips are included here on purpose: the map is a visualisation of
      // road conditions, not a personal statistic, and excluding them would
      // leave a new user staring at an empty page.
      if (!isCountable(trip) && !trip.simulated) continue;

      const [samples, events] = await Promise.all([
        this.repository.trips.readSamples(trip.id),
        this.repository.trips.readEvents(trip.id),
      ]);

      contributions.push(...anonymizeTrip({ samples, events, startedAt: trip.startedAt }));
    }

    return contributions;
  }
}

/**
 * The server-backed source. Not implemented — it needs the same backend cloud
 * sync needs, and the contract is one method.
 */
export class RemoteCommunitySource implements CommunitySource {
  readonly id = 'community';

  constructor(private readonly baseUrl: string) {}

  async fetchContributions(): Promise<RoadSegmentContribution[]> {
    const response = await fetch(`${this.baseUrl}/community/cells`);
    if (!response.ok) throw new Error(`Community fetch failed: ${response.status}`);
    const body = (await response.json()) as { cells: RoadSegmentContribution[] };
    return body.cells;
  }
}

export function createCommunitySource(repository: Road360Repository): CommunitySource {
  const url = process.env.NEXT_PUBLIC_SYNC_URL;
  return url ? new RemoteCommunitySource(url) : new LocalCommunitySource(repository);
}
