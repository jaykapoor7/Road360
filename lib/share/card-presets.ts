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
  background: '#07070A',
  surface: '#151823',
  border: '#272B3A',
  ink: '#F7F8FA',
  inkMuted: '#A2A8BB',
  inkFaint: '#6B7186',
} as const;

/** Band gradients as hex pairs, mirroring lib/score/labels.ts. */
export const CARD_BAND_COLORS = {
  excellent: { from: '#34D399', to: '#22D3EE' },
  normal: { from: '#60A5FA', to: '#818CF8' },
  stressful: { from: '#FBBF24', to: '#FB923C' },
  chaos: { from: '#FB7185', to: '#F43F5E' },
} as const;
