FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY agent.py .

RUN python agent.py download-files

CMD ["python", "agent.py", "start"]
