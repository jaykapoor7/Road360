import type { Millis } from './schema';

export type ScoreBand = 'excellent' | 'normal' | 'stressful' | 'chaos';

export type SubScoreKey =
  | 'hornPressure'
  | 'noise'
  | 'braking'
  | 'acceleration'
  | 'stopAndGo'
  | 'smoothness';

export const SUB_SCORE_KEYS: readonly SubScoreKey[] = [
  'hornPressure',
  'noise',
  'braking',
  'acceleration',
  'stopAndGo',
  'smoothness',
] as const;

export interface SubScore {
  key: SubScoreKey;
  /** The measured rate, e.g. 3.2 horns/min. Shown in the breakdown so the score is explicable. */
  raw: number;
  unit: string;
  /** 0..100 normalised, where 100 is calm. */
  value: number;
  /** Effective weight after coverage renormalisation. */
  weight: number;
  contribution: number;
  available: boolean;
}

export interface Road360Score {
  /** 0..100 integer. Higher is calmer. */
  value: number;
  band: ScoreBand;
  label: string;
  breakdown: Record<SubScoreKey, SubScore>;
  /** Sum of available weights before renormalisation, 0..1. Below 0.85 the UI flags partial data. */
  coverage: number;
  /** True for short trips, where the score is blended toward neutral. */
  provisional: boolean;
  algorithmVersion: string;
  computedAt: Millis;
}
