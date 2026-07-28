'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Share2, Download, Loader2 } from 'lucide-react';
import type { TripRecord } from '@/lib/domain/trip';
import { ShareCard } from './share-card';
import { CARD_SIZES, type CardFormat } from '@/lib/share/card-presets';
import {
  renderCardToBlob,
  shareCard,
  downloadBlob,
  copyBlobToClipboard,
} from '@/lib/share/render-card';
import { buildShareText, buildXIntentUrl, shareOrigin } from '@/lib/share/share-text';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Button } from '@/components/ui/button';
import { SPRING } from '@/components/motion/transitions';

const FORMATS = [
  { value: 'story' as const, label: 'Story' },
  { value: 'square' as const, label: 'Square' },
];

/** The X logo. Lucide has no mark for it, and an outdated bird would be worse. */
function XMark({ size = 17 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/**
 * Share sheet with a live preview.
 *
 * The card is mounted off-screen at TRUE pixel size (1080 wide) and the preview
 * is the same node scaled down by transform — so what the user previews is
 * exactly what rasterises. Hiding it with `display:none` or inside a
 * zero-size parent would break layout and capture blank, which is why it is
 * positioned far off-screen instead.
 */
export function ShareSheet({ trip, onClose }: { trip: TripRecord; onClose: () => void }) {
  const [format, setFormat] = useState<CardFormat>('story');
  const [status, setStatus] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle');
  const [note, setNote] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filename = `road360-${new Date(trip.startedAt).toISOString().slice(0, 10)}.png`;

  const handleShare = async (forceDownload: boolean) => {
    if (!cardRef.current) return;
    setStatus('rendering');
    setNote(null);
    try {
      const blob = await renderCardToBlob(cardRef.current);

      if (forceDownload) {
        downloadBlob(blob, filename);
        setNote('Saved to your downloads.');
      } else {
        const outcome = await shareCard(blob, filename, buildShareText(trip));
        if (outcome === 'downloaded') setNote('Sharing unavailable — saved instead.');
      }
      setStatus('done');
    } catch {
      setStatus('error');
      setNote('Could not create the image.');
    }
  };

  /**
   * X can prefill the composer but cannot be handed a file, so the card goes to
   * the clipboard and the user pastes it. Where the clipboard refuses images we
   * download instead and say so — silently opening an empty composer would
   * leave them posting a bare link.
   */
  const handlePostToX = async () => {
    if (!cardRef.current) return;
    setStatus('rendering');
    setNote(null);
    try {
      const blob = await renderCardToBlob(cardRef.current);
      const copied = await copyBlobToClipboard(blob);
      if (!copied) downloadBlob(blob, filename);

      // Opened after the await, so this can be blocked by a popup blocker in
      // rare configurations; the note tells the user what to expect either way.
      window.open(
        buildXIntentUrl(buildShareText(trip), shareOrigin()),
        '_blank',
        'noopener,noreferrer',
      );
      setNote(
        copied
          ? 'Card copied — paste it into the post.'
          : 'Card saved to downloads — attach it to the post.',
      );
      setStatus('done');
    } catch {
      setStatus('error');
      setNote('Could not create the image.');
    }
  };

  const size = CARD_SIZES[format];
  const previewScale = 240 / size.width;
  const busy = status === 'rendering';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-hidden />

      {/* True-size card, rendered off-screen. Not display:none — that captures blank. */}
      <div style={{ position: 'fixed', left: -10_000, top: 0, pointerEvents: 'none' }} aria-hidden>
        <ShareCard ref={cardRef} trip={trip} format={format} />
      </div>

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={SPRING.smooth}
        className="glass-strong relative z-10 max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-ink">Share this drive</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint">
            <X size={20} />
          </button>
        </div>

        <SegmentedControl
          options={FORMATS}
          value={format}
          onChange={setFormat}
          layoutId="share-format"
          className="mb-4"
        />

        {/* Preview: the same markup, scaled. */}
        <div
          className="mx-auto mb-5 overflow-hidden rounded-2xl border border-hairline"
          style={{ width: 240, height: size.height * previewScale }}
        >
          <div
            style={{
              width: size.width,
              height: size.height,
              transform: `scale(${previewScale})`,
              transformOrigin: 'top left',
            }}
          >
            <ShareCard trip={trip} format={format} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button size="lg" full onClick={() => void handleShare(false)} disabled={busy}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Share2 size={18} />}
            Share
          </Button>
          <Button size="md" variant="subtle" full onClick={() => void handlePostToX()} disabled={busy}>
            <XMark /> Post to X
          </Button>
          <Button size="md" variant="ghost" full onClick={() => void handleShare(true)} disabled={busy}>
            <Download size={16} /> Save image
          </Button>
          {note ? <p className="pt-1 text-center text-[12px] text-ink-muted">{note}</p> : null}
        </div>
      </motion.div>
    </div>
  );
}
