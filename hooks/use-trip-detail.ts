'use client';

import { useEffect, useState } from 'react';
import { getRepository } from '@/lib/storage/local-repository';
import type { TripRecord } from '@/lib/domain/trip';
import type { TripEvent } from '@/lib/domain/events';
import type { TripSample } from '@/lib/domain/samples';
import type { TripId } from '@/lib/domain/schema';

export interface TripDetail {
  trip: TripRecord;
  events: TripEvent[];
  samples: TripSample[];
}

/**
 * Loads everything the report and replay need: the trip header plus its full
 * event log and sample track. Unlike the list hooks, this deliberately pages in
 * the samples — the report is the one screen that wants them.
 */
export function useTripDetail(id: TripId | null) {
  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found'>('loading');

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!id) {
        if (active) setStatus('not-found');
        return;
      }
      const repo = getRepository();
      const trip = await repo.trips.get(id);
      if (!trip) {
        if (active) setStatus('not-found');
        return;
      }
      const [events, samples] = await Promise.all([
        repo.trips.readEvents(id),
        repo.trips.readSamples(id),
      ]);
      if (!active) return;
      setDetail({ trip, events, samples });
      setStatus('ready');
    })();
    return () => {
      active = false;
    };
  }, [id]);

  return { detail, status };
}
