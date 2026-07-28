import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalRepository, getDeviceId } from '@/lib/storage/local-repository';
import { deleteDatabase, closeDb } from '@/lib/storage/db';
import { SyncEngine } from '@/lib/sync/sync-engine';
import { MemoryTransport } from '@/lib/sync/memory-transport';
import { compareRecords, mergeRecord } from '@/lib/sync/merge';
import { newTripId } from '@/lib/utils/id';
import { newSyncMeta, type DeviceId, type TripId } from '@/lib/domain/schema';
import { hornEvent, tripStats, TEST_DEVICE } from './fixtures';
import { computeScore } from '@/lib/score/engine';

const DEVICE_A = 'DEVICEAAAAAAAAAAAAAAAAAAAA' as DeviceId;
const DEVICE_B = 'DEVICEBBBBBBBBBBBBBBBBBBBB' as DeviceId;

let repo: LocalRepository;
let transport: MemoryTransport;

async function makeTrip(id: TripId = newTripId(), startedAt = Date.now()) {
  await repo.trips.create({
    id,
    startedAt,
    simulated: false,
    sensorsUsed: ['gps', 'audio', 'motion'],
    detectorId: 'heuristic-v1',
  });
  return id;
}

function engineFor(deviceId: DeviceId, repository = repo, cursorKey = 'sync.cursor') {
  return new SyncEngine({ repository, transport, deviceId, cursorKey });
}

beforeEach(async () => {
  await deleteDatabase();
  repo = new LocalRepository();
  transport = new MemoryTransport();
});

afterEach(async () => {
  await deleteDatabase();
});

describe('conflict resolution', () => {
  const base = (overrides: Partial<ReturnType<typeof newSyncMeta>> = {}) => ({
    ...newSyncMeta(TEST_DEVICE, 1000),
    ...overrides,
  });

  it('prefers the more recently updated record', () => {
    const local = base({ updatedAt: 2000 });
    const remote = base({ updatedAt: 1000 });
    expect(compareRecords(local, remote)).toBe('local');
    expect(compareRecords(remote, local)).toBe('remote');
  });

  it('breaks an updatedAt tie on revision', () => {
    const local = base({ updatedAt: 1000, revision: 5 });
    const remote = base({ updatedAt: 1000, revision: 3 });
    expect(compareRecords(local, remote)).toBe('local');
  });

  it('breaks a full tie on deviceId, so every device agrees', () => {
    const local = base({ updatedAt: 1000, revision: 1, deviceId: DEVICE_B });
    const remote = base({ updatedAt: 1000, revision: 1, deviceId: DEVICE_A });
    // Deterministic and symmetric: both devices compute the same winner.
    expect(compareRecords(local, remote)).toBe('local');
    expect(compareRecords(remote, local)).toBe('remote');
  });

  it('lets a delete beat a concurrent edit', () => {
    // Resurrecting a deleted trip is worse than losing an edit to it.
    const deleted = base({ updatedAt: 1000, deleted: 1 });
    const edited = base({ updatedAt: 5000, deleted: 0 });
    expect(compareRecords(deleted, edited)).toBe('local');
    expect(compareRecords(edited, deleted)).toBe('remote');
  });

  it('reports identical records as equal and merges to no change', () => {
    const record = base({ updatedAt: 1000, revision: 2 });
    expect(compareRecords(record, { ...record })).toBe('equal');
    expect(mergeRecord(record, { ...record })).toBeNull();
  });

  it('takes the remote record when there is no local copy', () => {
    const remote = base();
    expect(mergeRecord(null, remote)).toBe(remote);
  });
});

describe('push', () => {
  it('drains the outbox that local writes have been filling', async () => {
    const id = await makeTrip();
    await repo.trips.update(id, { status: 'completed', stats: tripStats() });
    expect(await repo.outbox.size()).toBeGreaterThan(0);

    const status = await engineFor(DEVICE_A).sync();

    expect(status.phase).toBe('idle');
    expect(status.pushed).toBeGreaterThan(0);
    expect(await repo.outbox.size()).toBe(0);
    expect(transport.getTrip(id)).not.toBeNull();
  });

  it('clears the dirty flag once the server has the record', async () => {
    const id = await makeTrip();
    await engineFor(DEVICE_A).sync();

    const trip = await repo.trips.getRaw(id);
    expect(trip!.dirty).toBe(0);
    expect(trip!.syncedAt).not.toBeNull();
  });

  it('does not lose an edit made while a push was in flight', async () => {
    const id = await makeTrip();
    transport.latencyMs = 30;

    const engine = engineFor(await getDeviceId());
    const syncing = engine.sync();
    // Edit mid-flight: the server's ack refers to the older revision, so the
    // record must NOT be marked synced on the strength of it.
    await new Promise((r) => setTimeout(r, 10));
    await repo.trips.update(id, { title: 'edited mid-flight' });
    await syncing;

    // The engine keeps draining, so the newer revision goes out in a later
    // round of the same run and the edit reaches the server intact.
    expect(transport.getTrip(id)?.title).toBe('edited mid-flight');
    expect((await repo.trips.getRaw(id))!.title).toBe('edited mid-flight');
  });

  it('pushes samples and events, not just headers', async () => {
    const id = await makeTrip();
    await repo.trips.appendEvents([hornEvent(1, 1000, { tripId: id })]);
    await repo.trips.appendChunk({
      ...newSyncMeta(TEST_DEVICE, Date.now()),
      tripId: id,
      chunk: 0,
      from: 0,
      to: 1000,
      samples: [],
    });

    const status = await engineFor(DEVICE_A).sync();
    // trip + event + chunk
    expect(status.pushed).toBeGreaterThanOrEqual(3);
  });

  it('backs off instead of losing work when the transport fails', async () => {
    await makeTrip();
    transport.failNextPushes = 1;

    const status = await engineFor(DEVICE_A).sync();
    expect(status.phase).toBe('error');
    expect(status.lastError).toContain('simulated push failure');
    // The op survives for the next run rather than being dropped.
    expect(await repo.outbox.size()).toBeGreaterThan(0);
  });

  it('recovers on the next run after a failure', async () => {
    const id = await makeTrip();
    transport.failNextPushes = 1;

    const engine = engineFor(DEVICE_A);
    await engine.sync();
    // Backoff pushed the op into the future; run against a later clock.
    const later = new SyncEngine({
      repository: repo,
      transport,
      deviceId: DEVICE_A,
      now: () => Date.now() + 120_000,
    });
    const status = await later.sync();

    expect(status.phase).toBe('idle');
    expect(transport.getTrip(id)).not.toBeNull();
  });

  it('drops ops whose record no longer exists rather than blocking the queue', async () => {
    const id = await makeTrip();
    // Hard-remove the bulk data an op points at.
    await repo.trips.appendEvents([hornEvent(1, 1000, { tripId: id })]);
    await deleteEventsFor(id);

    const status = await engineFor(DEVICE_A).sync();
    expect(status.phase).toBe('idle');
    expect(await repo.outbox.size()).toBe(0);
  });

  it('does not re-push a record that is already synced', async () => {
    await makeTrip();
    const engine = engineFor(DEVICE_A);
    const first = await engine.sync();
    const second = await engine.sync();

    expect(first.pushed).toBeGreaterThan(0);
    expect(second.pushed).toBe(0);
  });
});

describe('pull and convergence', () => {
  it('brings a second device up to date', async () => {
    // Device A records and syncs.
    const id = await makeTrip();
    await repo.trips.update(id, { status: 'completed', stats: tripStats(), score: computeScore(tripStats()) });
    await engineFor(DEVICE_A).sync();

    // Device B starts empty against the same server.
    await closeDb();
    await deleteDatabase();
    const repoB = new LocalRepository();
    const engineB = new SyncEngine({ repository: repoB, transport, deviceId: DEVICE_B });
    const status = await engineB.sync();

    expect(status.pulled).toBeGreaterThan(0);
    const trip = await repoB.trips.get(id);
    expect(trip).not.toBeNull();
    expect(trip!.status).toBe('completed');
    expect(trip!.score).not.toBeNull();
  });

  it('does not hand a device back its own writes', async () => {
    await makeTrip();
    // Must be the id the repository actually stamps on records, otherwise the
    // server cannot tell they came from us.
    const engine = engineFor(await getDeviceId());
    const status = await engine.sync();
    expect(status.pulled).toBe(0);
  });

  it('advances the cursor so a second run pulls nothing new', async () => {
    const id = await makeTrip();
    await engineFor(DEVICE_A).sync();

    await closeDb();
    await deleteDatabase();
    const repoB = new LocalRepository();
    const engineB = new SyncEngine({ repository: repoB, transport, deviceId: DEVICE_B });

    const first = await engineB.sync();
    const second = await engineB.sync();

    expect(first.pulled).toBeGreaterThan(0);
    expect(second.pulled).toBe(0);
    expect(await repoB.trips.get(id)).not.toBeNull();
  });

  it('applies a remote delete as a tombstone', async () => {
    const id = await makeTrip();
    await engineFor(DEVICE_A).sync();

    // A tombstone arrives from elsewhere, newer than the local copy.
    const local = await repo.trips.getRaw(id);
    await transport.push(
      [{ entity: 'trip', record: { ...local!, deleted: 1, updatedAt: Date.now() + 10_000, deviceId: DEVICE_B } }],
      DEVICE_B,
    );

    await repo.settings.set('sync.cursor', null);
    await engineFor(DEVICE_A).sync();

    // `get` hides tombstones, which is the user-visible behaviour we want.
    expect(await repo.trips.get(id)).toBeNull();
    expect((await repo.trips.getRaw(id))!.deleted).toBe(1);
  });

  it('keeps the newer local record when the server is behind', async () => {
    const id = await makeTrip();
    await engineFor(DEVICE_A).sync();

    // Server holds an older revision than the local copy.
    const local = await repo.trips.getRaw(id);
    await transport.push(
      [{ entity: 'trip', record: { ...local!, title: 'stale', updatedAt: local!.updatedAt - 5000, deviceId: DEVICE_B } }],
      DEVICE_B,
    );

    await repo.settings.set('sync.cursor', null);
    await engineFor(DEVICE_A).sync();

    const after = await repo.trips.getRaw(id);
    expect(after!.title).not.toBe('stale');
  });

  it('survives a pull failure without corrupting the cursor', async () => {
    await makeTrip();
    transport.failNextPulls = 1;

    const status = await engineFor(DEVICE_A).sync();
    expect(status.phase).toBe('error');

    // Next run completes cleanly.
    const retry = await engineFor(DEVICE_A).sync();
    expect(retry.phase).toBe('idle');
  });
});

describe('engine behaviour', () => {
  it('shares one in-flight run rather than racing concurrent calls', async () => {
    await makeTrip();
    transport.latencyMs = 20;

    const engine = engineFor(DEVICE_A);
    const [a, b] = await Promise.all([engine.sync(), engine.sync()]);

    // Both callers observe the same run; work is not doubled.
    expect(a.pushed).toBe(b.pushed);
    expect(await repo.outbox.size()).toBe(0);
  });

  it('reports pending count and last sync time', async () => {
    await makeTrip();
    const engine = engineFor(DEVICE_A);

    const before = await engine.status();
    expect(before.pending).toBeGreaterThan(0);
    expect(before.lastSyncAt).toBeNull();

    await engine.sync();
    const after = await engine.status();
    expect(after.pending).toBe(0);
    expect(after.lastSyncAt).not.toBeNull();
  });

  it('never throws — a failed sync is not an app error', async () => {
    await makeTrip();
    transport.failNextPushes = 1;
    await expect(engineFor(DEVICE_A).sync()).resolves.toBeDefined();
  });
});

/** Hard-delete a trip's events, bypassing the repository, to orphan its ops. */
async function deleteEventsFor(id: TripId): Promise<void> {
  const { getDb } = await import('@/lib/storage/db');
  const db = await getDb();
  const keys = await db.getAllKeysFromIndex('tripEvents', 'by-tripId', id);
  const tx = db.transaction('tripEvents', 'readwrite');
  await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
}
