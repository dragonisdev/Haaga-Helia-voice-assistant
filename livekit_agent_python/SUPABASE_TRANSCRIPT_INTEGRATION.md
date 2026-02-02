# Supabase Transcript Integration Guide

## Overview

This guide explains how to save voice agent conversation transcripts to Supabase for future viewing, analytics, and compliance. The implementation captures all user-agent interactions, metadata, and usage statistics automatically.

---

## Architecture

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Session   │────────▶│   Agent (Python) │────────▶│    Supabase     │
│   Events    │  Track  │  Transcript      │  Save   │    Database     │
└─────────────┘         └──────────────────┘         └─────────────────┘
      │                         │                            │
      │                         │                            │
  User Speech              Agent Speech               Persistent Storage
  Agent Speech             Session Metadata           Query & Analytics
  Session End              Usage Metrics              Compliance
```

---

## Database Schema

### 1. Create Supabase Tables

Run this SQL in your Supabase SQL Editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sessions table
CREATE TABLE conversation_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_name TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    user_id TEXT, -- Optional: if you track users
    metadata JSONB, -- Additional session info
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table (transcript)
CREATE TABLE conversation_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES conversation_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    language TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    metadata JSONB, -- Additional message info
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage metrics table
CREATE TABLE session_usage_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES conversation_sessions(id) ON DELETE CASCADE,
    llm_prompt_tokens INTEGER DEFAULT 0,
    llm_completion_tokens INTEGER DEFAULT 0,
    tts_characters_count INTEGER DEFAULT 0,
    tts_audio_duration FLOAT DEFAULT 0,
    stt_audio_duration FLOAT DEFAULT 0,
    total_cost_usd DECIMAL(10, 4), -- Optional: calculated cost
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_sessions_room_name ON conversation_sessions(room_name);
CREATE INDEX idx_sessions_started_at ON conversation_sessions(started_at DESC);
CREATE INDEX idx_messages_session_id ON conversation_messages(session_id);
CREATE INDEX idx_messages_timestamp ON conversation_messages(timestamp);
CREATE INDEX idx_usage_session_id ON session_usage_metrics(session_id);

-- Enable Row Level Security (RLS)
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_usage_metrics ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust based on your auth setup)
-- For now, allow service role to read/write everything
CREATE POLICY "Service role can do everything on sessions"
ON conversation_sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can do everything on messages"
ON conversation_messages
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can do everything on usage"
ON session_usage_metrics
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Optional: Create view for easy querying
CREATE VIEW session_summaries AS
SELECT 
    s.id,
    s.room_name,
    s.started_at,
    s.ended_at,
    s.duration_seconds,
    COUNT(m.id) as message_count,
    u.llm_prompt_tokens,
    u.llm_completion_tokens,
    u.tts_characters_count,
    u.total_cost_usd
FROM conversation_sessions s
LEFT JOIN conversation_messages m ON s.id = m.session_id
LEFT JOIN session_usage_metrics u ON s.id = u.session_id
GROUP BY s.id, u.llm_prompt_tokens, u.llm_completion_tokens, 
         u.tts_characters_count, u.total_cost_usd
ORDER BY s.started_at DESC;
```

---

## Python Implementation

### 1. Install Supabase Client

Add to `pyproject.toml`:

```toml
[project]
dependencies = [
    # ... existing dependencies
    "supabase>=2.0.0",
]
```

Then install:
```bash
uv add supabase
```

### 2. Environment Variables

Add to `.env.local`:

```env
# Existing variables...
LIVEKIT_URL=wss://...
OPENAI_API_KEY=...
GLADIA_API_KEY=...
ELEVEN_API_KEY=...

# Add Supabase credentials
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

Get these from: Supabase Dashboard → Settings → API

**⚠️ Important**: Use the `service_role` key (not anon key) for backend operations.

### 3. Create Supabase Helper Module

Create `src/supabase_helper.py`:

```python
import os
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
from supabase import create_client, Client

logger = logging.getLogger("supabase_helper")


class TranscriptStorage:
    """Helper class for storing conversation transcripts in Supabase"""
    
    def __init__(self):
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
        
        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        
        self.client: Client = create_client(supabase_url, supabase_key)
        logger.info("Supabase client initialized")
    
    async def create_session(
        self,
        room_name: str,
        started_at: str,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Create a new conversation session and return session ID"""
        try:
            data = {
                "room_name": room_name,
                "started_at": started_at,
                "user_id": user_id,
                "metadata": metadata or {}
            }
            
            result = self.client.table("conversation_sessions").insert(data).execute()
            session_id = result.data[0]["id"]
            logger.info(f"Created session {session_id} for room {room_name}")
            return session_id
            
        except Exception as e:
            logger.error(f"Failed to create session: {e}")
            raise
    
    async def save_messages(
        self,
        session_id: str,
        messages: List[Dict[str, Any]]
    ) -> None:
        """Save all messages for a session"""
        try:
            # Prepare message data
            message_data = [
                {
                    "session_id": session_id,
                    "role": msg["role"],
                    "content": msg["content"],
                    "language": msg.get("language"),
                    "timestamp": msg["timestamp"],
                    "metadata": msg.get("metadata", {})
                }
                for msg in messages
            ]
            
            if message_data:
                self.client.table("conversation_messages").insert(message_data).execute()
                logger.info(f"Saved {len(message_data)} messages for session {session_id}")
            
        except Exception as e:
            logger.error(f"Failed to save messages: {e}")
            raise
    
    async def save_usage_metrics(
        self,
        session_id: str,
        usage_summary: Any
    ) -> None:
        """Save usage metrics for a session"""
        try:
            # Calculate total cost (optional - adjust rates as needed)
            llm_cost = (
                (usage_summary.llm_prompt_tokens / 1_000_000) * 0.15 +  # GPT-4o-mini input
                (usage_summary.llm_completion_tokens / 1_000_000) * 0.60  # GPT-4o-mini output
            )
            tts_cost = (usage_summary.tts_characters_count / 1000) * 0.30  # ElevenLabs
            stt_cost = (usage_summary.stt_audio_duration / 60) * 0.00036  # Gladia
            total_cost = llm_cost + tts_cost + stt_cost
            
            data = {
                "session_id": session_id,
                "llm_prompt_tokens": usage_summary.llm_prompt_tokens,
                "llm_completion_tokens": usage_summary.llm_completion_tokens,
                "tts_characters_count": usage_summary.tts_characters_count,
                "tts_audio_duration": usage_summary.tts_audio_duration,
                "stt_audio_duration": usage_summary.stt_audio_duration,
                "total_cost_usd": round(total_cost, 4)
            }
            
            self.client.table("session_usage_metrics").insert(data).execute()
            logger.info(f"Saved usage metrics for session {session_id} (cost: ${total_cost:.4f})")
            
        except Exception as e:
            logger.error(f"Failed to save usage metrics: {e}")
            raise
    
    async def end_session(
        self,
        session_id: str,
        ended_at: str
    ) -> None:
        """Mark session as ended and calculate duration"""
        try:
            # Get session start time
            result = self.client.table("conversation_sessions").select("started_at").eq("id", session_id).execute()
            
            if result.data:
                started_at = datetime.fromisoformat(result.data[0]["started_at"].replace('Z', '+00:00'))
                ended_at_dt = datetime.fromisoformat(ended_at.replace('Z', '+00:00'))
                duration_seconds = int((ended_at_dt - started_at).total_seconds())
                
                # Update session
                self.client.table("conversation_sessions").update({
                    "ended_at": ended_at,
                    "duration_seconds": duration_seconds
                }).eq("id", session_id).execute()
                
                logger.info(f"Ended session {session_id} (duration: {duration_seconds}s)")
            
        except Exception as e:
            logger.error(f"Failed to end session: {e}")
            raise
    
    async def save_complete_session(
        self,
        session_metadata: Dict[str, Any],
        messages: List[Dict[str, Any]],
        usage_summary: Any
    ) -> str:
        """Complete workflow: create session, save messages, save metrics, end session"""
        try:
            # Create session
            session_id = await self.create_session(
                room_name=session_metadata["room_name"],
                started_at=session_metadata.get("started_at") or datetime.utcnow().isoformat(),
                user_id=session_metadata.get("user_id"),
                metadata=session_metadata.get("metadata")
            )
            
            # Save messages
            if messages:
                await self.save_messages(session_id, messages)
            
            # Save usage metrics
            await self.save_usage_metrics(session_id, usage_summary)
            
            # End session
            if session_metadata.get("ended_at"):
                await self.end_session(session_id, session_metadata["ended_at"])
            
            logger.info(f"Successfully saved complete session {session_id}")
            return session_id
            
        except Exception as e:
            logger.error(f"Failed to save complete session: {e}")
            raise


# Singleton instance
_transcript_storage: Optional[TranscriptStorage] = None


def get_transcript_storage() -> TranscriptStorage:
    """Get or create transcript storage instance"""
    global _transcript_storage
    if _transcript_storage is None:
        _transcript_storage = TranscriptStorage()
    return _transcript_storage
```

### 4. Update agent.py

Update the cleanup function in `agent.py`:

```python
# At the top of agent.py, add import
from supabase_helper import get_transcript_storage

# In agent_worker function, update cleanup_and_save_transcript:
async def cleanup_and_save_transcript():
    """Handle session cleanup and save transcript"""
    from datetime import datetime
    
    # Log usage metrics
    summary = usage_collector.get_summary()
    logger.info(f"Usage: {summary}")
    
    # Update session end time
    session_metadata["ended_at"] = datetime.utcnow().isoformat()
    
    # Log transcript summary
    logger.info(f"Session ended. Transcript contains {len(transcript_messages)} messages")
    
    # Save to Supabase
    if transcript_messages or summary:
        try:
            storage = get_transcript_storage()
            session_id = await storage.save_complete_session(
                session_metadata=session_metadata,
                messages=transcript_messages,
                usage_summary=summary
            )
            logger.info(f"✅ Transcript saved to Supabase with session ID: {session_id}")
        except Exception as e:
            logger.error(f"❌ Failed to save transcript to Supabase: {e}")
            # Don't crash the agent if Supabase save fails
```

---

## Querying Transcripts

### Simple Queries

```sql
-- Get all sessions from today
SELECT * FROM conversation_sessions 
WHERE started_at >= CURRENT_DATE
ORDER BY started_at DESC;

-- Get full transcript for a session
SELECT 
    m.role,
    m.content,
    m.language,
    m.timestamp
FROM conversation_messages m
WHERE m.session_id = 'YOUR-SESSION-ID'
ORDER BY m.timestamp;

-- Get sessions with high token usage
SELECT 
    s.room_name,
    s.started_at,
    s.duration_seconds,
    u.llm_prompt_tokens + u.llm_completion_tokens as total_tokens,
    u.total_cost_usd
FROM conversation_sessions s
JOIN session_usage_metrics u ON s.id = u.session_id
WHERE u.total_cost_usd > 0.10
ORDER BY u.total_cost_usd DESC;

-- Get average session duration
SELECT AVG(duration_seconds) as avg_duration_seconds
FROM conversation_sessions
WHERE ended_at IS NOT NULL;
```

### Python Queries

```python
from supabase_helper import get_transcript_storage

storage = get_transcript_storage()

# Get recent sessions
result = storage.client.table("conversation_sessions")\
    .select("*, conversation_messages(*)")\
    .order("started_at", desc=True)\
    .limit(10)\
    .execute()

for session in result.data:
    print(f"Room: {session['room_name']}")
    print(f"Messages: {len(session['conversation_messages'])}")
```

---

## Frontend Integration (Optional)

### Create API Route to Fetch Transcripts

Create `livekit-frontend/app/api/transcripts/route.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  
  if (sessionId) {
    // Get specific session with messages
    const { data, error } = await supabase
      .from('conversation_sessions')
      .select(`
        *,
        conversation_messages(*),
        session_usage_metrics(*)
      `)
      .eq('id', sessionId)
      .single();
    
    if (error) throw error;
    return Response.json(data);
  } else {
    // Get all recent sessions
    const { data, error } = await supabase
      .from('conversation_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20);
    
    if (error) throw error;
    return Response.json(data);
  }
}
```

### Display Transcripts Component

Create `livekit-frontend/components/transcripts/transcript-viewer.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  language?: string;
}

export function TranscriptViewer({ sessionId }: { sessionId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetch(`/api/transcripts?sessionId=${sessionId}`)
      .then(res => res.json())
      .then(data => {
        setMessages(data.conversation_messages || []);
        setLoading(false);
      });
  }, [sessionId]);
  
  if (loading) return <div>Loading transcript...</div>;
  
  return (
    <div className="space-y-4">
      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`p-4 rounded ${
            msg.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'
          }`}
        >
          <div className="font-bold">{msg.role === 'user' ? 'User' : 'Agent'}</div>
          <div>{msg.content}</div>
          <div className="text-xs text-gray-500">
            {new Date(msg.timestamp).toLocaleString()}
            {msg.language && ` • ${msg.language}`}
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## Testing

### 1. Test Database Setup

```bash
# Test connection from Python
python -c "from supabase_helper import get_transcript_storage; print('✅ Connected')"
```

### 2. Test with Console Mode

Run the agent and have a conversation:

```bash
cd livekit_agent_python
uv run src/agent.py console
```

Check Supabase dashboard → Table Editor → `conversation_sessions`

### 3. Verify Data

```sql
-- Check latest session
SELECT * FROM conversation_sessions 
ORDER BY created_at DESC 
LIMIT 1;

-- Check messages
SELECT * FROM conversation_messages 
WHERE session_id = (
    SELECT id FROM conversation_sessions 
    ORDER BY created_at DESC 
    LIMIT 1
);
```

---

## Cost Tracking

The implementation automatically calculates costs based on:

- **OpenAI GPT-4o-mini**: $0.15/1M input tokens, $0.60/1M output tokens
- **ElevenLabs**: $0.30/1K characters
- **Gladia**: $0.00036/minute

Update rates in `supabase_helper.py` as needed.

### Monthly Cost Report Query

```sql
SELECT 
    DATE_TRUNC('month', s.started_at) as month,
    COUNT(DISTINCT s.id) as total_sessions,
    SUM(u.total_cost_usd) as total_cost,
    AVG(u.total_cost_usd) as avg_cost_per_session
FROM conversation_sessions s
JOIN session_usage_metrics u ON s.id = u.session_id
GROUP BY DATE_TRUNC('month', s.started_at)
ORDER BY month DESC;
```

---

## Security Best Practices

1. **Never expose service_role key** to frontend
2. **Use RLS policies** to restrict data access by user
3. **Encrypt sensitive data** if needed
4. **Set up backup policies** in Supabase
5. **Monitor query performance** with indexes

### Example RLS Policy for User-Specific Access

```sql
-- Allow users to see only their own sessions
CREATE POLICY "Users can view own sessions"
ON conversation_sessions
FOR SELECT
TO authenticated
USING (auth.uid()::text = user_id);
```

---

## Troubleshooting

### Agent fails to save transcripts

**Check**: Are environment variables set correctly?
```bash
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_KEY
```

**Check**: Is Supabase client installed?
```bash
uv pip list | grep supabase
```

**Check**: Are tables created?
- Go to Supabase Dashboard → Table Editor

### "No rows found" errors

**Check**: RLS policies might be blocking service_role
```sql
-- Verify policies
SELECT * FROM pg_policies 
WHERE tablename IN ('conversation_sessions', 'conversation_messages');
```

### Performance issues with large transcripts

**Solution**: Add pagination

```python
# In queries
result = client.table("conversation_messages")\
    .select("*")\
    .eq("session_id", session_id)\
    .range(0, 99)\  # First 100 messages
    .execute()
```

---

## Next Steps

1. ✅ Set up Supabase database and tables
2. ✅ Install `supabase` Python package
3. ✅ Add environment variables
4. ✅ Create `src/supabase_helper.py`
5. ✅ Update `agent.py` to use Supabase
6. ✅ Test with console mode
7. ✅ Deploy to Railway with Supabase credentials
8. Optional: Create frontend to view transcripts
9. Optional: Set up alerts for high-cost sessions
10. Optional: Export transcripts to CSV/JSON for analysis

---

## Additional Resources

- [Supabase Python Docs](https://supabase.com/docs/reference/python/introduction)
- [LiveKit Agents Events](https://docs.livekit.io/agents/)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
