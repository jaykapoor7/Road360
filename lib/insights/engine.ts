import type { Insight, TripSummary } from '@/lib/domain/summary';
import type { TripStats } from '@/lib/domain/stats';
import type { Road360Score } from '@/lib/domain/score';
import type { TripRecord } from '@/lib/domain/trip';
import { hashString } from '@/lib/utils/id';
import { buildComparisons } from './comparisons';
import { mulberry32, pick } from './rng';
import { RULES, toInsight, type HistoryContext, type InsightContext } from './rules';

export const SUMMARY_GENERATOR = 'template-v1';

export interface SummaryInput {
  trip: Pick<TripRecord, 'id' | 'startedAt'>;
  stats: TripStats;
  score: Road360Score;
  history: HistoryContext | null;
  maxInsights?: number;
}

/**
 * Turn a finished trip into a headline, a short narrative and a comparison deck.
 *
 * The ranking is `priority + 10 × specificity`, so a rule that found a genuine
 * pattern outranks one of nominally equal priority that only found a generic
 * one. Categories are deduplicated, since three sentences about horns read as
 * padding rather than insight.
 */
export function buildSummary(input: SummaryInput): TripSummary {
  const seed = hashString(input.trip.id);
  const rng = mulberry32(seed);

  const ctx: InsightContext = {
    trip: input.trip,
    stats: input.stats,
    score: input.score,
    history: input.history,
    rng,
  };

  const applicable = RULES.filter((rule) => {
    try {
      return rule.applies(ctx);
    } catch {
      // A broken rule must not take the whole report down with it.
      return false;
    }
  });

  const ranked = applicable
    .map((rule) => ({ rule, weight: rule.priority + 10 * (rule.specificity?.(ctx) ?? 0) }))
    .sort((a, b) => b.weight - a.weight);

  const seenCategories = new Set<string>();
  const insights: Insight[] = [];
  const limit = input.maxInsights ?? 5;

  for (const { rule } of ranked) {
    if (insights.length >= limit) break;
    if (seenCategories.has(rule.category)) continue;
    seenCategories.add(rule.category);
    insights.push(toInsight(rule, ctx));
  }

  const headline = insights[0]?.text ?? 'A drive worth remembering.';
  const narrative = buildNarrative(insights, rng);

  return {
    headline,
    narrative,
    insights,
    comparisons: buildComparisons(input.stats),
    generator: SUMMARY_GENERATOR,
    seed,
    generatedAt: Date.now(),
  };
}

const CONNECTIVES = ['', 'And ', 'Meanwhile, ', 'On top of that, '] as const;

/**
 * Join the top insights into prose.
 *
 * Only the second and third sentences take a connective, and the first letter
 * is lowered after one — otherwise the narrative reads like a list with words
 * bolted on.
 */
function buildNarrative(insights: readonly Insight[], rng: () => number): string {
  if (insights.length === 0) return '';
  const body = insights.slice(0, 4);

  return body
    .map((insight, index) => {
      if (index === 0) return insight.text;
      const connective = index === 1 ? pick(rng, CONNECTIVES) : '';
      if (!connective) return insight.text;
      return connective + insight.text.charAt(0).toLowerCase() + insight.text.slice(1);
    })
    .join(' ');
}

export type { HistoryContext };
