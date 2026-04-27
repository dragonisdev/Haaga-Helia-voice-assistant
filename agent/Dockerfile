# Multi-stage build for better caching
FROM python:3.13-slim AS builder

ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies in a separate layer that can be cached
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# Final stage
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Copy installed packages from builder stage (no gcc needed at runtime)
COPY --from=builder /root/.local /root/.local

# Pre-download ML models using a minimal stub that does NOT change with agent code.
# This layer is cached independently of agent.py, so model re-downloads are
# skipped on every normal code push.
COPY download_models.py .
RUN python download_models.py download-files

# Copy application code last so the layers above stay cached between pushes.
COPY agent.py .

CMD ["python", "agent.py", "start"]
