import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Refresh the session cookie so it never expires mid-visit.
  // This MUST use the middleware client (not the server.ts helper) so it
  // can write Set-Cookie headers on the response.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — do NOT remove this.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Redirect unauthenticated visitors away from all /admin/* routes,
  // except /admin/login itself (to prevent redirect loops).
  if (!user && pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/admin/login';
    // Preserve the intended destination so we can redirect after login
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect already-authenticated users away from the login page
  if (user && pathname === '/admin/login') {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/admin';
    dashboardUrl.search = '';
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all /admin routes. Exclude static files and Next.js internals.
    '/admin/:path*',
    // Also match the auth callback used by Supabase email confirmation
    '/api/auth/callback',
  ],
};
