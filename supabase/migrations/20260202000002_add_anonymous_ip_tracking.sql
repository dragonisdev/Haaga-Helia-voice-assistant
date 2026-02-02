-- Migration: Update conversation tables for anonymous usage with IP tracking
-- Description: Make user_id optional and add IP tracking for rate limiting
-- Created: 2026-02-02

-- Add client_ip column to conversation_sessions
ALTER TABLE conversation_sessions 
ADD COLUMN IF NOT EXISTS client_ip TEXT;

-- Add index on client_ip for rate limiting queries
CREATE INDEX IF NOT EXISTS idx_sessions_client_ip_started 
ON conversation_sessions(client_ip, started_at DESC);

-- Add index on started_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_sessions_started_at 
ON conversation_sessions(started_at DESC);

-- Make user_id optional (it already is, but adding comment for clarity)
COMMENT ON COLUMN conversation_sessions.user_id IS 'Optional user identifier - NULL for anonymous sessions';
COMMENT ON COLUMN conversation_sessions.client_ip IS 'Client IP address for rate limiting and analytics (retained for 90 days)';

-- ============================================================================
-- Function: Get recent session count by IP (for rate limiting)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_session_count_by_ip(
    p_client_ip TEXT,
    p_hours_ago INTEGER DEFAULT 1
) RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM conversation_sessions
    WHERE client_ip = p_client_ip
    AND started_at >= NOW() - (p_hours_ago || ' hours')::INTERVAL;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_session_count_by_ip IS 'Get count of sessions from an IP within specified hours (for rate limiting)';

-- ============================================================================
-- Function: Cleanup old IP data (GDPR compliance)
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_old_ip_data(
    p_retention_days INTEGER DEFAULT 90
) RETURNS INTEGER AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    -- Anonymize IP addresses older than retention period
    UPDATE conversation_sessions
    SET client_ip = 'anonymized'
    WHERE started_at < NOW() - (p_retention_days || ' days')::INTERVAL
    AND client_ip != 'anonymized'
    AND client_ip IS NOT NULL;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_ip_data IS 'Anonymize IP addresses older than retention period (default 90 days)';

-- ============================================================================
-- Update RLS policies for anonymous usage
-- ============================================================================

-- Drop old policies that require user_id
DROP POLICY IF EXISTS "Users can view own sessions" ON conversation_sessions;
DROP POLICY IF EXISTS "Users can view own messages" ON conversation_messages;
DROP POLICY IF EXISTS "Users can view own usage metrics" ON session_usage_metrics;

-- Policy: Public can view their own recent sessions by IP (for showing user their conversation history)
CREATE POLICY "Users can view recent sessions by IP"
ON conversation_sessions
FOR SELECT
TO anon, authenticated
USING (
    client_ip = current_setting('request.headers', true)::json->>'x-forwarded-for'
    OR (auth.uid()::text = user_id AND user_id IS NOT NULL)
);

-- Policy: Public can view messages from their IP's sessions
CREATE POLICY "Users can view messages from their sessions"
ON conversation_messages
FOR SELECT
TO anon, authenticated
USING (
    session_id IN (
        SELECT id FROM conversation_sessions 
        WHERE client_ip = current_setting('request.headers', true)::json->>'x-forwarded-for'
        OR (auth.uid()::text = user_id AND user_id IS NOT NULL)
    )
);

-- Policy: Public can view usage metrics from their sessions
CREATE POLICY "Users can view usage from their sessions"
ON session_usage_metrics
FOR SELECT
TO anon, authenticated
USING (
    session_id IN (
        SELECT id FROM conversation_sessions 
        WHERE client_ip = current_setting('request.headers', true)::json->>'x-forwarded-for'
        OR (auth.uid()::text = user_id AND user_id IS NOT NULL)
    )
);

-- ============================================================================
-- Analytics views (admin only)
-- ============================================================================

CREATE OR REPLACE VIEW v_ip_usage_stats AS
SELECT 
    client_ip,
    COUNT(*) as total_sessions,
    COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '1 hour') as sessions_last_hour,
    COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '24 hours') as sessions_last_day,
    MAX(started_at) as last_session_at,
    MIN(started_at) as first_session_at
FROM conversation_sessions
WHERE client_ip IS NOT NULL AND client_ip != 'anonymized'
GROUP BY client_ip
ORDER BY total_sessions DESC;

COMMENT ON VIEW v_ip_usage_stats IS 'IP usage statistics for monitoring and abuse detection';

-- ============================================================================
-- Scheduled cleanup (run daily via pg_cron or external scheduler)
-- ============================================================================
-- Example: SELECT cleanup_old_ip_data(90); -- Run this daily
