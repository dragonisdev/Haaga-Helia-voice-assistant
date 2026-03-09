# Haaga-Helia Voice Assistant — Project Context

## Overview

A real-time multilingual voice assistant for Haaga-Helia University of Applied Sciences students. Students open a web app, click connect, and speak naturally. The assistant answers questions about programs, admissions, courses, and campus life — in whatever language the student uses — and can search the web for up-to-date information via Exa.

---

## Architecture

```
Browser (Next.js frontend)
        │  WebRTC (LiveKit SDK)
        ▼
  LiveKit Cloud
        │  Worker job dispatch
        ▼
 Python Agent (Railway)
   ├── Gladia STT  ── multilingual speech recognition
   ├── gpt-4o-mini ── language model
   ├── OpenAI TTS  ── text-to-speech (alloy voice)
   ├── Silero VAD  ── voice activity detection (prewarmed)
   ├── Exa REST API── real-time web search
   └── Supabase REST── transcript + usage persistence
```

---

## Folder Structure

```
agent/           Python LiveKit agent (deployed to Railway via Docker)
frontend/        Next.js app (deployed to Vercel or similar)
supabase/        Database migration files
docs/            Project documentation
old_agent/       Legacy SaaS agent (reference only, not deployed)
```

---

## Agent (`agent/`)

| File | Purpose |
|---|---|
| `agent.py` | Main agent logic |
| `Dockerfile` | Container build (python:3.13-slim + pip) |
| `requirements.txt` | Python dependencies |
| `railway.toml` | Railway deployment config |
| `README.md` | Setup and run instructions |
| `.env.example` | Template for environment variables |

### Key components in `agent.py`

- **`Assistant(Agent)`** — Haaga-Helia system prompt + `web_search` function tool
- **`web_search(query)`** — Calls Exa REST API, returns top-3 result highlights for voice summarization
- **`save_transcript_to_supabase()`** — Inserts session, messages, and usage metrics via Supabase REST API (no SDK)
- **`entrypoint()`** — Sets up `AgentSession`, registers event handlers and shutdown callback, starts session with noise cancellation (BVCTelephony for SIP, BVC for web)
- **`_timeout_guard()`** — Background asyncio task; triggers clean shutdown (including Supabase save) if session exceeds `SESSION_TIMEOUT_SECONDS` (default 1800s)

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `LIVEKIT_URL` | Yes | LiveKit server WebSocket URL |
| `LIVEKIT_API_KEY` | Yes | LiveKit API key |
| `LIVEKIT_API_SECRET` | Yes | LiveKit API secret |
| `OPENAI_API_KEY` | Yes | OpenAI API key (LLM + TTS) |
| `GLADIA_API_KEY` | Yes | Gladia STT API key |
| `SUPABASE_URL` | No | Supabase project URL (transcripts) |
| `SUPABASE_SERVICE_KEY` | No | Supabase service-role key |
| `EXA_API_KEY` | No | Exa API key (web search) |
| `SESSION_TIMEOUT_SECONDS` | No | Max session length in seconds (default: 1800) |

---

## Frontend (`frontend/`)

Next.js 15 app using `@livekit/components-react`. Connects to LiveKit Cloud via a token fetched from `/api/connection-details`. Branded for Haaga-Helia (blue `#002cf2`, `haagahelia_logo_1.png`).

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `LIVEKIT_URL` | Yes | LiveKit server URL |
| `LIVEKIT_API_KEY` | Yes | LiveKit API key (server-side token signing) |
| `LIVEKIT_API_SECRET` | Yes | LiveKit API secret (server-side token signing) |
| `NEXT_PUBLIC_APP_CONFIG` | No | JSON blob to override `app-config.ts` defaults |

### Rate limiting

`/api/connection-details` applies in-memory rate limiting: 5 requests per IP per minute. Configured in `frontend/app/api/connection-details/route.ts`.

---

## Database (`supabase/`)

Single migration file: `migrations/20260310000000_create_conversation_tables.sql`

### Tables

| Table | Description |
|---|---|
| `conversation_sessions` | One row per session (room name, start/end time, duration) |
| `conversation_messages` | All turns (role, content, timestamp, language nullable) |
| `session_usage_metrics` | Token and TTS character counts per session |

### Access

RLS is enabled. Only the `service_role` key has access. No anonymous or authenticated user policies — data is fully internal.

### Applying the migration

1. Open your Supabase project → SQL Editor
2. Paste the contents of `supabase/migrations/20260310000000_create_conversation_tables.sql`
3. Run

### Useful analytics queries

See `supabase/migrations/example_queries.sql` for pre-written queries. The migration also installs these functions:

- `get_daily_stats()` — sessions and messages per day
- `get_language_distribution()` — message counts by detected language
- `cleanup_old_sessions(days int)` — deletes sessions older than N days

---

## Deployment

### Agent → Railway

1. Create a new Railway project, connect to this repo
2. Railway detects `agent/railway.toml` and builds via `agent/Dockerfile`
3. Set all required environment variables in Railway dashboard
4. Deploy — Railway runs `python agent.py start`

The Dockerfile runs `python agent.py download-files` at build time to pre-download Silero VAD and other ML model weights.

### Frontend → Vercel (or similar)

1. Set root directory to `frontend/`
2. Set the three LiveKit environment variables
3. Deploy

---

## Local development

```bash
# Agent
cd agent
cp .env.example .env.local
# Fill in .env.local
pip install -r requirements.txt
python agent.py dev

# Frontend
cd frontend
cp .env.example .env.local
# Fill in .env.local
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The agent connects to LiveKit Cloud automatically.
