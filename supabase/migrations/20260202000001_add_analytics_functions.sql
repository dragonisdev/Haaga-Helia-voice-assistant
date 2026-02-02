-- Migration: Add helpful functions for conversation analytics
-- Description: SQL functions for analyzing conversation data
-- Created: 2026-02-02

-- ============================================================================
-- FUNCTION: Calculate session cost
-- Purpose: Calculate estimated cost for a session based on usage metrics
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_session_cost(
    p_session_id UUID
) RETURNS DECIMAL(10, 4) AS $$
DECLARE
    v_cost DECIMAL(10, 4);
BEGIN
    SELECT 
        -- OpenAI GPT-4o-mini pricing
        ((u.llm_prompt_tokens / 1000000.0) * 0.15) +
        ((u.llm_completion_tokens / 1000000.0) * 0.60) +
        -- ElevenLabs pricing
        ((u.tts_characters_count / 1000.0) * 0.30) +
        -- Gladia pricing
        ((u.stt_audio_duration / 60.0) * 0.00036)
    INTO v_cost
    FROM session_usage_metrics u
    WHERE u.session_id = p_session_id;
    
    RETURN COALESCE(v_cost, 0);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_session_cost IS 'Calculate estimated cost in USD for a session';

-- ============================================================================
-- FUNCTION: Get daily session statistics
-- Purpose: Aggregate session stats by day
-- ============================================================================

CREATE OR REPLACE FUNCTION get_daily_stats(
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
    date DATE,
    total_sessions BIGINT,
    total_messages BIGINT,
    avg_duration_seconds NUMERIC,
    total_cost_usd NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE(s.started_at) as date,
        COUNT(DISTINCT s.id) as total_sessions,
        COUNT(m.id) as total_messages,
        AVG(s.duration_seconds)::NUMERIC(10, 2) as avg_duration_seconds,
        SUM(COALESCE(u.total_cost_usd, 0))::NUMERIC(10, 4) as total_cost_usd
    FROM conversation_sessions s
    LEFT JOIN conversation_messages m ON s.id = m.session_id
    LEFT JOIN session_usage_metrics u ON s.id = u.session_id
    WHERE DATE(s.started_at) BETWEEN p_start_date AND p_end_date
    GROUP BY DATE(s.started_at)
    ORDER BY DATE(s.started_at) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_daily_stats IS 'Get daily session statistics within a date range';

-- ============================================================================
-- FUNCTION: Get language distribution
-- Purpose: Analyze which languages are being used
-- ============================================================================

CREATE OR REPLACE FUNCTION get_language_distribution(
    p_days INTEGER DEFAULT 30
) RETURNS TABLE (
    language TEXT,
    message_count BIGINT,
    percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH language_counts AS (
        SELECT 
            COALESCE(m.language, 'unknown') as lang,
            COUNT(*) as count
        FROM conversation_messages m
        JOIN conversation_sessions s ON m.session_id = s.id
        WHERE s.started_at >= CURRENT_DATE - (p_days || ' days')::INTERVAL
        AND m.role = 'user'
        GROUP BY COALESCE(m.language, 'unknown')
    ),
    total AS (
        SELECT SUM(count) as total_count FROM language_counts
    )
    SELECT 
        lc.lang as language,
        lc.count as message_count,
        ROUND((lc.count::NUMERIC / t.total_count::NUMERIC) * 100, 2) as percentage
    FROM language_counts lc, total t
    ORDER BY lc.count DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_language_distribution IS 'Get distribution of languages used in the last N days';

-- ============================================================================
-- FUNCTION: Get session transcript
-- Purpose: Retrieve full transcript for a session in chronological order
-- ============================================================================

CREATE OR REPLACE FUNCTION get_session_transcript(
    p_session_id UUID
) RETURNS TABLE (
    message_id UUID,
    role TEXT,
    content TEXT,
    language TEXT,
    timestamp TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id as message_id,
        m.role,
        m.content,
        m.language,
        m.timestamp
    FROM conversation_messages m
    WHERE m.session_id = p_session_id
    ORDER BY m.timestamp ASC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_session_transcript IS 'Get chronological transcript for a session';

-- ============================================================================
-- FUNCTION: Get top cost sessions
-- Purpose: Find sessions with highest costs for budget monitoring
-- ============================================================================

CREATE OR REPLACE FUNCTION get_top_cost_sessions(
    p_limit INTEGER DEFAULT 10,
    p_days INTEGER DEFAULT 30
) RETURNS TABLE (
    session_id UUID,
    room_name TEXT,
    started_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    message_count BIGINT,
    total_cost_usd DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as session_id,
        s.room_name,
        s.started_at,
        s.duration_seconds,
        COUNT(m.id) as message_count,
        COALESCE(u.total_cost_usd, 0) as total_cost_usd
    FROM conversation_sessions s
    LEFT JOIN conversation_messages m ON s.id = m.session_id
    LEFT JOIN session_usage_metrics u ON s.id = u.session_id
    WHERE s.started_at >= CURRENT_DATE - (p_days || ' days')::INTERVAL
    GROUP BY s.id, u.total_cost_usd
    ORDER BY total_cost_usd DESC NULLS LAST
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_top_cost_sessions IS 'Get sessions with highest costs in the last N days';

-- ============================================================================
-- FUNCTION: Clean up old sessions
-- Purpose: Archive or delete sessions older than retention period
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_sessions(
    p_retention_days INTEGER DEFAULT 90,
    p_dry_run BOOLEAN DEFAULT true
) RETURNS TABLE (
    sessions_affected BIGINT,
    messages_affected BIGINT,
    metrics_affected BIGINT
) AS $$
DECLARE
    v_cutoff_date TIMESTAMPTZ;
    v_sessions BIGINT;
    v_messages BIGINT;
    v_metrics BIGINT;
BEGIN
    v_cutoff_date := CURRENT_DATE - (p_retention_days || ' days')::INTERVAL;
    
    -- Count what would be deleted
    SELECT COUNT(*) INTO v_sessions
    FROM conversation_sessions
    WHERE started_at < v_cutoff_date;
    
    SELECT COUNT(*) INTO v_messages
    FROM conversation_messages m
    JOIN conversation_sessions s ON m.session_id = s.id
    WHERE s.started_at < v_cutoff_date;
    
    SELECT COUNT(*) INTO v_metrics
    FROM session_usage_metrics u
    JOIN conversation_sessions s ON u.session_id = s.id
    WHERE s.started_at < v_cutoff_date;
    
    -- Actually delete if not dry run
    IF NOT p_dry_run THEN
        DELETE FROM conversation_sessions
        WHERE started_at < v_cutoff_date;
    END IF;
    
    RETURN QUERY SELECT v_sessions, v_messages, v_metrics;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_sessions IS 'Delete sessions older than retention period (use dry_run=false to execute)';

-- ============================================================================
-- FUNCTION: Get session performance metrics
-- Purpose: Calculate average response times and turn-taking metrics
-- ============================================================================

CREATE OR REPLACE FUNCTION get_session_performance(
    p_session_id UUID
) RETURNS TABLE (
    total_turns INTEGER,
    user_turns INTEGER,
    agent_turns INTEGER,
    avg_seconds_between_turns NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH message_times AS (
        SELECT 
            timestamp,
            role,
            LAG(timestamp) OVER (ORDER BY timestamp) as prev_timestamp
        FROM conversation_messages
        WHERE session_id = p_session_id
    )
    SELECT 
        COUNT(*)::INTEGER as total_turns,
        COUNT(*) FILTER (WHERE role = 'user')::INTEGER as user_turns,
        COUNT(*) FILTER (WHERE role = 'assistant')::INTEGER as agent_turns,
        AVG(EXTRACT(EPOCH FROM (timestamp - prev_timestamp)))::NUMERIC(10, 2) as avg_seconds_between_turns
    FROM message_times
    WHERE prev_timestamp IS NOT NULL;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_session_performance IS 'Calculate performance metrics for a session';

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION calculate_session_cost TO service_role;
GRANT EXECUTE ON FUNCTION get_daily_stats TO service_role;
GRANT EXECUTE ON FUNCTION get_language_distribution TO service_role;
GRANT EXECUTE ON FUNCTION get_session_transcript TO service_role;
GRANT EXECUTE ON FUNCTION get_top_cost_sessions TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_sessions TO service_role;
GRANT EXECUTE ON FUNCTION get_session_performance TO service_role;

GRANT EXECUTE ON FUNCTION get_session_transcript TO authenticated;
GRANT EXECUTE ON FUNCTION get_session_performance TO authenticated;
