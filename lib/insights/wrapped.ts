import type { TripRecord } from '@/lib/domain/trip';
import type { TripId } from '@/lib/domain/schema';
import type { ScoreBand } from '@/lib/domain/score';
import { isCountable } from '@/lib/analytics/aggregate';
import { energyAverageDb } from '@/lib/utils/math';
import {
  formatDistanceLong,
  formatDurationCompact,
  formatDurationWords,
  pluralise,
} from '@/lib/utils/format';
import { bandDefinition } from '@/lib/score/labels';

/**
 * Road360 Wrapped — the Spotify-Wrapped half of the concept.
 *
 * Deliberately built from the same trip records the rest of the app uses, so a
 * Wrapped slide can never disagree with the history screen. Slides that have no
 * data simply are not generated, rather than rendering an empty superlative.
 */

export type WrappedPeriodKind = 'month' | 'year';

export interface WrappedSlide {
  id: string;
  kind: 'stat' | 'superlative' | 'distribution' | 'trend' | 'closing';
  eyebrow: string;
  headline: string;
  detail: string;
  /** Large figure, when the slide leads with a number. */
  value?: string;
  unit?: string;
  tripId?: TripId;
  band?: ScoreBand;
  icon: string;
}

export interface WrappedReport {
  key: string;
  kind: WrappedPeriodKind;
  label: string;
  periodStart: number;
  periodEnd: number;
  tripCount: number;
  totalDistanceM: number;
  totalDurationMs: number;
  totalHorns: number;
  avgScore: number;
  avgDb: number;
  bandCounts: Record<ScoreBand, number>;
  /** Score delta against the previous comparable period. */
  scoreDelta: number | null;
  slides: WrappedSlide[];
  /** True when there was not enough driving to say anything interesting. */
  sparse: boolean;
}

export interface WrappedInput {
  kind: WrappedPeriodKind;
  label: string;
  periodStart: number;
  periodEnd: number;
  trips: readonly TripRecord[];
  /** Same-length preceding period, for trend slides. */
  previousTrips?: readonly TripRecord[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function buildWrapped(input: WrappedInput): WrappedReport {
  const trips = input.trips.filter(isCountable);
  const previous = (input.previousTrips ?? []).filter(isCountable);

  const bandCounts: Record<ScoreBand, number> = {
    excellent: 0,
    normal: 0,
    stressful: 0,
    chaos: 0,
  };

  let totalDistanceM = 0;
  let totalDurationMs = 0;
  let totalHorns = 0;
  let totalBrakes = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  const dbValues: number[] = [];

  const byDayOfWeek = new Map<number, { scores: number[]; horns: number }>();
  const byHour = new Map<number, number>();

  for (const trip of trips) {
    const stats = trip.stats!;
    totalDistanceM += stats.distanceM;
    totalDurationMs += stats.durationMs;
    totalHorns += stats.soundCounts.horn;
    totalBrakes += stats.hardBrakes;
    if (stats.noise.avgDb > 0) dbValues.push(stats.noise.avgDb);

    if (trip.score) {
      bandCounts[trip.score.band] += 1;
      scoreSum += trip.score.value;
      scoreCount += 1;
    }

    const date = new Date(trip.startedAt);
    const dow = date.getDay();
    const bucket = byDayOfWeek.get(dow) ?? { scores: [], horns: 0 };
    if (trip.score) bucket.scores.push(trip.score.value);
    bucket.horns += stats.soundCounts.horn;
    byDayOfWeek.set(dow, bucket);

    byHour.set(date.getHours(), (byHour.get(date.getHours()) ?? 0) + 1);
  }

  const avgScore = scoreCount > 0 ? scoreSum / scoreCount : 0;
  const avgDb = dbValues.length > 0 ? energyAverageDb(dbValues) : 0;

  const previousAvg =
    previous.length > 0
      ? previous.reduce((acc, t) => acc + (t.score?.value ?? 0), 0) / previous.length
      : null;
  const scoreDelta = previousAvg !== null && scoreCount > 0 ? avgScore - previousAvg : null;

  const slides = buildSlides({
    input,
    trips,
    totalDistanceM,
    totalDurationMs,
    totalHorns,
    totalBrakes,
    avgScore,
    avgDb,
    bandCounts,
    scoreDelta,
    byDayOfWeek,
    byHour,
  });

  return {
    key: `${input.kind}:${input.label}`,
    kind: input.kind,
    label: input.label,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    tripCount: trips.length,
    totalDistanceM,
    totalDurationMs,
    totalHorns,
    avgScore,
    avgDb,
    bandCounts,
    scoreDelta,
    slides,
    sparse: trips.length < 3,
  };
}

interface SlideInput {
  input: WrappedInput;
  trips: readonly TripRecord[];
  totalDistanceM: number;
  totalDurationMs: number;
  totalHorns: number;
  totalBrakes: number;
  avgScore: number;
  avgDb: number;
  bandCounts: Record<ScoreBand, number>;
  scoreDelta: number | null;
  byDayOfWeek: Map<number, { scores: number[]; horns: number }>;
  byHour: Map<number, number>;
}

function buildSlides(s: SlideInput): WrappedSlide[] {
  const slides: WrappedSlide[] = [];
  const { trips, input } = s;

  if (trips.length === 0) {
    return [
      {
        id: 'empty',
        kind: 'closing',
        eyebrow: input.label,
        headline: 'No drives recorded',
        detail: 'Start a drive and this page fills up.',
        icon: 'Route',
      },
    ];
  }

  const distance = formatDistanceLong(s.totalDistanceM);

  slides.push({
    id: 'opening',
    kind: 'stat',
    eyebrow: input.label,
    headline: `${trips.length} ${pluralise(trips.length, 'drive')}`,
    detail: `${distance} and ${formatDurationWords(s.totalDurationMs)} behind the wheel.`,
    value: String(trips.length),
    unit: pluralise(trips.length, 'drive'),
    icon: 'Route',
  });

  slides.push({
    id: 'horns',
    kind: 'stat',
    eyebrow: 'Horns',
    headline:
      s.totalHorns === 0
        ? 'Nobody honked at you'
        : `${s.totalHorns.toLocaleString()} ${pluralise(s.totalHorns, 'horn')}`,
    detail:
      s.totalHorns === 0
        ? 'Not a single horn all period. Genuinely remarkable.'
        : `That is about ${(s.totalHorns / trips.length).toFixed(1)} per drive.`,
    value: s.totalHorns.toLocaleString(),
    unit: pluralise(s.totalHorns, 'horn'),
    icon: 'Megaphone',
  });

  const band = bandDefinition(
    s.avgScore >= 80 ? 'excellent' : s.avgScore >= 60 ? 'normal' : s.avgScore >= 40 ? 'stressful' : 'chaos',
  );
  slides.push({
    id: 'avg-score',
    kind: 'stat',
    eyebrow: 'Average score',
    headline: band.label,
    detail: band.blurb,
    value: String(Math.round(s.avgScore)),
    unit: '/ 100',
    band: band.band,
    icon: 'Gauge',
  });

  /* ----------------------------- superlatives ---------------------------- */

  const withScores = trips.filter((t) => t.score);

  const calmest = maxBy(withScores, (t) => t.score!.value);
  if (calmest && withScores.length >= 2) {
    slides.push({
      id: 'calmest',
      kind: 'superlative',
      eyebrow: 'Your calmest drive',
      headline: `${calmest.score!.value} out of 100`,
      detail: `${formatDateLabel(calmest.startedAt)} · ${formatDistanceLong(calmest.stats!.distanceM)}.`,
      tripId: calmest.id,
      band: calmest.score!.band,
      icon: 'Feather',
    });
  }

  const worst = minBy(withScores, (t) => t.score!.value);
  if (worst && withScores.length >= 2 && worst.id !== calmest?.id) {
    slides.push({
      id: 'roughest',
      kind: 'superlative',
      eyebrow: 'Your roughest drive',
      headline: `${worst.score!.value} out of 100`,
      detail: `${formatDateLabel(worst.startedAt)} · ${worst.stats!.soundCounts.horn} ${pluralise(worst.stats!.soundCounts.horn, 'horn')}, ${worst.stats!.hardBrakes} hard ${pluralise(worst.stats!.hardBrakes, 'stop')}.`,
      tripId: worst.id,
      band: worst.score!.band,
      icon: 'Flame',
    });
  }

  const loudest = maxBy(trips, (t) => t.stats!.noise.peakDb);
  if (loudest && loudest.stats!.noise.peakDb > 0) {
    slides.push({
      id: 'loudest',
      kind: 'superlative',
      eyebrow: 'Loudest moment',
      headline: `${Math.round(loudest.stats!.noise.peakDb)} dB`,
      detail: `On ${formatDateLabel(loudest.startedAt)}. Your average was ${Math.round(s.avgDb)} dB.`,
      tripId: loudest.id,
      icon: 'Volume2',
    });
  }

  const mostPeaceful = maxBy(trips, (t) => t.stats!.longestSilenceMs);
  if (mostPeaceful && mostPeaceful.stats!.longestSilenceMs > 120_000) {
    slides.push({
      id: 'peaceful',
      kind: 'superlative',
      eyebrow: 'Longest stretch of quiet',
      headline: formatDurationCompact(mostPeaceful.stats!.longestSilenceMs),
      detail: `Not one horn, on ${formatDateLabel(mostPeaceful.startedAt)}.`,
      tripId: mostPeaceful.id,
      icon: 'Sparkles',
    });
  }

  /* -------------------------------- patterns ----------------------------- */

  const chaosDay = worstDayOfWeek(s.byDayOfWeek);
  if (chaosDay !== null && trips.length >= 5) {
    slides.push({
      id: 'chaos-day',
      kind: 'distribution',
      eyebrow: 'Your worst day',
      headline: DAY_NAMES[chaosDay]!,
      detail: `${DAY_NAMES[chaosDay]}s score lowest for you. Plan accordingly.`,
      icon: 'CalendarDays',
    });
  }

  const busiestHour = maxEntry(s.byHour);
  if (busiestHour !== null && trips.length >= 5) {
    const hour = busiestHour;
    const label = new Date(2020, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric' });
    slides.push({
      id: 'busiest-hour',
      kind: 'distribution',
      eyebrow: 'When you drive',
      headline: `Mostly around ${label}`,
      detail: `More of your drives start in this hour than any other.`,
      icon: 'Clock',
    });
  }

  if (s.scoreDelta !== null && Math.abs(s.scoreDelta) >= 3) {
    const better = s.scoreDelta > 0;
    slides.push({
      id: 'trend',
      kind: 'trend',
      eyebrow: better ? 'Trending calmer' : 'Trending rougher',
      headline: `${better ? '+' : ''}${Math.round(s.scoreDelta)} points`,
      detail: better
        ? `Your driving was calmer than the previous ${input.kind}.`
        : `Your driving was rougher than the previous ${input.kind}.`,
      icon: better ? 'TrendingUp' : 'TrendingDown',
    });
  }

  slides.push({
    id: 'closing',
    kind: 'closing',
    eyebrow: input.label,
    headline: closingLine(s.avgScore),
    detail: `${distance} · ${s.totalHorns.toLocaleString()} ${pluralise(s.totalHorns, 'horn')} · ${s.totalBrakes} hard ${pluralise(s.totalBrakes, 'stop')}.`,
    icon: 'Sparkles',
  });

  return slides;
}

function closingLine(avgScore: number): string {
  if (avgScore >= 80) return 'A genuinely calm stretch of driving.';
  if (avgScore >= 60) return 'Steady, ordinary, survivable.';
  if (avgScore >= 40) return 'That was a lot of traffic.';
  return 'You have earned a quiet road.';
}

function formatDateLabel(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function maxBy<T>(items: readonly T[], value: (item: T) => number): T | null {
  let best: T | null = null;
  let bestValue = -Infinity;
  for (const item of items) {
    const v = value(item);
    if (v > bestValue) {
      bestValue = v;
      best = item;
    }
  }
  return best;
}

function minBy<T>(items: readonly T[], value: (item: T) => number): T | null {
  return maxBy(items, (item) => -value(item));
}

function worstDayOfWeek(byDay: Map<number, { scores: number[]; horns: number }>): number | null {
  let worst: number | null = null;
  let worstAvg = Infinity;

  for (const [day, bucket] of byDay) {
    // One drive on a Tuesday does not make Tuesdays your worst day.
    if (bucket.scores.length < 2) continue;
    const avg = bucket.scores.reduce((a, b) => a + b, 0) / bucket.scores.length;
    if (avg < worstAvg) {
      worstAvg = avg;
      worst = day;
    }
  }

  return worst;
}

function maxEntry(counts: Map<number, number>): number | null {
  let best: number | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = key;
    }
  }
  return best;
}
