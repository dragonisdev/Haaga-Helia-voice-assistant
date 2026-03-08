# LiveKit Voice AI Agent

Multi-tenant voice AI agent for SaaS applications with phone (SIP) and browser-based calling.

## Features

- ✅ **Multi-Tenant:** Single agent handles all users via metadata routing
- ✅ **Knowledge Base Integration:** Fetches user-specific context from backend
- ✅ **Transcript Storage:** Automatically saves conversations to Supabase
- ✅ **Modular Design:** Clean separation of concerns (ChatGPT's advice implemented)
- ✅ **Production Ready:** Self-hosted worker with service account authentication

## Architecture

```
Agent Worker (this)
  ↓ Connects to LiveKit
  ↓ Receives dispatch with user_id in metadata
  ↓ Fetches user's knowledge base from backend
  ↓ Handles voice conversation
  ↓ Saves transcript via backend API
```

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in:

```bash
# LiveKit
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=<from-livekit-dashboard>
LIVEKIT_API_SECRET=<from-livekit-dashboard>

# Backend API
API_BASE_URL=https://your-backend.railway.app
SERVICE_TOKEN=<generate-with: openssl rand -hex 32>

# AI Services
OPENAI_API_KEY=<your-openai-key>
DEEPGRAM_API_KEY=<your-deepgram-key>
```

### 3. Run Agent

```bash
python agent.py start
```

## Deployment

### Railway (Recommended)

1. Create `Procfile`:
   ```
   worker: python agent.py start
   ```

2. Deploy:
   ```bash
   railway init
   railway up
   ```

3. Set environment variables in Railway dashboard

See [AGENT_DEPLOYMENT_GUIDE.md](../Docs/AGENT_DEPLOYMENT_GUIDE.md) for full deployment instructions.

## Code Structure

```
agent.py                    # Main entry point
├── TranscriptRepository    # Handles transcript formatting & upload
├── UserContextService      # Fetches user knowledge base from backend
├── GenericAssistant        # AI agent with user-specific context
└── entrypoint()           # Handles each call session
```

### Design Philosophy

Following modularity best practices:

1. **TranscriptRepository:** Pure data layer
   - `format_transcript()` - Converts LiveKit history to structured data
   - `save_session_end()` - Uploads to backend API
   - **No business logic, just persistence**

2. **UserContextService:** Context fetching
   - Fetches knowledge base from backend
   - Fetches user agent configuration
   - **Separated from agent logic**

3. **GenericAssistant:** AI agent
   - User-specific system prompt
   - Knowledge base injection
   - **No knowledge of storage/APIs**

This separation means you can swap backends (S3, Firestore, webhooks) without touching agent code.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LIVEKIT_URL` | ✅ | LiveKit server URL |
| `LIVEKIT_API_KEY` | ✅ | LiveKit API key |
| `LIVEKIT_API_SECRET` | ✅ | LiveKit API secret |
| `API_BASE_URL` | ✅ | Backend API URL |
| `SERVICE_TOKEN` | ✅ | Service account token (must match backend) |
| `OPENAI_API_KEY` | ✅ | OpenAI API key |
| `DEEPGRAM_API_KEY` | ✅ | Deepgram API key |
| `LLM_CHOICE` | ❌ | LLM model (default: gpt-4o-mini) |
| `DEFAULT_LANGUAGE` | ❌ | STT language (default: en) |

## How Multi-Tenant Works

### Metadata Flow

```
1. User calls +1-555-0100
2. LiveKit dispatch rule for that number contains:
   {
     "user_id": "uuid-123",
     "phone_number_id": "phone-uuid"
   }
3. Room created with this metadata
4. Agent reads: call_metadata.user_id
5. Fetches user's knowledge base
6. Conversation with user context
7. Saves transcript with user_id
```

### Key Function: `extract_call_metadata()`

```python
def extract_call_metadata(ctx: JobContext) -> CallMetadata:
    """
    Extract metadata from LiveKit room and participants.
    For multi-tenant: user_id comes from room metadata (set by dispatch rule)
    """
    room_metadata = json.loads(ctx.room.metadata or "{}")
    user_id = room_metadata.get("user_id")  # ← Critical for multi-tenant
    # ...
```

## Backend API Endpoints Used

The agent calls these backend endpoints:

### 1. Fetch Knowledge Base
```
GET /knowledgebase/records
Headers:
  Authorization: Bearer <SERVICE_TOKEN>
  X-User-ID: <user_id>
```

### 2. Save Transcript
```
POST /api/calls/agent-session-end
Headers:
  Authorization: Bearer <SERVICE_TOKEN>
Body:
  {
    "room_name": "call-123",
    "user_id": "uuid",
    "transcript": [...],
    "transcript_text": "...",
    "metrics": {...}
  }
```

## Testing

### Unit Test Transcript Formatting

```python
from agent import TranscriptRepository

repo = TranscriptRepository("http://localhost:3000", "test-token")

# Mock conversation items
items = [
    MockItem(role="user", content="Hello"),
    MockItem(role="agent", content="Hi there!")
]

result = repo.format_transcript(items)
print(result["text"])
# Output: user: Hello\nagent: Hi there!
```

### Integration Test

```bash
# Start agent locally
python agent.py start

# In another terminal, trigger a test call via LiveKit API
# (See AGENT_DEPLOYMENT_GUIDE.md)
```

## Troubleshooting

### No user_id in metadata
```
❌ No user_id found in room metadata. Cannot proceed without user context.
```

**Cause:** Dispatch rule doesn't include `metadata` field

**Fix:** Ensure dispatch rules are created with user_id:
```python
metadata=json.dumps({"user_id": user_id})
```

### Failed to fetch knowledge base
```
❌ Failed to load user context for uuid-123
```

**Cause:** SERVICE_TOKEN mismatch or backend endpoint unreachable

**Fix:**
1. Verify SERVICE_TOKEN matches backend `.env`
2. Test backend endpoint: `curl https://your-backend/knowledgebase/records`

### Transcript not saving
```
❌ Failed to save transcript: 401 Unauthorized
```

**Cause:** SERVICE_TOKEN invalid

**Fix:** Regenerate token and update both `.env` files

## Performance Considerations

- **Startup Time:** ~2-3 seconds per call (loads knowledge base)
- **Memory:** ~200MB per active call
- **Concurrency:** 1 worker handles ~10 concurrent calls
- **Scaling:** Deploy multiple workers for horizontal scaling

## Future Enhancements

- [ ] AI-powered sentiment analysis
- [ ] Key points extraction
- [ ] Action items detection
- [ ] Multi-language support (per-user)
- [ ] Custom tools/functions per user
- [ ] Call recording upload to storage
- [ ] Real-time analytics streaming

## Related Docs

- [AGENT_DEPLOYMENT_GUIDE.md](../Docs/AGENT_DEPLOYMENT_GUIDE.md) - Full deployment guide
- [TRANSCRIPTS.md](../Docs/TRANSCRIPTS.md) - Database schema
- [LIVEKIT_AGENT_KNOWLEDGEBASE_GUIDE.md](../Docs/LIVEKIT_AGENT_KNOWLEDGEBASE_GUIDE.md) - Knowledge base integration

## License

See main project [README.md](../Readme.md)
