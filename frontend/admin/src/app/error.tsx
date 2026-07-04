'use client';

import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO: report to lib/telemetry
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-muted">{error.message}</p>
      <button
        onClick={reset}
        className="mt-6 rounded-md bg-brand px-4 py-2 text-brand-foreground"
      >
        Try again
      </button>
    </main>
  );
}
