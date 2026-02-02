import logging
import sys

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    NOT_GIVEN,
    Agent,
    AgentFalseInterruptionEvent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    MetricsCollectedEvent,
    RunContext,
    WorkerOptions,
    cli,
    metrics,
    room_io,
)
from livekit.agents.llm import function_tool
from livekit.plugins import gladia, noise_cancellation, openai, silero, elevenlabs
from livekit.plugins.turn_detector.multilingual import MultilingualModel

logger = logging.getLogger("agent")

load_dotenv(".env.local")


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are in a voice call with someone.
            You can speak multiple languages, i.e. English, Spanish, German and Polish (but there are others too)
            Your responses are concise, to the point, and without any complex formatting or punctuation including emojis, asterisks, or other symbols.
            You are curious, friendly, and have a sense of humor.""",
        )


server = AgentServer()


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session()
async def agent_worker(ctx: JobContext):
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

    # Initialize transcript storage for this session
    transcript_messages = []
    session_metadata = {
        "room_name": ctx.room.name,
        "started_at": None,
        "ended_at": None,
    }

    session = AgentSession(
        llm=openai.LLM(model="gpt-4o-mini"),
        stt=gladia.STT(
            # Gladia supports 99+ languages with auto-detection
            # language=["en", "es", "fr"],  # specify languages for better accuracy
        ),
        tts=elevenlabs.TTS(
            voice_id="21m00Tcm4TlvDq8ikWAM",
            model="eleven_multilingual_v2",
        ),
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=True,
    )

    @session.on("agent_false_interruption")
    def _on_agent_false_interruption(ev: AgentFalseInterruptionEvent):
        logger.info("false positive interruption, resuming")
        session.generate_reply(instructions=ev.extra_instructions or NOT_GIVEN)

    # Track user and agent messages for transcript
    @session.on("user_speech_committed")
    def _on_user_speech(ev):
        from datetime import datetime
        transcript_messages.append({
            "role": "user",
            "content": ev.alternatives[0].text if ev.alternatives else "",
            "timestamp": datetime.utcnow().isoformat(),
            "language": getattr(ev, "language", "unknown"),
        })
        logger.debug(f"User message captured: {ev.alternatives[0].text if ev.alternatives else ''}")

    @session.on("agent_speech_committed")
    def _on_agent_speech(ev):
        from datetime import datetime
        transcript_messages.append({
            "role": "assistant",
            "content": ev.text,
            "timestamp": datetime.utcnow().isoformat(),
        })
        logger.debug(f"Agent message captured: {ev.text}")

    usage_collector = metrics.UsageCollector()

    @session.on("metrics_collected")
    def _on_metrics_collected(ev: MetricsCollectedEvent):
        metrics.log_metrics(ev.metrics)
        usage_collector.collect(ev.metrics)

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
        
        # TODO: Save to Supabase
        # This is where you would call save_transcript_to_supabase()
        # For now, just log the transcript data
        if transcript_messages:
            logger.info("Transcript ready for Supabase:")
            logger.info(f"Session metadata: {session_metadata}")
            logger.info(f"Total messages: {len(transcript_messages)}")
            # Uncomment when Supabase integration is ready:
            # await save_transcript_to_supabase(session_metadata, transcript_messages, summary)

    ctx.add_shutdown_callback(cleanup_and_save_transcript)

    # Start the session with modern room options including SIP/telephony support
    await session.start(
        agent=Assistant(),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                # Use different noise cancellation for SIP calls vs web/mobile
                noise_cancellation=lambda params: noise_cancellation.BVCTelephony()
                if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                else noise_cancellation.BVC(),
            ),
        ),
    )

    # Connect to the room and begin handling the session
    await ctx.connect()


# Console mode for local testing
async def console_entrypoint(ctx: JobContext):
    """Console mode entrypoint for local testing"""
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

    # Initialize transcript storage for console mode too
    transcript_messages = []
    session_metadata = {
        "room_name": ctx.room.name,
        "started_at": None,
        "ended_at": None,
    }

    session = AgentSession(
        llm=openai.LLM(model="gpt-4o-mini"),
        stt=gladia.STT(
            # Gladia supports 99+ languages with auto-detection
            # language=["en", "es", "fr"],  # specify languages for better accuracy
        ),
        tts=elevenlabs.TTS(
            voice_id="21m00Tcm4TlvDq8ikWAM",
            model="eleven_multilingual_v2",
        ),
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=True,
    )

    @session.on("agent_false_interruption")
    def _on_agent_false_interruption(ev: AgentFalseInterruptionEvent):
        logger.info("false positive interruption, resuming")
        session.generate_reply(instructions=ev.extra_instructions or NOT_GIVEN)

    # Track messages in console mode too
    @session.on("user_speech_committed")
    def _on_user_speech(ev):
        from datetime import datetime
        transcript_messages.append({
            "role": "user",
            "content": ev.alternatives[0].text if ev.alternatives else "",
            "timestamp": datetime.utcnow().isoformat(),
            "language": getattr(ev, "language", "unknown"),
        })

    @session.on("agent_speech_committed")
    def _on_agent_speech(ev):
        from datetime import datetime
        transcript_messages.append({
            "role": "assistant",
            "content": ev.text,
            "timestamp": datetime.utcnow().isoformat(),
        })

    usage_collector = metrics.UsageCollector()

    @session.on("metrics_collected")
    def _on_metrics_collected(ev: MetricsCollectedEvent):
        metrics.log_metrics(ev.metrics)
        usage_collector.collect(ev.metrics)

    async def cleanup_console_session():
        """Console mode cleanup"""
        from datetime import datetime
        
        summary = usage_collector.get_summary()
        logger.info(f"Usage: {summary}")
        
        session_metadata["ended_at"] = datetime.utcnow().isoformat()
        logger.info(f"Console session ended. Transcript contains {len(transcript_messages)} messages")

    ctx.add_shutdown_callback(cleanup_console_session)

    # Start the session with simplified room options for console mode
    await session.start(
        agent=Assistant(),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=noise_cancellation.BVC(),
            ),
        ),
    )

    await ctx.connect()


if __name__ == "__main__":
    # Check if running in console mode
    if len(sys.argv) > 1 and sys.argv[1] == "console":
        # Console mode for local testing
        cli.run_app(WorkerOptions(entrypoint_fnc=console_entrypoint, prewarm_fnc=prewarm))
    else:
        # Production server mode
        cli.run_app(server)