import { BaseSensorSource, type AudioFrame, type AudioReading, type FrameProducer } from '../types';
import type { SensorError, SensorKind } from '@/lib/domain/sensors';
import { Err, Ok, type Result } from '@/lib/utils/result';
import { NoiseFloorEstimator } from '@/lib/audio/features/noise-floor';
import { FFT, amplitudeToDb, bufferPeak, bufferRms } from '@/lib/audio/features/fft';
import { AUDIO } from '@/lib/config/constants';

/**
 * Microphone capture. Capture only — this file does not classify anything.
 *
 * Two things here are load-bearing and easy to get wrong:
 *
 *  1. The media constraints. Automatic gain control and noise suppression are
 *     designed to make speech intelligible, and they destroy both the level
 *     measurement and the horn spectra we depend on. They are explicitly
 *     disabled and the result is verified, because browsers may ignore them.
 *  2. The worklet. Doing FFT work on the main thread at 20 Hz for an hour is
 *     the difference between a warm phone and a flat one.
 */
export class WebAudioCaptureSource
  extends BaseSensorSource<AudioReading>
  implements FrameProducer
{
  readonly kind: SensorKind = 'audio';

  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;
  private fallbackBuffer: Float32Array | null = null;

  private readonly frameListeners = new Set<(frame: AudioFrame) => void>();
  private floor: NoiseFloorEstimator;
  private fft: FFT | null = null;
  private magnitudes: Float32Array | null = null;
  private startedAt = 0;

  /** dBFS → pseudo-SPL. A phone mic is not a sound level meter; see `calibrated`. */
  calibrationOffset = AUDIO.defaultCalibrationOffset;
  /** False until the user calibrates, or when constraints were ignored. */
  calibrated = false;

  constructor() {
    super();
    const hopsPerWindow = Math.round(AUDIO.noiseFloorWindowMs / AUDIO.hopMs);
    const hopsPerEwma = Math.round(AUDIO.noiseFloorEwmaMs / AUDIO.hopMs);
    this.floor = new NoiseFloorEstimator(hopsPerWindow, hopsPerEwma);
  }

  onFrame(cb: (frame: AudioFrame) => void): () => void {
    this.frameListeners.add(cb);
    return () => this.frameListeners.delete(cb);
  }

  async start(): Promise<Result<void, SensorError>> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.setStatus('unsupported');
      return Err({ kind: 'audio', code: 'unsupported', message: 'Microphone is not available.' });
    }

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      this.setStatus('error');
      return Err({
        kind: 'audio',
        code: 'insecure-context',
        message: 'Microphone requires a secure (HTTPS) connection.',
      });
    }

    this.setStatus('starting');
    this.startedAt = performance.now();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: AUDIO.targetSampleRate,
        },
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      const denied = name === 'NotAllowedError' || name === 'SecurityError';
      this.setStatus(denied ? 'denied' : 'error');
      return Err({
        kind: 'audio',
        code: denied ? 'denied' : 'unknown',
        message: denied ? 'Microphone permission was denied.' : 'Could not open the microphone.',
      });
    }

    // Verify the browser honoured the constraints. If it did not, the level
    // readings are no longer comparable and the UI must say "relative", not dB.
    const track = this.stream.getAudioTracks()[0];
    const settings = track?.getSettings() as
      | (MediaTrackSettings & { autoGainControl?: boolean; noiseSuppression?: boolean })
      | undefined;
    const processed = settings?.autoGainControl === true || settings?.noiseSuppression === true;
    this.calibrated = !processed;

    this.context = new AudioContext({ sampleRate: AUDIO.targetSampleRate });
    // iOS creates contexts suspended and only a user gesture can resume them.
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    const source = this.context.createMediaStreamSource(this.stream);
    this.fft = new FFT(AUDIO.fftSize);
    this.magnitudes = new Float32Array(AUDIO.fftSize / 2);

    const worklet = await this.tryWorklet(source);
    if (!worklet) this.startAnalyserFallback(source);

    this.setStatus('live');
    return Ok(undefined);
  }

  private async tryWorklet(source: MediaStreamAudioSourceNode): Promise<boolean> {
    if (!this.context || typeof AudioWorkletNode === 'undefined') return false;

    try {
      await this.context.audioWorklet.addModule('/worklets/audio-meter.worklet.js');

      this.node = new AudioWorkletNode(this.context, 'road360-meter', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        processorOptions: { hopMs: AUDIO.hopMs, frameSize: AUDIO.fftSize },
      });

      this.node.port.onmessage = (event: MessageEvent) => {
        const data = event.data as
          | { type: 'level'; t: number; rmsDb: number; peakDb: number }
          | { type: 'frame'; t: number; rmsDb: number; peakDb: number; buffer: ArrayBuffer };

        if (data.type === 'level') {
          this.publishLevels(data.rmsDb, data.peakDb);
          return;
        }

        const samples = new Float32Array(data.buffer);
        this.publishFrame(samples, data.rmsDb, data.peakDb);
        // Hand the buffer back so the worklet can reuse it.
        this.node?.port.postMessage({ type: 'recycle', buffer: samples.buffer }, [samples.buffer]);
      };

      source.connect(this.node);
      return true;
    } catch {
      return false;
    }
  }

  /** Older Safari has no AudioWorklet. Same message shape, more main-thread work. */
  private startAnalyserFallback(source: MediaStreamAudioSourceNode): void {
    if (!this.context) return;

    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = AUDIO.fftSize * 2;
    // Smoothing would blur the sharp attack the onset test depends on.
    this.analyser.smoothingTimeConstant = 0;
    source.connect(this.analyser);

    this.fallbackBuffer = new Float32Array(this.analyser.fftSize);

    // setInterval, not requestAnimationFrame: rAF is display-locked, wasteful,
    // and throttled to zero when the page is hidden — wrong on every count for
    // a sensor that must keep running with the screen off.
    this.fallbackTimer = setInterval(() => {
      if (!this.analyser || !this.fallbackBuffer) return;
      this.analyser.getFloatTimeDomainData(this.fallbackBuffer);
      const rmsDb = amplitudeToDb(bufferRms(this.fallbackBuffer));
      const peakDb = amplitudeToDb(bufferPeak(this.fallbackBuffer));
      this.publishFrame(this.fallbackBuffer, rmsDb, peakDb);
    }, AUDIO.hopMs);
  }

  private publishLevels(rmsDbFs: number, peakDbFs: number): number {
    const rmsDb = rmsDbFs + this.calibrationOffset;
    const peakDb = peakDbFs + this.calibrationOffset;
    const floorDb = this.floor.push(rmsDb);

    this.latest = { t: performance.now() - this.startedAt, rmsDb, peakDb, floorDb };
    return floorDb;
  }

  private publishFrame(samples: Float32Array, rmsDbFs: number, peakDbFs: number): void {
    this.publishLevels(rmsDbFs, peakDbFs);
    if (this.frameListeners.size === 0 || !this.fft || !this.magnitudes || !this.context) return;

    this.fft.magnitudes(samples, this.magnitudes);

    const frame: AudioFrame = {
      t: performance.now() - this.startedAt,
      sampleRate: this.context.sampleRate,
      fftSize: AUDIO.fftSize,
      magnitudes: this.magnitudes,
      rmsDb: rmsDbFs + this.calibrationOffset,
      peakDb: peakDbFs + this.calibrationOffset,
    };

    for (const listener of this.frameListeners) listener(frame);
  }

  async stop(): Promise<void> {
    if (this.fallbackTimer !== null) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (this.node) {
      this.node.port.postMessage({ type: 'stop' });
      this.node.disconnect();
      this.node = null;
    }
    this.analyser?.disconnect();
    this.analyser = null;

    // Releasing the tracks matters beyond tidiness: on iOS a live mic track
    // reroutes audio to the earpiece and ducks whatever the user is playing.
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;

    await this.context?.close();
    this.context = null;
    this.floor.reset();
    this.setStatus('idle');
  }
}
