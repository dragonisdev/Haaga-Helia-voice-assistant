import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from './sign-out-button';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already guards the route, but double-check here as a
  // defence-in-depth measure in case middleware is bypassed.
  // No user means middleware will redirect — render children directly so the
  // login page (which is also under /admin/) is not blocked.
  if (!user) {
    return <>{children}</>;
  }

  // Check admin role from JWT app_metadata (only settable by service role)
  const role = (user.app_metadata as Record<string, unknown> | undefined)?.role;
  const isAdmin = role === 'admin';

  return (
    <div className="bg-background min-h-screen">
      {/* Top navigation bar */}
      <header className="border-border bg-card sticky top-0 z-40 border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="text-foreground text-sm font-semibold transition-opacity hover:opacity-80"
            >
              Admin Dashboard
            </Link>
            <span className="text-muted-foreground hidden text-xs sm:inline">
              — Haaga-Helia Voice Assistant
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground hidden max-w-[200px] truncate text-xs sm:block">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Access denied gate */}
      {!isAdmin ? (
        <div className="flex min-h-[calc(100vh-57px)] items-center justify-center p-4">
          <div className="max-w-sm text-center">
            <div className="bg-destructive/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="text-destructive h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                />
              </svg>
            </div>
            <h2 className="text-foreground text-lg font-semibold">Access denied</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Your account ({user.email}) does not have admin privileges. Contact an administrator
              to request access.
            </p>
            <div className="mt-4">
              <SignOutButton />
            </div>
          </div>
        </div>
      ) : (
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      )}
    </div>
  );
}
