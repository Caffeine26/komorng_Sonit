// Menu page — rendered by features/menu-browse once it exists.

export default function MenuPage({
  params,
}: {
  params: { tenantSlug: string };
}) {
  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="text-xl font-bold">Menu — {params.tenantSlug}</h1>
      <p className="mt-2 text-sm text-muted">
        TODO: render via <code>features/menu-browse</code>.
      </p>
    </main>
  );
}
