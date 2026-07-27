import type { SoundEventType } from '@/lib/domain/events';
import { clamp01, norm } from '@/lib/utils/math';
import {
  bandEnergy,
  bandMedian,
  findPeak,
  harmonicScore,
  peakProminence,
  spectralCentroid,
  spectralFlatness,
} from './features/spectral';
import {
  DEFAULT_DETECTOR_CONFIG,
  type DetectorConfig,
  type DetectorFrame,
  type SoundEventDetection,
  type SoundEventDetector,
} from './types';

/**
 * Frequency profiles.
 *
 * Car horns are a chord of two reeds, fundamentals typically 300–500 Hz with a
 * strong harmonic stack to 2–4 kHz. Sirens are similarly tonal but *sweep*.
 * Whistles are narrow-band and much higher. That difference in behaviour over
 * time — not any single frame — is what separates them.
 */
const PROFILE = {
  horn: { fundamentalLo: 300, fundamentalHi: 800, bandLo: 300, bandHi: 2000 },
  whistle: { lo: 2000, hi: 6000 },
  analysis: { lo: 100, hi: 8000 },
} as const;

const GATES = {
  bandRatio: 0.45,
  prominence: 6,
  onsetRiseDb: 8,
  minSustainFrames: 3, // 150 ms at a 50 ms hop
  maxSustainFrames: 60, // 3 s
  maxPitchDriftHz: 60,
  /** Above this flatness the frame is noise, not a tone. */
  maxFlatness: 0.45,
  /** A siren must sweep at least this much for its centroid to count as moving. */
  sirenCentroidStdHz: 120,
  sirenMinDurationMs: 2000,
} as const;

interface Candidate {
  startT: number;
  frames: number;
  peakDbSeen: number;
  fundamentalHz: number;
  /** Strongest peak anywhere in the analysis band — reported for non-horn classes. */
  dominantHz: number;
  minFundamentalHz: number;
  maxFundamentalHz: number;
  bandRatioSum: number;
  prominenceSum: number;
  harmonicSum: number;
  /** Prominence and harmonics of the global peak — the whistle/siren view. */
  globalProminenceSum: number;
  globalHarmonicSum: number;
  onsetRiseDb: number;
  centroids: number[];
  whistleFrames: number;
}

/**
 * The shipped placeholder detector.
 *
 * Explicitly a heuristic, not a model. It is tuned to be conservative — it
 * would rather miss a quiet horn than count every door slam — because a horn
 * count that is obviously wrong destroys trust in the whole report.
 *
 * Known false positives, documented rather than hidden: reversing beepers,
 * motorcycle exhaust resonance, the steady segment of some emergency sirens,
 * and brass on a car stereo. Swapping in a trained model is a registry change.
 */
export class HeuristicSoundDetector implements SoundEventDetector {
  readonly id = 'heuristic-v1';
  readonly version = '1.0.0';
  readonly supportedTypes: readonly SoundEventType[] = ['horn', 'siren', 'whistle', 'unknown'];
  readonly requiresSpectrum = true;

  private config: DetectorConfig = DEFAULT_DETECTOR_CONFIG;
  private candidate: Candidate | null = null;
  private refractoryUntil = 0;
  private readonly scratch: number[] = [];
  private prevRmsDb: number | null = null;

  async init(config: DetectorConfig): Promise<void> {
    this.config = config;
    this.reset();
  }

  reset(): void {
    this.candidate = null;
    this.refractoryUntil = 0;
    this.prevRmsDb = null;
  }

  async dispose(): Promise<void> {
    this.reset();
  }

  process(frame: DetectorFrame): SoundEventDetection | null {
    const { magnitudes, binHz, rmsDb, peakDb, floorDb, t } = frame;

    // Gate 1 — loudness. This is the cheap early-out that rejects the
    // overwhelming majority of frames before any spectral work happens.
    const aboveFloor = peakDb - floorDb;
    const loudEnough =
      aboveFloor >= this.config.loudnessMarginDb && peakDb >= this.config.absoluteFloorDb;

    if (!loudEnough || t < this.refractoryUntil) {
      const closed = this.closeCandidate(t);
      this.prevRmsDb = rmsDb;
      return closed;
    }

    // Gate 2 — is the energy where a horn's energy is?
    const total = bandEnergy(magnitudes, binHz, PROFILE.analysis.lo, PROFILE.analysis.hi);
    if (total <= 1e-12) {
      this.prevRmsDb = rmsDb;
      return this.closeCandidate(t);
    }
    const inBand = bandEnergy(magnitudes, binHz, PROFILE.horn.bandLo, PROFILE.horn.bandHi);
    const bandRatio = inBand / total;

    // Gate 3 — tonality. Broadband noise fails here.
    const flatness = spectralFlatness(magnitudes, binHz, PROFILE.analysis.lo, PROFILE.analysis.hi);

    // Gate 4 — is there a prominent peak, and does it have harmonics?
    const peak = findPeak(magnitudes, binHz, PROFILE.horn.fundamentalLo, PROFILE.horn.fundamentalHi);
    const median = bandMedian(
      magnitudes,
      binHz,
      PROFILE.horn.bandLo,
      PROFILE.horn.bandHi,
      this.scratch,
    );
    const prominence = peakProminence(peak, median);
    const harmonics = harmonicScore(magnitudes, binHz, peak.hz, peak.magnitude);

    // Whistle features must key off the *global* peak. Measuring them against
    // the horn-band peak means comparing a 3 kHz tone's harmonics to whatever
    // noise happens to sit at 400 Hz — a near-zero reference against which
    // everything looks harmonic, which suppressed whistles entirely.
    const globalPeak = findPeak(magnitudes, binHz, PROFILE.analysis.lo, PROFILE.analysis.hi);
    const globalHarmonics = harmonicScore(
      magnitudes,
      binHz,
      globalPeak.hz,
      globalPeak.magnitude,
    );
    const globalMedian = bandMedian(
      magnitudes,
      binHz,
      PROFILE.analysis.lo,
      PROFILE.analysis.hi,
      this.scratch,
    );
    const globalProminence = peakProminence(globalPeak, globalMedian);
    const isWhistleFrame =
      globalPeak.hz >= PROFILE.whistle.lo &&
      globalPeak.hz <= PROFILE.whistle.hi &&
      globalPeak.magnitude > peak.magnitude &&
      flatness < 0.3 &&
      globalHarmonics < 0.34;

    const tonal = flatness <= GATES.maxFlatness;
    const qualifies = tonal && (bandRatio >= GATES.bandRatio || isWhistleFrame);

    if (!qualifies) {
      const closed = this.closeCandidate(t);
      this.prevRmsDb = rmsDb;
      return closed;
    }

    const onsetRise = this.prevRmsDb === null ? 0 : rmsDb - this.prevRmsDb;
    const centroid = spectralCentroid(magnitudes, binHz, PROFILE.analysis.lo, PROFILE.analysis.hi);

    if (!this.candidate) {
      this.candidate = {
        startT: t,
        frames: 0,
        peakDbSeen: peakDb,
        fundamentalHz: peak.hz,
        dominantHz: globalPeak.hz,
        minFundamentalHz: peak.hz,
        maxFundamentalHz: peak.hz,
        bandRatioSum: 0,
        prominenceSum: 0,
        harmonicSum: 0,
        globalProminenceSum: 0,
        globalHarmonicSum: 0,
        onsetRiseDb: Math.max(onsetRise, aboveFloor),
        centroids: [],
        whistleFrames: 0,
      };
    }

    const c = this.candidate;
    c.frames += 1;
    c.peakDbSeen = Math.max(c.peakDbSeen, peakDb);
    c.bandRatioSum += bandRatio;
    c.prominenceSum += prominence;
    c.harmonicSum += harmonics;
    c.globalProminenceSum += globalProminence;
    c.globalHarmonicSum += globalHarmonics;
    c.minFundamentalHz = Math.min(c.minFundamentalHz, peak.hz);
    c.maxFundamentalHz = Math.max(c.maxFundamentalHz, peak.hz);
    c.centroids.push(centroid);
    if (isWhistleFrame) c.whistleFrames += 1;

    this.prevRmsDb = rmsDb;

    // A sound that never stops is not an event — it is the environment.
    if (c.frames > GATES.maxSustainFrames) {
      const closed = this.closeCandidate(t);
      this.candidate = null;
      return closed;
    }

    return null;
  }

  /** Evaluate an accumulated candidate now that its extent is known. */
  private closeCandidate(now: number): SoundEventDetection | null {
    const c = this.candidate;
    this.candidate = null;
    if (!c || c.frames < GATES.minSustainFrames) return null;

    const durationMs = c.frames * this.config.hopMs;
    const bandRatio = c.bandRatioSum / c.frames;
    const prominence = c.prominenceSum / c.frames;
    const harmonics = c.harmonicSum / c.frames;
    const pitchDrift = c.maxFundamentalHz - c.minFundamentalHz;

    const centroidStd = standardDeviation(c.centroids);
    const whistleRatio = c.whistleFrames / c.frames;
    const globalProminence = c.globalProminenceSum / c.frames;
    const globalHarmonics = c.globalHarmonicSum / c.frames;

    const scores = this.classify({
      bandRatio,
      prominence,
      harmonics,
      globalProminence,
      globalHarmonics,
      pitchDrift,
      centroidStd,
      whistleRatio,
      durationMs,
      onsetRiseDb: c.onsetRiseDb,
    });

    let best: SoundEventType = 'unknown';
    let bestScore = 0;
    for (const type of this.supportedTypes) {
      const score = scores[type] ?? 0;
      if (score > bestScore) {
        bestScore = score;
        best = type;
      }
    }

    if (bestScore < this.config.minConfidence) return null;

    this.refractoryUntil = now + this.config.refractoryMs;

    return {
      // Report the onset, not the moment we worked out what it was.
      t: c.startT,
      sound: best,
      confidence: clamp01(bestScore),
      scores,
      peakHz: best === 'horn' ? c.fundamentalHz : c.dominantHz,
      db: c.peakDbSeen,
      durationMs,
      ...(this.config.debug
        ? { features: { bandRatio, prominence, harmonics, pitchDrift, centroidStd, whistleRatio } }
        : {}),
    };
  }

  /**
   * Score each class on features measured where that class lives.
   *
   * Horn features come from the 300–2000 Hz band; whistle and siren features
   * come from the global peak. Scoring a whistle on horn-band prominence means
   * scoring it on noise, which is how a textbook whistle ends up unclassified.
   */
  private classify(f: {
    bandRatio: number;
    prominence: number;
    harmonics: number;
    globalProminence: number;
    globalHarmonics: number;
    pitchDrift: number;
    centroidStd: number;
    whistleRatio: number;
    durationMs: number;
    onsetRiseDb: number;
  }): Partial<Record<SoundEventType, number>> {
    const sustainFrames = f.durationMs / this.config.hopMs;

    // Horn: in-band, prominent, harmonic, sharp attack, and — the key
    // discriminator — holding its pitch. Sirens sweep, speech wobbles, music
    // modulates; a horn sits still.
    const pitchStability = 1 - clamp01(f.pitchDrift / GATES.maxPitchDriftHz);
    const horn =
      0.3 * norm(f.bandRatio, GATES.bandRatio, 0.85) +
      0.25 * norm(f.prominence, GATES.prominence, 25) +
      0.2 * f.harmonics +
      0.15 * norm(f.onsetRiseDb, GATES.onsetRiseDb, 24) +
      0.1 * norm(sustainFrames, GATES.minSustainFrames, 12);

    const hornScore = horn * (0.55 + 0.45 * pitchStability);

    // Siren: tonal and harmonic, but the centroid moves and it goes on far
    // longer than a horn blast.
    const sweep = norm(f.centroidStd, GATES.sirenCentroidStdHz, 600);
    const longEnough = f.durationMs >= GATES.sirenMinDurationMs ? 1 : 0.25;
    const sirenScore =
      (0.45 * sweep +
        0.3 * norm(Math.max(f.prominence, f.globalProminence), GATES.prominence, 25) +
        0.25 * Math.max(f.harmonics, f.globalHarmonics)) *
      longEnough;

    // Whistle: high, narrow-band, little harmonic structure.
    const whistleScore =
      0.55 * f.whistleRatio +
      0.3 * norm(f.globalProminence, GATES.prominence, 30) +
      0.15 * (1 - f.globalHarmonics);

    // Unknown: it passed the loudness and tonality gates but matches nothing.
    // Recorded rather than discarded, so the timeline stays truthful and a
    // future model has something to be compared against.
    const bestKnown = Math.max(hornScore, sirenScore, whistleScore);
    const unknownScore = bestKnown < 0.5 ? 0.5 + 0.2 * norm(f.prominence, 4, 20) : 0;

    return {
      horn: clamp01(hornScore),
      siren: clamp01(sirenScore),
      whistle: clamp01(whistleScore),
      unknown: clamp01(unknownScore),
    };
  }
}

function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;

  let variance = 0;
  for (const v of values) variance += (v - mean) ** 2;
  return Math.sqrt(variance / values.length);
}

export const createHeuristicDetector = async (): Promise<SoundEventDetector> =>
  new HeuristicSoundDetector();
