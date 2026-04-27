import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { createClient } from '@/lib/supabase/server';

const PAGE_SIZE = 25;

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { page: pageParam, q } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();

  // Fetch sessions with joined message counts and usage metrics
  let query = supabase
    .from('conversation_sessions')
    .select(
      `
      id,
      room_name,
      started_at,
      ended_at,
      duration_seconds,
      conversation_messages ( message_count ),
      session_usage_metrics ( llm_prompt_tokens, llm_completion_tokens, tts_characters_count )
    `,
      { count: 'exact' }
    )
    .order('started_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (q) {
    query = query.ilike('room_name', `%${q}%`);
  }

  const { data: sessions, count, error } = await query;

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-semibold">Call Sessions</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {count !== null ? `${count} session${count === 1 ? '' : 's'} recorded` : 'Loading…'}
          </p>
        </div>

        {/* Search */}
        <form method="GET" className="flex gap-2">
          <input
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search by room name…"
            className="border-input bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-56 rounded-md border px-3 py-1.5 text-sm outline-none focus:ring-2"
          />
          <button
            type="submit"
            className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90"
          >
            Search
          </button>
          {q && (
            <Link
              href="/admin"
              className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1.5 text-sm transition-colors"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive rounded-md px-4 py-3 text-sm">
          Failed to load sessions: {error.message}
        </div>
      )}

      {/* Table */}
      <div className="border-border overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-border border-b text-left">
                <th className="text-muted-foreground px-4 py-3 font-medium">Started</th>
                <th className="text-muted-foreground px-4 py-3 font-medium">Duration</th>
                <th className="text-muted-foreground px-4 py-3 font-medium">Turns</th>
                <th className="text-muted-foreground hidden px-4 py-3 font-medium lg:table-cell">
                  Prompt tokens
                </th>
                <th className="text-muted-foreground hidden px-4 py-3 font-medium lg:table-cell">
                  Completion tokens
                </th>
                <th className="text-muted-foreground hidden px-4 py-3 font-medium xl:table-cell">
                  TTS chars
                </th>
                <th className="text-muted-foreground px-4 py-3 font-medium">Room</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {!sessions || sessions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-muted-foreground px-4 py-10 text-center text-sm">
                    {q ? 'No sessions match your search.' : 'No sessions recorded yet.'}
                  </td>
                </tr>
              ) : (
                sessions.map((s) => {
                  const msgs = Array.isArray(s.conversation_messages)
                    ? (s.conversation_messages[0] as { message_count?: number } | undefined)
                    : (s.conversation_messages as { message_count?: number } | null);
                  const usage = Array.isArray(s.session_usage_metrics)
                    ? (s.session_usage_metrics[0] as
                        | {
                            llm_prompt_tokens?: number;
                            llm_completion_tokens?: number;
                            tts_characters_count?: number;
                          }
                        | undefined)
                    : (s.session_usage_metrics as {
                        llm_prompt_tokens?: number;
                        llm_completion_tokens?: number;
                        tts_characters_count?: number;
                      } | null);

                  return (
                    <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                      <td className="text-foreground px-4 py-3">
                        <div className="font-medium">
                          {format(new Date(s.started_at), 'MMM d, yyyy')}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {format(new Date(s.started_at), 'HH:mm:ss')}
                          {' · '}
                          {formatDistanceToNow(new Date(s.started_at), { addSuffix: true })}
                        </div>
                      </td>
                      <td className="text-foreground px-4 py-3">
                        {formatDuration(s.duration_seconds)}
                      </td>
                      <td className="text-foreground px-4 py-3">{msgs?.message_count ?? '—'}</td>
                      <td className="text-foreground hidden px-4 py-3 lg:table-cell">
                        {usage?.llm_prompt_tokens?.toLocaleString() ?? '—'}
                      </td>
                      <td className="text-foreground hidden px-4 py-3 lg:table-cell">
                        {usage?.llm_completion_tokens?.toLocaleString() ?? '—'}
                      </td>
                      <td className="text-foreground hidden px-4 py-3 xl:table-cell">
                        {usage?.tts_characters_count?.toLocaleString() ?? '—'}
                      </td>
                      <td className="text-muted-foreground max-w-[160px] truncate px-4 py-3 font-mono text-xs">
                        {s.room_name}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/sessions/${s.id}`}
                          className="text-primary text-xs font-medium hover:underline"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                className="border-border bg-background text-foreground rounded-md border px-3 py-1.5 text-sm transition-opacity hover:opacity-80"
              >
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                className="border-border bg-background text-foreground rounded-md border px-3 py-1.5 text-sm transition-opacity hover:opacity-80"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
