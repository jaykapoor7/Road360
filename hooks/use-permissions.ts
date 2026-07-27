'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PermissionState, SensorKind } from '@/lib/domain/sensors';
import { WebMotionSource } from '@/lib/sensors/web/motion-source';
import { haptic } from '@/lib/platform/haptics';

export type PermissionStates = Record<SensorKind, PermissionState>;

const INITIAL: PermissionStates = { gps: 'unknown', audio: 'unknown', motion: 'unknown' };

/**
 * Permission state and the gesture-bound request functions.
 *
 * The iOS constraint shapes this whole hook: `DeviceMotionEvent.requestPermission()`
 * must run synchronously inside a user gesture, and *any* await before it —
 * including awaiting getUserMedia — loses the activation and rejects. So each
 * request is its own function, meant to be called directly from a tap handler,
 * and motion's request calls `requestPermission()` before anything else.
 *
 * `navigator.permissions.query` is unimplemented for microphone in Safari, so
 * it is wrapped and treated as 'unknown' rather than branched on.
 */
export function usePermissions() {
  const [states, setStates] = useState<PermissionStates>(INITIAL);

  // Best-effort initial read. Never blocks the UI on it.
  useEffect(() => {
    let cancelled = false;

    async function probe() {
      const next: Partial<PermissionStates> = {};

      if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
        for (const name of ['geolocation', 'microphone'] as const) {
          try {
            const status = await navigator.permissions.query({ name: name as PermissionName });
            const kind: SensorKind = name === 'geolocation' ? 'gps' : 'audio';
            next[kind] = status.state === 'prompt' ? 'prompt' : (status.state as PermissionState);
          } catch {
            // Safari throws for 'microphone'; leave as unknown.
          }
        }
      }

      // Motion: if the platform exposes no permission gate, it's effectively granted.
      if (!WebMotionSource.needsExplicitPermission()) {
        next.motion = typeof DeviceMotionEvent === 'undefined' ? 'unsupported' : 'granted';
      } else {
        next.motion = 'prompt';
      }

      if (!cancelled) setStates((prev) => ({ ...prev, ...next }));
    }

    void probe();
    return () => {
      cancelled = true;
    };
  }, []);

  const setOne = useCallback((kind: SensorKind, state: PermissionState) => {
    setStates((prev) => ({ ...prev, [kind]: state }));
  }, []);

  /**
   * MUST be the first thing a tap handler calls. No awaits may precede the
   * call to requestPermission() or iOS rejects it.
   */
  const requestMotion = useCallback(async (): Promise<PermissionState> => {
    if (!WebMotionSource.needsExplicitPermission()) {
      const state: PermissionState =
        typeof DeviceMotionEvent === 'undefined' ? 'unsupported' : 'granted';
      setOne('motion', state);
      return state;
    }

    const result = await WebMotionSource.requestIosPermission();
    const state: PermissionState = result === 'granted' ? 'granted' : 'denied';
    setOne('motion', state);
    if (state === 'granted') haptic('tap');
    return state;
  }, [setOne]);

  const requestMicrophone = useCallback(async (): Promise<PermissionState> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setOne('audio', 'unsupported');
      return 'unsupported';
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release immediately; the capture source opens its own stream with the
      // right constraints when the drive starts.
      stream.getTracks().forEach((t) => t.stop());
      setOne('audio', 'granted');
      haptic('tap');
      return 'granted';
    } catch (error) {
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      const state: PermissionState = denied ? 'denied' : 'unsupported';
      setOne('audio', state);
      return state;
    }
  }, [setOne]);

  const requestLocation = useCallback(async (): Promise<PermissionState> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setOne('gps', 'unsupported');
      return 'unsupported';
    }
    return new Promise<PermissionState>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          setOne('gps', 'granted');
          haptic('tap');
          resolve('granted');
        },
        (error) => {
          const state: PermissionState =
            error.code === error.PERMISSION_DENIED ? 'denied' : 'prompt';
          setOne('gps', state);
          resolve(state);
        },
        { enableHighAccuracy: true, timeout: 15_000 },
      );
    });
  }, [setOne]);

  const granted = (Object.keys(states) as SensorKind[]).filter((k) => states[k] === 'granted');
  // A drive is worth recording with any one sensor available.
  const canStart = granted.length > 0;
  const anyDenied = (Object.keys(states) as SensorKind[]).some((k) => states[k] === 'denied');

  return {
    states,
    granted,
    canStart,
    anyDenied,
    requestMotion,
    requestMicrophone,
    requestLocation,
  };
}
