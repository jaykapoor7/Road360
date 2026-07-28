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

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="glass-strong fixed inset-x-0 bottom-0 z-40 safe-b"
      style={{ height: 'calc(var(--tab-bar-h) + env(safe-area-inset-bottom))' }}
      aria-label="Primary"
    >
      <ul className="mx-auto flex h-[var(--tab-bar-h)] max-w-md items-stretch justify-around px-2">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className="relative flex h-full flex-col items-center justify-center gap-1"
              >
                {active ? (
                  <motion.span
                    layoutId="tab-glow"
                    transition={SPRING.snappy}
                    className="absolute top-2 h-9 w-14 rounded-2xl bg-brand/20"
                  />
                ) : null}
                <Icon
                  size={20}
                  strokeWidth={active ? 2.4 : 1.8}
                  className={cn('relative z-10 transition-colors', active ? 'text-brand-bright' : 'text-ink-faint')}
                />
                <span
                  className={cn(
                    'relative z-10 text-[10px] font-semibold transition-colors',
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
