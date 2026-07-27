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
      ctx.scale(dpr, dpr);
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
        const barH = norm * h;

        // Colour ramps green → amber → rose with level.
        const hue = 160 - norm * 160;
        const alpha = 0.35 + 0.65 * (i / historyLen);
        ctx.fillStyle = `hsla(${hue}, 85%, 60%, ${alpha})`;
        ctx.fillRect(i * barW, h - barH, barW - 1, barH);
      }

      // Ambient floor line.
      if (floorDb > 0) {
        const norm = Math.max(0, Math.min(1, (floorDb - min) / (max - min)));
        const y = h - norm * h;
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.setLineDash([4, 4]);
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
