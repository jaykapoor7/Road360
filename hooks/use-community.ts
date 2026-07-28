'use client';

import { useEffect, useState } from 'react';
import { getRepository } from '@/lib/storage/local-repository';
import { createCommunitySource } from '@/lib/community/source';
import { buildCommunitySnapshot } from '@/lib/community/aggregate';
import type { CommunitySnapshot, HeatmapMetric } from '@/lib/community/types';
import type { RoadSegmentContribution } from '@/lib/domain/sync';

/**
 * Community data for the map and rankings.
 *
 * Contributions are fetched once and re-folded locally when the metric
 * changes — re-running the privacy pipeline over every trip on each toggle
 * would be needless work for the same input.
 */
export function useCommunity(metric: HeatmapMetric) {
  const [contributions, setContributions] = useState<RoadSegmentContribution[] | null>(null);
  const [snapshot, setSnapshot] = useState<CommunitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const source = createCommunitySource(getRepository());
      try {
        const cells = await source.fetchContributions();
        if (!active) return;
        setContributions(cells);
        setSnapshot(buildCommunitySnapshot(cells, metric, source.id));
      } catch {
        if (active) setContributions([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // Deliberately not keyed on `metric`: refolding is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!contributions) return;
    const source = createCommunitySource(getRepository());
    setSnapshot(buildCommunitySnapshot(contributions, metric, source.id));
  }, [contributions, metric]);

  return { snapshot, loading };
}
