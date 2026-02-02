-- ============================================================================
-- EXAMPLE QUERIES for Voice Agent Conversation Analytics
-- Description: Practical SQL queries for analyzing conversation data
-- ============================================================================

-- ============================================================================
-- BASIC QUERIES
-- ============================================================================

-- Get all sessions from today
SELECT 
    id,
    room_name,
    started_at,
    ended_at,
    duration_seconds
FROM conversation_sessions 
WHERE started_at >= CURRENT_DATE
ORDER BY started_at DESC;

-- Get session with full transcript
SELECT 
    s.room_name,
    s.started_at,
    m.role,
    m.content,
    m.language,
    m.timestamp
FROM conversation_sessions s
JOIN conversation_messages m ON s.id = m.session_id
WHERE s.id = 'YOUR-SESSION-ID-HERE'
ORDER BY m.timestamp ASC;

-- Get latest 10 sessions with message counts
SELECT * FROM session_summaries LIMIT 10;

-- ============================================================================
-- ANALYTICS QUERIES
-- ============================================================================

-- Daily session volume for last 30 days
SELECT * FROM get_daily_stats(CURRENT_DATE - 30, CURRENT_DATE);

-- Language distribution for last 7 days
SELECT * FROM get_language_distribution(7);

-- Top 10 most expensive sessions this month
SELECT * FROM get_top_cost_sessions(10, 30);

-- Sessions by hour of day (find peak usage times)
SELECT 
    EXTRACT(HOUR FROM started_at) as hour,
    COUNT(*) as session_count,
    AVG(duration_seconds)::INTEGER as avg_duration,
    SUM(COALESCE(u.total_cost_usd, 0))::NUMERIC(10, 4) as total_cost
FROM conversation_sessions s
LEFT JOIN session_usage_metrics u ON s.id = u.session_id
WHERE started_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY EXTRACT(HOUR FROM started_at)
ORDER BY hour;

-- Average session duration by day of week
SELECT 
    TO_CHAR(started_at, 'Day') as day_of_week,
    COUNT(*) as sessions,
    AVG(duration_seconds)::INTEGER as avg_duration_seconds,
    AVG(duration_seconds / 60.0)::NUMERIC(10, 1) as avg_duration_minutes
FROM conversation_sessions
WHERE started_at >= CURRENT_DATE - INTERVAL '30 days'
AND duration_seconds IS NOT NULL
GROUP BY TO_CHAR(started_at, 'Day'), EXTRACT(DOW FROM started_at)
ORDER BY EXTRACT(DOW FROM started_at);

-- ============================================================================
-- COST ANALYSIS
-- ============================================================================

-- Total cost by day for last 30 days
SELECT 
    DATE(s.started_at) as date,
    COUNT(s.id) as sessions,
    SUM(u.total_cost_usd)::NUMERIC(10, 4) as total_cost,
    AVG(u.total_cost_usd)::NUMERIC(10, 4) as avg_cost_per_session
FROM conversation_sessions s
JOIN session_usage_metrics u ON s.id = u.session_id
WHERE s.started_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(s.started_at)
ORDER BY DATE(s.started_at) DESC;

-- Monthly cost breakdown by service
SELECT 
    DATE_TRUNC('month', s.started_at) as month,
    COUNT(DISTINCT s.id) as total_sessions,
    -- LLM costs
    SUM((u.llm_prompt_tokens / 1000000.0) * 0.15)::NUMERIC(10, 4) as llm_input_cost,
    SUM((u.llm_completion_tokens / 1000000.0) * 0.60)::NUMERIC(10, 4) as llm_output_cost,
    -- TTS costs
    SUM((u.tts_characters_count / 1000.0) * 0.30)::NUMERIC(10, 4) as tts_cost,
    -- STT costs
    SUM((u.stt_audio_duration / 60.0) * 0.00036)::NUMERIC(10, 4) as stt_cost,
    -- Total
    SUM(u.total_cost_usd)::NUMERIC(10, 4) as total_cost
FROM conversation_sessions s
JOIN session_usage_metrics u ON s.id = u.session_id
WHERE s.started_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months')
GROUP BY DATE_TRUNC('month', s.started_at)
ORDER BY month DESC;

-- Find high-cost outliers (> 2 standard deviations above mean)
WITH cost_stats AS (
    SELECT 
        AVG(total_cost_usd) as mean_cost,
        STDDEV(total_cost_usd) as stddev_cost
    FROM session_usage_metrics
    WHERE total_cost_usd > 0
)
SELECT 
    s.id,
    s.room_name,
    s.started_at,
    s.duration_seconds,
    u.total_cost_usd,
    (u.total_cost_usd - cs.mean_cost) / NULLIF(cs.stddev_cost, 0) as z_score
FROM conversation_sessions s
JOIN session_usage_metrics u ON s.id = u.session_id
CROSS JOIN cost_stats cs
WHERE u.total_cost_usd > (cs.mean_cost + (2 * cs.stddev_cost))
ORDER BY u.total_cost_usd DESC;

-- ============================================================================
-- CONVERSATION QUALITY METRICS
-- ============================================================================

-- Average messages per session
SELECT 
    COUNT(DISTINCT s.id) as total_sessions,
    COUNT(m.id) as total_messages,
    (COUNT(m.id)::FLOAT / COUNT(DISTINCT s.id))::NUMERIC(10, 1) as avg_messages_per_session
FROM conversation_sessions s
LEFT JOIN conversation_messages m ON s.id = m.session_id
WHERE s.started_at >= CURRENT_DATE - INTERVAL '30 days';

-- Session completion rate (sessions with > 1 turn)
SELECT 
    COUNT(*) FILTER (WHERE message_count > 1) as completed_sessions,
    COUNT(*) as total_sessions,
    (COUNT(*) FILTER (WHERE message_count > 1)::FLOAT / COUNT(*))::NUMERIC(10, 3) as completion_rate
FROM (
    SELECT s.id, COUNT(m.id) as message_count
    FROM conversation_sessions s
    LEFT JOIN conversation_messages m ON s.id = m.session_id
    WHERE s.started_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY s.id
) session_stats;

-- Average response time (time between user and agent turns)
SELECT 
    AVG(time_diff)::NUMERIC(10, 2) as avg_response_seconds,
    MIN(time_diff)::NUMERIC(10, 2) as min_response_seconds,
    MAX(time_diff)::NUMERIC(10, 2) as max_response_seconds,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY time_diff)::NUMERIC(10, 2) as median_response_seconds
FROM (
    SELECT 
        EXTRACT(EPOCH FROM (
            m2.timestamp - m1.timestamp
        )) as time_diff
    FROM conversation_messages m1
    JOIN conversation_messages m2 ON m1.session_id = m2.session_id
    JOIN conversation_sessions s ON m1.session_id = s.id
    WHERE m1.role = 'user'
    AND m2.role = 'assistant'
    AND m2.timestamp > m1.timestamp
    AND m2.timestamp = (
        SELECT MIN(timestamp)
        FROM conversation_messages
        WHERE session_id = m1.session_id
        AND role = 'assistant'
        AND timestamp > m1.timestamp
    )
    AND s.started_at >= CURRENT_DATE - INTERVAL '7 days'
) response_times;

-- ============================================================================
-- LANGUAGE INSIGHTS
-- ============================================================================

-- Most common language pairs (user switches languages)
WITH language_switches AS (
    SELECT 
        m.session_id,
        m.language as from_lang,
        LEAD(m.language) OVER (PARTITION BY m.session_id ORDER BY m.timestamp) as to_lang
    FROM conversation_messages m
    WHERE m.role = 'user'
    AND m.language IS NOT NULL
)
SELECT 
    from_lang,
    to_lang,
    COUNT(*) as switch_count
FROM language_switches
WHERE from_lang != to_lang
GROUP BY from_lang, to_lang
ORDER BY switch_count DESC
LIMIT 10;

-- Sessions with multilingual conversations
SELECT 
    s.id,
    s.room_name,
    s.started_at,
    STRING_AGG(DISTINCT m.language, ', ' ORDER BY m.language) as languages_used,
    COUNT(DISTINCT m.language) as language_count
FROM conversation_sessions s
JOIN conversation_messages m ON s.id = m.session_id
WHERE m.language IS NOT NULL
AND s.started_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY s.id
HAVING COUNT(DISTINCT m.language) > 1
ORDER BY language_count DESC;

-- ============================================================================
-- USER BEHAVIOR
-- ============================================================================

-- Sessions by length category
SELECT 
    CASE 
        WHEN duration_seconds < 30 THEN '< 30s (Quick)'
        WHEN duration_seconds < 120 THEN '30s - 2m (Short)'
        WHEN duration_seconds < 300 THEN '2m - 5m (Medium)'
        WHEN duration_seconds < 600 THEN '5m - 10m (Long)'
        ELSE '> 10m (Extended)'
    END as duration_category,
    COUNT(*) as session_count,
    AVG(message_count)::NUMERIC(10, 1) as avg_messages
FROM (
    SELECT 
        s.id,
        s.duration_seconds,
        COUNT(m.id) as message_count
    FROM conversation_sessions s
    LEFT JOIN conversation_messages m ON s.id = m.session_id
    WHERE s.duration_seconds IS NOT NULL
    AND s.started_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY s.id
) session_data
GROUP BY duration_category
ORDER BY MIN(duration_seconds);

-- Busiest hours of the day
SELECT 
    EXTRACT(HOUR FROM started_at) as hour,
    COUNT(*) as sessions,
    AVG(duration_seconds)::INTEGER as avg_duration,
    SUM(message_count) as total_messages
FROM (
    SELECT 
        s.started_at,
        s.duration_seconds,
        COUNT(m.id) as message_count
    FROM conversation_sessions s
    LEFT JOIN conversation_messages m ON s.id = m.session_id
    WHERE s.started_at >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY s.id
) hourly_stats
GROUP BY EXTRACT(HOUR FROM started_at)
ORDER BY hour;

-- ============================================================================
-- DATA QUALITY CHECKS
-- ============================================================================

-- Find sessions with no messages (potential errors)
SELECT 
    s.id,
    s.room_name,
    s.started_at,
    s.ended_at,
    s.duration_seconds
FROM conversation_sessions s
LEFT JOIN conversation_messages m ON s.id = m.session_id
WHERE m.id IS NULL
AND s.started_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY s.started_at DESC;

-- Find sessions with missing usage metrics
SELECT 
    s.id,
    s.room_name,
    s.started_at,
    COUNT(m.id) as message_count
FROM conversation_sessions s
LEFT JOIN conversation_messages m ON s.id = m.session_id
LEFT JOIN session_usage_metrics u ON s.id = u.session_id
WHERE u.id IS NULL
AND s.started_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY s.id
ORDER BY s.started_at DESC;

-- Find sessions with unusually high token usage
SELECT 
    s.id,
    s.room_name,
    s.started_at,
    s.duration_seconds,
    u.llm_prompt_tokens + u.llm_completion_tokens as total_tokens,
    (u.llm_prompt_tokens + u.llm_completion_tokens)::FLOAT / NULLIF(s.duration_seconds, 0) as tokens_per_second
FROM conversation_sessions s
JOIN session_usage_metrics u ON s.id = u.session_id
WHERE (u.llm_prompt_tokens + u.llm_completion_tokens) > 10000
AND s.started_at >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY total_tokens DESC;

-- ============================================================================
-- EXPORT QUERIES
-- ============================================================================

-- Export full session data for external analysis (CSV-friendly)
SELECT 
    s.id as session_id,
    s.room_name,
    s.started_at,
    s.ended_at,
    s.duration_seconds,
    COUNT(m.id) as message_count,
    COALESCE(u.llm_prompt_tokens, 0) as llm_prompt_tokens,
    COALESCE(u.llm_completion_tokens, 0) as llm_completion_tokens,
    COALESCE(u.tts_characters_count, 0) as tts_characters,
    COALESCE(u.tts_audio_duration, 0) as tts_duration,
    COALESCE(u.stt_audio_duration, 0) as stt_duration,
    COALESCE(u.total_cost_usd, 0) as total_cost_usd
FROM conversation_sessions s
LEFT JOIN conversation_messages m ON s.id = m.session_id
LEFT JOIN session_usage_metrics u ON s.id = u.session_id
WHERE s.started_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY s.id, u.llm_prompt_tokens, u.llm_completion_tokens, 
         u.tts_characters_count, u.tts_audio_duration, 
         u.stt_audio_duration, u.total_cost_usd
ORDER BY s.started_at DESC;

-- Export message-level data for transcript analysis
SELECT 
    s.room_name,
    s.started_at as session_start,
    m.role,
    m.content,
    m.language,
    m.timestamp,
    EXTRACT(EPOCH FROM (m.timestamp - s.started_at))::INTEGER as seconds_from_start
FROM conversation_sessions s
JOIN conversation_messages m ON s.id = m.session_id
WHERE s.started_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY s.started_at DESC, m.timestamp ASC;
