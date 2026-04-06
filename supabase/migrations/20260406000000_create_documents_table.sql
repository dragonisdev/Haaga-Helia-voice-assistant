-- Enable pgvector extension for embedding similarity search
create extension if not exists vector;

-- Store document chunks with their embeddings for RAG
create table documents (
  id bigserial primary key,
  content text,
  embedding vector(1536),
  source text
);

-- Search for similar documents using cosine distance
-- match_threshold: minimum similarity score (0-1)
-- match_count: maximum number of results to return
create function match_documents (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  content text,
  similarity float
)
language sql stable
as $$
  select
    id,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from documents
  where 1 - (embedding <=> query_embedding) > match_threshold
  order by (embedding <=> query_embedding)
  limit match_count;
$$;
