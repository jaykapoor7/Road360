import { BaseSensorSource, type GpsFix } from '../types';
import type { SensorError, SensorKind } from '@/lib/domain/sensors';
import { Err, Ok, type Result } from '@/lib/utils/result';
import { evaluateFix } from '../derive';
import { GPS } from '@/lib/config/constants';

/**
 * GPS via `watchPosition`.
 *
 * Browsers deliver fixes at roughly 1 Hz and there is no way to ask for more,
 * so this subscribes once and lets the platform push. Polling `getCurrentPosition`
 * on a timer is strictly worse: it costs more battery and returns cached values.
 */
export class WebGeolocationSource extends BaseSensorSource<GpsFix> {
  readonly kind: SensorKind = 'gps';

  private watchId: number | null = null;
  private previous: GpsFix | null = null;
  private accumulatedDistanceM = 0;
  private rejectedCount = 0;

  async start(): Promise<Result<void, SensorError>> {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      this.setStatus('unsupported');
      return Err({ kind: 'gps', code: 'unsupported', message: 'Geolocation is not available.' });
    }

    // getUserMedia and geolocation both require a secure context. `localhost`
    // counts; a LAN IP does not, which is why testing on a real phone needs
    // HTTPS (see `pnpm dev:https`).
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      this.setStatus('error');
      return Err({
        kind: 'gps',
        code: 'insecure-context',
        message: 'Location requires a secure (HTTPS) connection.',
      });
    }

    this.setStatus('starting');

    return new Promise((resolve) => {
      let settled = false;

      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          this.handlePosition(position);
          if (!settled) {
            settled = true;
            resolve(Ok(undefined));
          }
        },
        (error) => {
          const denied = error.code === error.PERMISSION_DENIED;
          this.setStatus(denied ? 'denied' : 'error');
          if (!settled) {
            settled = true;
            resolve(
              Err({
                kind: 'gps',
                code: denied ? 'denied' : 'unknown',
                message: error.message || 'Location unavailable.',
              }),
            );
          }
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 15_000 },
      );
    });
  }

  private handlePosition(position: GeolocationPosition): void {
    const fix: GpsFix = {
      t: position.timestamp,
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      speed: position.coords.speed,
      heading: position.coords.heading,
    };

    const verdict = evaluateFix(this.previous, fix);
    if (!verdict.accepted) {
      this.rejectedCount += 1;
      // Sustained rejection means the fix quality is bad, not that GPS is off.
      if (this.rejectedCount > 5) this.setStatus('degraded');
      return;
    }

    this.rejectedCount = 0;
    this.accumulatedDistanceM += verdict.distanceM;

    // Some devices report speed as null; fall back to the derived value.
    if (fix.speed === null && verdict.derivedSpeed !== null) {
      fix.speed = verdict.derivedSpeed;
    }

    this.previous = fix;
    this.latest = fix;
    this.setStatus(fix.accuracy > GPS.maxAccuracyM / 2 ? 'degraded' : 'live');
  }

  /** Total accepted distance since start, in metres. */
  get distanceM(): number {
    return this.accumulatedDistanceM;
  }

  async stop(): Promise<void> {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.setStatus('idle');
  }
}
