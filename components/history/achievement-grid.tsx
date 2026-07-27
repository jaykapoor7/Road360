'use client';

import { motion } from 'framer-motion';
import type { AchievementView } from '@/lib/domain/achievements';
import { Icon } from '@/components/ui/icon';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';

const TIER_COLORS = {
  bronze: '#fb923c',
  silver: '#a2a8bb',
  gold: '#fbbf24',
  platinum: '#22d3ee',
} as const;

/**
 * Achievements with real progress rings on the locked ones — the definitions
 * expose `progress`/`goal` rather than a boolean precisely so a locked tile can
 * show how close it is instead of being an opaque grey square.
 */
export function AchievementGrid({ views }: { views: AchievementView[] }) {
  const unlockedCount = views.filter((v) => v.unlocked).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Achievements</CardTitle>
        <span className="text-[11px] text-ink-faint tabular">
          {unlockedCount} / {views.length}
        </span>
      </CardHeader>

      <div className="grid grid-cols-4 gap-3">
        {views.map((view, i) => {
          const color = TIER_COLORS[view.def.tier];
          const unlocked = view.unlocked !== null;
          return (
            <motion.div
              key={view.def.id}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
              className="flex flex-col items-center gap-1 text-center"
              title={`${view.def.title} — ${view.def.description}`}
            >
              <div className="relative grid size-12 place-items-center">
                {/* Progress ring for locked achievements. */}
                {!unlocked && view.fraction > 0 ? (
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48">
                    <circle cx="24" cy="24" r="21" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="3" />
                    <circle
                      cx="24"
                      cy="24"
                      r="21"
                      fill="none"
                      stroke={color}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 21 * view.fraction} ${2 * Math.PI * 21}`}
                      opacity="0.7"
                    />
                  </svg>
                ) : null}

                <div
                  className={cn(
                    'grid size-10 place-items-center rounded-xl transition-opacity',
                    !unlocked && 'opacity-35',
                  )}
                  style={{ background: `${color}22`, color }}
                >
                  <Icon name={view.def.icon} size={18} />
                </div>
              </div>
              <span
                className={cn(
                  'text-[9px] leading-tight font-semibold',
                  unlocked ? 'text-ink-muted' : 'text-ink-faint',
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
