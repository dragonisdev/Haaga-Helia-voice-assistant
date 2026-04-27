import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Basic UUID format validation to prevent injection
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }

  const supabase = await createClient();

  const [sessionRes, messagesRes, usageRes] = await Promise.all([
    supabase
      .from('conversation_sessions')
      .select('id, room_name, started_at, ended_at, duration_seconds, metadata')
      .eq('id', id)
      .single(),
    supabase
      .from('conversation_messages')
      .select('turns, transcript_text, message_count')
      .eq('session_id', id)
      .single(),
    supabase
      .from('session_usage_metrics')
      .select('llm_prompt_tokens, llm_completion_tokens, tts_characters_count')
      .eq('session_id', id)
      .maybeSingle(),
  ]);

  if (sessionRes.error || !sessionRes.data) {
    notFound();
  }

  const session = sessionRes.data;
  const messages = messagesRes.data;
  const usage = usageRes.data;
  const turns: Turn[] = Array.isArray(messages?.turns) ? (messages.turns as Turn[]) : [];

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/admin"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
      >
        ← Back to sessions
      </Link>

      {/* Session metadata card */}
      <div className="border-border bg-card rounded-lg border p-5">
        <h1 className="text-foreground mb-4 text-xl font-semibold">Session Details</h1>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat
            label="Started"
            value={format(new Date(session.started_at), 'MMM d, yyyy HH:mm:ss')}
          />
          <Stat
            label="Ended"
            value={
              session.ended_at
                ? format(new Date(session.ended_at), 'MMM d, yyyy HH:mm:ss')
                : 'In progress'
            }
          />
          <Stat label="Duration" value={formatDuration(session.duration_seconds)} />
          <Stat label="Turns" value={String(messages?.message_count ?? turns.length)} />
          {usage && (
            <>
              <Stat
                label="Prompt tokens"
                value={usage.llm_prompt_tokens?.toLocaleString() ?? '—'}
              />
              <Stat
                label="Completion tokens"
                value={usage.llm_completion_tokens?.toLocaleString() ?? '—'}
              />
              <Stat
                label="TTS characters"
                value={usage.tts_characters_count?.toLocaleString() ?? '—'}
              />
              <Stat
                label="Total tokens"
                value={(
                  (usage.llm_prompt_tokens ?? 0) + (usage.llm_completion_tokens ?? 0)
                ).toLocaleString()}
              />
            </>
          )}
        </div>
        <div className="border-border mt-4 border-t pt-4">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Room ID
          </p>
          <p className="text-foreground mt-0.5 font-mono text-sm break-all">{session.room_name}</p>
        </div>
        <div className="mt-3">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Session ID
          </p>
          <p className="text-foreground mt-0.5 font-mono text-sm break-all">{session.id}</p>
        </div>
      </div>

      {/* Transcript */}
      <div className="border-border bg-card rounded-lg border">
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-foreground font-semibold">Transcript</h2>
          <span className="text-muted-foreground text-sm">{turns.length} turns</span>
        </div>

        {turns.length === 0 ? (
          <p className="text-muted-foreground px-5 py-10 text-center text-sm">
            No transcript recorded for this session.
          </p>
        ) : (
          <div className="divide-border divide-y">
            {turns.map((turn, i) => (
              <div
                key={i}
                className={`flex gap-3 px-5 py-4 ${turn.role === 'assistant' ? 'bg-muted/20' : ''}`}
              >
                {/* Role badge */}
                <div className="mt-0.5 shrink-0">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                      turn.role === 'user'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-accent text-accent-foreground'
                    }`}
                  >
                    {turn.role === 'user' ? 'User' : 'Assistant'}
                  </span>
                </div>
                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-sm leading-relaxed break-words whitespace-pre-wrap">
                    {turn.content}
                  </p>
                  {turn.timestamp && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {format(new Date(turn.timestamp), 'HH:mm:ss')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <p className="text-foreground mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}
