import { env } from '@/config/env';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-brand">XFOS Platform Admin</h1>
        <p className="font-khmer text-lg text-muted">Internal ops — IP allowlisted in production</p>
      </header>

      <section className="rounded-md border border-gray-300 bg-white p-6">
        <p className="mb-4">Tenant management, audit logs, system health, cross-tenant billing.</p>
        <dl className="text-sm">
          <dt className="font-semibold">API base</dt>
          <dd className="font-mono text-muted">{env.NEXT_PUBLIC_API_BASE_URL}</dd>
        </dl>
      </section>

      <footer className="mt-12 text-center text-xs text-muted">
        Self-contained app (docs §12). Per ADR-006, can be split to its own repo later.
      </footer>
    </main>
  );
}
