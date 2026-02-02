# Agent Implementation Comparison: old_agent.md vs agent.py

## Overview
This document compares the two agent implementations to help combine the modern `AgentServer` architecture with your preferred AI model providers.

---

## 1. Server Architecture

### old_agent.md (Modern Pattern - RECOMMENDED for Railway Deployment)
```python
server = AgentServer()

def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()

server.setup_fnc = prewarm

@server.rtc_session()
async def my_agent(ctx: JobContext):
    # Agent logic here
    pass

if __name__ == "__main__":
    cli.run_app(server)
```

**Advantages:**
- ✅ Better for production deployments (Railway, cloud platforms)
- ✅ Built-in server lifecycle management
- ✅ Supports automatic agent dispatch from LiveKit Cloud
- ✅ More explicit server setup with `AgentServer` class
- ✅ Cleaner decorator pattern with `@server.rtc_session()`

### agent.py (Current Pattern)
```python
def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()

async def entrypoint(ctx: JobContext):
    # Agent logic here
    pass

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
```

**Disadvantages:**
- ⚠️ Older pattern, less explicit
- ⚠️ `WorkerOptions` wraps everything implicitly

---

## 2. AI Model Providers

### old_agent.md (LiveKit Inference - Unified API)
```python
session = AgentSession(
    stt=inference.STT(model="assemblyai/universal-streaming", language="en"),
    llm=inference.LLM(model="openai/gpt-4.1-mini"),
    tts=inference.TTS(model="cartesia/sonic-3", voice="9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"),
    turn_detection=MultilingualModel(),
    vad=ctx.proc.userdata["vad"],
    preemptive_generation=True,
)
```

**Advantages:**
- ✅ Unified API across all providers
- ✅ **No API keys needed when deployed to LiveKit Cloud**
- ✅ LiveKit Cloud handles billing and management
- ✅ Simpler configuration (just model strings)
- ✅ Easier to switch between providers

**Import Requirements:**
```python
from livekit.agents import inference
```

**Environment Variables:**
- None needed on LiveKit Cloud (uses LiveKit's credentials)
- Requires LIVEKIT credentials only

### agent.py (Direct Plugin Integration - YOUR CURRENT CHOICE)
```python
from livekit.plugins import gladia, openai, elevenlabs

session = AgentSession(
    stt=gladia.STT(),  # Supports 99+ languages with auto-detection
    llm=openai.LLM(model="gpt-4o-mini"),
    tts=elevenlabs.TTS(
        voice_id="pNInz6obpgDQGcFmaJgB",  # Adam - better multilingual support
        model="eleven_multilingual_v2",
    ),
    turn_detection=MultilingualModel(),
    vad=ctx.proc.userdata["vad"],
    preemptive_generation=True,
)
```

**Advantages:**
- ✅ **Gladia**: Superior multilingual support (99+ languages with auto-detection)
- ✅ **ElevenLabs**: Better voice quality and multilingual TTS
- ✅ **Direct control**: Full access to provider-specific features
- ✅ **Model flexibility**: Not limited to LiveKit Inference catalog

**Disadvantages:**
- ⚠️ Requires separate API keys for each service
- ⚠️ More environment variables to manage
- ⚠️ Manual billing management with each provider

**Environment Variables:**
```env
OPENAI_API_KEY=sk-...
GLADIA_API_KEY=...
ELEVENLABS_API_KEY=...
```

---

## 3. Room Options & Audio Configuration

### old_agent.md (Modern Pattern - BETTER)
```python
from livekit import rtc
from livekit.agents import room_io

await session.start(
    agent=Assistant(),
    room=ctx.room,
    room_options=room_io.RoomOptions(
        audio_input=room_io.AudioInputOptions(
            noise_cancellation=lambda params: noise_cancellation.BVCTelephony()
            if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
            else noise_cancellation.BVC(),
        ),
    ),
)
```

**Advantages:**
- ✅ **SIP/Telephony support**: Automatically uses different noise cancellation for phone calls
- ✅ More granular control over room behavior
- ✅ Future-proof API design
- ✅ Supports advanced audio input options

### agent.py (Current Pattern - SIMPLER)
```python
await session.start(
    agent=Assistant(),
    room=ctx.room,
    room_input_options=RoomInputOptions(
        noise_cancellation=noise_cancellation.BVC(),
    ),
)
```

**Advantages:**
- ✅ Simpler for basic use cases
- ⚠️ No SIP/telephony differentiation (not needed if you're only using web/mobile)

---

## 4. Imports Comparison

### old_agent.md
```python
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    cli,
    inference,
    room_io,
)
from livekit.plugins import noise_cancellation, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel
```

### agent.py
```python
from livekit.agents import (
    NOT_GIVEN,
    Agent,
    AgentFalseInterruptionEvent,
    AgentSession,
    JobContext,
    JobProcess,
    MetricsCollectedEvent,
    RoomInputOptions,
    RunContext,
    WorkerOptions,
    cli,
    metrics,
)
from livekit.agents.llm import function_tool
from livekit.plugins import cartesia, gladia, noise_cancellation, openai, silero, elevenlabs
from livekit.plugins.turn_detector.multilingual import MultilingualModel
```

**Key Differences:**
- `agent.py` includes **metrics collection** (usage tracking)
- `agent.py` includes **false interruption handling**
- `old_agent.md` includes **room_io** and **rtc** for advanced room control

---

## 5. Additional Features

### agent.py Has (But old_agent.md Doesn't)

#### Metrics Collection
```python
usage_collector = metrics.UsageCollector()

@session.on("metrics_collected")
def _on_metrics_collected(ev: MetricsCollectedEvent):
    metrics.log_metrics(ev.metrics)
    usage_collector.collect(ev.metrics)

async def log_usage():
    summary = usage_collector.get_summary()
    logger.info(f"Usage: {summary}")

ctx.add_shutdown_callback(log_usage)
```

**Advantage:** Track costs and usage per session

#### False Interruption Handling
```python
@session.on("agent_false_interruption")
def _on_agent_false_interruption(ev: AgentFalseInterruptionEvent):
    logger.info("false positive interruption, resuming")
    session.generate_reply(instructions=ev.extra_instructions or NOT_GIVEN)
```

**Advantage:** Better conversation flow when user accidentally interrupts

---

## 6. Function Tools (Both Support)

Both implementations support function tools for extending agent capabilities:

```python
from livekit.agents import function_tool, RunContext

@function_tool
async def lookup_weather(self, context: RunContext, location: str):
    """Use this tool to look up current weather information."""
    return f"Weather in {location}: sunny, 70°F"
```

---

## 7. Deployment Comparison

### For Railway Deployment to LiveKit Cloud

| Feature | old_agent.md | agent.py |
|---------|--------------|----------|
| Server Architecture | ✅ Modern (`AgentServer`) | ⚠️ Older (`WorkerOptions`) |
| Cloud Integration | ✅ Optimized for LiveKit Cloud | ⚠️ Works but not optimal |
| API Key Management | ✅ None needed (uses LiveKit credentials) | ⚠️ Requires 3 separate keys |
| SIP Support | ✅ Built-in telephony support | ❌ No telephony support |
| Metrics | ❌ Not included | ✅ Full usage tracking |
| False Interruption | ❌ Not included | ✅ Better UX |
| Model Providers | ⚠️ Limited to LiveKit Inference | ✅ Gladia + ElevenLabs (better) |

---

## 8. Recommended Hybrid Approach

### For Railway → LiveKit Cloud Deployment

Combine the best of both:

1. **Use `AgentServer` pattern** from `old_agent.md` (modern architecture)
2. **Keep your model providers** from `agent.py` (Gladia, OpenAI, ElevenLabs)
3. **Add metrics collection** from `agent.py` (usage tracking)
4. **Add false interruption handling** from `agent.py` (better UX)
5. **Use `room_io.RoomOptions`** from `old_agent.md` (SIP support for future)

### Hybrid Implementation Structure
```python
server = AgentServer()

def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()

server.setup_fnc = prewarm

@server.rtc_session()
async def my_agent(ctx: JobContext):
    session = AgentSession(
        # Use your preferred models
        stt=gladia.STT(),
        llm=openai.LLM(model="gpt-4o-mini"),
        tts=elevenlabs.TTS(voice_id="...", model="eleven_multilingual_v2"),
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=True,
    )
    
    # Add metrics from agent.py
    usage_collector = metrics.UsageCollector()
    
    @session.on("metrics_collected")
    def _on_metrics_collected(ev: MetricsCollectedEvent):
        metrics.log_metrics(ev.metrics)
        usage_collector.collect(ev.metrics)
    
    # Add false interruption handling from agent.py
    @session.on("agent_false_interruption")
    def _on_agent_false_interruption(ev: AgentFalseInterruptionEvent):
        logger.info("false positive interruption, resuming")
        session.generate_reply(instructions=ev.extra_instructions or NOT_GIVEN)
    
    async def log_usage():
        summary = usage_collector.get_summary()
        logger.info(f"Usage: {summary}")
    
    ctx.add_shutdown_callback(log_usage)
    
    # Use modern room options for SIP support
    await session.start(
        agent=Assistant(),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: noise_cancellation.BVCTelephony()
                if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                else noise_cancellation.BVC(),
            ),
        ),
    )
    
    await ctx.connect()

if __name__ == "__main__":
    cli.run_app(server)
```

---

## 9. Environment Variables Needed

### For Hybrid Approach (Railway Deployment)

```env
# LiveKit Cloud Connection
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret

# AI Model Providers
OPENAI_API_KEY=sk-...
GLADIA_API_KEY=...
ELEVENLABS_API_KEY=...
```

---

## 10. Migration Checklist

To modernize your `agent.py` for Railway deployment:

- [ ] Change from `WorkerOptions` → `AgentServer` pattern
- [ ] Change from `async def entrypoint` → `@server.rtc_session()` decorator
- [ ] Add `from livekit import rtc` for SIP support
- [ ] Add `from livekit.agents import room_io` for modern room options
- [ ] Change `room_input_options` → `room_options=room_io.RoomOptions(...)`
- [ ] Add SIP/telephony noise cancellation logic (if needed)
- [ ] Keep metrics collection (already in agent.py)
- [ ] Keep false interruption handling (already in agent.py)
- [ ] Keep your model providers (Gladia, OpenAI, ElevenLabs)
- [ ] Test locally with `uv run src/agent.py console`
- [ ] Create Dockerfile for Railway deployment
- [ ] Set environment variables in Railway dashboard

---

## 11. Summary

### What to Keep from agent.py
✅ **Gladia STT** - Superior multilingual support  
✅ **OpenAI GPT-4o-mini** - Reliable and cost-effective  
✅ **ElevenLabs TTS** - Best voice quality  
✅ **Metrics collection** - Track usage and costs  
✅ **False interruption handling** - Better UX  

### What to Adopt from old_agent.md
✅ **AgentServer architecture** - Modern, production-ready  
✅ **@server.rtc_session() decorator** - Cleaner code  
✅ **room_io.RoomOptions** - SIP/telephony support  
✅ **Lambda-based noise cancellation** - Adaptive to call type  

### Result
A production-ready agent that:
- Deploys cleanly to Railway
- Connects to LiveKit Cloud
- Uses your preferred AI providers
- Supports future telephony integration
- Tracks metrics and costs
- Provides excellent conversation quality
