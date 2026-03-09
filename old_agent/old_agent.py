"""
Generic LiveKit Voice AI Agent for SaaS Multi-Tenant Platform
Supports phone (SIP) and browser-based voice calls with per-user context
"""

import os
import json
import logging
import asyncio
import httpx
from datetime import datetime
from typing import Optional, Dict, Any, List
from dataclasses import dataclass

from dotenv import load_dotenv
from livekit import rtc, agents
from livekit.agents import (
    Agent,
    AgentSession,
    AgentServer,
    JobContext,
    room_io,
)
from livekit.plugins import openai, deepgram, silero

logger = logging.getLogger(__name__)
load_dotenv()


# ============================================================================
# DATA STRUCTURES
# ============================================================================

@dataclass
class UserConfig:
    """User-specific configuration loaded from backend"""
    user_id: str
    knowledge_base: List[Dict[str, Any]]
    agent_config: Dict[str, Any]


@dataclass
class CallMetadata:
    """Extracted metadata from room/participant"""
    room_sid: str
    room_name: str
    user_id: Optional[str]
    caller_number: Optional[str]
    called_number: Optional[str]
    started_at: datetime


# ============================================================================
# TRANSCRIPT REPOSITORY (Following ChatGPT's modularity advice)
# ============================================================================

class TranscriptRepository:
    """
    Clean abstraction for transcript storage.
    Implements: formatting → persistence → upload
    """
    def __init__(self, api_base_url: str, service_token: str):
        self.api_base_url = api_base_url.rstrip('/')
        self.service_token = service_token
        # Reuse HTTP client to avoid creating new connection pools
        self._client: Optional[httpx.AsyncClient] = None
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create a reusable HTTP client"""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client
    
    async def close(self):
        """Close HTTP client and cleanup resources"""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None
    
    def format_transcript(self, conversation_items: List[Any]) -> Dict[str, Any]:
        """
        Format LiveKit conversation history into structured transcript.
        Returns: { "turns": [...], "text": "plain text" }
        """
        turns = []
        for item in conversation_items:
            # Handle LiveKit ChatItem objects (from session.history.items)
            if hasattr(item, 'type') and item.type == 'message':
                # Extract text content from ChatMessage
                content = ""
                if hasattr(item, 'text_content') and item.text_content:
                    content = item.text_content
                elif hasattr(item, 'content'):
                    content = self._extract_content(item.content)
                
                # Get timestamp (created_at is a float timestamp)
                timestamp = None
                if hasattr(item, 'created_at'):
                    timestamp = datetime.fromtimestamp(item.created_at).isoformat()
                
                turn = {
                    "role": item.role,
                    "content": content,
                    "timestamp": timestamp,
                }
                turns.append(turn)
        
        # Generate plain text for full-text search
        text = "\n".join([f"{t['role']}: {t['content']}" for t in turns if t['content']])
        
        return {
            "turns": turns,
            "text": text
        }
    
    def _extract_content(self, content: Any) -> str:
        """Extract text from various content formats"""
        if isinstance(content, str):
            return content
        elif isinstance(content, list):
            return " ".join([str(c) for c in content])
        return str(content)
    
    async def save_session_end(
        self,
        room_name: str,
        user_id: str,
        transcript_data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Upload session data to backend API when call ends.
        Returns: True if successful, False otherwise
        """
        try:
            payload = {
                "room_name": room_name,
                "user_id": user_id,
                "ended_at": datetime.utcnow().isoformat(),
                "outcome": "completed",  # TODO: Determine based on conversation
                "transcript": transcript_data["turns"],
                "transcript_text": transcript_data["text"],
                **(metadata or {})
            }
            
            logger.info(f"🔍 Sending transcript to API: {len(transcript_data['turns'])} turns, {len(transcript_data['text'])} chars")
            logger.debug(f"📦 Full payload: {payload}")
            
            client = await self._get_client()
            response = await client.post(
                f"{self.api_base_url}/api/calls/agent-session-end",
                json=payload,
                headers={
                    "Authorization": f"Bearer {self.service_token}",
                    "Content-Type": "application/json"
                }
            )
            
            logger.info(f"📡 API Response Status: {response.status_code}")
            logger.debug(f"📡 API Response Body: {response.text}")
            
            if response.status_code in (200, 201):
                logger.info(f"✅ Transcript saved for room {room_name}")
                return True
            else:
                logger.error(f"❌ Failed to save transcript: {response.status_code} - {response.text}")
                return False
                    
        except Exception as e:
            logger.exception(f"❌ Exception while saving transcript: {e}")
            return False


# ============================================================================
# USER CONTEXT SERVICE
# ============================================================================

class UserContextService:
    """
    Fetches user-specific configuration and knowledge base from backend.
    """
    def __init__(self, api_base_url: str, service_token: str):
        self.api_base_url = api_base_url.rstrip('/')
        self.service_token = service_token
        # Reuse HTTP client to avoid creating new connection pools
        self._client: Optional[httpx.AsyncClient] = None
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create a reusable HTTP client"""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=15.0)
        return self._client
    
    async def close(self):
        """Close HTTP client and cleanup resources"""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None
    
    async def fetch_user_context(self, user_id: str) -> Optional[UserConfig]:
        """
        Fetch user configuration and knowledge base from backend.
        """
        try:
            client = await self._get_client()
            # Fetch knowledge base
            kb_response = await client.get(
                f"{self.api_base_url}/knowledgebase/records",
                headers={
                    "Authorization": f"Bearer {self.service_token}",
                    "X-User-ID": user_id  # Service account impersonation
                }
            )
                
            if kb_response.status_code != 200:
                logger.warning(f"Failed to fetch knowledge base for user {user_id}: {kb_response.status_code}")
                knowledge_base = []
            else:
                kb_data = kb_response.json()
                knowledge_base = kb_data.get('data', {}).get('records', [])
            
            # TODO: Fetch user agent configuration (persona, tools, etc.)
            agent_config = {
                "persona_name": "AI Assistant",
                "model": os.getenv("LLM_CHOICE", "gpt-4o-mini"),
                "voice": "alloy"
            }
            
            return UserConfig(
                user_id=user_id,
                knowledge_base=knowledge_base,
                agent_config=agent_config
            )
                
        except Exception as e:
            logger.exception(f"Failed to fetch user context: {e}")
            return None


# ============================================================================
# METADATA EXTRACTOR
# ============================================================================

def extract_call_metadata(ctx: JobContext) -> CallMetadata:
    """
    Extract metadata from LiveKit room and participants.
    Supports both:
    - Phone calls: user_id from room metadata (set by dispatch rule)
    - Browser calls: user_id from participant metadata
    """
    room = ctx.room
    
    # Try 1: Parse room metadata (for phone/SIP calls with dispatch rules)
    room_metadata = {}
    if room.metadata:
        try:
            room_metadata = json.loads(room.metadata)
        except json.JSONDecodeError:
            logger.warning(f"Failed to parse room metadata: {room.metadata}")
    
    user_id = room_metadata.get("user_id")
    
    # Try 2: If not in room metadata, check participant metadata (for browser calls)
    caller_number = None
    called_number = None
    
    for participant in room.remote_participants.values():
        # Check participant metadata for user_id (browser calls)
        if not user_id and hasattr(participant, 'metadata') and participant.metadata:
            try:
                participant_metadata = json.loads(participant.metadata)
                user_id = participant_metadata.get('user_id') or user_id
                logger.info(f"Found user_id in participant metadata: {user_id}")
            except json.JSONDecodeError:
                pass
        
        # Check participant attributes for phone numbers (SIP calls)
        if hasattr(participant, 'attributes'):
            caller_number = participant.attributes.get('caller_number') or caller_number
            called_number = participant.attributes.get('called_number') or called_number
    
    return CallMetadata(
        room_sid=room.sid or room.name,  # Use name as fallback
        room_name=room.name,
        user_id=user_id,
        caller_number=caller_number,
        called_number=called_number,
        started_at=datetime.utcnow()
    )


# ============================================================================
# GENERIC VOICE ASSISTANT
# ============================================================================

class GenericAssistant(Agent):
    """
    Multi-tenant voice assistant that adapts to each user's configuration.
    """
    def __init__(self, user_config: UserConfig):
        self.user_config = user_config
        
        # Build system prompt with user's knowledge base
        system_prompt = self._build_system_prompt()
        
        # Initialize with user-specific config
        # Note: Model settings are configured in AgentSession, not Agent
        super().__init__(
            instructions=system_prompt
        )
    
    def _build_system_prompt(self) -> str:
        """
        Build system prompt with user's knowledge base context.
        """
        persona = self.user_config.agent_config.get("persona_name", "AI Assistant")
        
        # Extract knowledge base content
        kb_content = ""
        if self.user_config.knowledge_base:
            kb_items = []
            for record in self.user_config.knowledge_base[:10]:  # Limit to prevent context overflow
                title = record.get('title', 'Untitled')
                content = record.get('content', '')
                if content:
                    kb_items.append(f"**{title}**\n{content}")
            
            if kb_items:
                kb_content = "\n\n## Knowledge Base\n" + "\n\n---\n\n".join(kb_items)
        
        system_prompt = f"""You are {persona}, a helpful voice AI assistant.

## Your Role
- Assist the caller with their questions and requests
- Be conversational, friendly, and professional
- Use the knowledge base below to answer questions accurately
- If you don't know something, say so honestly

{kb_content}

## Guidelines
- Keep responses concise for voice conversation
- Ask clarifying questions when needed
- Be natural and human-like in your speech patterns
"""
        
        return system_prompt


# ============================================================================
# MAIN ENTRYPOINT
# ============================================================================

server = AgentServer(name="old_agent")

@server.rtc_session()
async def entrypoint(ctx: JobContext):
    """
    Main entry point for each voice call.
    Handles both SIP (phone) and browser-based calls.
    """
    logger.info(f"🚀 Agent starting for room: {ctx.room.name}")
    
    # Connect to room
    await ctx.connect()
    
    # Wait for participant to join (needed for browser calls to get metadata)
    logger.info("⏳ Waiting for participant to join...")
    participant = await ctx.wait_for_participant()
    logger.info(f"✅ Participant joined: {participant.identity}")
    
    # Extract call metadata (supports both phone and browser calls)
    call_metadata = extract_call_metadata(ctx)
    
    if not call_metadata.user_id:
        logger.error("❌ No user_id found in room metadata. Cannot proceed without user context.")
        # For multi-tenant SaaS, this is critical - each call MUST have a user_id
        return
    
    logger.info(f"📞 Call from {call_metadata.caller_number} for user {call_metadata.user_id}")
    
    # Initialize services
    api_base_url = os.getenv("API_BASE_URL")
    service_token = os.getenv("SERVICE_TOKEN")
    
    if not api_base_url or not service_token:
        logger.error("❌ Missing API_BASE_URL or SERVICE_TOKEN environment variables")
        return
    
    user_service = UserContextService(api_base_url, service_token)
    transcript_repo = TranscriptRepository(api_base_url, service_token)
    
    try:
        # Fetch user-specific context
        user_config = await user_service.fetch_user_context(call_metadata.user_id)
        
        if not user_config:
            logger.error(f"❌ Failed to load user context for {call_metadata.user_id}")
            return
        
        logger.info(f"✅ Loaded {len(user_config.knowledge_base)} knowledge base records for user")
        
        # Create user-specific assistant
        assistant = GenericAssistant(user_config)
        
        # Initialize AgentSession with STT/TTS
        # Lazy-load VAD per session to save idle memory (~50-100MB)
        logger.info("🔄 Loading VAD model for this session...")
        vad = silero.VAD.load(
            min_speech_duration=0.05,      # Minimum speech duration in seconds (50ms)
            min_silence_duration=0.55,     # How long of silence before considering speech ended (550ms)
            prefix_padding_duration=0.1,   # Padding around speech segments (100ms)
            activation_threshold=0.5,      # Sensitivity threshold (0.0-1.0, lower = more sensitive)
        )
        logger.info("✅ VAD model loaded")
        
        session = AgentSession(
            stt=deepgram.STT(model="nova-2", language="en"),
            llm=openai.LLM(model=user_config.agent_config.get("model", "gpt-4o-mini")),
            tts=openai.TTS(voice=user_config.agent_config.get("voice", "alloy")),
            vad=vad,
        )
        
        # Start the session with room options
        await session.start(
            room=ctx.room,
            agent=assistant,
        )
        
        # Say initial greeting immediately (before entering listening mode)
        # Make greeting non-interruptible to ensure users hear the full message
        await session.say(
            "Hello! I'm your AI assistant. How can I help you today?",
            allow_interruptions=False,  # Prevent user from interrupting the greeting
        )
        
        # Track session state for disconnect handling
        cleanup_task = None
        session_ended = asyncio.Event()
        
        # Monitor participant disconnect (handles browser close)
        @ctx.room.on("participant_disconnected")
        def on_participant_disconnected(participant: rtc.RemoteParticipant):
            """Handle participant disconnect (browser close, network loss, etc.)"""
            logger.warning(f"⚠️ Participant disconnected: {participant.identity} (SID: {participant.sid})")
            # Session should close automatically, but set event as backup
            session_ended.set()
        
        # Save transcript when session closes (proper LiveKit way)
        @session.on("close")
        def on_session_close(event):
            """Handle session close and save transcript"""
            nonlocal cleanup_task
            logger.info(f"📝 Session closing: {event.reason}")
            logger.info(f"💾 Saving call transcript from session.history...")
            session_ended.set()  # Ensure we exit wait loop
            
            # IMPORTANT: Make a COPY of the conversation items to avoid holding references
            # to the session object after cleanup
            conversation_items = []
            if hasattr(session, 'history') and hasattr(session.history, 'items'):
                # Create a shallow copy of the list to avoid memory retention
                conversation_items = list(session.history.items)
                logger.info(f"📊 Copied {len(conversation_items)} items from session history")
            
            transcript_data = transcript_repo.format_transcript(conversation_items)
            logger.info(f"✅ Formatted transcript: {len(transcript_data['turns'])} turns, {len(transcript_data['text'])} chars")
            
            # Save to database (synchronous callback must use asyncio.create_task)
            async def save_and_cleanup():
                try:
                    await transcript_repo.save_session_end(
                        room_name=call_metadata.room_name,
                        user_id=call_metadata.user_id,
                        transcript_data=transcript_data,
                        metadata={
                            "caller_number": call_metadata.caller_number,
                            "called_number": call_metadata.called_number,
                            "started_at": call_metadata.started_at.isoformat(),
                        }
                    )
                finally:
                    # Explicit cleanup to help garbage collection
                    conversation_items.clear()
                    transcript_data.clear()
                    logger.info("🧹 Cleaned up transcript data")
            
            # Schedule the async save and track the task
            cleanup_task = asyncio.create_task(save_and_cleanup())
        
        logger.info("✅ Agent session ready - waiting for call to end")
        
        # Set up session timeout to prevent zombie sessions
        SESSION_TIMEOUT = int(os.getenv("SESSION_TIMEOUT_SECONDS", "1800"))  # 30 min default
        
        async def session_timeout_handler():
            """End session after timeout to prevent infinite hangs"""
            await asyncio.sleep(SESSION_TIMEOUT)
            if not session_ended.is_set():
                logger.warning(f"⏱️ Session timeout after {SESSION_TIMEOUT}s - force ending")
                try:
                    await session.end()
                except Exception as e:
                    logger.error(f"Error ending session: {e}")
                session_ended.set()
        
        timeout_task = asyncio.create_task(session_timeout_handler())
        
        try:
            # Wait for the session to complete (or timeout/disconnect)
            await session.wait_for_completion()
        except Exception as e:
            logger.error(f"❌ Error during session: {e}")
            session_ended.set()
        finally:
            # Cancel timeout task if session ended normally
            if not timeout_task.done():
                timeout_task.cancel()
                try:
                    await timeout_task
                except asyncio.CancelledError:
                    pass
        
    finally:
        # Ensure cleanup task completes before agent shuts down
        if cleanup_task and not cleanup_task.done():
            logger.info("⏳ Waiting for cleanup task to complete...")
            try:
                await asyncio.wait_for(cleanup_task, timeout=10.0)
            except asyncio.TimeoutError:
                logger.warning("⚠️ Cleanup task timed out after 10 seconds")
        
        # Final cleanup of services (always runs even if errors occur)
        await user_service.close()
        await transcript_repo.close()
        logger.info("🏁 Agent session fully cleaned up")


# ============================================================================
# WORKER STARTUP
# ============================================================================

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - INFO - %(message)s'
    )
    
    # Validate required environment variables
    required_vars = [
        "LIVEKIT_URL",
        "LIVEKIT_API_KEY",
        "LIVEKIT_API_SECRET",
        "API_BASE_URL",
        "SERVICE_TOKEN"
    ]
    
    missing = [var for var in required_vars if not os.getenv(var)]
    if missing:
        logger.error(f"❌ Missing required environment variables: {', '.join(missing)}")
        exit(1)
    
    logger.info("🎙️  Starting LiveKit Voice AI Agent Worker")
    logger.info(f"📡 LiveKit URL: {os.getenv('LIVEKIT_URL')}")
    logger.info(f"🔗 Backend API: {os.getenv('API_BASE_URL')}")
    
    agents.cli.run_app(server)
