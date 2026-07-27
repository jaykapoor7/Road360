export type SensorKind = 'gps' | 'audio' | 'motion';

export const SENSOR_KINDS: readonly SensorKind[] = ['gps', 'audio', 'motion'] as const;

export type SensorStatus =
  | 'idle'
  | 'starting'
  | 'live'
  /** Running, but producing lower-quality data than expected (e.g. poor GPS accuracy). */
  | 'degraded'
  | 'denied'
  | 'unsupported'
  | 'error';

export type PermissionState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface SensorError {
  kind: SensorKind;
  code: 'denied' | 'unsupported' | 'insecure-context' | 'timeout' | 'unknown';
  message: string;
}

/**
 * How much of the trip each sensor actually covered. Carried into scoring so a
 * partially-sensed drive produces an honest score rather than a misleading one.
 */
export interface SensorCoverage {
  /** 0..1 fraction of active time with usable data. */
  gps: number;
  audio: number;
  motion: number;
  available: SensorKind[];
  denied: SensorKind[];
}

export const EMPTY_COVERAGE: SensorCoverage = {
  gps: 0,
  audio: 0,
  motion: 0,
  available: [],
  denied: [],
};

export const SENSOR_LABELS: Record<SensorKind, string> = {
  gps: 'Location',
  audio: 'Microphone',
  motion: 'Motion',
};

export const SENSOR_PURPOSE: Record<SensorKind, string> = {
  gps: 'Distance, speed, stop-and-go and your route map.',
  audio: 'Horn detection and how loud your drive was.',
  motion: 'Hard braking, rapid acceleration and ride smoothness.',
};
