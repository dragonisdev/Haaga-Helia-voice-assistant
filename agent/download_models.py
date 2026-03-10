"""
Minimal script for pre-downloading plugin model files during Docker build.
Only the plugins that ship local model weights are imported here.
This file is intentionally separate from agent.py so the Docker layer that runs
it is only invalidated when requirements.txt changes, not on every code change.
"""
import sys

from livekit.agents import AgentServer, cli
from livekit.plugins import noise_cancellation, silero  # noqa: F401
from livekit.plugins.turn_detector.multilingual import MultilingualModel  # noqa: F401

if __name__ == "__main__":
    # Ensure the download-files subcommand is active when called without args.
    if len(sys.argv) < 2:
        sys.argv.append("download-files")
    cli.run_app(AgentServer())
