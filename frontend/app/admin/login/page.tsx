'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { type AuthActionResult, signIn, signUp } from './actions';

const initialState: AuthActionResult | null = null;

function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const action = mode === 'signin' ? signIn : signUp;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-foreground text-sm font-medium">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete={mode === 'signin' ? 'username' : 'email'}
          required
          className="border-input bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          placeholder="you@example.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-foreground text-sm font-medium">
          Password
          {mode === 'signup' && (
            <span className="text-muted-foreground ml-1 font-normal">(min. 8 characters)</span>
          )}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          required
          minLength={mode === 'signup' ? 8 : undefined}
          className="border-input bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          placeholder="••••••••"
        />
      </div>

      {state && !state.success && (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
          {state.error}
        </p>
      )}

      {state && state.success && (
        <p
          role="status"
          className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400"
        >
          {state.message}
        </p>
      )}

      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending
          ? mode === 'signin'
            ? 'Signing in…'
            : 'Creating account…'
          : mode === 'signin'
            ? 'Sign in'
            : 'Create account'}
      </Button>
    </form>
  );
}

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [confirmationError, setConfirmationError] = useState(false);

  useEffect(() => {
    searchParams.then(({ error }) => {
      if (error === 'confirmation_failed') setConfirmationError(true);
    });
  }, [searchParams]);

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-8 text-center">
          <div className="bg-primary/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="text-primary h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="text-foreground text-xl font-semibold">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">Haaga-Helia Voice Assistant</p>
        </div>

        {/* Error from email confirmation failure */}
        {confirmationError && (
          <div className="bg-destructive/10 text-destructive mb-4 rounded-md px-3 py-2 text-sm">
            Email confirmation failed. The link may have expired. Please try signing in or request a
            new confirmation email.
          </div>
        )}

        {/* Tab switcher */}
        <div className="bg-muted mb-6 flex rounded-lg p-1">
          {(['signin', 'signup'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'signin' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        {/* Form — remount on tab switch to reset state */}
        {tab === 'signin' ? (
          <AuthForm key="signin" mode="signin" />
        ) : (
          <AuthForm key="signup" mode="signup" />
        )}

        {tab === 'signup' && (
          <p className="text-muted-foreground mt-4 text-center text-xs">
            After signing up and confirming your email, an administrator must grant you access via
            the Supabase dashboard before you can view the dashboard.
          </p>
        )}
      </div>
    </div>
  );
}
