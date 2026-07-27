'use client';

import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[colors,transform,opacity] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-bright focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]',
  {
    variants: {
      variant: {
        primary:
          'bg-linear-to-b from-brand-bright to-brand text-white shadow-[0_8px_24px_-8px_rgb(99_102_241/0.7)] hover:brightness-110',
        glass: 'glass text-ink hover:bg-white/10',
        subtle: 'bg-surface-2 text-ink hover:bg-surface-3 border border-white/8',
        ghost: 'text-ink-muted hover:text-ink hover:bg-white/5',
        danger: 'bg-linear-to-b from-rose to-crimson text-white hover:brightness-110',
      },
      size: {
        sm: 'h-9 rounded-xl px-3.5 text-[13px]',
        md: 'h-11 rounded-2xl px-5 text-[15px]',
        lg: 'h-14 rounded-3xl px-7 text-base',
        icon: 'size-11 rounded-2xl',
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
