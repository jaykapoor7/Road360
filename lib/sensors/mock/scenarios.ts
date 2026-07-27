/**
 * Demo scenarios.
 *
 * These are what make every screen in the app verifiable without a car — and
 * they are deliberately *different* from one another, so the score, the
 * insights and the comparisons all have something to distinguish.
 */
export type ScenarioId = 'city-chaos' | 'stop-and-go' | 'highway-calm';

export interface Scenario {
  id: ScenarioId;
  name: string;
  description: string;
  /** How long a simulated drive runs, in seconds of trip time. */
  durationS: number;
  /** Mean cruising speed, m/s. */
  cruiseSpeed: number;
  /** Ambient noise level, dB. */
  baseDb: number;
  /** Peak-to-ambient swing of traffic noise, dB. */
  noiseSwingDb: number;
  /** Expected horn blasts per minute. */
  hornsPerMin: number;
  /** Hard brakes per minute. */
  brakesPerMin: number;
  /** Rapid accelerations per minute. */
  accelsPerMin: number;
  /** Fraction of time spent stationary. */
  stopRatio: number;
  /** 0..1 — how much of the event load is concentrated toward the end. */
  endLoading: number;
  sirensPerMin: number;
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  'city-chaos': {
    id: 'city-chaos',
    name: 'City chaos',
    description: 'Rush hour through the middle of town. Loud, tight and relentless.',
    durationS: 900,
    cruiseSpeed: 7,
    baseDb: 72,
    noiseSwingDb: 16,
    hornsPerMin: 5.5,
    brakesPerMin: 1.2,
    accelsPerMin: 1.4,
    stopRatio: 0.34,
    // Braking clusters late, so the segment insight has something true to say.
    endLoading: 0.7,
    sirensPerMin: 0.15,
  },
  'stop-and-go': {
    id: 'stop-and-go',
    name: 'Stop and go',
    description: 'Gridlock. Not especially loud, but you barely move.',
    durationS: 780,
    cruiseSpeed: 3.5,
    baseDb: 66,
    noiseSwingDb: 10,
    hornsPerMin: 2.2,
    brakesPerMin: 0.9,
    accelsPerMin: 0.7,
    stopRatio: 0.62,
    endLoading: 0.5,
    sirensPerMin: 0.05,
  },
  'highway-calm': {
    id: 'highway-calm',
    name: 'Highway calm',
    description: 'Open road, steady speed, almost nobody using their horn.',
    durationS: 720,
    cruiseSpeed: 24,
    baseDb: 62,
    noiseSwingDb: 6,
    hornsPerMin: 0.15,
    brakesPerMin: 0.08,
    accelsPerMin: 0.15,
    stopRatio: 0.02,
    endLoading: 0.4,
    sirensPerMin: 0,
  },
};

export const DEFAULT_SCENARIO: ScenarioId = 'city-chaos';

export function isScenarioId(value: string | null | undefined): value is ScenarioId {
  return value === 'city-chaos' || value === 'stop-and-go' || value === 'highway-calm';
}
