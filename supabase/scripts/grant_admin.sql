-- ============================================================
-- Grant admin role to a Supabase Auth user
--
-- Run this in the Supabase SQL editor (requires service role).
--
-- Replace 'admin@example.com' with the target user's email.
-- The user must have already signed up and confirmed their email
-- before running this script.
--
-- The role is stored in app_metadata (NOT user_metadata), so the
-- user cannot modify it themselves. It is embedded in their JWT
-- and verified on every request without an extra DB lookup.
-- ============================================================

UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'admin@example.com';

-- Verify the change:
-- SELECT id, email, raw_app_meta_data FROM auth.users WHERE email = 'admin@example.com';

-- To revoke admin access:
-- UPDATE auth.users
-- SET raw_app_meta_data = raw_app_meta_data - 'role'
-- WHERE email = 'admin@example.com';
