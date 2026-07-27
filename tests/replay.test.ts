import { describe, expect, it } from 'vitest';
import { replayFrameAt } from '@/lib/replay/interpolate';
import { ReplayClock } from '@/lib/replay/replay-clock';
import { sample, hornEvent, brakeEvent } from './fixtures';
import type { TripSample } from '@/lib/domain/samples';

function straightSamples(count: number): TripSample[] {
  return Array.from({ length: count }, (_, i) =>
    sample(i * 1000, { lat: 51.5 + i * 0.001, lon: -0.1, spd: 10 }),
  );
}

describe('replayFrameAt', () => {
  const samples = straightSamples(60);
  const events = [hornEvent(1, 10_000), brakeEvent(2, 30_000), hornEvent(3, 50_000)];

  it('returns nothing meaningful at the very start', () => {
    const frame = replayFrameAt(samples, events, events, 0);
    expect(frame.stats.hornCount).toBe(0);
    expect(frame.stats.hardBrakes).toBe(0);
  });

  it('accumulates only the events up to the playhead', () => {
    const at20 = replayFrameAt(samples, events, events, 20_000);
    expect(at20.stats.hornCount).toBe(1);
    expect(at20.stats.hardBrakes).toBe(0);

    const at40 = replayFrameAt(samples, events, events, 40_000);
    expect(at40.stats.hornCount).toBe(1);
    expect(at40.stats.hardBrakes).toBe(1);

    const atEnd = replayFrameAt(samples, events, events, 60_000);
    expect(atEnd.stats.hornCount).toBe(2);
    expect(atEnd.stats.hardBrakes).toBe(1);
  });

  it('interpolates position between samples', () => {
    const frame = replayFrameAt(samples, events, events, 5500);
    expect(frame.position).not.toBeNull();
    // Between sample 5 (lat 51.505) and sample 6 (lat 51.506).
    expect(frame.position!.lat).toBeGreaterThan(51.505);
    expect(frame.position!.lat).toBeLessThan(51.506);
  });

  it('grows the traveled path as the playhead advances', () => {
    const early = replayFrameAt(samples, events, events, 10_000);
    const late = replayFrameAt(samples, events, events, 50_000);
    expect(late.traveled.length).toBeGreaterThan(early.traveled.length);
  });

  it('reports the active timeline event', () => {
    // At 35s the most recent event is the brake (index 1).
    const frame = replayFrameAt(samples, events, events, 35_000);
    expect(frame.activeEventIndex).toBe(1);
  });

  it('accumulates distance monotonically', () => {
    const mid = replayFrameAt(samples, events, events, 30_000);
    const end = replayFrameAt(samples, events, events, 60_000);
    expect(end.stats.distanceM).toBeGreaterThan(mid.stats.distanceM);
  });

  it('handles an empty track without throwing', () => {
    const frame = replayFrameAt([], [], [], 1000);
    expect(frame.position).toBeNull();
    expect(frame.traveled).toHaveLength(0);
  });
});

describe('ReplayClock', () => {
  it('starts paused at zero', () => {
    const clock = new ReplayClock(60_000);
    const state = clock.getSnapshot();
    expect(state.playing).toBe(false);
    expect(state.positionMs).toBe(0);
    expect(state.speed).toBe(1);
  });

  it('clamps seeks to the trip bounds', () => {
    const clock = new ReplayClock(60_000);
    clock.seek(90_000);
    expect(clock.getSnapshot().positionMs).toBe(60_000);
    clock.seek(-5000);
    expect(clock.getSnapshot().positionMs).toBe(0);
  });

  it('changes speed', () => {
    const clock = new ReplayClock(60_000);
    clock.setSpeed(4);
    expect(clock.getSnapshot().speed).toBe(4);
  });

  it('notifies subscribers on change', () => {
    const clock = new ReplayClock(60_000);
    let calls = 0;
    const unsub = clock.subscribe(() => calls++);
    clock.seek(1000);
    clock.setSpeed(2);
    expect(calls).toBe(2);
    unsub();
    clock.seek(2000);
    expect(calls).toBe(2);
  });
});
