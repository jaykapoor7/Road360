import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TripSession } from '@/lib/session/trip-session';
import { SessionStore } from '@/lib/session/session-store';
import { createSensorSuite } from '@/lib/sensors/factory';
import { createSoundEventDetector } from '@/lib/audio/registry';
import { computeTripStats, groupHornBlasts } from '@/lib/analytics/trip-analytics';
import { buildSegments, findConcentration } from '@/lib/analytics/segments';
import { computeScore } from '@/lib/score/engine';
import { isHorn, isSound } from '@/lib/domain/events';
import type { TripEvent } from '@/lib/domain/events';
import type { TripSampleChunk } from '@/lib/domain/samples';
import { TEST_DEVICE, hornEvent, brakeEvent, sample } from './fixtures';

/**
 * Drives the real recording engine with simulated sensors on fake timers, so a
 * fifteen-minute commute runs in milliseconds and produces a genuine trip:
 * real FFT, real detector, real analytics, real scoring.
 */
async function runSimulatedDrive(
  scenario: 'city-chaos' | 'stop-and-go' | 'highway-calm',
  seconds: number,
) {
  const store = new SessionStore();
  const chunks: TripSampleChunk[] = [];
  const persistedEvents: TripEvent[] = [];

  // The simulated sources read trip time from this clock rather than wall time.
  let simulatedNow = 0;
  const suite = createSensorSuite({
    mode: 'simulated',
    scenario,
    clock: { now: () => simulatedNow },
    seed: 42,
  });

  const detector = await createSoundEventDetector('heuristic-v1');

  const session = new TripSession({
    store,
    suite,
    detector,
    deviceId: TEST_DEVICE,
    simulated: true,
    callbacks: {
      onChunk: (chunk) => {
        chunks.push(chunk);
      },
      onEvents: (events) => {
        persistedEvents.push(...events);
      },
      onError: () => {},
    },
  });

  await session.start();

  // Advance the simulation. Timers fire at their real intervals under fake
  // time, so audio runs at 20 Hz, motion at 5 Hz and GPS at 1 Hz — exactly as
  // they would on a phone.
  for (let ms = 0; ms < seconds * 1000; ms += 50) {
    simulatedNow = ms;
    await vi.advanceTimersByTimeAsync(50);
  }

  const result = await session.stop();
  return { session, store, chunks, persistedEvents, ...result };
}

beforeEach(() => {
  // `performance` must be faked too. The session clock and the GPS filter both
  // work in monotonic time, so without it trip time stays at zero and every
  // fix looks simultaneous.
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TripSession with simulated sensors', () => {
  it('records samples at 1 Hz for the duration of the drive', async () => {
    const { samples } = await runSimulatedDrive('city-chaos', 120);

    // ~120 seconds of trip time, one sample per second.
    expect(samples.length).toBeGreaterThan(100);
    expect(samples.length).toBeLessThan(140);
    expect(samples[0]!.t).toBeLessThan(2000);
  });

  it('captures position, noise and motion into every sample', async () => {
    const { samples } = await runSimulatedDrive('city-chaos', 60);
    const withGps = samples.filter((s) => s.lat !== null);

    expect(withGps.length).toBeGreaterThan(40);
    expect(samples.every((s) => s.db > 0)).toBe(true);
    expect(samples.some((s) => s.aMag > 0)).toBe(true);
    // Geohashes are precomputed at capture time for future heatmaps.
    expect(withGps.every((s) => s.gh !== null && s.gh.length === 7)).toBe(true);
  });

  it('detects horns from synthesised audio through the real detector', async () => {
    const { events } = await runSimulatedDrive('city-chaos', 240);
    const horns = events.filter(isHorn);

    expect(horns.length).toBeGreaterThan(0);
    for (const horn of horns) {
      expect(horn.detectorId).toBe('heuristic-v1');
      expect(horn.confidence).toBeGreaterThan(0.6);
      // Detector identity is recorded so history stays interpretable after a
      // model swap.
      expect(horn.detectorVersion).toBeTruthy();
    }
  });

  it('records hard brakes and rapid accelerations', async () => {
    const { events } = await runSimulatedDrive('city-chaos', 240);

    expect(events.filter((e) => e.type === 'brake').length).toBeGreaterThan(0);
    expect(events.filter((e) => e.type === 'accel').length).toBeGreaterThan(0);
  });

  it('assigns a monotonic sequence so events have a stable order', async () => {
    const { events } = await runSimulatedDrive('city-chaos', 120);
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.seq).toBeGreaterThan(events[i - 1]!.seq);
    }
  });

  it('finds a quiet drive genuinely quiet', async () => {
    const { events } = await runSimulatedDrive('highway-calm', 240);
    const horns = events.filter(isHorn);
    const { events: cityEvents } = await runSimulatedDrive('city-chaos', 240);

    expect(horns.length).toBeLessThan(cityEvents.filter(isHorn).length);
  });

  it('flushes completed chunks during the drive, not only at the end', async () => {
    const { chunks } = await runSimulatedDrive('city-chaos', 300);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.samples.length).toBe(120);
    expect(chunks[0]!.chunk).toBe(0);
    expect(chunks[1]!.chunk).toBe(1);
  });

  it('persists every event it recorded', async () => {
    const { events, persistedEvents } = await runSimulatedDrive('city-chaos', 180);
    expect(persistedEvents.length).toBe(events.length);
  });

  it('commits live metrics to the store', async () => {
    const { store } = await runSimulatedDrive('city-chaos', 120);
    const metrics = store.getSnapshot('metrics');

    expect(metrics.tripTimeMs).toBeGreaterThan(0);
    expect(metrics.avgDb).toBeGreaterThan(0);
    expect(metrics.provisionalScore).toBeGreaterThanOrEqual(0);
    expect(metrics.provisionalScore).toBeLessThanOrEqual(100);
  });

  it('builds a live route for the map', async () => {
    const { store } = await runSimulatedDrive('city-chaos', 180);
    const route = store.getSnapshot('route');
    expect(route.points.length).toBeGreaterThan(3);
  });

  it('reports coverage for the sensors that produced data', async () => {
    const { coverage, sensorsUsed } = await runSimulatedDrive('city-chaos', 120);

    expect(sensorsUsed).toContain('gps');
    expect(sensorsUsed).toContain('audio');
    expect(sensorsUsed).toContain('motion');
    expect(coverage.audio).toBeGreaterThan(0.8);
  });

  it('records a gap event when the page was suspended', async () => {
    const store = new SessionStore();
    let simulatedNow = 0;
    const suite = createSensorSuite({
      mode: 'simulated',
      scenario: 'city-chaos',
      clock: { now: () => simulatedNow },
      seed: 1,
    });

    const session = new TripSession({
      store,
      suite,
      detector: null,
      deviceId: TEST_DEVICE,
      simulated: true,
      callbacks: { onChunk: () => {}, onEvents: () => {}, onError: () => {} },
    });

    await session.start();
    for (let ms = 0; ms < 5000; ms += 50) {
      simulatedNow = ms;
      await vi.advanceTimersByTimeAsync(50);
    }

    session.setHidden(true);
    // A real backgrounding advances wall time even though our fake timers do not.
    vi.setSystemTime(Date.now() + 30_000);
    session.setHidden(false);

    const { events } = await session.stop();
    const gaps = events.filter((e) => e.type === 'gap');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.type === 'gap' && gaps[0]!.durationMs).toBeGreaterThanOrEqual(30_000);
  });

  it('excludes suspended time from active duration', async () => {
    const { samples, events, coverage, sensorsUsed } = await runSimulatedDrive('city-chaos', 60);
    const withGap: TripEvent[] = [
      ...events,
      {
        ...brakeEvent(9999, 10_000),
        type: 'gap',
        source: 'derived',
        durationMs: 20_000,
        reason: 'hidden',
      } as unknown as TripEvent,
    ];

    const stats = computeTripStats({
      samples,
      events: withGap,
      durationMs: 60_000,
      coverage,
      sensorsUsed,
    });

    expect(stats.activeMs).toBe(40_000);
  });
});

describe('trip analytics over a simulated drive', () => {
  it('produces coherent statistics and a score', async () => {
    const { samples, events, coverage, sensorsUsed, session } = await runSimulatedDrive(
      'city-chaos',
      300,
    );

    const stats = computeTripStats({
      samples,
      events,
      durationMs: session.elapsedMs,
      coverage,
      sensorsUsed,
    });

    expect(stats.distanceM).toBeGreaterThan(0);
    expect(stats.noise.avgDb).toBeGreaterThan(50);
    expect(stats.noise.peakDb).toBeGreaterThanOrEqual(stats.noise.avgDb);
    expect(stats.movingMs + stats.stoppedMs).toBeGreaterThan(0);
    expect(stats.stoppedRatio).toBeGreaterThanOrEqual(0);
    expect(stats.stoppedRatio).toBeLessThanOrEqual(1);

    const score = computeScore(stats);
    expect(score.value).toBeGreaterThanOrEqual(0);
    expect(score.value).toBeLessThanOrEqual(100);
    expect(score.breakdown.hornPressure.available).toBe(true);
  });

  it('scores a calm highway drive above a chaotic city one', async () => {
    const city = await runSimulatedDrive('city-chaos', 300);
    const highway = await runSimulatedDrive('highway-calm', 300);

    const cityScore = computeScore(
      computeTripStats({
        samples: city.samples,
        events: city.events,
        durationMs: city.session.elapsedMs,
        coverage: city.coverage,
        sensorsUsed: city.sensorsUsed,
      }),
    );

    const highwayScore = computeScore(
      computeTripStats({
        samples: highway.samples,
        events: highway.events,
        durationMs: highway.session.elapsedMs,
        coverage: highway.coverage,
        sensorsUsed: highway.sensorsUsed,
      }),
    );

    expect(highwayScore.value).toBeGreaterThan(cityScore.value);
  });
});

describe('silence and blast grouping', () => {
  it('counts the run before the first horn and after the last as silence', () => {
    const samples = Array.from({ length: 100 }, (_, i) => sample(i * 1000));
    const stats = computeTripStats({
      samples,
      events: [hornEvent(1, 30_000), hornEvent(2, 40_000)],
      durationMs: 100_000,
      coverage: { gps: 1, audio: 1, motion: 1 },
      sensorsUsed: ['gps', 'audio', 'motion'],
    });

    // The 60 s tail after the last horn is the longest peaceful stretch.
    expect(stats.longestSilenceMs).toBe(60_000);
    expect(stats.longestSilenceAt).toBe(40_000);
  });

  it('averages the interval between horns', () => {
    const samples = Array.from({ length: 100 }, (_, i) => sample(i * 1000));
    const stats = computeTripStats({
      samples,
      events: [hornEvent(1, 10_000), hornEvent(2, 20_000), hornEvent(3, 30_000)],
      durationMs: 100_000,
      coverage: { gps: 1, audio: 1, motion: 1 },
      sensorsUsed: ['gps', 'audio', 'motion'],
    });

    expect(stats.avgSecondsBetweenHorns).toBe(10);
  });

  it('collapses a rapid triple-honk into one event with three blasts', () => {
    const grouped = groupHornBlasts([
      hornEvent(1, 10_000),
      hornEvent(2, 10_250),
      hornEvent(3, 10_500),
      hornEvent(4, 30_000),
    ]);

    expect(grouped.filter(isSound)).toHaveLength(2);
    const first = grouped[0]!;
    expect(isHorn(first) && first.blasts).toBe(3);
  });

  it('keeps genuinely separate honks separate', () => {
    const grouped = groupHornBlasts([hornEvent(1, 10_000), hornEvent(2, 12_000)]);
    expect(grouped).toHaveLength(2);
  });
});

describe('segment concentration', () => {
  const samples = Array.from({ length: 90 }, (_, i) => sample(i * 1000));

  it('reports a real concentration in the final third', () => {
    const events = [
      brakeEvent(1, 5_000),
      brakeEvent(2, 62_000),
      brakeEvent(3, 68_000),
      brakeEvent(4, 74_000),
      brakeEvent(5, 80_000),
    ];
    const segments = buildSegments(samples, events, 90_000, 3);
    const hit = findConcentration(segments, (s) => s.hardBrakes);

    expect(hit).not.toBeNull();
    expect(hit!.segment.label).toBe('final');
    expect(hit!.share).toBeGreaterThanOrEqual(0.45);
  });

  it('refuses to claim a pattern from too few events', () => {
    const segments = buildSegments(samples, [brakeEvent(1, 80_000)], 90_000, 3);
    expect(findConcentration(segments, (s) => s.hardBrakes)).toBeNull();
  });

  it('refuses to claim a pattern when events are spread evenly', () => {
    const events = [
      brakeEvent(1, 5_000),
      brakeEvent(2, 10_000),
      brakeEvent(3, 35_000),
      brakeEvent(4, 40_000),
      brakeEvent(5, 65_000),
      brakeEvent(6, 70_000),
    ];
    const segments = buildSegments(samples, events, 90_000, 3);
    expect(findConcentration(segments, (s) => s.hardBrakes)).toBeNull();
  });

  it('attributes events to the right slice', () => {
    const segments = buildSegments(samples, [brakeEvent(1, 5_000), hornEvent(2, 85_000)], 90_000, 3);
    expect(segments[0]!.hardBrakes).toBe(1);
    expect(segments[2]!.horns).toBe(1);
    expect(segments.filter((s) => s.hardBrakes > 0)).toHaveLength(1);
  });
});
