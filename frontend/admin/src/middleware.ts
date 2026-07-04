import { NextRequest, NextResponse } from 'next/server';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from '@/config/constants';

// Custom middleware: detects locale from cookies and injects it into the REQUEST headers
// so next-intl's requestLocale in i18n.ts can read it correctly.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Skip static assets, API routes, and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Detect locale from NEXT_LOCALE cookie
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value as Locale | undefined;
  const detectedLocale = cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale) 
    ? cookieLocale 
    : DEFAULT_LOCALE;

  // CRITICAL: Inject locale into REQUEST headers (not response)
  // next-intl's requestLocale reads from the incoming request headers.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-next-intl-locale', detectedLocale);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Ensure the cookie is always set so client-side components have access to it
  if (!cookieLocale || cookieLocale !== detectedLocale) {
    response.cookies.set('NEXT_LOCALE', detectedLocale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
