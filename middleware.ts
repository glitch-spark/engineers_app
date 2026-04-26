import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  const { pathname } = req.nextUrl;
  const isAuthPath = pathname.startsWith('/login') || pathname.startsWith('/register');

  if (!token && !isAuthPath) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (token && isAuthPath) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next|api|public).*)'] };
