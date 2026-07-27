import type { Millis, TripId } from './schema';
import type { LifetimeStats } from './aggregates';
import type { TripRecord } from './trip';

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface AchievementContext {
  /** The trip that was just completed. */
  trip: TripRecord;
  /** Lifetime totals *including* the trip above. */
  lifetime: LifetimeStats;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  /** lucide icon name, resolved in the UI layer. */
  icon: string;
  tier: AchievementTier;
  /** Value of `progress` at which this unlocks. */
  goal: number;
  /** Current progress toward `goal`, so locked achievements can show a ring. */
  progress(ctx: AchievementContext): number;
}

export interface AchievementRecord {
  id: string;
  unlockedAt: Millis;
  /** The trip that pushed it over the line. */
  tripId: TripId;
  /** Progress value at unlock — a nicety for "you hit 1,047 horns". */
  valueAtUnlock: number;
}

export interface AchievementView {
  def: AchievementDef;
  unlocked: AchievementRecord | null;
  progress: number;
  /** 0..1 */
  fraction: number;
}

export const TIER_ORDER: Record<AchievementTier, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
};
