'use client';

import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import type { AchievementView } from '@/lib/domain/achievements';
import { Icon } from '@/components/ui/icon';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';

const TIER_COLORS = {
  bronze: '#C8814F',
  silver: '#8B8B90',
  gold: '#D0A35C',
  platinum: '#6E8FBF',
} as const;

/**
 * Achievements with real progress rings on the locked ones — the definitions
 * expose `progress`/`goal` rather than a boolean precisely so a locked tile can
 * show how close it is instead of being an opaque grey square.
 *
 * Locked tiles are fully desaturated rather than a dimmed tier colour. At 35%
 * opacity an orange badge still reads as orange, so a grid of sixteen locked
 * achievements looked like a grid of earned ones and the "0 / 16" counter above
 * it looked wrong.
 */
export function AchievementGrid({ views }: { views: AchievementView[] }) {
  const unlockedCount = views.filter((v) => v.unlocked !== null).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Achievements</CardTitle>
        <span className="num text-[11px] text-ink-faint">
          {unlockedCount} / {views.length}
        </span>
      </CardHeader>

      <div className="grid grid-cols-4 gap-x-2 gap-y-4">
        {views.map((view, i) => {
          const unlocked = view.unlocked !== null;
          const color = unlocked ? TIER_COLORS[view.def.tier] : '#3A3A44';
          const circumference = 2 * Math.PI * 21;

          return (
            <motion.div
              key={view.def.id}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
              className="flex flex-col items-center gap-1.5 text-center"
              title={`${view.def.title} — ${view.def.description}`}
            >
              <div className="relative grid size-12 place-items-center">
                {/* Progress ring on locked achievements that are under way. */}
                {!unlocked && view.fraction > 0 ? (
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48">
                    <circle
                      cx="24"
                      cy="24"
                      r="21"
                      fill="none"
                      stroke="rgb(255 255 255 / 0.07)"
                      strokeWidth="2.5"
                    />
                    <circle
                      cx="24"
                      cy="24"
                      r="21"
                      fill="none"
                      stroke={TIER_COLORS[view.def.tier]}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={`${circumference * view.fraction} ${circumference}`}
                      opacity="0.55"
                    />
                  </svg>
                ) : null}

                <div
                  className="relative grid size-10 place-items-center rounded-xl"
                  style={{
                    background: unlocked ? `${color}1F` : 'rgb(255 255 255 / 0.03)',
                    color,
                    boxShadow: unlocked ? `inset 0 0 0 1px ${color}44` : 'none',
                  }}
                >
                  {unlocked ? (
                    <Icon name={view.def.icon} size={18} />
                  ) : (
                    <Lock size={15} strokeWidth={2} />
                  )}
                </div>
              </div>
              <span
                className={cn(
                  'text-[9px] leading-tight font-semibold',
                  unlocked ? 'text-ink' : 'text-ink-faint',
                )}
              >
                {view.def.title}
              </span>
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}
