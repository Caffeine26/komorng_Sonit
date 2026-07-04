import { NextRequest, NextResponse } from 'next/server';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@/config/constants';

// Middleware runs on every request. Keep it minimal — locale + routing only.
// Do NOT add: DB calls, auth lookups, tenant resolution. Those belong in
// route layouts (Server Components), where they can use the full Node runtime.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const hasLocale = SUPPORTED_LOCALES.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  );
  if (hasLocale) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
