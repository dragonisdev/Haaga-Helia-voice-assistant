#!/usr/bin/env python3
import os
import sys
from dotenv import load_dotenv

print("=== Railway vs Local Environment Check ===")
print(f"Python version: {sys.version.split()[0]}")
print(f"Platform: {sys.platform}")
print(f"Working directory: {os.getcwd()}")
print(f"User: {os.getenv('USER', 'unknown')}")

print("\n=== Environment Variables ===")
load_dotenv('.env.local')

required_vars = ['ELEVEN_API_KEY', 'OPENAI_API_KEY', 'GLADIA_API_KEY', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_URL']
for var in required_vars:
    value = os.getenv(var)
    if value:
        print(f"✅ {var}: {value[:10]}... (length: {len(value)})")
    else:
        print(f"❌ {var}: NOT SET")

print("\n=== Package Check ===")
try:
    import livekit.agents
    print("✅ LiveKit Agents available")
except ImportError as e:
    print(f"❌ LiveKit Agents: {e}")

try:
    from livekit.plugins import elevenlabs
    print("✅ ElevenLabs plugin available")
except ImportError as e:
    print(f"❌ ElevenLabs plugin: {e}")

try:
    from livekit.plugins import openai
    print("✅ OpenAI plugin available")
except ImportError as e:
    print(f"❌ OpenAI plugin: {e}")

print("\n=== ElevenLabs API Test ===")
eleven_key = os.getenv('ELEVEN_API_KEY')
if eleven_key:
    try:
        import requests
        response = requests.get('https://api.elevenlabs.io/v1/user',
                              headers={'xi-api-key': eleven_key},
                              timeout=10)
        print(f"ElevenLabs API status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"User: {data.get('first_name', 'Unknown')} {data.get('last_name', 'Unknown')}")
            print(f"Subscription: {data.get('subscription', {}).get('tier', 'Unknown')}")
            print(f"Character count: {data.get('subscription', {}).get('character_count', 'Unknown')}")
            print(f"Character limit: {data.get('subscription', {}).get('character_limit', 'Unknown')}")
        else:
            print(f"API Error: {response.status_code} - {response.text[:200]}")
    except Exception as e:
        print(f"API test failed: {e}")
else:
    print("ELEVEN_API_KEY not found")