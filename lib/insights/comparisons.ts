import type { Comparison, Tone } from '@/lib/domain/summary';
import type { TripStats } from '@/lib/domain/stats';
import {
  formatDistanceLong,
  formatDurationCompact,
  formatSecondsPrecise,
  pluralise,
} from '@/lib/utils/format';

/**
 * The humorous comparison deck.
 *
 * Every line is anchored to a real number from the trip. Jokes that are not
 * true stop being funny the second the user checks them, so each comparison
 * states the measurement it is built on.
 */

interface DbBand {
  max: number;
  headline: string;
  detail: (db: number) => string;
  tone: Tone;
}

/** First match wins, so these are ordered quietest to loudest. */
const DB_LADDER: DbBand[] = [
  {
    max: 50,
    headline: 'Quieter than a library',
    detail: (db) => `${Math.round(db)} dB average — quieter than a reading room.`,
    tone: 'positive',
  },
  {
    max: 58,
    headline: 'Coffee-shop calm',
    detail: (db) => `${Math.round(db)} dB — about the hum of a café.`,
    tone: 'positive',
  },
  {
    max: 64,
    headline: 'Conversation level',
    detail: (db) => `${Math.round(db)} dB — like someone talking beside you the whole way.`,
    tone: 'positive',
  },
  {
    max: 70,
    headline: 'Vacuum-cleaner territory',
    detail: (db) => `${Math.round(db)} dB — a vacuum running next to your ear.`,
    tone: 'neutral',
  },
  {
    max: 76,
    headline: 'Busy restaurant',
    detail: (db) => `${Math.round(db)} dB — dinner rush, but on wheels.`,
    tone: 'neutral',
  },
  {
    max: 82,
    headline: 'City bus passing',
    detail: (db) => `${Math.round(db)} dB — a bus pulling away, continuously.`,
    tone: 'negative',
  },
  {
    max: 88,
    headline: 'Louder than a motorcycle',
    detail: (db) => `${Math.round(db)} dB — a motorcycle idles around 80.`,
    tone: 'negative',
  },
  {
    max: 94,
    headline: 'Chainsaw-adjacent',
    detail: (db) => `${Math.round(db)} dB — a chainsaw at three metres.`,
    tone: 'negative',
  },
  {
    max: Infinity,
    headline: 'Rock concert',
    detail: (db) => `${Math.round(db)} dB — your ears earned overtime.`,
    tone: 'negative',
  },
];

export function dbComparison(avgDb: number): Comparison {
  const band = DB_LADDER.find((b) => avgDb < b.max) ?? DB_LADDER[DB_LADDER.length - 1]!;
  return {
    id: 'compare.db',
    headline: band.headline,
    detail: band.detail(avgDb),
    icon: 'Volume2',
    tone: band.tone,
  };
}

interface CandidateComparison extends Comparison {
  priority: number;
  applies: boolean;
}

function candidates(stats: TripStats): CandidateComparison[] {
  const km = stats.distanceM / 1000;
  const silenceSeconds = stats.longestSilenceMs / 1000;

  return [
    {
      id: 'compare.peace',
      priority: 90,
      applies: stats.longestSilenceMs < 60_000 && stats.soundCounts.horn > 0,
      headline: 'You found almost no peace',
      detail: `Your longest quiet stretch was ${formatSecondsPrecise(silenceSeconds)}.`,
      icon: 'HeartCrack',
      tone: 'negative',
    },
    {
      id: 'compare.peace-long',
      priority: 60,
      applies: stats.longestSilenceMs >= 600_000,
      headline: 'Genuine quiet',
      detail: `${formatDurationCompact(stats.longestSilenceMs)} without a single horn.`,
      icon: 'Sparkles',
      tone: 'positive',
    },
    {
      id: 'compare.brakes',
      priority: 85,
      applies: stats.hardBrakes >= 4,
      headline: 'Your brakes worked overtime',
      detail:
        km > 0.5
          ? `${stats.hardBrakes} hard ${pluralise(stats.hardBrakes, 'stop')} in ${formatDistanceLong(stats.distanceM)}.`
          : `${stats.hardBrakes} hard ${pluralise(stats.hardBrakes, 'stop')} in one short trip.`,
      icon: 'Footprints',
      tone: 'negative',
    },
    {
      id: 'compare.stopped',
      priority: 80,
      applies: stats.stoppedRatio > 0.35,
      headline: 'Mostly standing still',
      detail: `${Math.round(stats.stoppedRatio * 100)}% of this drive was stationary — ${formatDurationCompact(stats.stoppedMs)} of nothing.`,
      icon: 'Hourglass',
      tone: 'negative',
    },
    {
      id: 'compare.horn-cadence',
      priority: 88,
      applies: stats.avgSecondsBetweenHorns !== null && stats.avgSecondsBetweenHorns < 30,
      headline: 'A horn every few seconds',
      detail: `One horn every ${formatSecondsPrecise(stats.avgSecondsBetweenHorns ?? 0)}. A metronome would be jealous.`,
      icon: 'Megaphone',
      tone: 'negative',
    },
    {
      id: 'compare.zen',
      priority: 95,
      applies: stats.soundCounts.horn === 0 && stats.durationMs > 300_000,
      headline: 'Not one horn',
      detail: `${formatDurationCompact(stats.durationMs)} of driving and nobody honked once.`,
      icon: 'Feather',
      tone: 'positive',
    },
    {
      id: 'compare.smooth',
      priority: 55,
      applies: stats.jerkRms < 1.2 && stats.hardBrakes === 0,
      headline: 'Smooth the whole way',
      detail: 'No hard braking, no sharp inputs. Passengers would not have noticed a thing.',
      icon: 'Waves',
      tone: 'positive',
    },
    {
      id: 'compare.sirens',
      priority: 70,
      applies: stats.soundCounts.siren > 0,
      headline: 'Emergency traffic',
      detail: `${stats.soundCounts.siren} ${pluralise(stats.soundCounts.siren, 'siren')} passed close enough to hear clearly.`,
      icon: 'Siren',
      tone: 'neutral',
    },
    {
      id: 'compare.accel',
      priority: 65,
      applies: stats.aggressiveAccels >= 3,
      headline: 'Heavy right foot',
      detail: `${stats.aggressiveAccels} launches hard enough to push you into the seat.`,
      icon: 'Gauge',
      tone: 'negative',
    },
  ];
}

/**
 * Always the dB comparison plus the two strongest others, chosen from distinct
 * categories so the deck does not say the same thing three ways.
 */
export function buildComparisons(stats: TripStats, count = 3): Comparison[] {
  const db = dbComparison(stats.noise.avgDb);
  const others = candidates(stats)
    .filter((c) => c.applies)
    .sort((a, b) => b.priority - a.priority);

  const chosen: Comparison[] = [db];
  const seenPrefixes = new Set<string>(['compare.db']);

  for (const candidate of others) {
    if (chosen.length >= count) break;
    // 'compare.peace' and 'compare.peace-long' are the same observation.
    const family = candidate.id.split('-')[0]!;
    if (seenPrefixes.has(family)) continue;
    seenPrefixes.add(family);

    const { priority: _priority, applies: _applies, ...comparison } = candidate;
    chosen.push(comparison);
  }

  // A drive can be unremarkable. Better a true filler than an invented drama.
  if (chosen.length < count) {
    chosen.push({
      id: 'compare.ordinary',
      headline: 'An ordinary commute',
      detail: `${formatDistanceLong(stats.distanceM)} in ${formatDurationCompact(stats.durationMs)}, without incident.`,
      icon: 'Route',
      tone: 'neutral',
    });
  }

  return chosen.slice(0, count);
}
