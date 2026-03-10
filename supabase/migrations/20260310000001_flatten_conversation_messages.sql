-- Migration: flatten conversation_messages to one row per session
-- Instead of individual message rows, store the entire transcript as a JSONB
-- array (turns) plus a plain-text version for easy reading in the database.

-- ============================================================================
-- 1. Replace conversation_messages table
-- ============================================================================

DROP TABLE IF EXISTS conversation_messages CASCADE;

CREATE TABLE conversation_messages (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id     UUID        NOT NULL UNIQUE REFERENCES conversation_sessions(id) ON DELETE CASCADE,
    turns          JSONB       NOT NULL DEFAULT '[]'::jsonb,
    transcript_text TEXT       NOT NULL DEFAULT '',
    message_count  INTEGER     NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Index for joins from session_id
CREATE INDEX idx_messages_session_id ON conversation_messages(session_id);

-- Full-text search index on the plain-text transcript
CREATE INDEX idx_messages_transcript_text ON conversation_messages USING gin(to_tsvector('english', transcript_text));

-- ============================================================================
-- 2. RLS
-- ============================================================================

ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on messages"
    ON conversation_messages FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. Update analytics helpers to work with new schema
-- ============================================================================

-- Daily stats: use message_count column instead of COUNT(individual rows)
CREATE OR REPLACE FUNCTION get_daily_stats(
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date   DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
    day                   DATE,
    total_sessions        BIGINT,
    total_messages        BIGINT,
    avg_duration_seconds  NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        DATE(s.started_at)                           AS day,
        COUNT(DISTINCT s.id)                         AS total_sessions,
        COALESCE(SUM(m.message_count), 0)::BIGINT    AS total_messages,
        AVG(s.duration_seconds)::NUMERIC(10, 2)      AS avg_duration_seconds
    FROM conversation_sessions s
    LEFT JOIN conversation_messages m ON s.id = m.session_id
    WHERE DATE(s.started_at) BETWEEN p_start_date AND p_end_date
    GROUP BY DATE(s.started_at)
    ORDER BY DATE(s.started_at) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Language distribution is no longer available (language was per-message).
-- Replace with a stub that returns an empty result set so existing callers
-- don't error out.
CREATE OR REPLACE FUNCTION get_language_distribution(
    p_days INTEGER DEFAULT 30
) RETURNS TABLE (
    language      TEXT,
    message_count BIGINT,
    percentage    NUMERIC
) AS $$
BEGIN
    -- Language data is no longer stored at the individual message level.
    -- Return empty result set.
    RETURN;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 4. Update session_summaries view
-- ============================================================================

DROP VIEW IF EXISTS session_summaries;

CREATE OR REPLACE VIEW session_summaries AS
SELECT
    s.id,
    s.room_name,
    s.started_at,
    s.ended_at,
    s.duration_seconds,
    COALESCE(m.message_count, 0)              AS message_count,
    COALESCE(u.llm_prompt_tokens, 0)          AS llm_prompt_tokens,
    COALESCE(u.llm_completion_tokens, 0)      AS llm_completion_tokens,
    COALESCE(u.tts_characters_count, 0)       AS tts_characters_count
FROM conversation_sessions s
LEFT JOIN conversation_messages m ON s.id = m.session_id
LEFT JOIN session_usage_metrics u ON s.id = u.session_id
ORDER BY s.started_at DESC;

GRANT SELECT ON session_summaries TO service_role;
