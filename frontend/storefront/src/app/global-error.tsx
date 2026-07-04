'use client';

// global-error replaces the root layout when a render error escapes the root.
// It MUST include <html> and <body>. Keep dependencies minimal.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main style={{ maxWidth: 480, margin: '64px auto', padding: '0 24px', textAlign: 'center' }}>
          <h1>Application error</h1>
          <p className="text-slate-500">{error.message}</p>
          <button onClick={reset} style={{ marginTop: 24 }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
