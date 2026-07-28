import { ImageResponse } from 'next/og';

export const alt = 'Road360 — how chaotic was your commute?';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * The link preview card, generated at build time.
 *
 * Rendered by Satori, which supports a subset of CSS: flexbox only (no grid),
 * every element with more than one child needs an explicit `display: flex`, and
 * there is no `gap` shorthand inheritance to rely on. It is written flat and
 * verbose for that reason rather than reusing the app's components.
 *
 * No webfont is fetched — a build that reaches out to a font CDN fails on any
 * machine without network access, and the built-in sans is close enough at this
 * size.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#000000',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              background: '#00E08C',
              marginRight: 16,
            }}
          />
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: 6,
              color: '#9A9AA5',
            }}
          >
            ROAD360
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 82,
              fontWeight: 800,
              color: '#FFFFFF',
              lineHeight: 1.05,
              letterSpacing: -2,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span>How chaotic is</span>
            <span>your commute?</span>
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 30,
              color: '#9A9AA5',
              lineHeight: 1.4,
              display: 'flex',
            }}
          >
            Horns, noise, hard braking and stop-and-go — measured on your phone,
            scored out of 100.
          </div>
        </div>

        {/* Band strip: the four score bands, in order. */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {[
            { label: 'CHAOS', color: '#FF2D55' },
            { label: 'STRESSFUL', color: '#FF8A3D' },
            { label: 'NORMAL', color: '#4EA8FF' },
            { label: 'EXCELLENT', color: '#00E08C' },
          ].map((band) => (
            <div
              key={band.label}
              style={{ display: 'flex', alignItems: 'center', marginRight: 44 }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  background: band.color,
                  marginRight: 12,
                }}
              />
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, color: '#62626E' }}>
                {band.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
