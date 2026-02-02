# Railway Deployment Guide

## Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **LiveKit Cloud Project**: Already set up at `haaga-helia-support-pivrqa1h.livekit.cloud`
3. **API Keys**: You have all required keys in `.env.local`

## Deployment Steps

### 1. Install Railway CLI (Optional but Recommended)

```bash
npm install -g @railway/cli
```

### 2. Login to Railway

```bash
railway login
```

### 3. Initialize Railway Project

From the `livekit_agent_python` directory:

```bash
railway init
```

Select "Create a new project" and give it a name (e.g., `haaga-helia-voice-agent`)

### 4. Set Environment Variables

You can set environment variables either via Railway CLI or Dashboard:

#### Option A: Via Railway CLI



#### Option B: Via Railway Dashboard

1. Go to your project in [Railway Dashboard](https://railway.app/dashboard)
2. Click on your service
3. Navigate to "Variables" tab
4. Add each environment variable:
   - `LIVEKIT_URL`
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
   - `OPENAI_API_KEY`
   - `GLADIA_API_KEY`
   - `ELEVEN_API_KEY`

### 5. Deploy to Railway

```bash
railway up
```

Or push to GitHub and link the repository in Railway Dashboard for automatic deployments.

### 6. Verify Deployment

Check Railway logs:

```bash
railway logs
```

You should see:
- ✅ Agent connecting to LiveKit Cloud
- ✅ Worker registered and waiting for jobs
- ✅ HTTP server listening on port (Railway assigns this automatically)

## Architecture Flow

```
┌──────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Frontend   │────────▶│  LiveKit Cloud   │────────▶│  Railway Agent  │
│  (Next.js)   │  WebRTC │  (Room Manager)  │  Dispatch│   (agent.py)    │
└──────────────┘         └──────────────────┘         └─────────────────┘
      ▲                           │                            │
      │                           │                            │
      └───────────────────────────┴────────────────────────────┘
                    Audio/Video/Transcriptions
```

## How It Works

1. **Frontend connects** to LiveKit Cloud (via your Next.js app)
2. **LiveKit Cloud** creates a room and dispatches your Railway agent
3. **Railway agent** (running agent.py):
   - Connects to LiveKit Cloud
   - Joins the room as a participant
   - Processes audio through STT → LLM → TTS pipeline
   - Sends responses back to the room
4. **Frontend receives** agent audio and displays transcriptions

## Troubleshooting

### Agent Not Connecting

Check Railway logs for connection errors:
```bash
railway logs --tail
```

Common issues:
- ❌ Missing environment variables → Set them in Railway Dashboard
- ❌ Wrong `LIVEKIT_URL` → Should be WebSocket URL (wss://)
- ❌ Invalid credentials → Double-check API keys

### Agent Not Dispatched to Rooms

1. Verify agent is running in Railway logs
2. Check LiveKit Cloud dashboard for agent registration
3. Ensure frontend is using correct LiveKit credentials
4. Check room creation in LiveKit Cloud dashboard

### High Latency

- Consider deploying to a region closer to your users
- Railway automatically uses the nearest region, but you can specify one

## Monitoring

### Railway Dashboard

- View logs in real-time
- Monitor CPU/Memory usage
- Check deployment history
- View build logs

### LiveKit Cloud Dashboard

- View active rooms
- See agent sessions
- Monitor API usage
- Check connection quality

## Scaling

Railway automatically scales based on demand:
- **Vertical scaling**: Increase memory/CPU in Railway Dashboard
- **Horizontal scaling**: Railway can run multiple instances

For high-traffic deployments, consider:
- Using Railway's Pro plan for better performance
- Deploying to multiple regions
- Monitoring costs via LiveKit and Railway dashboards

## Cost Estimation

### Railway Costs
- **Starter Plan**: $5/month (500 hours)
- **Pro Plan**: $20/month + usage

### AI Provider Costs
- **OpenAI GPT-4o-mini**: ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens
- **Gladia STT**: ~$0.00036 per minute
- **ElevenLabs TTS**: ~$0.30 per 1K characters (paid tiers have better rates)

Monitor usage in each provider's dashboard to track costs.

## Next Steps

1. ✅ Deploy agent to Railway
2. ✅ Test from frontend (localhost)
3. ✅ Deploy frontend to Vercel/Netlify
4. ✅ Configure production environment variables
5. ✅ Set up monitoring and alerts
6. ✅ Test telephony integration (optional)

## Support

- **Railway**: https://railway.app/help
- **LiveKit**: https://docs.livekit.io
- **LiveKit Community**: https://livekit.io/join-slack
