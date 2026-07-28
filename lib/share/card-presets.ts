/**
 * Share card constraints and palette.
 *
 * html-to-image rasterises through an SVG <foreignObject>, which has real
 * limits that silently produce a broken or blank card:
 *
 *  - `backdrop-filter` does not composite, so cards use solid fills, never the
 *    app's `.glass` utility;
 *  - unknown colour functions (oklch) are dropped by older WebKit, so every
 *    value here is hex;
 *  - external fonts taint or fail, so cards inherit the system stack.
 */
export const CARD_SIZES = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
} as const;

export type CardFormat = keyof typeof CARD_SIZES;

export const CARD_PALETTE = {
  background: '#000000',
  surface: '#0E0E11',
  border: '#232329',
  ink: '#FFFFFF',
  inkMuted: '#9A9AA5',
  inkFaint: '#62626E',
} as const;

/** Band gradients as hex pairs, mirroring lib/score/labels.ts. */
export const CARD_BAND_COLORS = {
  excellent: { from: '#00E08C', to: '#00C8B4' },
  normal: { from: '#4EA8FF', to: '#6E8BFF' },
  stressful: { from: '#FFC043', to: '#FF8A3D' },
  chaos: { from: '#FF5470', to: '#FF2D55' },
} as const;
