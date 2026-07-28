'use client';

/**
 * The last line of defence: a failure in the root layout itself, where
 * `app/error.tsx` cannot render because the layout that would host it is the
 * thing that threw.
 *
 * This component replaces <html> wholesale, so it cannot rely on the app's
 * stylesheet having loaded — every style here is inline for that reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          padding: 32,
          textAlign: 'center',
          background: '#000000',
          color: '#ffffff',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
          Road360 could not start
        </h1>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: '#9a9aa5', maxWidth: 300, margin: 0 }}>
          Something failed before the app loaded. Your recorded drives are stored on this device and
          are not affected.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            appearance: 'none',
            border: 'none',
            borderRadius: 999,
            padding: '12px 28px',
            fontSize: 15,
            fontWeight: 600,
            background: '#ffffff',
            color: '#000000',
          }}
        >
          Reload
        </button>
        {error.digest ? (
          <p style={{ fontSize: 11, color: '#62626e', margin: 0 }}>Reference {error.digest}</p>
        ) : null}
      </body>
    </html>
  );
}
