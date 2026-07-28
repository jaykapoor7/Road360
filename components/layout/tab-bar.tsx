'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Activity, Compass, History, Map, Settings } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { SPRING } from '@/components/motion/transitions';

const TABS = [
  { href: '/', label: 'Drive', icon: Compass },
  { href: '/history', label: 'History', icon: History },
  { href: '/stats', label: 'Stats', icon: Activity },
  { href: '/community', label: 'Roads', icon: Map },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

/**
 * Active state is a hairline rule above the tab plus a colour change, rather
 * than a filled pill. A pill behind a stacked icon-and-label either clips the
 * label or forces the whole bar taller; a rule costs one pixel and never
 * collides with anything.
 */
export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="glass-strong fixed inset-x-0 bottom-0 z-40 safe-b"
      style={{ height: 'calc(var(--tab-bar-h) + env(safe-area-inset-bottom))' }}
      aria-label="Primary"
    >
      <ul className="mx-auto flex h-[var(--tab-bar-h)] max-w-md items-stretch justify-around px-1">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className="relative flex h-full flex-col items-center justify-center gap-1.5"
              >
                {active ? (
                  <motion.span
                    layoutId="tab-rule"
                    transition={SPRING.snappy}
                    className="absolute top-0 h-0.5 w-10 rounded-full bg-brand"
                  />
                ) : null}
                <Icon
                  size={21}
                  strokeWidth={active ? 2.2 : 1.7}
                  className={cn('transition-colors', active ? 'text-brand' : 'text-ink-faint')}
                />
                <span
                  className={cn(
                    'text-[10px] font-semibold tracking-wide transition-colors',
                    active ? 'text-ink' : 'text-ink-faint',
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
