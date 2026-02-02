# Supabase Migration Guide

## Overview

This folder contains Supabase SQL migration files for the voice agent conversation tracking system. These migrations create tables, indexes, RLS policies, views, and analytics functions.

## Migration Files

### 1. `20260202000000_create_conversation_tables.sql`
**Purpose**: Creates the core database schema

**Tables Created**:
- `conversation_sessions` - Tracks voice agent sessions
- `conversation_messages` - Stores individual messages (transcript)
- `session_usage_metrics` - Tracks AI service usage and costs

**Features**:
- ✅ UUID primary keys
- ✅ Foreign key relationships with CASCADE delete
- ✅ Performance indexes
- ✅ Row Level Security (RLS) policies
- ✅ Automatic `updated_at` timestamp triggers
- ✅ Summary view for quick analytics

### 2. `20260202000001_add_analytics_functions.sql`
**Purpose**: Adds SQL functions for analytics and reporting

**Functions Created**:
- `calculate_session_cost()` - Calculate estimated cost per session
- `get_daily_stats()` - Daily session statistics
- `get_language_distribution()` - Language usage analytics
- `get_session_transcript()` - Retrieve full transcript
- `get_top_cost_sessions()` - Find highest cost sessions
- `cleanup_old_sessions()` - Data retention management
- `get_session_performance()` - Response time metrics

---

## How to Run Migrations

### Option 1: Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Navigate to SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Run Migration 1**
   - Copy contents of `20260202000000_create_conversation_tables.sql`
   - Paste into the SQL editor
   - Click "Run" or press `Ctrl+Enter`
   - ✅ Verify success message

4. **Run Migration 2**
   - Copy contents of `20260202000001_add_analytics_functions.sql`
   - Paste into the SQL editor
   - Click "Run" or press `Ctrl+Enter`
   - ✅ Verify success message

5. **Verify Tables**
   - Go to "Table Editor" in the sidebar
   - You should see:
     - `conversation_sessions`
     - `conversation_messages`
     - `session_usage_metrics`

### Option 2: Supabase CLI

1. **Install Supabase CLI** (if not already installed)
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**
   ```bash
   supabase login
   ```

3. **Link to your project**
   ```bash
   supabase link --project-ref your-project-ref
   ```

4. **Run migrations**
   ```bash
   supabase db push
   ```

### Option 3: psql (Direct Database Connection)

1. **Get connection string** from Supabase Dashboard → Settings → Database

2. **Run migrations**
   ```bash
   psql "postgres://postgres:[password]@[host]:5432/postgres" -f supabase/migrations/20260202000000_create_conversation_tables.sql
   psql "postgres://postgres:[password]@[host]:5432/postgres" -f supabase/migrations/20260202000001_add_analytics_functions.sql
   ```

---

## Verify Installation

Run this query in Supabase SQL Editor to verify all tables exist:

```sql
SELECT 
    schemaname, 
    tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
    'conversation_sessions', 
    'conversation_messages', 
    'session_usage_metrics'
)
ORDER BY tablename;
```

Expected output:
```
schemaname | tablename
-----------+---------------------------
public     | conversation_messages
public     | conversation_sessions
public     | session_usage_metrics
```

Verify functions:
```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_type = 'FUNCTION'
AND routine_name LIKE 'get_%' OR routine_name LIKE 'calculate_%' OR routine_name LIKE 'cleanup_%'
ORDER BY routine_name;
```

---

## Using the Schema

### Insert Sample Data

```sql
-- Create a session
INSERT INTO conversation_sessions (room_name, started_at, ended_at, duration_seconds)
VALUES ('test_room_123', NOW() - INTERVAL '5 minutes', NOW(), 300)
RETURNING id;

-- Insert messages (use the returned session_id)
INSERT INTO conversation_messages (session_id, role, content, language, timestamp)
VALUES 
    ('SESSION_ID_HERE', 'user', 'Hello!', 'en', NOW() - INTERVAL '5 minutes'),
    ('SESSION_ID_HERE', 'assistant', 'Hi! How can I help?', 'en', NOW() - INTERVAL '4 minutes 50 seconds');

-- Insert usage metrics
INSERT INTO session_usage_metrics (session_id, llm_prompt_tokens, llm_completion_tokens, tts_characters_count)
VALUES ('SESSION_ID_HERE', 150, 30, 25);
```

### Query Examples

**Get all sessions from today:**
```sql
SELECT * FROM conversation_sessions 
WHERE started_at >= CURRENT_DATE
ORDER BY started_at DESC;
```

**Get session with transcript:**
```sql
SELECT * FROM get_session_transcript('SESSION_ID_HERE');
```

**Get daily stats for last 30 days:**
```sql
SELECT * FROM get_daily_stats();
```

**Get language distribution:**
```sql
SELECT * FROM get_language_distribution(30);
```

**Get top 10 most expensive sessions:**
```sql
SELECT * FROM get_top_cost_sessions(10, 30);
```

**Calculate cost for a specific session:**
```sql
SELECT calculate_session_cost('SESSION_ID_HERE');
```

**View session summary:**
```sql
SELECT * FROM session_summaries 
ORDER BY started_at DESC 
LIMIT 10;
```

---

## Security Notes

### Row Level Security (RLS)

RLS is **enabled by default** on all tables. The migration creates two sets of policies:

1. **Service Role**: Full access (used by your agent)
   - Can read/write all data
   - Use `SUPABASE_SERVICE_KEY` in your agent

2. **Authenticated Users**: Read-only access to their own sessions
   - Can only view sessions where `user_id = auth.uid()`
   - Use for frontend if implementing user-specific transcript viewing

### Modifying RLS Policies

If you want all authenticated users to see all sessions:
```sql
DROP POLICY "Users can view own sessions" ON conversation_sessions;

CREATE POLICY "Authenticated users can view all sessions"
ON conversation_sessions
FOR SELECT
TO authenticated
USING (true);
```

If you want to disable RLS (NOT recommended):
```sql
ALTER TABLE conversation_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE session_usage_metrics DISABLE ROW LEVEL SECURITY;
```

---

## Data Retention

### Manual Cleanup

Clean up sessions older than 90 days (dry run):
```sql
SELECT * FROM cleanup_old_sessions(90, true);
```

Actually delete old sessions:
```sql
SELECT * FROM cleanup_old_sessions(90, false);
```

### Automated Cleanup (Optional)

Set up a Supabase Edge Function to run cleanup weekly:

```typescript
// supabase/functions/cleanup/index.ts
import { createClient } from '@supabase/supabase-js'

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  
  const { data, error } = await supabase.rpc('cleanup_old_sessions', {
    p_retention_days: 90,
    p_dry_run: false
  })
  
  return new Response(JSON.stringify({ data, error }))
})
```

Schedule with a cron job or Supabase scheduler.

---

## Migration Rollback

If you need to undo these migrations:

```sql
-- Drop functions
DROP FUNCTION IF EXISTS calculate_session_cost(UUID);
DROP FUNCTION IF EXISTS get_daily_stats(DATE, DATE);
DROP FUNCTION IF EXISTS get_language_distribution(INTEGER);
DROP FUNCTION IF EXISTS get_session_transcript(UUID);
DROP FUNCTION IF EXISTS get_top_cost_sessions(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS cleanup_old_sessions(INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS get_session_performance(UUID);
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop views
DROP VIEW IF EXISTS session_summaries;

-- Drop tables (CASCADE will delete dependent data)
DROP TABLE IF EXISTS session_usage_metrics CASCADE;
DROP TABLE IF EXISTS conversation_messages CASCADE;
DROP TABLE IF EXISTS conversation_sessions CASCADE;
```

---

## Next Steps After Migration

1. ✅ **Run migrations** using one of the methods above
2. ✅ **Verify tables** exist in Supabase Dashboard
3. ✅ **Get API keys** from Supabase Dashboard → Settings → API
   - Copy `URL`
   - Copy `service_role` key (keep secret!)
4. ✅ **Add to Railway** environment variables:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_KEY=your-service-role-key
   ```
5. ✅ **Implement Python integration** following `SUPABASE_TRANSCRIPT_INTEGRATION.md`
6. ✅ **Test** with a conversation and verify data appears in Supabase

---

## Troubleshooting

### Error: "permission denied for table"
**Solution**: Make sure you're using the `service_role` key, not the `anon` key

### Error: "relation already exists"
**Solution**: Tables already created. Check existing schema or drop tables first

### Error: "function does not exist"
**Solution**: Run migration 2 (analytics functions) after migration 1

### No data appearing in tables
**Solution**: 
1. Check Python agent has correct `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
2. Verify RLS policies allow service role to insert
3. Check agent logs for Supabase errors

---

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Python Integration Guide](../livekit_agent_python/SUPABASE_TRANSCRIPT_INTEGRATION.md)
