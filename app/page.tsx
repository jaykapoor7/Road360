'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Compass, Sparkles, Megaphone, Route, TrendingUp } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { TabBar } from '@/components/layout/tab-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { LastTripCard } from '@/components/home/last-trip-card';
import { useTrips, useLifetime } from '@/hooks/use-trips';
import { greetingFor, formatDistanceLong } from '@/lib/utils/format';
import { fadeUp, staggerParent } from '@/components/motion/transitions';

export default function HomePage() {
  const { trips, loading } = useTrips();
  const { lifetime } = useLifetime();
  const lastTrip = trips[0] ?? null;

  return (
    <>
      <AppShell>
        <motion.div variants={staggerParent(0.07)} initial="hidden" animate="show" className="flex flex-col gap-6">
          <motion.header variants={fadeUp} className="pt-2">
            <p className="text-sm font-medium text-ink-muted">{greetingFor()}</p>
            <h1 className="text-[32px] leading-tight font-bold tracking-tight text-ink">
              How chaotic is
              <br />
              your commute?
            </h1>
          </motion.header>

          {/* Start Drive hero */}
          <motion.div variants={fadeUp}>
            <Link href="/drive" className="block">
              <div
                className="aura relative overflow-hidden rounded-card bg-linear-to-br from-brand to-brand-bright p-6 text-white active:scale-[0.99]"
                style={{ ['--aura-color' as string]: '#818cf8', ['--aura-opacity' as string]: '0.5' }}
              >
                <div className="grain absolute inset-0" />
                <div className="relative flex items-center justify-between">
                  <div>
                    <div className="text-xl font-bold">Start drive</div>
                    <div className="mt-1 text-sm text-white/80">
                      Tap to track your next commute
                    </div>
                  </div>
                  <div className="grid size-14 place-items-center rounded-2xl bg-white/15 backdrop-blur">
                    <Compass size={28} />
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>

          {/* Last trip */}
          {loading ? (
            <Skeleton className="h-36 rounded-card" />
          ) : lastTrip ? (
            <LastTripCard trip={lastTrip} />
          ) : (
            <motion.div variants={fadeUp}>
              <div className="rounded-card glass p-6 text-center">
                <Sparkles size={28} className="mx-auto mb-3 text-brand-bright" />
                <h2 className="font-bold text-ink">No drives yet</h2>
                <p className="mx-auto mt-1 max-w-xs text-sm text-ink-muted">
                  Take your first drive, or try a demo to see the full report and score.
                </p>
                <Link
                  href="/drive?demo=1"
                  className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl glass px-3.5 text-[13px] font-semibold text-ink active:scale-[0.97]"
                >
                  <Sparkles size={15} /> Try a demo drive
                </Link>
              </div>
            </motion.div>
          )}

          {/* Lifetime stats */}
          {lifetime.tripCount > 0 ? (
            <motion.div variants={fadeUp} className="grid grid-cols-3 gap-3">
              <LifetimeStat
                icon={<TrendingUp size={16} />}
                value={String(Math.round(lifetime.avgScore))}
                label="Avg score"
                accent="#818cf8"
              />
              <LifetimeStat
                icon={<Megaphone size={16} />}
                value={lifetime.totalHorns.toLocaleString()}
                label="Total horns"
                accent="#fbbf24"
              />
              <LifetimeStat
                icon={<Route size={16} />}
                value={formatDistanceLong(lifetime.totalDistanceM)}
                label="Distance"
                accent="#34d399"
              />
            </motion.div>
          ) : null}
        </motion.div>
      </AppShell>
      <TabBar />
    </>
  );
}

function LifetimeStat({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  accent: string;
}) {
  return (
    <div className="rounded-tile glass p-3 text-center">
      <div className="mx-auto mb-1.5 grid size-8 place-items-center rounded-lg" style={{ color: accent }}>
        {icon}
      </div>
      <div className="text-lg font-bold text-ink tabular">{value}</div>
      <div className="text-[10px] font-semibold tracking-wide text-ink-faint uppercase">{label}</div>
    </div>
  );
}
