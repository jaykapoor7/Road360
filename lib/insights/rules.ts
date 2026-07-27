import type { Insight, InsightCategory, Tone } from '@/lib/domain/summary';
import type { TripRecord } from '@/lib/domain/trip';
import type { TripStats } from '@/lib/domain/stats';
import type { Road360Score } from '@/lib/domain/score';
import { findConcentration, segmentPhrase } from '@/lib/analytics/segments';
import {
  formatDb,
  formatDurationCompact,
  formatSecondsPrecise,
  pluralise,
} from '@/lib/utils/format';
import { MINUTE } from '@/lib/utils/time';
import { pick } from './rng';

export interface HistoryContext {
  avgScore: number;
  avgDb: number;
  tripCount: number;
  bestScore: number;
  longestSilenceMs: number;
}

export interface InsightContext {
  trip: Pick<TripRecord, 'id' | 'startedAt'>;
  stats: TripStats;
  score: Road360Score;
  /** Null on a user's very first trip — rules that compare must not fire. */
  history: HistoryContext | null;
  rng: () => number;
}

export interface InsightRule {
  id: string;
  category: InsightCategory;
  priority: number;
  tone: Tone;
  applies(ctx: InsightContext): boolean;
  /** 0..1, breaks ties within a priority so the more specific claim wins. */
  specificity?(ctx: InsightContext): number;
  render(ctx: InsightContext): string;
}

/**
 * The rule registry.
 *
 * Presented to the user as an AI summary; it is a deterministic template
 * engine. That is a deliberate trade: it never hallucinates a statistic, it
 * works offline, and every sentence is traceable to a number in `stats`.
 */
export const RULES: InsightRule[] = [
  {
    id: 'record.personal-best',
    category: 'record',
    priority: 95,
    tone: 'positive',
    applies: (c) =>
      c.history !== null && c.history.tripCount >= 3 && c.score.value > c.history.bestScore,
    render: (c) =>
      pick(c.rng, [
        'Your calmest drive yet.',
        'That is a new personal best.',
        'Nothing in your history was this calm.',
      ]),
  },

  {
    id: 'horn.extreme',
    category: 'horn',
    priority: 92,
    tone: 'negative',
    applies: (c) => c.stats.hornsPerMin >= 6 && c.stats.avgSecondsBetweenHorns !== null,
    specificity: () => 1,
    render: (c) =>
      `You averaged one horn every ${formatSecondsPrecise(c.stats.avgSecondsBetweenHorns ?? 0)}.`,
  },

  {
    id: 'brake.cluster.segment',
    category: 'segment',
    priority: 90,
    tone: 'negative',
    applies: (c) => findConcentration(c.stats.segments, (s) => s.hardBrakes) !== null,
    specificity: (c) => findConcentration(c.stats.segments, (s) => s.hardBrakes)?.share ?? 0,
    render: (c) => {
      const hit = findConcentration(c.stats.segments, (s) => s.hardBrakes)!;
      return `Most hard braking happened ${segmentPhrase(hit.segment.label)} of your drive.`;
    },
  },

  {
    id: 'horn.cluster.segment',
    category: 'segment',
    priority: 86,
    tone: 'negative',
    applies: (c) => findConcentration(c.stats.segments, (s) => s.horns) !== null,
    specificity: (c) => findConcentration(c.stats.segments, (s) => s.horns)?.share ?? 0,
    render: (c) => {
      const hit = findConcentration(c.stats.segments, (s) => s.horns)!;
      return `The horns clustered ${segmentPhrase(hit.segment.label)}.`;
    },
  },

  {
    id: 'noise.peak-moment',
    category: 'noise',
    priority: 85,
    tone: 'negative',
    applies: (c) => c.stats.noise.peakDb >= c.stats.noise.avgDb + 18 && c.stats.durationMs > 60_000,
    render: (c) => {
      const quintile = [...c.stats.quintiles].sort((a, b) => b.peakDb - a.peakDb)[0];
      const at = quintile ? Math.round(quintile.from / MINUTE) : 0;
      return `Your loudest moment hit ${formatDb(c.stats.noise.peakDb)} about ${at} ${pluralise(at, 'minute')} in.`;
    },
  },

  {
    id: 'peace.none',
    category: 'peace',
    priority: 82,
    tone: 'negative',
    applies: (c) => c.stats.longestSilenceMs < 60_000 && c.stats.soundCounts.horn >= 3,
    render: (c) =>
      `You found only ${formatSecondsPrecise(c.stats.longestSilenceMs / 1000)} of peace.`,
  },

  {
    id: 'horn.moderate',
    category: 'horn',
    priority: 78,
    tone: 'neutral',
    applies: (c) =>
      c.stats.hornsPerMin >= 1 &&
      c.stats.hornsPerMin < 6 &&
      c.stats.avgSecondsBetweenHorns !== null,
    render: (c) =>
      `A horn every ${formatSecondsPrecise(c.stats.avgSecondsBetweenHorns ?? 0)} — busy, but survivable.`,
  },

  {
    id: 'stopgo.heavy',
    category: 'stopgo',
    priority: 75,
    tone: 'negative',
    applies: (c) => c.stats.stoppedRatio > 0.4,
    render: (c) =>
      pick(c.rng, [
        `You spent ${Math.round(c.stats.stoppedRatio * 100)}% of this trip not moving.`,
        `${formatDurationCompact(c.stats.stoppedMs)} of this drive was spent stationary.`,
      ]),
  },

  {
    id: 'accel.aggressive',
    category: 'acceleration',
    priority: 72,
    tone: 'negative',
    applies: (c) => c.stats.aggressiveAccels >= 3,
    render: (c) =>
      `${c.stats.aggressiveAccels} launches hard enough to push you into the seat.`,
  },

  {
    id: 'smooth.praise',
    category: 'smoothness',
    priority: 70,
    tone: 'positive',
    applies: (c) => c.score.breakdown.smoothness.available && c.score.breakdown.smoothness.value >= 85,
    render: (c) =>
      pick(c.rng, [
        'Your inputs were genuinely smooth the whole way.',
        'Steady throttle, steady brakes — no drama.',
      ]),
  },

  {
    id: 'peace.long',
    category: 'peace',
    priority: 68,
    tone: 'positive',
    applies: (c) => c.stats.longestSilenceMs > 600_000,
    render: (c) =>
      `${formatDurationCompact(c.stats.longestSilenceMs)} uninterrupted without a single horn.`,
  },

  {
    id: 'trend.vs-average',
    category: 'trend',
    priority: 60,
    tone: 'neutral',
    applies: (c) =>
      c.history !== null &&
      c.history.tripCount >= 3 &&
      Math.abs(c.score.value - c.history.avgScore) >= 8,
    render: (c) => {
      const delta = Math.round(c.score.value - (c.history?.avgScore ?? 0));
      return delta > 0
        ? `That is ${delta} points calmer than your usual.`
        : `That is ${Math.abs(delta)} points rougher than your usual.`;
    },
  },

  {
    id: 'noise.quiet',
    category: 'noise',
    priority: 55,
    tone: 'positive',
    applies: (c) => c.stats.noise.avgDb > 0 && c.stats.noise.avgDb < 60,
    render: (c) =>
      `Unusually quiet at ${formatDb(c.stats.noise.avgDb)} — barely above conversation level.`,
  },

  {
    id: 'coverage.partial',
    category: 'overall',
    priority: 40,
    tone: 'neutral',
    applies: (c) => c.score.coverage < 0.85,
    render: (c) => {
      const missing = c.stats.coverage.denied;
      const names = missing.map((m) =>
        m === 'gps' ? 'location' : m === 'audio' ? 'microphone' : 'motion',
      );
      return `Scored without ${names.join(' or ')}, so this is a partial picture.`;
    },
  },

  {
    id: 'overall.fallback',
    category: 'overall',
    priority: 0,
    tone: 'neutral',
    applies: () => true,
    render: (c) =>
      c.history === null
        ? pick(c.rng, [
            'Your first drive is on the board.',
            'One drive down — the comparisons start from here.',
          ])
        : pick(c.rng, [
            'A fairly ordinary drive by your standards.',
            'Nothing unusual about this one.',
          ]),
  },
];

export function toInsight(rule: InsightRule, ctx: InsightContext): Insight {
  return {
    id: rule.id,
    category: rule.category,
    priority: rule.priority,
    text: rule.render(ctx),
    tone: rule.tone,
  };
}
