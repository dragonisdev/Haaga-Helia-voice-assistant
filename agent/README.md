# Haaga-Helia Voice Assistant � Agent

LiveKit Agents (Python) voice assistant for Haaga-Helia University of Applied Sciences. Uses Gladia for multilingual STT, OpenAI for LLM and TTS, and Silero VAD for voice activity detection.

## Environment variables

Set these in Railway ? Variables (or `.env.local` for local dev):

| Variable | Description |
|---|---|
| `LIVEKIT_URL` | LiveKit Cloud WebSocket URL (`wss://...`) |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `OPENAI_API_KEY` | OpenAI API key |
| `GLADIA_API_KEY` | Gladia API key |

## Local development

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python agent.py start
```

## Deploy to Railway

The service builds via Docker and is configured in `railway.toml`. Push to your connected repo � Railway will build and deploy automatically.

Required Railway service variables are listed above.