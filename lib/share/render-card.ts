import { toBlob } from 'html-to-image';
import { CARD_PALETTE } from './card-presets';

/**
 * Rasterise a DOM node to a PNG blob.
 *
 * Three things here are workarounds for real html-to-image behaviour, not
 * superstition:
 *
 *  1. `document.fonts.ready` plus a double rAF — capturing before layout has
 *     settled produces a card with fallback metrics or clipped text.
 *  2. Rendering twice — Safari's first pass routinely drops images and
 *     backgrounds; the second is reliably complete.
 *  3. An explicit background — a transparent PNG looks broken against a light
 *     chat background when shared.
 */
export async function renderCardToBlob(node: HTMLElement): Promise<Blob> {
  await document.fonts.ready;
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  const options = {
    cacheBust: true,
    backgroundColor: CARD_PALETTE.background,
    pixelRatio: 1,
    width: node.offsetWidth,
    height: node.offsetHeight,
  };

  await toBlob(node, options);
  const blob = await toBlob(node, options);

  if (!blob) throw new Error('Could not render the share card.');
  return blob;
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * Share a rendered card, degrading through the platforms that exist:
 * Web Share with files → text-only share → download. In an in-app webview
 * where none work, the caller falls back to showing the image to long-press.
 */
export async function shareCard(
  blob: Blob,
  filename: string,
  text: string,
): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: 'image/png' });

  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Road360', text });
      return 'shared';
    } catch (error) {
      // A user dismissing the sheet is not a failure worth falling back for.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
