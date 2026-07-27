'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import type { TripRecord } from '@/lib/domain/trip';
import { ShareSheet } from '@/components/share/share-sheet';

/** Opens the share sheet for a completed trip. */
export function ShareButton({ trip }: { trip: TripRecord }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass grid size-10 place-items-center rounded-full text-ink"
        aria-label="Share this drive"
      >
        <Share2 size={18} />
      </button>
      {open ? <ShareSheet trip={trip} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
