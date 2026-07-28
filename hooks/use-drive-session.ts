'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSessionStore } from '@/lib/session/session-store';
import { TripSession } from '@/lib/session/trip-session';
import { finalizeTrip } from '@/lib/session/finalize';
import { createSensorSuite } from '@/lib/sensors/factory';
import { SessionClock } from '@/lib/session/session-clock';
import { createSoundEventDetector } from '@/lib/audio/registry';
import { getRepository, getDeviceId } from '@/lib/storage/local-repository';
import { ScreenWakeLock } from '@/lib/platform/wake-lock';
import { haptic } from '@/lib/platform/haptics';
import type { ScenarioId } from '@/lib/sensors/mock/scenarios';
import type { TripId } from '@/lib/domain/schema';
import type { AchievementDef } from '@/lib/domain/achievements';
import { WebAudioCaptureSource } from '@/lib/sensors/web/audio-capture';

export type DriveState = 'idle' | 'starting' | 'recording' | 'paused' | 'finishing' | 'error';

export interface StartOptions {
  simulated: boolean;
  scenario?: ScenarioId;
  detectorId?: string;
  /** Record without the microphone. Demo drives ignore this. */
  silent?: boolean;
}

export interface FinishResult {
  tripId: TripId;
  unlocked: AchievementDef[];
}

/**
 * Owns the lifecycle of a single drive: builds the sensor suite and detector,
 * runs the recording engine, holds the wake lock, and — on finish — hands the
 * raw result to `finalizeTrip` and returns the trip id to navigate to.
 *
 * All the heavy lifting is in lib/; this hook is a lifecycle shell around it.
 */
export function useDriveSession() {
  const [state, setState] = useState<DriveState>('idle');
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<TripSession | null>(null);
  const audioRef = useRef<WebAudioCaptureSource | null>(null);
  const wakeLockRef = useRef<ScreenWakeLock | null>(null);
  const detachVisibility = useRef<(() => void) | null>(null);
  const simulatedClockRef = useRef<SessionClock | null>(null);

  const cleanup = useCallback(() => {
    detachVisibility.current?.();
    detachVisibility.current = null;
    simulatedClockRef.current?.stop();
    simulatedClockRef.current = null;
    void wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async (options: StartOptions) => {
    if (sessionRef.current) return;
    setError(null);
    setState('starting');

    try {
      const repo = getRepository();
      const deviceId = await getDeviceId();
      const store = getSessionStore();
      store.reset();

      // Simulated sensors read trip time from a clock that tracks the real
      // session clock, so a demo drive advances at the same 1x rate a real one
      // would — the screen looks exactly like a live drive.
      let clock: { now: () => number } | undefined;
      if (options.simulated) {
        const simClock = new SessionClock(() => {}, 250);
        simClock.start();
        simulatedClockRef.current = simClock;
        clock = { now: () => simClock.elapsed() };
      }

      const suite = createSensorSuite({
        mode: options.simulated ? 'simulated' : 'live',
        scenario: options.scenario,
        clock,
        silent: options.silent,
      });
      // The web audio source exposes calibration state the report needs. In
      // silent mode (or a demo) there is no such source, so this stays null and
      // the report simply reports no audio coverage.
      audioRef.current =
        suite.audio instanceof WebAudioCaptureSource ? suite.audio : null;

      const detector = await createSoundEventDetector(options.detectorId ?? 'heuristic-v1');

      const session = new TripSession({
        store,
        suite,
        detector,
        deviceId,
        simulated: options.simulated,
        callbacks: {
          onChunk: (chunk) => repo.trips.appendChunk(chunk),
          onEvents: (events) => repo.trips.appendEvents(events),
          onError: (e) => setError(e.message),
        },
      });

      // Create the trip header up front so a crash mid-drive leaves a
      // recoverable record rather than nothing.
      await repo.trips.create({
        id: session.tripId,
        startedAt: session.startedAt,
        simulated: options.simulated,
        sensorsUsed: [],
        detectorId: detector.id,
      });

      sessionRef.current = session;

      const wakeLock = new ScreenWakeLock();
      wakeLockRef.current = wakeLock;
      await wakeLock.acquire();
      detachVisibility.current = wakeLock.attachVisibilityHandler();

      // Keep the engine informed of backgrounding so it can record gaps.
      const onVisibility = () => session.setHidden(document.visibilityState === 'hidden');
      document.addEventListener('visibilitychange', onVisibility);
      const prevDetach = detachVisibility.current;
      detachVisibility.current = () => {
        prevDetach?.();
        document.removeEventListener('visibilitychange', onVisibility);
      };

      await session.start();
      setState('recording');
      haptic('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the drive.');
      setState('error');
      cleanup();
    }
  }, [cleanup]);

  const pause = useCallback(() => {
    sessionRef.current?.pause();
    simulatedClockRef.current?.pause();
    setState('paused');
    haptic('tap');
  }, []);

  const resume = useCallback(() => {
    sessionRef.current?.resume();
    simulatedClockRef.current?.resume();
    setState('recording');
    haptic('tap');
  }, []);

  const finish = useCallback(async (): Promise<FinishResult | null> => {
    const session = sessionRef.current;
    if (!session) return null;

    setState('finishing');
    haptic('success');

    try {
      const durationMs = session.elapsedMs;
      const result = await session.stop();
      const audioSource = audioRef.current;

      const { trip, unlocked } = await finalizeTrip(getRepository(), session.tripId, {
        samples: result.samples,
        events: result.events,
        coverage: result.coverage,
        sensorsUsed: result.sensorsUsed,
        durationMs,
        calibrationOffset: audioSource?.calibrationOffset,
        calibrated: audioSource?.calibrated,
      });

      sessionRef.current = null;
      cleanup();
      setState('idle');
      return { tripId: trip.id, unlocked };
    } catch (e) {
      // Surface the real cause: a swallowed finalize error otherwise looks like
      // a drive that simply never ends.
      console.error('Road360: failed to finalize drive', e);
      setError(e instanceof Error ? e.message : 'Could not save the drive.');
      setState('error');
      return null;
    }
  }, [cleanup]);

  const abandon = useCallback(async () => {
    const session = sessionRef.current;
    if (session) {
      await session.stop();
      await getRepository().trips.softDelete(session.tripId);
    }
    sessionRef.current = null;
    cleanup();
    setState('idle');
  }, [cleanup]);

  return { state, error, start, pause, resume, finish, abandon };
}
