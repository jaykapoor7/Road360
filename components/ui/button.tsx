'use client';

import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

/**
 * The primary action is white on black rather than a brand gradient. On a
 * true-black canvas nothing outranks pure white, so the main call to action
 * needs no colour of its own — which leaves the accent free to mean "live" and
 * the band colours free to mean "this is your score".
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[colors,transform,opacity] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-void hover:bg-white/90',
        accent: 'bg-brand text-void hover:brightness-110',
        glass: 'border border-hairline bg-surface text-ink hover:bg-surface-2',
        subtle: 'border border-hairline bg-surface text-ink hover:bg-surface-2',
        ghost: 'text-ink-muted hover:bg-white/5 hover:text-ink',
        danger: 'border border-crimson/30 bg-crimson/12 text-rose hover:bg-crimson/20',
      },
      size: {
        sm: 'h-9 rounded-pill px-4 text-[13px]',
        md: 'h-11 rounded-pill px-5 text-[15px]',
        lg: 'h-14 rounded-pill px-7 text-base',
        icon: 'size-10 rounded-full',
      },
      full: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', full: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, full, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, full }), className)}
      {...props}
    />
  );
});

export { buttonVariants };
