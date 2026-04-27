'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Rate limiting — mirrors the pattern in /api/connection-details/route.ts
// Stored in module scope (in-memory, single process).
// For multi-replica deployments replace with Redis/Upstash.
// ---------------------------------------------------------------------------
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_SIGN_IN_PER_WINDOW = 10; // generous for legitimate use
const MAX_SIGN_UP_PER_WINDOW = 3; // stricter to prevent account spam
const LOCKOUT_MS = 5 * 60 * 1000; // 5-minute lockout after limit hit

interface RateLimitEntry {
  count: number;
  resetTime: number;
  lockedUntil?: number;
}

const signInStore = new Map<string, RateLimitEntry>();
const signUpStore = new Map<string, RateLimitEntry>();

function getClientIP(headersList: Awaited<ReturnType<typeof headers>>): string {
  const forwarded = headersList.get('x-forwarded-for');
  const realIP = headersList.get('x-real-ip');
  const cf = headersList.get('cf-connecting-ip');
  if (forwarded) return forwarded.split(',')[0].trim();
  if (realIP) return realIP;
  if (cf) return cf;
  return 'unknown';
}

function checkLimit(
  store: Map<string, RateLimitEntry>,
  ip: string,
  max: number
): { allowed: boolean } {
  const now = Date.now();
  const entry = store.get(ip);

  if (entry?.lockedUntil && now < entry.lockedUntil) {
    return { allowed: false };
  }

  if (!entry || now > entry.resetTime) {
    store.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= max) {
    entry.lockedUntil = now + LOCKOUT_MS;
    return { allowed: false };
  }

  entry.count += 1;
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

export type AuthActionResult =
  | { success: true; message: string }
  | { success: false; error: string };

export async function signIn(_: unknown, formData: FormData): Promise<AuthActionResult> {
  const hdrs = await headers();
  const ip = getClientIP(hdrs);

  if (!checkLimit(signInStore, ip, MAX_SIGN_IN_PER_WINDOW).allowed) {
    return { success: false, error: 'Too many sign-in attempts. Please wait a few minutes.' };
  }

  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { success: false, error: 'Email and password are required.' };
  }

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Do not leak whether the email exists — use a generic message
    return { success: false, error: 'Invalid email or password.' };
  }

  redirect('/admin');
}

export async function signUp(_: unknown, formData: FormData): Promise<AuthActionResult> {
  const hdrs = await headers();
  const ip = getClientIP(hdrs);

  if (!checkLimit(signUpStore, ip, MAX_SIGN_UP_PER_WINDOW).allowed) {
    return { success: false, error: 'Too many sign-up attempts. Please wait a few minutes.' };
  }

  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { success: false, error: 'Email and password are required.' };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  if (password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Supabase will send the confirmation email automatically.
      // After confirmation the user lands on /api/auth/callback.
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/api/auth/callback`,
    },
  });

  if (error) {
    // Don't reveal whether the email is already registered
    return {
      success: false,
      error: 'Unable to create account. Please try again or contact an administrator.',
    };
  }

  return {
    success: true,
    message:
      'Account created! Please check your email to confirm your address. An administrator must grant you access before you can view the dashboard.',
  };
}
