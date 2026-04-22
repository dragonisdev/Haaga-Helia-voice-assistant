# Haaga-Helia Voice Assistant — Project Documentation

## What this project is

A real-time multilingual voice assistant for Haaga-Helia University of Applied Sciences students. Students open the web app, click "Start call", and speak to an AI that answers questions about programs, admissions, courses, campus life, Finnish student benefits (Kela), and more. The assistant responds in whatever language the student uses and can search the web for up-to-date information when needed.

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

## Folder structure

`agent/` contains the Python LiveKit agent. This is deployed to Railway as a Docker container.

`frontend/` contains the Next.js web app. This is deployed to Vercel.

`supabase/` contains the database migration SQL files. These need to be run once in your Supabase project.

`docs/` is this folder — project documentation.

`old_agent/` is a legacy reference implementation that is not deployed anywhere. Ignore it.

---

## The agent (agent/agent.py)

The agent is a Python process that connects to LiveKit Cloud as a worker. When a new room is created by the frontend, LiveKit dispatches the job to this worker.

### What happens at startup

The `entrypoint` function runs for each incoming session. It creates an `AgentSession` with these components:

- Gladia for speech-to-text (multilingual, picks up the student's language automatically)
- gpt-4o-mini as the language model
- OpenAI TTS with the "alloy" voice for text-to-speech
- Silero VAD for voice activity detection (knows when the student is speaking vs silent)

The agent then greets the student with: "Hi, I'm Haaga-Helia Help, a student assistant AI. Feel free to ask anything."

### The Assistant class

This is the main AI persona. It carries the full system prompt that tells the model to respond in plain spoken language (no markdown, no lists), keep replies short, match the student's language, and stay within school/student topics. It also defines the `web_search` tool.

### The web_search tool

When the assistant thinks it needs current information, it calls this tool with a search query. The tool sends a POST request to the Exa API and returns the top 3 results with short snippets. The assistant then summarizes the findings and tells the student the source URL. The URL also appears in the chat transcript on screen.

### Transcript collection

Two event listeners track the conversation as it happens:
- `user_speech_committed` fires when Gladia finishes transcribing a student utterance
- `agent_speech_committed` fires when the agent finishes speaking

Both append a dict with `role`, `content`, and `timestamp` to an in-memory `transcript` list.

### Session shutdown and Supabase save

When the student disconnects, the `on_shutdown` callback runs. It:
1. Collects the full transcript list
2. Gets the usage summary from the metrics collector (token counts, TTS character count)
3. Calls `save_transcript_to_supabase` which makes three sequential POST requests to the Supabase REST API: one to create a `conversation_sessions` row, one to create a `conversation_messages` row with the full transcript, and one to create a `session_usage_metrics` row.

There is no Supabase SDK used — everything is plain HTTP via `httpx`.

### Session timeout

A background asyncio task `_timeout_guard` runs during every session. If the session is still active after `SESSION_TIMEOUT_SECONDS` (default 1800 seconds / 30 minutes), it forces shutdown to prevent zombie sessions. This also triggers the Supabase save.

### False interruption handling

If Silero VAD incorrectly detects user speech while the agent is talking (background noise etc.), the `agent_false_interruption` event fires. The handler regenerates the agent's reply. There is a 1.5 second debounce to avoid spamming replies on rapid false triggers.

### Environment variables for the agent

`LIVEKIT_URL` — WebSocket URL of your LiveKit server. Required.

`LIVEKIT_API_KEY` — LiveKit API key. Required.

`LIVEKIT_API_SECRET` — LiveKit API secret. Required.

`OPENAI_API_KEY` — Used for both gpt-4o-mini and OpenAI TTS. Required.

`GLADIA_API_KEY` — Used for multilingual speech-to-text. Required.

`SUPABASE_URL` — Your Supabase project URL. Optional. Without it, transcripts are not saved.

`SUPABASE_SERVICE_KEY` — Supabase service-role key (bypasses row-level security). Optional.

`EXA_API_KEY` — Exa API key for web search. Optional. Without it, the web_search tool returns a "not available" message.

`SESSION_TIMEOUT_SECONDS` — How long a session can run before being force-ended. Optional, defaults to 1800.

### Docker and Railway deployment

The `Dockerfile` uses a multi-stage build. The first stage installs dependencies into `/root/.local`. The second stage copies only the installed packages and `agent.py`. Before starting, it runs `python agent.py download-files` which downloads the Silero VAD model so it is baked into the image. The container then starts with `python agent.py start`.

The `railway.toml` tells Railway to build using the Dockerfile and to restart the container on failure (max 2 retries).

---

## The frontend (frontend/)

A Next.js 15 app that provides the browser interface. Deployed to Vercel.

### Pages

`/` — The main page. Shows the welcome screen before connection and the active session view during a call.

`/privacy` — The privacy policy page.

### How the UI works

The app has two views controlled by `ViewController`:

Before connecting, the student sees the welcome screen (`WelcomeView`) with a "Start call" button and a brief description of what the assistant does.

After clicking "Start call", the app calls `session.start()` which triggers the token fetch and LiveKit connection. Once connected, the session view (`SessionView`) appears showing the audio visualizer, the live chat transcript, and controls to mute/end the call.

The `AgentSessionProvider` wraps everything and provides session state to child components via React context.

### App configuration

`app-config.ts` defines all the branding and feature flags. The defaults set the company name to "Haaga-Helia University of Applied Sciences", the logo to `haagahelia_logo_1.png`, the accent color to `#0079c2`, and the start button text to "Start call". Chat input, video input, and screen share are enabled. You can override these defaults at runtime by setting `NEXT_PUBLIC_APP_CONFIG` to a JSON string with the fields you want to change.

### Environment variables for the frontend

`LIVEKIT_URL` — LiveKit server URL used in the connection token. Required.

`LIVEKIT_API_KEY` — Used server-side to sign access tokens. Required.

`LIVEKIT_API_SECRET` — Used server-side to sign access tokens. Required.

`AGENT_NAME` — Optional. If set, the token request includes an agent name so LiveKit dispatches to a specific named agent worker.

`NEXT_PUBLIC_APP_CONFIG` — Optional JSON to override `APP_CONFIG_DEFAULTS` at runtime without redeploying.

---

## API routes

### POST /api/connection-details

This is the only API route in the frontend. The browser calls it when the student clicks "Start call".

It does the following:
1. Checks that `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are set. Returns 503 if not.
2. Gets the client IP from the `x-forwarded-for`, `x-real-ip`, or `cf-connecting-ip` headers (Cloudflare, Vercel, and generic proxy support).
3. Checks the in-memory rate limit store. Each IP is allowed 5 requests per minute. If exceeded, the reset window extends to 3 minutes and the route returns 429.
4. Parses and validates the JSON body. The body can optionally include `room_config.agents[0].agent_name` and `room_config.agents[0].metadata`.
5. Generates a cryptographically random `participantIdentity` (UUID), `roomName` (UUID), and sets `participantName` to `anonymous_user`.
6. Builds an enhanced metadata JSON that includes the client IP and session creation time.
7. Creates a LiveKit `AccessToken` with a 10-minute TTL. The token grants the participant permission to publish audio/video and subscribe to audio, but not to open data channels.
8. Returns a JSON object with `serverUrl`, `roomName`, `participantToken`, and `participantName`.

The response has `Cache-Control: no-store` so tokens are never cached.

Note: the rate limit store is in-memory. This works fine for a single Vercel serverless instance but if you ever scale to multiple instances you would need to move it to Redis.

---

## Database (supabase/)

The database lives in Supabase (Postgres). There are three migration files that need to be applied in order.

### conversation_sessions

Stores one row per voice call. Fields: `id` (UUID), `room_name`, `started_at`, `ended_at`, `duration_seconds`, `metadata` (JSONB), `created_at`.

### conversation_messages

Stores the full transcript of a session as a single row. Fields: `id`, `session_id` (FK to `conversation_sessions`), `turns` (JSONB array of all messages), `transcript_text` (plain text dump of the conversation), `message_count`.

### session_usage_metrics

Stores token and TTS usage per session. Fields: `id`, `session_id` (FK), `llm_prompt_tokens`, `llm_completion_tokens`, `tts_characters_count`.

### documents table (for RAG)

A `documents` table with `pgvector` support exists for potential retrieval-augmented generation. It stores text chunks with 1536-dimension embeddings and a `source` field. There is a `match_documents` SQL function for cosine similarity search. The `upload_documents.py` script in the agent folder is used to populate this table. This feature is set up but not wired into the agent's main flow yet.

---

## Hosting

### Railway (agent)

The Python agent runs as a Docker container on Railway. Railway watches for new LiveKit job dispatches and keeps the container running. Deployment is triggered by pushing to the connected Git branch. Railway uses the `Dockerfile` in the `agent/` folder and the `railway.toml` for build and restart config. Set all required environment variables in the Railway project settings.

### Vercel (frontend)

The Next.js frontend is deployed to Vercel. Vercel automatically builds from the `frontend/` folder using `pnpm install` and `pnpm build`. The `vercel.json` in the frontend folder specifies the build and dev commands. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in the Vercel project's environment variables. These are server-only (not prefixed with `NEXT_PUBLIC_`) so they are never exposed to the browser.

### LiveKit Cloud

LiveKit Cloud sits between the browser and the agent. You need a LiveKit Cloud project with the URL, API key, and API secret. The frontend uses these to mint access tokens and the agent uses them to connect as a worker. No self-hosted LiveKit server is needed.

### Supabase

Supabase provides the Postgres database. Run the three migration files under `supabase/migrations/` in your Supabase project's SQL editor (in filename order). Then grab the project URL and service-role key from the Supabase dashboard and add them to the Railway environment variables.

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
