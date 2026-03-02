import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/signup'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has('auth_session');

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (isPublicPath) {
    if (hasSession) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
