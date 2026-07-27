/** Tunable constants. Kept in one place so behaviour can be adjusted without archaeology. */

export const APP_VERSION = '0.1.0';

/* ------------------------------- timing ---------------------------------- */

/** Master sampling clock. One merged TripSample per tick. */
export const SAMPLE_INTERVAL_MS = 1000;
/** Audio frames per second delivered to the detector (50 ms hop). */
export const AUDIO_HOP_MS = 50;
/** Flush completed chunks and events to IndexedDB this often. */
export const CHECKPOINT_INTERVAL_MS = 30_000;
/** A recording trip older than this on launch is offered as recoverable. */
export const RECOVERY_THRESHOLD_MS = 120_000;

/* ---------------------- store commit cadences (battery) ------------------- */

export const COMMIT = {
  metrics: 1000,
  /** Route commits are expensive (map redraw), so they are rate- and distance-gated. */
  route: 5000,
  routeMinDistanceM: 15,
  /** dB meter channel — animated, but drawn to canvas without a React render. */
  meter: 100,
  /** While backgrounded, drop everything to this. */
  hidden: 1000,
} as const;

/* --------------------------------- GPS ----------------------------------- */

export const GPS = {
  /** Fixes worse than this are discarded outright. */
  maxAccuracyM: 50,
  /** Implied speeds above this are tower drift, not driving. */
  maxPlausibleSpeedMps: 60,
  /** Duplicate deliveries closer together than this are ignored. */
  minFixIntervalMs: 300,
  /**
   * Distance is accumulated only past this threshold. Without it, GPS jitter
   * while parked silently adds hundreds of metres to a stationary trip.
   */
  minDisplacementM: 6,
  accuracyFactor: 0.5,
  /** Speed below which the vehicle counts as stopped. */
  movingSpeedMps: 1.0,
} as const;

/* -------------------------------- motion --------------------------------- */

export const MOTION = {
  ringCapacity: 512, // ~10 s at 50 Hz
  /** Per-axis EWMA coefficient for the gravity estimate. */
  gravityAlpha: 0.02,
  hardBrakeMps2: -3.5,
  severeBrakeMps2: -5.5,
  rapidAccelMps2: 2.8,
  aggressiveAccelMps2: 4.5,
  minBrakeDurationMs: 300,
  minAccelDurationMs: 400,
  refractoryMs: 1500,
  /** Below this speed, "braking" is someone handling their phone while parked. */
  minSpeedForEventMps: 2.0,
  /** GPS-only fallback threshold when motion is unavailable. */
  gpsProxyDecelMps2: -3.0,
} as const;

/* --------------------------------- audio --------------------------------- */

export const AUDIO = {
  /** 16 kHz quarters FFT cost versus 48 kHz and still covers horn harmonics to 8 kHz. */
  targetSampleRate: 16_000,
  fftSize: 1024,
  /** Default dBFS → pseudo-SPL offset. User-adjustable; `calibrated` stays false until set. */
  defaultCalibrationOffset: 94,
  noiseFloorWindowMs: 2000,
  noiseFloorEwmaMs: 30_000,
  loudThresholdDb: 80,
  quietThresholdDb: 60,
} as const;

/* ------------------------------- storage --------------------------------- */

export const STORAGE = {
  /** Route simplification tolerance for the stored preview polyline. */
  routeSimplifyEpsilonM: 12,
  /** Stops shorter than this are not worth a timeline entry. */
  minStopDurationMs: 5000,
  /** A backgrounded window longer than this is recorded as a gap. */
  minGapMs: 3000,
} as const;

/* -------------------------------- privacy -------------------------------- */

export const PRIVACY = {
  /** Trimmed from each end of a contributed trace, so cells never reveal an origin. */
  trimMetres: 250,
  /** Cells with fewer samples than this are dropped rather than uploaded. */
  minCellSamples: 3,
  contributionGeohashPrecision: 7,
  tripAreaGeohashPrecision: 5,
} as const;
