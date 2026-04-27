# Admin Dashboard

The admin dashboard lets authorised staff review all recorded voice-call sessions: full conversation transcripts, call durations, start/end timestamps, and LLM/TTS token usage.

---

## How access works

The flow is:

1. A person signs up at `/admin/login` with their email and password.
2. Supabase sends them a confirmation email. They click the link.
3. The confirmation link lands on `/api/auth/callback`, which exchanges the one-time code for a session cookie and redirects to `/admin`.
4. At this point they are **authenticated but not authorised** — they see an "Access denied" screen.
5. An administrator runs the grant script in the Supabase SQL editor (see below).
6. The user signs out and signs back in. Their new JWT contains `app_metadata.role = admin` and the dashboard loads.

---

## Granting admin access

Edit [`supabase/scripts/grant_admin.sql`](../supabase/scripts/grant_admin.sql) with the user's email, then run it in the **Supabase SQL Editor** (requires service role — the dashboard SQL editor runs as service role by default):

```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'admin@example.com';
```

To verify:
```sql
SELECT id, email, raw_app_meta_data FROM auth.users WHERE email = 'admin@example.com';
```

To revoke:
```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data - 'role'
WHERE email = 'admin@example.com';
```

The role is stored in `app_metadata` (not `user_metadata`). Only the service role can write `app_metadata` — users cannot elevate their own privileges.

---

## Local development

### Prerequisites

- `frontend/.env` (or `.env.local`) must contain:
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
  NEXT_PUBLIC_SITE_URL=http://localhost:3000
  ```
- The RLS migration has been applied (see below).
- In the Supabase dashboard → **Authentication → URL Configuration**:
  - **Site URL**: `http://localhost:3000`
  - **Redirect URLs**: add `http://localhost:3000/api/auth/callback`

### Steps

```bash
cd frontend
pnpm dev
```

1. Go to `http://localhost:3000/admin/login`
2. Sign up with your email → check your inbox → click the confirmation link
3. You land on `/admin` and see "Access denied" (expected)
4. Run the grant SQL in the Supabase dashboard with your email
5. Sign out → sign in again → dashboard loads

---

## Applying the database migration

Run the contents of `supabase/migrations/20260427000000_admin_rls_policies.sql` in the Supabase SQL editor. This:

- Creates the `public.is_admin()` helper function that reads `app_metadata.role` from the JWT
- Enables RLS on `conversation_sessions`, `conversation_messages`, `session_usage_metrics`, and `documents`
- Creates a `SELECT` policy on each table for the `authenticated` role that calls `public.is_admin()`
- Grants `SELECT` on the `session_summaries` view to the `authenticated` role

The Python agent uses the **service role key** which bypasses RLS automatically — no agent changes are needed.

---

## Deploying to production

### Vercel environment variables

Add these in the Vercel project settings (in addition to the existing LiveKit vars):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `NEXT_PUBLIC_SITE_URL` | Your production domain, e.g. `https://yourapp.vercel.app` |

### Supabase redirect URLs

In the Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: your production domain
- **Redirect URLs**: add `https://yourapp.vercel.app/api/auth/callback`

Without this, Supabase will refuse to redirect back to your domain after email confirmation.

---

## Security design

| Layer | Mechanism |
|---|---|
| Route protection | Next.js middleware redirects unauthenticated requests to `/admin/login` before the page renders |
| Role gate | Admin layout server component re-checks `app_metadata.role` from the JWT as defence in depth |
| Data access | RLS policies on every table block any non-admin JWT at the database level |
| Role immutability | `app_metadata` is writable only by the service role — users cannot self-assign admin |
| Auth rate limiting | IP-based in-memory limits: 10 sign-in / 3 sign-up per minute, 5-minute lockout on breach |
| Error messages | Sign-in returns a generic "Invalid email or password" — email existence is never revealed |
| Open-redirect prevention | Auth callback validates `next` param is a relative path before redirecting |
| UUID validation | Session detail page validates the `id` route param format before querying Supabase |

---

## Dashboard pages

### `/admin` — Sessions list

Displays all recorded sessions newest-first, 25 per page. Columns:

- **Started** — date, time, and relative age
- **Duration** — call length in minutes and seconds
- **Turns** — number of conversation turns
- **Prompt tokens / Completion tokens** — LLM usage
- **TTS characters** — characters sent to OpenAI TTS
- **Room** — the LiveKit room UUID
- **View →** — link to the session detail page

A search box filters by room name.

### `/admin/sessions/[id]` — Session detail

- Metadata card: start time, end time, duration, turn count, all usage metrics, room ID, session UUID
- Full transcript rendered as a colour-coded chat log (user turns vs assistant turns), with per-turn timestamps

---

## File reference

```
frontend/
├── middleware.ts                          # Route protection + session refresh
├── lib/supabase/
│   ├── server.ts                          # SSR Supabase client (cookies)
│   └── client.ts                          # Browser Supabase client
└── app/
    ├── api/auth/callback/route.ts         # Email confirmation handler
    └── admin/
        ├── layout.tsx                     # Nav bar + role gate
        ├── actions.ts                     # Sign-out server action
        ├── page.tsx                       # Sessions list
        ├── login/
        │   ├── page.tsx                   # Sign-in / sign-up form
        │   └── actions.ts                 # Rate-limited auth server actions
        └── sessions/[id]/
            └── page.tsx                   # Session detail + transcript

supabase/
├── migrations/
│   └── 20260427000000_admin_rls_policies.sql   # RLS + view grant
└── scripts/
    └── grant_admin.sql                    # Edit email and run to grant admin role
```
