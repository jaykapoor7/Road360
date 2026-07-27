'use client';

import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import { SPRING } from '@/components/motion/transitions';

interface MetricNumberProps {
  value: number;
  /** Decimal places to render. */
  precision?: number;
  /** Rendered after the number, in a de-emphasised style. */
  suffix?: string;
  className?: string;
  suffixClassName?: string;
  /** Skip the spring and write the value straight through. */
  instant?: boolean;
}

/**
 * An animated numeric readout.
 *
 * The tween runs entirely on a MotionValue and is written to the DOM through a
 * ref — it never calls setState, so a value updating at 1 Hz costs zero React
 * renders. Digits are tabular so the layout does not jitter as they change.
 */
export function MetricNumber({
  value,
  precision = 0,
  suffix,
  className,
  suffixClassName,
  instant = false,
}: MetricNumberProps) {
  const reduceMotion = useReducedMotion();
  const raw = useMotionValue(value);
  const spring = useSpring(raw, SPRING.readout);
  const ref = useRef<HTMLSpanElement>(null);
  const immediate = instant || reduceMotion;

  useEffect(() => {
    raw.set(value);
  }, [value, raw]);

  useEffect(() => {
    const source = immediate ? raw : spring;
    const write = (v: number) => {
      const node = ref.current;
      if (node) node.textContent = v.toFixed(precision);
    };
    write(source.get());
    return source.on('change', write);
  }, [spring, raw, precision, immediate]);

  return (
    <span className={cn('tabular', className)}>
      <span ref={ref} />
      {suffix ? (
        <span className={cn('ml-1 text-[0.5em] font-semibold text-ink-faint', suffixClassName)}>
          {suffix}
        </span>
      ) : null}
    </span>
  );
}
