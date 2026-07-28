'use client';

import { useCallback, useEffect, useState } from 'react';
import { getRepository } from '@/lib/storage/local-repository';
import type { TripListItem, TripRecord } from '@/lib/domain/trip';
import type { LifetimeStats, PersonalRecords } from '@/lib/domain/aggregates';
import { EMPTY_LIFETIME, EMPTY_RECORDS } from '@/lib/domain/aggregates';
import { RECOVERY_THRESHOLD_MS } from '@/lib/config/constants';
import type { TripId } from '@/lib/domain/schema';

/**
 * The trip list for the history screen. Reads projections only, never samples.
 *
 * Only completed drives are listed. A trip whose session died mid-recording —
 * closed tab, killed browser, flat battery — has no stats and no score, so it
 * would otherwise render as a permanent 0-score row leading to an empty report.
 * Those are swept to `abandoned` first so the state is resolved rather than
 * merely hidden.
 */
export function useTrips(includeSimulated = true) {
  const [trips, setTrips] = useState<TripListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const list = await getRepository().trips.list({
      limit: 200,
      includeSimulated,
      status: 'completed',
    });
    setTrips(list);
    setLoading(false);
  }, [includeSimulated]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const repo = getRepository();
      await repo.trips.sweepAbandoned(RECOVERY_THRESHOLD_MS);
      const list = await repo.trips.list({ limit: 200, includeSimulated, status: 'completed' });
      if (active) {
        setTrips(list);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [includeSimulated]);

  const remove = useCallback(
    async (id: TripId) => {
      await getRepository().trips.softDelete(id);
      await reload();
    },
    [reload],
  );

  return { trips, loading, reload, remove };
}

/** A single trip record, with its status while loading. */
export function useTrip(id: TripId | null) {
  const [trip, setTrip] = useState<TripRecord | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found'>('loading');

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!id) {
        if (active) setStatus('not-found');
        return;
      }
      const record = await getRepository().trips.get(id);
      if (!active) return;
      setTrip(record);
      setStatus(record ? 'ready' : 'not-found');
    })();
    return () => {
      active = false;
    };
  }, [id]);

  return { trip, status };
}

/** Lifetime totals and personal records for the home and stats screens. */
export function useLifetime() {
  const [lifetime, setLifetime] = useState<LifetimeStats>(EMPTY_LIFETIME);
  const [records, setRecords] = useState<PersonalRecords>(EMPTY_RECORDS);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const repo = getRepository();
    const [life, recs] = await Promise.all([repo.aggregates.lifetime(), repo.aggregates.records()]);
    setLifetime(life);
    setRecords(recs);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const repo = getRepository();
      const [life, recs] = await Promise.all([
        repo.aggregates.lifetime(),
        repo.aggregates.records(),
      ]);
      if (!active) return;
      setLifetime(life);
      setRecords(recs);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return { lifetime, records, loading, reload };
}
