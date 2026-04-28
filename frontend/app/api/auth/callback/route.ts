import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Handles the OAuth/magic-link/email-confirmation callback from Supabase.
 * Supabase redirects here after a user clicks the confirmation link in their email.
 * Configure the "Site URL" and "Redirect URLs" in your Supabase project settings
 * to include: https://your-domain.com/api/auth/callback
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/admin';

  // Sanitise the `next` redirect to prevent open-redirect attacks:
  // only allow relative paths within the same origin.
  const safeNext = next.startsWith('/') ? next : '/admin';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  // Something went wrong — redirect to login with an error flag
  return NextResponse.redirect(`${origin}/admin/login?error=confirmation_failed`);
}
