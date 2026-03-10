# syntax=docker/dockerfile:1
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y gcc

WORKDIR /app

# Install dependencies. Cache is reused across builds even when the layer is busted.
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

# Download plugin model files (Silero, BVC, MultilingualModel).
# This layer only rebuilds when requirements.txt changes — not on every agent.py edit.
COPY download_models.py .
RUN python download_models.py download-files

# Copy application code last so model downloads are not re-triggered by code changes.
COPY agent.py .

CMD ["python", "agent.py", "start"]
