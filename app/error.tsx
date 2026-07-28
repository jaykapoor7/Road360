'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Route-level error boundary.
 *
 * Without this a thrown render lands on Next's default error screen, which on a
 * phone is an unstyled white page with no way back — the worst possible thing
 * for someone who arrived from a link and has no idea what the app is yet.
 *
 * Recorded drives live in IndexedDB and are untouched by a render failure, so
 * the copy says so: the most alarming reading of a crash in a tracking app is
 * "I just lost my data".
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Road360 render error:', error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-8 text-center">
      <div className="grid size-14 place-items-center rounded-2xl border border-hairline bg-surface">
        <AlertTriangle size={26} className="text-amber" />
      </div>

      <div>
        <h1 className="text-[22px] leading-none font-bold tracking-[-0.02em] text-ink">
          Something broke
        </h1>
        <p className="mx-auto mt-3 max-w-[19rem] text-[13px] leading-relaxed text-ink-muted">
          This screen failed to render. Your recorded drives are stored on this device and are not
          affected.
        </p>
      </div>

      <div className="flex w-full max-w-[17rem] flex-col gap-2">
        <Button size="md" full onClick={reset}>
          <RotateCcw size={16} /> Try again
        </Button>
        <Link
          href="/"
          className="flex h-11 items-center justify-center rounded-pill border border-hairline bg-surface text-[14px] font-semibold text-ink-muted"
        >
          Back to home
        </Link>
      </div>

      {error.digest ? (
        <p className="num text-[11px] text-ink-faint">Reference {error.digest}</p>
      ) : null}
    </div>
  );
}
