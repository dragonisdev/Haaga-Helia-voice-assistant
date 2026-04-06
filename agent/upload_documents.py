"""
Upload PDF documents to Supabase with OpenAI embeddings.

Uploads the original PDF to a Supabase Storage bucket ("documents"),
then chunks the text, embeds each chunk, and inserts them into the
documents table with a reference back to the source file.

Usage:
    python upload_documents.py path/to/file.pdf
    python upload_documents.py path/to/folder/   (uploads all PDFs in folder)
"""

import asyncio
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv
from pypdf import PdfReader

load_dotenv(".env.local")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

BUCKET_NAME = "documents"
CHUNK_SIZE = 500  # max words per chunk
CHUNK_OVERLAP = 50  # overlapping words between chunks


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract all text from a PDF file."""
    reader = PdfReader(pdf_path)
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"
    return text.strip()


def chunk_text(text: str) -> list[str]:
    """Split text into overlapping chunks by word count."""
    words = text.split()
    if len(words) <= CHUNK_SIZE:
        return [text]
    chunks = []
    start = 0
    while start < len(words):
        end = start + CHUNK_SIZE
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


async def upload_pdf_to_bucket(pdf_path: str, file_name: str) -> str | None:
    """Upload the original PDF to Supabase Storage and return the storage path."""
    storage_path = file_name
    storage_url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/{BUCKET_NAME}/{storage_path}"

    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/pdf",
    }

    with open(pdf_path, "rb") as f:
        file_data = f.read()

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(storage_url, headers=headers, content=file_data)

    if resp.status_code in (200, 201):
        print(f"  Uploaded PDF to bucket: {BUCKET_NAME}/{storage_path}")
        return storage_path
    else:
        print(f"  Bucket upload error: {resp.status_code} {resp.text}")
        return None


async def embed_text(text: str) -> list[float] | None:
    """Convert text to a 1536-dim vector using OpenAI embeddings."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "text-embedding-ada-002",
                "input": text,
            },
        )
    if resp.status_code != 200:
        print(f"  Embedding API error: {resp.status_code} {resp.text}")
        return None
    return resp.json()["data"][0]["embedding"]


async def upload_chunk(content: str, source: str) -> bool:
    """Embed a text chunk and insert it into the documents table."""
    embedding = await embed_text(content)
    if embedding is None:
        return False

    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    rest = SUPABASE_URL.rstrip("/") + "/rest/v1"

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{rest}/documents",
            headers=headers,
            json={
                "content": content,
                "embedding": embedding,
                "source": source,
            },
        )
    if resp.status_code not in (200, 201):
        print(f"  Supabase insert error: {resp.status_code} {resp.text}")
        return False
    return True


async def process_pdf(pdf_path: str):
    """Upload PDF to bucket, then extract, chunk, embed, and store."""
    print(f"\nProcessing: {pdf_path}")
    file_name = Path(pdf_path).name

    # 1. Upload original PDF to storage bucket
    storage_path = await upload_pdf_to_bucket(pdf_path, file_name)
    source = storage_path or file_name

    # 2. Extract and chunk text
    text = extract_text_from_pdf(pdf_path)
    if not text:
        print("  No text found in PDF, skipping chunks.")
        return

    chunks = chunk_text(text)
    print(f"  Extracted {len(chunks)} chunk(s)")

    # 3. Embed and insert each chunk
    for i, chunk in enumerate(chunks):
        success = await upload_chunk(chunk, source)
        status = "ok" if success else "FAILED"
        print(f"  Chunk {i + 1}/{len(chunks)}: {status}")


async def main():
    if len(sys.argv) < 2:
        print("Usage: python upload_documents.py <pdf_file_or_folder>")
        sys.exit(1)

    if not OPENAI_API_KEY or not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("Error: OPENAI_API_KEY, SUPABASE_URL, and SUPABASE_SERVICE_KEY must be set in .env.local")
        sys.exit(1)

    target = Path(sys.argv[1])
    if target.is_dir():
        pdfs = sorted(target.glob("*.pdf"))
        if not pdfs:
            print(f"No PDF files found in {target}")
            sys.exit(1)
        for pdf in pdfs:
            await process_pdf(str(pdf))
    elif target.is_file() and target.suffix.lower() == ".pdf":
        await process_pdf(str(target))
    else:
        print(f"Error: {target} is not a PDF file or directory")
        sys.exit(1)

    print("\nDone!")


if __name__ == "__main__":
    asyncio.run(main())
