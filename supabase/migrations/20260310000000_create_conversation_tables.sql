-- Conversation tracking schema for anonymous voice agent sessions
-- Tables: conversation_sessions, conversation_messages, session_usage_metrics

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLES
-- ============================================================================

CREATE TABLE conversation_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_name TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversation_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    language TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE session_usage_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
    llm_prompt_tokens INTEGER DEFAULT 0,
    llm_completion_tokens INTEGER DEFAULT 0,
    tts_characters_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_sessions_room_name ON conversation_sessions(room_name);
CREATE INDEX idx_sessions_started_at ON conversation_sessions(started_at DESC);
CREATE INDEX idx_messages_session_id ON conversation_messages(session_id);
CREATE INDEX idx_messages_timestamp ON conversation_messages(timestamp);
CREATE INDEX idx_usage_session_id ON session_usage_metrics(session_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_usage_metrics ENABLE ROW LEVEL SECURITY;

-- Service role (used by the agent) has full access
CREATE POLICY "Service role full access on sessions"
    ON conversation_sessions FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on messages"
    ON conversation_messages FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on usage"
    ON session_usage_metrics FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================================================
-- ANALYTICS HELPERS
-- ============================================================================

-- Daily stats for the last N days
CREATE OR REPLACE FUNCTION get_daily_stats(
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
    day DATE,
    total_sessions BIGINT,
    total_messages BIGINT,
    avg_duration_seconds NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        DATE(s.started_at) AS day,
        COUNT(DISTINCT s.id) AS total_sessions,
        COUNT(m.id) AS total_messages,
        AVG(s.duration_seconds)::NUMERIC(10,2) AS avg_duration_seconds
    FROM conversation_sessions s
    LEFT JOIN conversation_messages m ON s.id = m.session_id
    WHERE DATE(s.started_at) BETWEEN p_start_date AND p_end_date
    GROUP BY DATE(s.started_at)
    ORDER BY DATE(s.started_at) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Language distribution
CREATE OR REPLACE FUNCTION get_language_distribution(
    p_days INTEGER DEFAULT 30
) RETURNS TABLE (
    language TEXT,
    message_count BIGINT,
    percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH counts AS (
        SELECT COALESCE(m.language, 'unknown') AS lang, COUNT(*) AS cnt
        FROM conversation_messages m
        JOIN conversation_sessions s ON m.session_id = s.id
        WHERE s.started_at >= CURRENT_DATE - (p_days || ' days')::INTERVAL
          AND m.role = 'user'
        GROUP BY lang
    ), total AS (SELECT SUM(cnt) AS t FROM counts)
    SELECT c.lang, c.cnt, ROUND((c.cnt::NUMERIC / t.t) * 100, 2)
    FROM counts c, total t
    ORDER BY c.cnt DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Data retention cleanup (default 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_sessions(
    p_retention_days INTEGER DEFAULT 90,
    p_dry_run BOOLEAN DEFAULT true
) RETURNS TABLE (sessions_affected BIGINT) AS $$
DECLARE v_count BIGINT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM conversation_sessions
    WHERE started_at < CURRENT_DATE - (p_retention_days || ' days')::INTERVAL;

    IF NOT p_dry_run THEN
        DELETE FROM conversation_sessions
        WHERE started_at < CURRENT_DATE - (p_retention_days || ' days')::INTERVAL;
    END IF;

    RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql;

-- Summary view
CREATE OR REPLACE VIEW session_summaries AS
SELECT
    s.id, s.room_name, s.started_at, s.ended_at, s.duration_seconds,
    COUNT(m.id) AS message_count,
    COALESCE(u.llm_prompt_tokens, 0) AS llm_prompt_tokens,
    COALESCE(u.llm_completion_tokens, 0) AS llm_completion_tokens,
    COALESCE(u.tts_characters_count, 0) AS tts_characters_count
FROM conversation_sessions s
LEFT JOIN conversation_messages m ON s.id = m.session_id
LEFT JOIN session_usage_metrics u ON s.id = u.session_id
GROUP BY s.id, u.llm_prompt_tokens, u.llm_completion_tokens, u.tts_characters_count
ORDER BY s.started_at DESC;

GRANT SELECT ON session_summaries TO service_role;
