import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-3xl font-bold">404</h1>
      <p className="mt-2 text-muted">This page does not exist.</p>
      <Link href="/" className="mt-6 inline-block text-brand underline">
        Go home
      </Link>
    </main>
  );
}
