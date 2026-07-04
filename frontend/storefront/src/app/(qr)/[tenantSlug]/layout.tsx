import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

// ──────────────────────────────────────────────────────────────────────────
// Tenant resolution lives HERE — not in middleware, not in every page.
//
// Why this layout (Server Component) is the right place:
//   - Middleware would add latency to every request (including static assets)
//     and cannot use the full Node runtime (no Prisma, no NestJS HTTP).
//   - Page-level fetches duplicate the lookup across every route under the
//     tenant. With the layout, React caches the result for the visit and
//     all child pages get it for free.
//
// Replace the stub below with a real call to lib/api/tenant.getBySlug(...)
// once the @xfos/contracts-tenant schema and the backend endpoint exist.
// ──────────────────────────────────────────────────────────────────────────

type Tenant = {
  id: string;
  slug: string;
  name: string;
};

async function fetchTenant(slug: string): Promise<Tenant | null> {
  // STUB — replace with: return tenantApi.getBySlug(slug);
  if (!slug || slug.length < 2) return null;
  return { id: 'stub', slug, name: slug };
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { tenantSlug: string };
}) {
  const tenant = await fetchTenant(params.tenantSlug);
  if (!tenant) notFound();

  // TODO: provide tenant via React Context to descendants once we have a
  // dedicated TenantProvider in src/providers. For now child pages can
  // re-fetch with the same slug — React caches it within a request.
  return <>{children}</>;
}
