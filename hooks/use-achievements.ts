'use client';

import { useEffect, useState } from 'react';
import { getRepository } from '@/lib/storage/local-repository';
import { achievementViews } from '@/lib/insights/achievements';
import type { AchievementView } from '@/lib/domain/achievements';
import type { TripRecord } from '@/lib/domain/trip';
import { EMPTY_LIFETIME } from '@/lib/domain/aggregates';

/** Achievement progress across all definitions, unlocked first. */
export function useAchievements() {
  const [views, setViews] = useState<AchievementView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const repo = getRepository();
      const [records, lifetime, trips] = await Promise.all([
        repo.achievements.all(),
        repo.aggregates.lifetime(),
        repo.trips.listRecords({ limit: 1, includeSimulated: false }),
      ]);
      if (!active) return;

      // Progress for trip-scoped achievements is evaluated against the most
      // recent real trip; lifetime-scoped ones use the totals.
      const latest = trips[0] ?? ({ stats: null, score: null } as unknown as TripRecord);
      setViews(achievementViews({ trip: latest, lifetime: lifetime ?? EMPTY_LIFETIME }, records));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return { views, loading };
}
