'use client';

import { useEffect, useRef } from 'react';
import { getSessionStore } from '@/lib/session/session-store';

/**
 * The live dB meter.
 *
 * This component subscribes to the meter channel imperatively inside an effect
 * and draws to a canvas — it never calls setState, so it re-renders exactly
 * zero times over the course of a drive no matter how fast the level changes.
 * That is the whole reason the meter is its own channel.
 */
export function DbMeter({ height = 72 }: { height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      // setTransform, not scale: scale() multiplies the existing matrix, so
      // rotating the phone twice used to leave the meter drawing at dpr³ and
      // the bars marching off the canvas.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // A short rolling history so the meter reads like a spectrogram strip.
    const historyLen = 96;
    const history: number[] = new Array(historyLen).fill(0);
    let raf = 0;
    let latestDb = 0;
    let floorDb = 0;

    const store = getSessionStore();
    const unsubscribe = store.subscribe('meter', () => {
      const meter = store.getSnapshot('meter');
      latestDb = meter.db;
      floorDb = meter.floorDb;
    });

    // A single rAF loop is correct here — this is a foreground visualisation,
    // not a sensor path. It stops the moment the component unmounts.
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      history.push(latestDb);
      history.shift();

      ctx.clearRect(0, 0, w, h);

      const barW = w / historyLen;
      const min = 40;
      const max = 100;

      for (let i = 0; i < historyLen; i++) {
        const db = history[i]!;
        if (db <= 0) continue;
        const norm = Math.max(0, Math.min(1, (db - min) / (max - min)));
        const barH = Math.max(1, norm * h);

        // Ramped through the same three band colours the rest of the app uses,
        // rather than a full hue sweep — an 85%-saturation rainbow inside a
        // 44px strip was the loudest thing on the screen and meant nothing.
        const alpha = 0.3 + 0.7 * (i / historyLen);
        ctx.fillStyle = rampColor(norm, alpha);
        ctx.fillRect(i * barW, h - barH, Math.max(1, barW - 1), barH);
      }

      // Ambient floor line.
      if (floorDb > 0) {
        const norm = Math.max(0, Math.min(1, (floorDb - min) / (max - min)));
        const y = h - norm * h;
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full" style={{ height }} aria-hidden />;
}

/** Quiet → loud across the score-band greens, ambers and reds. */
function rampColor(norm: number, alpha: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [52, 217, 160]],
    [0.5, [208, 163, 92]],
    [0.75, [200, 129, 79]],
    [1, [205, 109, 109]],
  ];

  let lo = stops[0]!;
  let hi = stops[stops.length - 1]!;
  for (let i = 0; i < stops.length - 1; i++) {
    if (norm >= stops[i]![0] && norm <= stops[i + 1]![0]) {
      lo = stops[i]!;
      hi = stops[i + 1]!;
      break;
    }
  }

  const span = hi[0] - lo[0];
  const t = span === 0 ? 0 : (norm - lo[0]) / span;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgba(${mix(lo[1][0], hi[1][0])},${mix(lo[1][1], hi[1][1])},${mix(lo[1][2], hi[1][2])},${alpha})`;
}
