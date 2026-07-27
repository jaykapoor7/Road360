import type { AchievementContext, AchievementDef, AchievementView } from '@/lib/domain/achievements';
import type { AchievementRecord } from '@/lib/domain/achievements';

/**
 * Achievement definitions.
 *
 * Each declares a `goal` and a `progress` function rather than a boolean, so a
 * locked achievement can show how close it is instead of being an opaque grey
 * square. Tiers within a family share a progress function and differ only in
 * the goal.
 */
export const ACHIEVEMENTS: AchievementDef[] = [
  /* -------------------------------- horns -------------------------------- */
  {
    id: 'horns-100',
    title: 'Hundred Horns',
    description: 'Witness 100 horns across all your drives.',
    icon: 'Megaphone',
    tier: 'bronze',
    goal: 100,
    progress: (c) => c.lifetime.totalHorns,
  },
  {
    id: 'horns-1000',
    title: 'Thousand Horns',
    description: 'Witness 1,000 horns across all your drives.',
    icon: 'Megaphone',
    tier: 'silver',
    goal: 1000,
    progress: (c) => c.lifetime.totalHorns,
  },
  {
    id: 'horns-10000',
    title: 'Ten Thousand Horns',
    description: 'Witness 10,000 horns. You have heard some things.',
    icon: 'Megaphone',
    tier: 'gold',
    goal: 10_000,
    progress: (c) => c.lifetime.totalHorns,
  },

  /* -------------------------------- peace -------------------------------- */
  {
    id: 'zen-drive',
    title: 'Zen Drive',
    description: 'Complete a drive of 5 minutes or more without a single horn.',
    icon: 'Feather',
    tier: 'silver',
    goal: 1,
    progress: (c) =>
      c.trip.stats && c.trip.stats.soundCounts.horn === 0 && c.trip.stats.durationMs >= 300_000
        ? 1
        : 0,
  },
  {
    id: 'peace-10min',
    title: 'Ten Quiet Minutes',
    description: 'Go 10 minutes in one drive without hearing a horn.',
    icon: 'Sparkles',
    tier: 'bronze',
    goal: 600_000,
    progress: (c) => c.trip.stats?.longestSilenceMs ?? 0,
  },
  {
    id: 'peace-30min',
    title: 'Half an Hour of Calm',
    description: 'Go 30 minutes in one drive without hearing a horn.',
    icon: 'Sparkles',
    tier: 'gold',
    goal: 1_800_000,
    progress: (c) => c.trip.stats?.longestSilenceMs ?? 0,
  },

  /* ------------------------------- braking ------------------------------- */
  {
    id: 'smooth-operator',
    title: 'Smooth Operator',
    description: 'Finish a drive of 5 km or more with no hard braking at all.',
    icon: 'Waves',
    tier: 'silver',
    goal: 1,
    progress: (c) =>
      c.trip.stats && c.trip.stats.hardBrakes === 0 && c.trip.stats.distanceM >= 5000 ? 1 : 0,
  },
  {
    id: 'brakes-100',
    title: 'Brake Check',
    description: 'Record 100 hard stops. Not a compliment.',
    icon: 'Footprints',
    tier: 'bronze',
    goal: 100,
    progress: (c) => c.lifetime.totalHardBrakes,
  },
  {
    id: 'brakes-500',
    title: 'Pad Replacement Due',
    description: 'Record 500 hard stops across your driving.',
    icon: 'Footprints',
    tier: 'silver',
    goal: 500,
    progress: (c) => c.lifetime.totalHardBrakes,
  },

  /* ------------------------------- distance ------------------------------ */
  {
    id: 'distance-100km',
    title: 'Century',
    description: 'Track 100 km of driving.',
    icon: 'Route',
    tier: 'bronze',
    goal: 100_000,
    progress: (c) => c.lifetime.totalDistanceM,
  },
  {
    id: 'distance-1000km',
    title: 'Thousand Club',
    description: 'Track 1,000 km of driving.',
    icon: 'Route',
    tier: 'gold',
    goal: 1_000_000,
    progress: (c) => c.lifetime.totalDistanceM,
  },

  /* -------------------------------- scores ------------------------------- */
  {
    id: 'excellent-streak-5',
    title: 'On a Roll',
    description: 'Finish five drives in a row with an Excellent score.',
    icon: 'Flame',
    tier: 'gold',
    goal: 5,
    progress: (c) => c.lifetime.currentExcellentStreak,
  },
  {
    id: 'perfect-drive',
    title: 'Near Perfect',
    description: 'Score 95 or above on a single drive.',
    icon: 'Trophy',
    tier: 'platinum',
    goal: 95,
    progress: (c) => c.trip.score?.value ?? 0,
  },
  {
    id: 'first-drive',
    title: 'First Drive',
    description: 'Record your first Road360 trip.',
    icon: 'Flag',
    tier: 'bronze',
    goal: 1,
    progress: (c) => Math.min(1, c.lifetime.tripCount),
  },

  /* ------------------------------- survival ------------------------------ */
  {
    id: 'chaos-survivor',
    title: 'Chaos Survivor',
    description: 'Complete a drive that scores in the Chaos band.',
    icon: 'Shield',
    tier: 'bronze',
    goal: 1,
    progress: (c) => (c.trip.score?.band === 'chaos' ? 1 : 0),
  },
  {
    id: 'loud-90db',
    title: 'Ninety Decibels',
    description: 'Survive a drive averaging 90 dB or more.',
    icon: 'Volume2',
    tier: 'silver',
    goal: 90,
    progress: (c) => c.trip.stats?.noise.avgDb ?? 0,
  },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export const achievementById = (id: string): AchievementDef | undefined => BY_ID.get(id);

/**
 * Which achievements this trip just unlocked.
 *
 * Evaluated against the lifetime totals *including* the trip that has just
 * finished, and filtered against what is already unlocked so nothing fires twice.
 */
export function evaluateAchievements(
  ctx: AchievementContext,
  alreadyUnlocked: ReadonlySet<string>,
): { def: AchievementDef; progress: number }[] {
  const unlocked: { def: AchievementDef; progress: number }[] = [];

  for (const def of ACHIEVEMENTS) {
    if (alreadyUnlocked.has(def.id)) continue;
    let progress = 0;
    try {
      progress = def.progress(ctx);
    } catch {
      continue;
    }
    if (progress >= def.goal) unlocked.push({ def, progress });
  }

  return unlocked;
}

/** Every achievement with its current progress, for the history grid. */
export function achievementViews(
  ctx: AchievementContext,
  records: readonly AchievementRecord[],
): AchievementView[] {
  const byId = new Map(records.map((r) => [r.id, r]));

  return ACHIEVEMENTS.map((def) => {
    const unlocked = byId.get(def.id) ?? null;
    let progress = 0;
    try {
      progress = def.progress(ctx);
    } catch {
      progress = 0;
    }
    // An unlocked achievement always reads as complete, even if the underlying
    // measure is trip-scoped and this trip did not repeat the feat.
    const effective = unlocked ? def.goal : Math.min(progress, def.goal);
    return {
      def,
      unlocked,
      progress: effective,
      fraction: def.goal > 0 ? Math.min(1, effective / def.goal) : 0,
    };
  }).sort((a, b) => {
    if (a.unlocked && !b.unlocked) return -1;
    if (!a.unlocked && b.unlocked) return 1;
    return b.fraction - a.fraction;
  });
}
