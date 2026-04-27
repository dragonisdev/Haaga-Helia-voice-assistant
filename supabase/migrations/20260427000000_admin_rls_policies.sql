-- ============================================================
-- Admin RLS Policies for conversation tables
--
-- HOW TO GRANT ADMIN ACCESS TO A USER:
--   Run this SQL in the Supabase SQL editor (as service role):
--
--   UPDATE auth.users
--   SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
--   WHERE email = 'admin@example.com';
--
-- The role is stored in app_metadata (not user_metadata), so users
-- cannot modify it themselves — only the service role can.
-- The claim is embedded in the JWT and verified on every request.
-- ============================================================

-- Helper function: extract admin role from JWT app_metadata.
-- Defined in public schema — the auth schema is reserved for Supabase internals
-- and does not allow user-created functions on managed instances.
-- Note: SECURITY DEFINER is intentionally omitted — it can prevent auth.jwt()
-- from reading the caller's JWT claims in some Supabase configurations.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- Allow authenticated (and anon) roles to execute the function.
-- Without this grant RLS policies that call the function return no rows silently.
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- ============================================================
-- conversation_sessions
-- ============================================================
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;

-- Service role (used by the Python agent) bypasses RLS automatically.
-- This SELECT policy only applies to regular authenticated/anon roles.
CREATE POLICY "admins_can_read_sessions"
  ON conversation_sessions
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- ============================================================
-- conversation_messages
-- ============================================================
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_can_read_messages"
  ON conversation_messages
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- ============================================================
-- session_usage_metrics
-- ============================================================
ALTER TABLE session_usage_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_can_read_usage_metrics"
  ON session_usage_metrics
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- ============================================================
-- documents (RAG table — admin read-only, no public access)
-- ============================================================
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_can_read_documents"
  ON documents
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- ============================================================
-- session_summaries view
-- Views do not support RLS directly, but Postgres enforces the
-- RLS policies of the underlying tables when a non-service role
-- queries through a view — so the policies above are sufficient.
-- We only need to ensure the authenticated role can SELECT it.
-- ============================================================
GRANT SELECT ON session_summaries TO authenticated;
