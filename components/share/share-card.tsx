'use client';

import { forwardRef } from 'react';
import type { TripRecord } from '@/lib/domain/trip';
import { CARD_BAND_COLORS, CARD_PALETTE, CARD_SIZES, type CardFormat } from '@/lib/share/card-presets';
import {
  formatDistanceLong,
  formatDurationCompact,
  formatDateLong,
} from '@/lib/utils/format';

/**
 * The shareable card.
 *
 * Deliberately styled with inline hex values rather than the app's Tailwind
 * glass utilities: html-to-image cannot composite backdrop-filter and older
 * WebKit drops oklch, so a card built from the app's normal surfaces would
 * rasterise wrong. Everything here is solid fills and explicit dimensions.
 */
export const ShareCard = forwardRef<
  HTMLDivElement,
  { trip: TripRecord; format: CardFormat }
>(function ShareCard({ trip, format }, ref) {
  const size = CARD_SIZES[format];
  const score = trip.score!;
  const stats = trip.stats!;
  const band = CARD_BAND_COLORS[score.band];
  const isStory = format === 'story';

  const headline = trip.summary?.headline ?? '';
  const comparison = trip.summary?.comparisons[0];

  return (
    <div
      ref={ref}
      style={{
        width: size.width,
        height: size.height,
        background: `linear-gradient(160deg, ${band.from}26, ${band.to}14, ${CARD_PALETTE.background} 62%)`,
        color: CARD_PALETTE.ink,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: isStory ? 96 : 80,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: 6,
              textTransform: 'uppercase',
              color: CARD_PALETTE.inkFaint,
            }}
          >
            Road360
          </div>
          <div style={{ fontSize: 34, color: CARD_PALETTE.inkMuted, marginTop: 12 }}>
            {formatDateLong(trip.startedAt)}
          </div>
        </div>
      </div>

      {/* Score */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: 8,
            textTransform: 'uppercase',
            color: CARD_PALETTE.inkFaint,
          }}
        >
          Road360 Score
        </div>
        <div
          style={{
            fontSize: isStory ? 340 : 260,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: -8,
            background: `linear-gradient(135deg, ${band.from}, ${band.to})`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {score.value}
        </div>
        <div style={{ fontSize: 56, fontWeight: 700, color: CARD_PALETTE.ink }}>{score.label}</div>

        {headline ? (
          <div
            style={{
              fontSize: 38,
              lineHeight: 1.35,
              color: CARD_PALETTE.inkMuted,
              textAlign: 'center',
              maxWidth: size.width - (isStory ? 260 : 220),
              marginTop: 12,
            }}
          >
            {headline}
          </div>
        ) : null}
      </div>

      {/* Stats + comparison */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {comparison ? (
          <div
            style={{
              background: CARD_PALETTE.surface,
              border: `2px solid ${CARD_PALETTE.border}`,
              borderRadius: 32,
              padding: 36,
            }}
          >
            <div style={{ fontSize: 38, fontWeight: 700, marginBottom: 10 }}>
              {comparison.headline}
            </div>
            <div style={{ fontSize: 30, color: CARD_PALETTE.inkMuted, lineHeight: 1.4 }}>
              {comparison.detail}
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 20 }}>
          <CardStat label="Distance" value={formatDistanceLong(stats.distanceM)} />
          <CardStat label="Horns" value={String(stats.soundCounts.horn)} accent={band.to} />
          <CardStat label="Hard brakes" value={String(stats.hardBrakes)} />
          <CardStat label="Avg noise" value={`${Math.round(stats.noise.avgDb)} dB`} />
        </div>

        <div style={{ fontSize: 26, color: CARD_PALETTE.inkFaint, textAlign: 'center' }}>
          {formatDurationCompact(stats.durationMs)} of driving · tracked with Road360
        </div>
      </div>
    </div>
  );
});

function CardStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      style={{
        flex: 1,
        background: CARD_PALETTE.surface,
        border: `2px solid ${CARD_PALETTE.border}`,
        borderRadius: 28,
        padding: 28,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 44,
          fontWeight: 800,
          color: accent ?? CARD_PALETTE.ink,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: CARD_PALETTE.inkFaint,
          marginTop: 8,
        }}
      >
        {label}
      </div>
    </div>
  );
}
