'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Share2, Download, Loader2 } from 'lucide-react';
import type { TripRecord } from '@/lib/domain/trip';
import { ShareCard } from './share-card';
import { CARD_SIZES, type CardFormat } from '@/lib/share/card-presets';
import { renderCardToBlob, shareCard } from '@/lib/share/render-card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Button } from '@/components/ui/button';
import { SPRING } from '@/components/motion/transitions';

const FORMATS = [
  { value: 'story' as const, label: 'Story' },
  { value: 'square' as const, label: 'Square' },
];

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

  const handleShare = async (forceDownload: boolean) => {
    if (!cardRef.current) return;
    setStatus('rendering');
    setNote(null);
    try {
      const blob = await renderCardToBlob(cardRef.current);
      const filename = `road360-${new Date(trip.startedAt).toISOString().slice(0, 10)}.png`;

      if (forceDownload) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setNote('Saved to your downloads.');
      } else {
        const outcome = await shareCard(
          blob,
          filename,
          `I scored ${trip.score?.value} on Road360.`,
        );
        if (outcome === 'downloaded') setNote('Sharing unavailable — saved instead.');
      }
      setStatus('done');
    } catch {
      setStatus('error');
      setNote('Could not create the image.');
    }
  };

  const size = CARD_SIZES[format];
  const previewScale = 260 / size.width;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />

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
          <h2 className="text-lg font-bold text-ink">Share this drive</h2>
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
          className="mx-auto mb-5 overflow-hidden rounded-2xl border border-white/10"
          style={{ width: 260, height: size.height * previewScale }}
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
          <Button size="lg" full onClick={() => handleShare(false)} disabled={status === 'rendering'}>
            {status === 'rendering' ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Share2 size={18} />
            )}
            Share
          </Button>
          <Button
            size="md"
            variant="subtle"
            full
            onClick={() => handleShare(true)}
            disabled={status === 'rendering'}
          >
            <Download size={16} /> Save image
          </Button>
          {note ? <p className="pt-1 text-center text-xs text-ink-muted">{note}</p> : null}
        </div>
      </motion.div>
    </div>
  );
}
