-- Migration: Create voice agent conversation tracking tables
-- Description: Tables for storing conversation sessions, messages, and usage metrics
-- Created: 2026-02-02

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLE: conversation_sessions
-- Purpose: Track voice agent conversation sessions with metadata
-- ============================================================================
CREATE TABLE conversation_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_name TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    user_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE conversation_sessions IS 'Voice agent conversation sessions';
COMMENT ON COLUMN conversation_sessions.room_name IS 'LiveKit room name';
COMMENT ON COLUMN conversation_sessions.user_id IS 'Optional user identifier for tracking';
COMMENT ON COLUMN conversation_sessions.metadata IS 'Additional session data (JSON)';

-- ============================================================================
-- TABLE: conversation_messages
-- Purpose: Store individual user and agent messages (transcript)
-- ============================================================================
CREATE TABLE conversation_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    language TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE conversation_messages IS 'Individual messages in voice agent conversations';
COMMENT ON COLUMN conversation_messages.role IS 'Speaker role: user or assistant';
COMMENT ON COLUMN conversation_messages.language IS 'Detected language code (e.g., en, es, zh)';

-- ============================================================================
-- TABLE: session_usage_metrics
-- Purpose: Track AI service usage and costs per session
-- ============================================================================
CREATE TABLE session_usage_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
    llm_prompt_tokens INTEGER DEFAULT 0,
    llm_completion_tokens INTEGER DEFAULT 0,
    tts_characters_count INTEGER DEFAULT 0,
    tts_audio_duration FLOAT DEFAULT 0,
    stt_audio_duration FLOAT DEFAULT 0,
    total_cost_usd DECIMAL(10, 4),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE session_usage_metrics IS 'AI service usage metrics and cost tracking';
COMMENT ON COLUMN session_usage_metrics.total_cost_usd IS 'Estimated total cost in USD';

-- ============================================================================
-- INDEXES for performance
-- ============================================================================

-- Sessions indexes
CREATE INDEX idx_sessions_room_name ON conversation_sessions(room_name);
CREATE INDEX idx_sessions_started_at ON conversation_sessions(started_at DESC);
CREATE INDEX idx_sessions_user_id ON conversation_sessions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_sessions_ended_at ON conversation_sessions(ended_at DESC NULLS LAST);

-- Messages indexes
CREATE INDEX idx_messages_session_id ON conversation_messages(session_id);
CREATE INDEX idx_messages_timestamp ON conversation_messages(timestamp);
CREATE INDEX idx_messages_role ON conversation_messages(role);
CREATE INDEX idx_messages_language ON conversation_messages(language) WHERE language IS NOT NULL;

-- Usage metrics indexes
CREATE INDEX idx_usage_session_id ON session_usage_metrics(session_id);
CREATE INDEX idx_usage_cost ON session_usage_metrics(total_cost_usd DESC) WHERE total_cost_usd IS NOT NULL;

-- ============================================================================
-- TRIGGERS for automatic timestamp updates
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for conversation_sessions
CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON conversation_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_usage_metrics ENABLE ROW LEVEL SECURITY;

-- Policy: Service role has full access
CREATE POLICY "Service role full access on sessions"
ON conversation_sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on messages"
ON conversation_messages
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on usage"
ON session_usage_metrics
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy: Authenticated users can view their own sessions (if user_id is set)
CREATE POLICY "Users can view own sessions"
ON conversation_sessions
FOR SELECT
TO authenticated
USING (auth.uid()::text = user_id);

CREATE POLICY "Users can view own messages"
ON conversation_messages
FOR SELECT
TO authenticated
USING (
    session_id IN (
        SELECT id FROM conversation_sessions 
        WHERE auth.uid()::text = user_id
    )
);

CREATE POLICY "Users can view own usage metrics"
ON session_usage_metrics
FOR SELECT
TO authenticated
USING (
    session_id IN (
        SELECT id FROM conversation_sessions 
        WHERE auth.uid()::text = user_id
    )
);

-- ============================================================================
-- VIEWS for convenient querying
-- ============================================================================

CREATE OR REPLACE VIEW session_summaries AS
SELECT 
    s.id,
    s.room_name,
    s.user_id,
    s.started_at,
    s.ended_at,
    s.duration_seconds,
    COUNT(m.id) as message_count,
    COALESCE(u.llm_prompt_tokens, 0) as llm_prompt_tokens,
    COALESCE(u.llm_completion_tokens, 0) as llm_completion_tokens,
    COALESCE(u.tts_characters_count, 0) as tts_characters_count,
    COALESCE(u.tts_audio_duration, 0) as tts_audio_duration,
    COALESCE(u.stt_audio_duration, 0) as stt_audio_duration,
    COALESCE(u.total_cost_usd, 0) as total_cost_usd,
    s.created_at
FROM conversation_sessions s
LEFT JOIN conversation_messages m ON s.id = m.session_id
LEFT JOIN session_usage_metrics u ON s.id = u.session_id
GROUP BY s.id, u.llm_prompt_tokens, u.llm_completion_tokens, 
         u.tts_characters_count, u.tts_audio_duration, 
         u.stt_audio_duration, u.total_cost_usd
ORDER BY s.started_at DESC;

COMMENT ON VIEW session_summaries IS 'Summary view of sessions with message counts and metrics';

-- ============================================================================
-- GRANTS (adjust based on your needs)
-- ============================================================================

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant select on views
GRANT SELECT ON session_summaries TO service_role;
GRANT SELECT ON session_summaries TO authenticated;
