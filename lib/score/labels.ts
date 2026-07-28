import type { ScoreBand } from '@/lib/domain/score';

export const SCORE_VERSION = 'score-v1';

export interface BandDefinition {
  band: ScoreBand;
  /** Inclusive lower bound. */
  min: number;
  label: string;
  emoji: string;
  /** Hex, not oklch — these gradients are reused inside rasterised share cards. */
  from: string;
  to: string;
  /** One-line characterisation shown under the score. */
  blurb: string;
}

export const BANDS: readonly BandDefinition[] = [
  {
    band: 'excellent',
    min: 80,
    label: 'Excellent',
    emoji: '🟢',
    from: '#00E08C',
    to: '#00C8B4',
    blurb: 'Genuinely calm. Whatever you did, do it again.',
  },
  {
    band: 'normal',
    min: 60,
    label: 'Normal',
    emoji: '🟡',
    from: '#4EA8FF',
    to: '#6E8BFF',
    blurb: 'An ordinary commute. Nothing dramatic either way.',
  },
  {
    band: 'stressful',
    min: 40,
    label: 'Stressful',
    emoji: '🟠',
    from: '#FFC043',
    to: '#FF8A3D',
    blurb: 'That took something out of you.',
  },
  {
    band: 'chaos',
    min: 0,
    label: 'Chaos',
    emoji: '🔴',
    from: '#FF5470',
    to: '#FF2D55',
    blurb: 'Loud, jerky and relentless. You earned the rest of your day.',
  },
] as const;

export function bandFor(score: number): BandDefinition {
  // BANDS is ordered high → low, so the first match is the tightest one.
  for (const band of BANDS) {
    if (score >= band.min) return band;
  }
  return BANDS[BANDS.length - 1]!;
}

export function bandDefinition(band: ScoreBand): BandDefinition {
  return BANDS.find((b) => b.band === band) ?? BANDS[1]!;
}

export const SUB_SCORE_LABELS = {
  hornPressure: 'Horn pressure',
  noise: 'Noise',
  braking: 'Hard braking',
  acceleration: 'Acceleration',
  stopAndGo: 'Stop-and-go',
  smoothness: 'Smoothness',
} as const;

export const SUB_SCORE_DESCRIPTIONS = {
  hornPressure: 'How often horns went off around you.',
  noise: 'How loud the drive was overall.',
  braking: 'How often you had to brake hard.',
  acceleration: 'How often you accelerated sharply.',
  stopAndGo: 'How much of the trip you spent stationary.',
  smoothness: 'How steady your inputs were.',
} as const;
