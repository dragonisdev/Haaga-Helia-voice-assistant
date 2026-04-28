import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Escape a single CSV cell value
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Wrap in quotes if the value contains a comma, newline, or double-quote
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function buildCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    'sep=,',                 // tells Excel to use comma as delimiter regardless of locale
    headers.join(','),
    ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(',')),
  ];
  // Prepend UTF-8 BOM so Excel opens with correct encoding
  return '\uFEFF' + lines.join('\r\n');
}

export async function GET() {
  const supabase = await createClient();

  // Fetch all sessions with message counts, usage metrics, and transcript (no pagination)
  const { data: sessions, error } = await supabase
    .from('conversation_sessions')
    .select(
      `
      id,
      room_name,
      started_at,
      ended_at,
      duration_seconds,
      metadata,
      created_at,
      conversation_messages ( message_count, transcript_text, turns ),
      session_usage_metrics ( llm_prompt_tokens, llm_completion_tokens, tts_characters_count )
    `
    )
    .order('started_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten into one row per session, mirroring the DB column structure
  const rows = (sessions ?? []).map((s) => {
    const msgs = Array.isArray(s.conversation_messages)
      ? (s.conversation_messages[0] as {
          message_count?: number;
          transcript_text?: string;
          turns?: unknown;
        } | undefined)
      : (s.conversation_messages as {
          message_count?: number;
          transcript_text?: string;
          turns?: unknown;
        } | null);

    const usage = Array.isArray(s.session_usage_metrics)
      ? (s.session_usage_metrics[0] as {
          llm_prompt_tokens?: number;
          llm_completion_tokens?: number;
          tts_characters_count?: number;
        } | undefined)
      : (s.session_usage_metrics as {
          llm_prompt_tokens?: number;
          llm_completion_tokens?: number;
          tts_characters_count?: number;
        } | null);

    return {
      id: s.id,
      room_name: s.room_name,
      started_at: s.started_at,
      ended_at: s.ended_at ?? '',
      duration_seconds: s.duration_seconds ?? '',
      message_count: msgs?.message_count ?? '',
      llm_prompt_tokens: usage?.llm_prompt_tokens ?? '',
      llm_completion_tokens: usage?.llm_completion_tokens ?? '',
      tts_characters_count: usage?.tts_characters_count ?? '',
      transcript_text: msgs?.transcript_text ?? '',
      turns: msgs?.turns ? JSON.stringify(msgs.turns) : '',
      metadata: s.metadata ? JSON.stringify(s.metadata) : '',
      created_at: s.created_at,
    };
  });

  const csv = buildCsv(rows);
  const filename = `sessions-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
