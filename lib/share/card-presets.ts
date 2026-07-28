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
  surface: '#0C0C0E',
  border: '#1F1F22',
  ink: '#F5F5F4',
  inkMuted: '#8B8B90',
  inkFaint: '#57575D',
} as const;

/** Band gradients as hex pairs, mirroring lib/score/labels.ts. */
export const CARD_BAND_COLORS = {
  excellent: { from: '#38D6A2', to: '#2FB992' },
  normal: { from: '#8590A4', to: '#6F7C92' },
  stressful: { from: '#D2A45E', to: '#C2894C' },
  chaos: { from: '#CD6D6D', to: '#BD5754' },
} as const;
