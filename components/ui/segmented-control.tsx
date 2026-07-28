'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import { SPRING } from '@/components/motion/transitions';

interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Must be unique per mounted control — drives the shared layout animation. */
  layoutId: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={cn('flex gap-0.5 rounded-pill border border-hairline bg-surface p-1', className)}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative flex-1 rounded-pill px-3 py-1.5 text-[13px] font-semibold transition-colors',
              active ? 'text-void' : 'text-ink-faint hover:text-ink-muted',
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                transition={SPRING.snappy}
                className="absolute inset-0 rounded-pill bg-ink"
              />
            ) : null}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
