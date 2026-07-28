import type { Transition, Variants } from 'framer-motion';

/**
 * Single source of truth for motion. Every animated surface pulls from here so
 * the app feels like one system rather than a dozen independently-tuned easings.
 */

export const SPRING = {
  /** Default for layout and position changes. */
  smooth: { type: 'spring', stiffness: 320, damping: 34, mass: 0.9 },
  /** Snappier — buttons, toggles, chips. */
  snappy: { type: 'spring', stiffness: 520, damping: 32, mass: 0.7 },
  /** Slow and heavy — score reveals, Wrapped slides. */
  cinematic: { type: 'spring', stiffness: 130, damping: 24, mass: 1.1 },
  /** For numbers driven through useSpring. */
  readout: { stiffness: 180, damping: 26, mass: 0.6 },
} as const satisfies Record<string, Transition | Record<string, number>>;

export const EASE = {
  outExpo: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

export const DURATION = {
  fast: 0.18,
  base: 0.32,
  slow: 0.55,
  reveal: 0.9,
} as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE.outExpo } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.base, ease: EASE.outExpo } },
};

/**
 * A slower, more deliberate rise. Used to reveal the trip report a section at a
 * time — the report is meant to feel like an unfolding rather than a dashboard
 * that pops into place all at once, so the travel is longer and the easing
 * calmer than `fadeUp`.
 */
export const revealUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE.outExpo } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: SPRING.smooth as Transition },
};

/** Parent variant that cascades children. Pair with `fadeUp` on each child. */
export function staggerParent(stagger = 0.06, delay = 0): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren: delay } },
  };
}

/** Page-level enter/exit used by the route transition wrapper. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE.outExpo } },
  exit: { opacity: 0, y: -8, transition: { duration: DURATION.fast, ease: EASE.inOut } },
};
