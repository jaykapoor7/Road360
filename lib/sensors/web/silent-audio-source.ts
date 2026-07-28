import { BaseSensorSource, type AudioReading } from '../types';
import type { SensorError, SensorKind } from '@/lib/domain/sensors';
import { Err, type Result } from '@/lib/utils/result';

/**
 * The microphone, off.
 *
 * When silent mode is on the drive still records — GPS and motion carry it —
 * but the mic is never opened. Rather than thread a "skip audio" flag through
 * the session, the suite simply swaps this in: it starts as unavailable,
 * produces no readings and no frames, so coverage renormalises the sound
 * sub-scores away exactly as it would for a mic-denied user, with no special
 * casing anywhere downstream.
 */
export class SilentAudioSource extends BaseSensorSource<AudioReading> {
  readonly kind: SensorKind = 'audio';

  async start(): Promise<Result<void, SensorError>> {
    this.setStatus('denied');
    return Err({ kind: 'audio', code: 'unsupported', message: 'Silent mode is on.' });
  }

  async stop(): Promise<void> {
    this.setStatus('idle');
  }

  // No onFrame — the detector is never initialised, so no horn events are
  // produced and nothing tries to read a spectrum that will not arrive.
}
