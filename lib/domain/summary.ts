import type { Millis } from './schema';

export type InsightCategory =
  | 'horn'
  | 'noise'
  | 'braking'
  | 'acceleration'
  | 'stopgo'
  | 'smoothness'
  | 'peace'
  | 'segment'
  | 'record'
  | 'trend'
  | 'overall';

export type Tone = 'positive' | 'neutral' | 'negative';

export interface Insight {
  /** Rule id, e.g. 'brake.cluster.segment'. Stable across runs. */
  id: string;
  category: InsightCategory;
  priority: number;
  text: string;
  tone: Tone;
}

export interface Comparison {
  id: string;
  headline: string;
  detail: string;
  /** lucide icon name, resolved in the UI layer. */
  icon: string;
  tone: Tone;
}

export interface TripSummary {
  /** One line, the hero of the report. */
  headline: string;
  /** Two to four sentences — the "AI summary". */
  narrative: string;
  insights: Insight[];
  comparisons: Comparison[];
  generator: string;
  /** Derived from the trip id, so wording is stable per trip but varies across trips. */
  seed: number;
  generatedAt: Millis;
}
