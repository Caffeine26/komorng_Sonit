import { env } from '@/config/env';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-brand">Komorng Storefront</h1>
        <p className="font-khmer text-lg text-muted">ហាងអាហារ Komorng</p>
      </header>

      <section className="rounded-lg bg-white p-6 shadow-sm">
        <p className="mb-4">Customer-facing mobile web. Scan a QR to browse the menu.</p>
        <dl className="text-sm">
          <dt className="font-semibold">API base</dt>
          <dd className="font-mono text-muted">{env.NEXT_PUBLIC_API_BASE_URL}</dd>
        </dl>
      </section>

      <footer className="mt-12 text-center text-xs text-muted">
        This app is fully self-contained (see docs §12).
      </footer>
    </main>
  );
}
