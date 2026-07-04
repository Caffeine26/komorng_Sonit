import { NextRequest, NextResponse } from 'next/server';

// Middleware runs on every request. Keep it minimal — routing only.
// Locale is now managed via cookies + React Context, NOT in the URL.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};

