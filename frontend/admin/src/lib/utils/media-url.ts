/**
 * resolveMediaUrl
 *
 * Converts an absolute `http://localhost:PORT` media URL (as stored in the DB
 * from MinIO/S3 in development) into a **relative path** so that:
 *  - The browser only ever makes HTTPS requests (no Safari mixed-content block).
 *  - The request is proxied to the backend via the Next.js rewrite rules.
 *
 * Any URL that is already relative, empty, or points to a real HTTPS host is
 * returned unchanged.
 *
 * @example
 * resolveMediaUrl('http://localhost:9000/xfos-media/logos/logo.png')
 * // → '/xfos-media/logos/logo.png'
 *
 * resolveMediaUrl('https://cdn.example.com/logo.png')
 * // → 'https://cdn.example.com/logo.png'  (unchanged)
 */
export function resolveMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    // Only rewrite http://localhost:* URLs — leave real HTTPS CDN URLs alone
    if (parsed.protocol === 'http:' && parsed.hostname === 'localhost') {
      // Return everything after the origin (pathname + search + hash)
      return parsed.pathname + parsed.search + parsed.hash;
    }
  } catch {
    // Not a valid absolute URL — treat it as already relative
  }

  return url;
}
