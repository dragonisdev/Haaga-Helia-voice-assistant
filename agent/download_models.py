# Minimal entrypoint used only at build time to pre-download plugin model files.
# Kept separate from agent.py so that Docker can cache the download layer
# independently of application code changes.
from livekit.agents import AgentServer, cli
from livekit.plugins import gladia, openai, silero  # noqa: F401


async def _entrypoint(ctx):  # pragma: no cover
    pass


server = AgentServer(_entrypoint)

if __name__ == "__main__":
    cli.run_app(server)
