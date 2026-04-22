"""One-shot script to apply RAG optimizations to agent/agent.py."""
import sys

with open('agent/agent.py', 'r', encoding='utf-8') as f:
    src = f.read()

changes = []

# ── 1. embed_text: replace async-with block with persistent client ──────────
old = (
    '    try:\n'
    '        async with httpx.AsyncClient(timeout=10.0) as client:\n'
    '            resp = await client.post(\n'
    '                "https://api.openai.com/v1/embeddings",\n'
    '                headers={\n'
    '                    "Authorization": f"Bearer {OPENAI_API_KEY}",\n'
    '                    "Content-Type": "application/json",\n'
    '                },\n'
    '                json={\n'
    '                    "model": "text-embedding-ada-002",\n'
    '                    "input": text,\n'
    '                },\n'
    '            )\n'
    '        if resp.status_code != 200:'
)
new = (
    '    try:\n'
    '        resp = await _get_client().post(\n'
    '            "https://api.openai.com/v1/embeddings",\n'
    '            headers={\n'
    '                "Authorization": f"Bearer {OPENAI_API_KEY}",\n'
    '                "Content-Type": "application/json",\n'
    '            },\n'
    '            json={\n'
    '                "model": "text-embedding-ada-002",\n'
    '                "input": text,\n'
    '            },\n'
    '            timeout=10.0,\n'
    '        )\n'
    '        if resp.status_code != 200:'
)
if old in src:
    src = src.replace(old, new, 1)
    changes.append("embed_text client: OK")
else:
    changes.append("embed_text client: NOT FOUND")

# ── 2. search_documents: threshold 0.7→0.5, move config check, client ───────
old = (
    'async def search_documents(query: str, match_threshold: float = 0.7, match_count: int = 3) -> list[dict]:\n'
    '    """Embed the query and call match_documents RPC in Supabase."""\n'
    '    embedding = await embed_text(query)\n'
    '    if embedding is None:\n'
    '        return []\n'
    '    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:\n'
    '        return []\n'
    '    try:\n'
    '        async with httpx.AsyncClient(timeout=10.0) as client:\n'
    '            resp = await client.post(\n'
    '                f"{SUPABASE_URL.rstrip(\'/\')}/rest/v1/rpc/match_documents",\n'
    '                headers={\n'
    '                    "apikey": SUPABASE_SERVICE_KEY,\n'
    '                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",\n'
    '                    "Content-Type": "application/json",\n'
    '                },\n'
    '                json={\n'
    '                    "query_embedding": embedding,\n'
    '                    "match_threshold": match_threshold,\n'
    '                    "match_count": match_count,\n'
    '                },\n'
    '            )\n'
    '        if resp.status_code != 200:'
)
new = (
    'async def search_documents(query: str, match_threshold: float = 0.5, match_count: int = 3) -> list[dict]:\n'
    '    """Embed the query and call match_documents RPC in Supabase."""\n'
    '    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:\n'
    '        return []\n'
    '    embedding = await embed_text(query)\n'
    '    if embedding is None:\n'
    '        return []\n'
    '    try:\n'
    '        resp = await _get_client().post(\n'
    '            f"{SUPABASE_URL.rstrip(\'/\')}/rest/v1/rpc/match_documents",\n'
    '            headers={\n'
    '                "apikey": SUPABASE_SERVICE_KEY,\n'
    '                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",\n'
    '                "Content-Type": "application/json",\n'
    '            },\n'
    '            json={\n'
    '                "query_embedding": embedding,\n'
    '                "match_threshold": match_threshold,\n'
    '                "match_count": match_count,\n'
    '            },\n'
    '            timeout=10.0,\n'
    '        )\n'
    '        if resp.status_code != 200:'
)
if old in src:
    src = src.replace(old, new, 1)
    changes.append("search_documents: OK")
else:
    changes.append("search_documents: NOT FOUND")

# ── 3. rag_search: threshold 0.7→0.5 ────────────────────────────────────────
old = '        results = await search_documents(query, match_threshold=0.7, match_count=3)'
new = '        results = await search_documents(query, match_threshold=0.5, match_count=3)'
if old in src:
    src = src.replace(old, new, 1)
    changes.append("rag_search threshold: OK")
else:
    changes.append("rag_search threshold: NOT FOUND")

# ── 4. web_search: replace async-with block with persistent client ───────────
old = (
    '        try:\n'
    '            async with httpx.AsyncClient(timeout=8.0) as client:\n'
    '                resp = await client.post(\n'
    '                    "https://api.exa.ai/search",\n'
    '                    headers={"x-api-key": EXA_API_KEY, "Content-Type": "application/json"},\n'
    '                    json={\n'
    '                        "query": query,\n'
    '                        "type": "auto",\n'
    '                        "num_results": 3,\n'
    '                        "contents": {\n'
    '                            "text": {"max_characters": 300},\n'
    '                            "highlights": {"max_characters": 300},\n'
    '                        },\n'
    '                    },\n'
    '                )\n'
    '            if resp.status_code != 200:'
)
new = (
    '        try:\n'
    '            resp = await _get_client().post(\n'
    '                "https://api.exa.ai/search",\n'
    '                headers={"x-api-key": EXA_API_KEY, "Content-Type": "application/json"},\n'
    '                json={\n'
    '                    "query": query,\n'
    '                    "type": "auto",\n'
    '                    "num_results": 3,\n'
    '                    "contents": {\n'
    '                        "text": {"max_characters": 300},\n'
    '                        "highlights": {"max_characters": 300},\n'
    '                    },\n'
    '                },\n'
    '                timeout=8.0,\n'
    '            )\n'
    '            if resp.status_code != 200:'
)
if old in src:
    src = src.replace(old, new, 1)
    changes.append("web_search client: OK")
else:
    changes.append("web_search client: NOT FOUND")

with open('agent/agent.py', 'w', encoding='utf-8') as f:
    f.write(src)

for c in changes:
    print(c)

failed = [c for c in changes if "NOT FOUND" in c]
sys.exit(1 if failed else 0)
