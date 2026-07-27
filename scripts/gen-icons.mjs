import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

/**
 * Generate PWA icons from an inline SVG.
 *
 * The maskable variant needs its artwork inside the safe zone (the inner ~80%),
 * because Android crops maskable icons to whatever shape the launcher uses — a
 * full-bleed logo loses its edges.
 */
const OUT = path.join(process.cwd(), 'public', 'icons');

const logo = (size, safeScale = 1) => {
  const s = size;
  const c = s / 2;
  const r = (s * 0.32) * safeScale;
  const ring = s * 0.055 * safeScale;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#12142a"/>
      <stop offset="100%" stop-color="#07070a"/>
    </linearGradient>
    <linearGradient id="arc" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#34D399"/>
      <stop offset="50%" stop-color="#818CF8"/>
      <stop offset="100%" stop-color="#F43F5E"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" fill="url(#bg)"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="${ring}"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#arc)" stroke-width="${ring}"
          stroke-linecap="round" stroke-dasharray="${2 * Math.PI * r * 0.72} ${2 * Math.PI * r}"
          transform="rotate(130 ${c} ${c})"/>
  <circle cx="${c}" cy="${c}" r="${r * 0.30}" fill="#818CF8"/>
</svg>`;
};

async function main() {
  await mkdir(OUT, { recursive: true });

  const targets = [
    { file: 'icon-192.png', size: 192, safe: 1 },
    { file: 'icon-512.png', size: 512, safe: 1 },
    { file: 'apple-touch-icon.png', size: 180, safe: 1 },
    // Maskable art sits inside the safe zone so launcher cropping never clips it.
    { file: 'maskable-512.png', size: 512, safe: 0.78 },
  ];

  for (const target of targets) {
    const svg = Buffer.from(logo(target.size, target.safe));
    const png = await sharp(svg).png().toBuffer();
    await writeFile(path.join(OUT, target.file), png);
    console.log('wrote', target.file);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
