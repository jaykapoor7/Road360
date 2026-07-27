import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TripSession } from '@/lib/session/trip-session';
import { SessionStore } from '@/lib/session/session-store';
import { createSensorSuite } from '@/lib/sensors/factory';
import { createSoundEventDetector } from '@/lib/audio/registry';
import { finalizeTrip } from '@/lib/session/finalize';
import { LocalRepository, getDeviceId } from '@/lib/storage/local-repository';
import { deleteDatabase } from '@/lib/storage/db';

let repo: LocalRepository;

beforeEach(async () => {
  await deleteDatabase();
  repo = new LocalRepository();
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  });
});

afterEach(async () => {
  vi.useRealTimers();
  await deleteDatabase();
});

describe('finalizeTrip', () => {
  it('turns a recorded demo drive into a completed, scored trip', async () => {
    const store = new SessionStore();
    const deviceId = await getDeviceId();
    let simNow = 0;
    const suite = createSensorSuite({
      mode: 'simulated',
      scenario: 'city-chaos',
      clock: { now: () => simNow },
      seed: 7,
    });
    const detector = await createSoundEventDetector('heuristic-v1');

    const session = new TripSession({
      store,
      suite,
      detector,
      deviceId,
      simulated: true,
      callbacks: {
        onChunk: (c) => repo.trips.appendChunk(c),
        onEvents: (e) => repo.trips.appendEvents(e),
        onError: () => {},
      },
    });

    // The header must exist before finalize updates it, exactly as the hook does.
    await repo.trips.create({
      id: session.tripId,
      startedAt: session.startedAt,
      simulated: true,
      sensorsUsed: [],
      detectorId: detector.id,
    });

    await session.start();
    for (let ms = 0; ms < 180_000; ms += 50) {
      simNow = ms;
      await vi.advanceTimersByTimeAsync(50);
    }

    const durationMs = session.elapsedMs;
    const result = await session.stop();

    const { trip, unlocked } = await finalizeTrip(repo, session.tripId, {
      samples: result.samples,
      events: result.events,
      coverage: result.coverage,
      sensorsUsed: result.sensorsUsed,
      durationMs,
    });

    expect(trip.status).toBe('completed');
    expect(trip.score).not.toBeNull();
    expect(trip.score!.value).toBeGreaterThanOrEqual(0);
    expect(trip.stats).not.toBeNull();
    expect(trip.summary).not.toBeNull();
    expect(trip.summary!.headline.length).toBeGreaterThan(0);

    // The trip is retrievable and complete.
    const stored = await repo.trips.get(session.tripId);
    expect(stored?.status).toBe('completed');

    // A simulated trip is excluded from lifetime and unlocks nothing — demo
    // drives must not pollute a user's real stats or achievements.
    expect(unlocked).toHaveLength(0);
    const lifetime = await repo.aggregates.lifetime();
    expect(lifetime.tripCount).toBe(0);
  });

  it('unlocks achievements and counts toward lifetime for a real trip', async () => {
    const store = new SessionStore();
    const deviceId = await getDeviceId();
    let simNow = 0;
    const suite = createSensorSuite({
      mode: 'simulated',
      scenario: 'city-chaos',
      clock: { now: () => simNow },
      seed: 3,
    });
    const detector = await createSoundEventDetector('heuristic-v1');

    const session = new TripSession({
      store,
      suite,
      detector,
      deviceId,
      simulated: false,
      callbacks: {
        onChunk: (c) => repo.trips.appendChunk(c),
        onEvents: (e) => repo.trips.appendEvents(e),
        onError: () => {},
      },
    });

    await repo.trips.create({
      id: session.tripId,
      startedAt: session.startedAt,
      simulated: false,
      sensorsUsed: [],
      detectorId: detector.id,
    });

    await session.start();
    for (let ms = 0; ms < 120_000; ms += 50) {
      simNow = ms;
      await vi.advanceTimersByTimeAsync(50);
    }
    const durationMs = session.elapsedMs;
    const result = await session.stop();

    const { unlocked } = await finalizeTrip(repo, session.tripId, {
      samples: result.samples,
      events: result.events,
      coverage: result.coverage,
      sensorsUsed: result.sensorsUsed,
      durationMs,
    });

    expect(unlocked.some((a) => a.id === 'first-drive')).toBe(true);
    expect((await repo.aggregates.lifetime()).tripCount).toBe(1);
  });
});
