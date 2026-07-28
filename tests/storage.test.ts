import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalRepository } from '@/lib/storage/local-repository';
import { deleteDatabase } from '@/lib/storage/db';
import { newTripId } from '@/lib/utils/id';
import { SCHEMA_VERSION } from '@/lib/domain/schema';
import { CHUNK_SIZE, type TripSampleChunk } from '@/lib/domain/samples';
import { newSyncMeta } from '@/lib/domain/schema';
import { brakeEvent, hornEvent, sample, TEST_DEVICE, tripStats } from './fixtures';
import type { TripId } from '@/lib/domain/schema';

let repo: LocalRepository;

async function makeTrip(overrides: { simulated?: boolean } = {}): Promise<TripId> {
  const id = newTripId();
  await repo.trips.create({
    id,
    startedAt: Date.now(),
    simulated: overrides.simulated ?? false,
    sensorsUsed: ['gps', 'audio', 'motion'],
    detectorId: 'heuristic-v1',
  });
  return id;
}

beforeEach(async () => {
  await deleteDatabase();
  repo = new LocalRepository();
});

afterEach(async () => {
  await deleteDatabase();
});

describe('trip lifecycle', () => {
  it('creates a trip with sync metadata and derived period keys', async () => {
    const id = await makeTrip();
    const trip = await repo.trips.get(id);

    expect(trip).not.toBeNull();
    expect(trip!.status).toBe('recording');
    expect(trip!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(trip!.revision).toBe(1);
    expect(trip!.dirty).toBe(1);
    expect(trip!.syncedAt).toBeNull();
    expect(trip!.dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(trip!.weekKey).toMatch(/^\d{4}-W\d{2}$/);
    expect(trip!.monthKey).toMatch(/^\d{4}-\d{2}$/);
  });

  it('bumps revision on update', async () => {
    const id = await makeTrip();
    const updated = await repo.trips.update(id, { status: 'completed', stats: tripStats() });

    expect(updated.revision).toBe(2);
    expect(updated.status).toBe('completed');
    expect(updated.stats).not.toBeNull();
  });

  it('tombstones rather than hard-deleting, so a synced row cannot resurrect', async () => {
    const id = await makeTrip();
    await repo.trips.softDelete(id);

    expect(await repo.trips.get(id)).toBeNull();
    expect(await repo.trips.list()).toHaveLength(0);
  });

  it('excludes simulated trips when asked', async () => {
    await makeTrip({ simulated: false });
    await makeTrip({ simulated: true });

    expect(await repo.trips.list()).toHaveLength(2);
    expect(await repo.trips.list({ includeSimulated: false })).toHaveLength(1);
  });

  it('sweeps a drive whose session died into abandoned', async () => {
    const stale = await makeTrip();
    // Backdate it past the liveness window, as a killed browser would leave it.
    // putRaw, because update() stamps updatedAt itself and would keep it fresh.
    const record = (await repo.trips.getRaw(stale))!;
    const longAgo = Date.now() - 600_000;
    await repo.trips.putRaw({ ...record, startedAt: longAgo, updatedAt: longAgo });

    const swept = await repo.trips.sweepAbandoned(120_000);

    expect(swept).toHaveLength(1);
    expect((await repo.trips.get(stale))!.status).toBe('abandoned');
    // And it no longer pollutes the history list.
    expect(await repo.trips.list({ status: 'completed' })).toHaveLength(0);
  });

  it('leaves a drive that is genuinely still recording alone', async () => {
    const live = await makeTrip();
    expect(await repo.trips.sweepAbandoned(120_000)).toHaveLength(0);
    expect((await repo.trips.get(live))!.status).toBe('recording');
  });

  it('lists newest first', async () => {
    const older = newTripId();
    const newer = newTripId();
    await repo.trips.create({
      id: older,
      startedAt: 1000,
      simulated: false,
      sensorsUsed: [],
      detectorId: 'heuristic-v1',
    });
    await repo.trips.create({
      id: newer,
      startedAt: 9000,
      simulated: false,
      sensorsUsed: [],
      detectorId: 'heuristic-v1',
    });

    const list = await repo.trips.list();
    expect(list[0]!.id).toBe(newer);
    expect(list[1]!.id).toBe(older);
  });
});

describe('samples and events', () => {
  it('round-trips sample chunks and reassembles them in order', async () => {
    const id = await makeTrip();

    for (let c = 0; c < 3; c++) {
      const samples = Array.from({ length: CHUNK_SIZE }, (_, i) =>
        sample((c * CHUNK_SIZE + i) * 1000),
      );
      const chunk: TripSampleChunk = {
        ...newSyncMeta(TEST_DEVICE, Date.now()),
        tripId: id,
        chunk: c,
        from: samples[0]!.t,
        to: samples[samples.length - 1]!.t,
        samples,
      };
      await repo.trips.appendChunk(chunk);
    }

    const all = await repo.trips.readSamples(id);
    expect(all).toHaveLength(CHUNK_SIZE * 3);
    expect(all[0]!.t).toBe(0);
    expect(all[all.length - 1]!.t).toBe((CHUNK_SIZE * 3 - 1) * 1000);
  });

  it('reads a bounded time range without loading the whole trip', async () => {
    const id = await makeTrip();
    const samples = Array.from({ length: CHUNK_SIZE }, (_, i) => sample(i * 1000));
    await repo.trips.appendChunk({
      ...newSyncMeta(TEST_DEVICE, Date.now()),
      tripId: id,
      chunk: 0,
      from: 0,
      to: (CHUNK_SIZE - 1) * 1000,
      samples,
    });

    const window = await repo.trips.readSamples(id, { from: 10_000, to: 20_000 });
    expect(window).toHaveLength(11);
    expect(window[0]!.t).toBe(10_000);
  });

  it('stores events chronologically and filters by type', async () => {
    const id = await makeTrip();
    await repo.trips.appendEvents([
      hornEvent(2, 5000, { tripId: id }),
      brakeEvent(1, 2000, { tripId: id }),
      hornEvent(3, 9000, { tripId: id }),
    ]);

    const all = await repo.trips.readEvents(id);
    expect(all.map((e) => e.t)).toEqual([2000, 5000, 9000]);

    const sounds = await repo.trips.readEvents(id, 'sound');
    expect(sounds).toHaveLength(2);
    expect(sounds.every((e) => e.type === 'sound')).toBe(true);
  });

  it('removes bulk data when a trip is deleted', async () => {
    const id = await makeTrip();
    await repo.trips.appendEvents([hornEvent(1, 1000, { tripId: id })]);
    await repo.trips.softDelete(id);

    expect(await repo.trips.readEvents(id)).toHaveLength(0);
  });
});

describe('outbox', () => {
  it('fills from local writes so future sync needs no backfill', async () => {
    const id = await makeTrip();
    await repo.trips.update(id, { status: 'completed' });
    await repo.trips.appendEvents([hornEvent(1, 1000, { tripId: id })]);

    // create + update + event
    expect(await repo.outbox.size()).toBe(3);

    const claimed = await repo.outbox.claim(10, Date.now());
    expect(claimed.length).toBe(3);
    expect(claimed[0]!.entity).toBe('trip');
    expect(claimed.some((op) => op.entity === 'event')).toBe(true);
  });

  it('records a delete op rather than dropping the row silently', async () => {
    const id = await makeTrip();
    await repo.outbox.claim(10, Date.now());
    await repo.trips.softDelete(id);

    const ops = await repo.outbox.claim(10, Date.now());
    expect(ops.some((op) => op.op === 'delete' && op.entity === 'trip')).toBe(true);
  });

  it('backs off failed ops instead of spinning on them', async () => {
    await makeTrip();
    const [op] = await repo.outbox.claim(1, Date.now());
    await repo.outbox.fail(op!.id!, 'network down');

    // No longer due immediately.
    expect(await repo.outbox.claim(10, Date.now())).toHaveLength(0);
    expect(await repo.outbox.claim(10, Date.now() + 60_000)).toHaveLength(1);
  });

  it('acks remove the op', async () => {
    await makeTrip();
    const [op] = await repo.outbox.claim(1, Date.now());
    await repo.outbox.ack(op!.id!);
    expect(await repo.outbox.size()).toBe(0);
  });
});

describe('settings and achievements', () => {
  it('round-trips settings with a typed fallback', async () => {
    expect(await repo.settings.get('missing', 42)).toBe(42);
    await repo.settings.set('missing', 7);
    expect(await repo.settings.get('missing', 42)).toBe(7);
  });

  it('keeps the first unlock date for an achievement', async () => {
    const id = await makeTrip();
    await repo.achievements.unlock({
      id: 'zen-drive',
      unlockedAt: 1000,
      tripId: id,
      valueAtUnlock: 1,
    });
    await repo.achievements.unlock({
      id: 'zen-drive',
      unlockedAt: 5000,
      tripId: id,
      valueAtUnlock: 2,
    });

    const all = await repo.achievements.all();
    expect(all).toHaveLength(1);
    expect(all[0]!.unlockedAt).toBe(1000);
  });
});

describe('clearAll', () => {
  it('wipes user data but preserves device identity', async () => {
    await makeTrip();
    await repo.settings.set('foo', 'bar');
    await repo.clearAll();

    expect(await repo.trips.list()).toHaveLength(0);
    expect(await repo.settings.get('foo', null)).toBeNull();
    expect(await repo.outbox.size()).toBe(0);
  });
});
