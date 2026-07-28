import type { SensorSuite, SensorMode } from './types';
import { WebGeolocationSource } from './web/geolocation-source';
import { WebAudioCaptureSource } from './web/audio-capture';
import { SilentAudioSource } from './web/silent-audio-source';
import { WebMotionSource } from './web/motion-source';
import { createSimulatedSuite, type SimulationClock } from './mock/simulated-sources';
import type { ScenarioId } from './mock/scenarios';

export interface SuiteOptions {
  mode: SensorMode;
  scenario?: ScenarioId;
  clock?: SimulationClock;
  seed?: number;
  /** Silent mode: build the live suite with the microphone left off. */
  silent?: boolean;
}

/**
 * Build a sensor suite.
 *
 * The only place in the app that knows whether sensors are real or simulated.
 * Everything downstream sees `SensorSuite` and cannot tell the difference,
 * which is what makes demo mode a genuine test of the pipeline rather than a
 * parallel implementation that can drift.
 */
export function createSensorSuite(options: SuiteOptions): SensorSuite {
  if (options.mode === 'simulated') {
    if (!options.clock) throw new Error('Simulated sensors need a clock.');
    const suite = createSimulatedSuite({
      scenario: options.scenario ?? 'city-chaos',
      clock: options.clock,
      seed: options.seed,
    });
    return { mode: 'simulated', gps: suite.gps, audio: suite.audio, motion: suite.motion };
  }

  return {
    mode: 'live',
    gps: new WebGeolocationSource(),
    audio: options.silent ? new SilentAudioSource() : new WebAudioCaptureSource(),
    motion: new WebMotionSource(),
  };
}
