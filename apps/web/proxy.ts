import { NextRequest, NextResponse } from 'next/server';

const protectedPrefixes = [
  '/admin',
  '/inspect',
  '/me',
  '/onboarding',
  '/professional',
  '/user',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; connect-src 'self' https://performancefactory.littlefly.it http://127.0.0.1:4000 http://localhost:4000; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );

  if (!isProtected) {
    return response;
  }

  const hasSession = request.cookies.has('pf.sid');
  if (!hasSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/inspect/:path*', '/me', '/onboarding', '/professional/:path*', '/user/:path*'],
};
