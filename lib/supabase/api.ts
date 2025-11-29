import { SupabaseClient } from '@supabase/supabase-js';
import { AuthResult, MessageDraft, PullUpdatesResult } from './types';

const DEFAULT_BATCH_LIMIT = Number.parseInt(process.env.BACKEND_MAX_MESSAGE_BATCH || '20', 10);
const DEFAULT_PULL_LIMIT = Number.parseInt(process.env.BACKEND_MAX_PULL_LIMIT || '100', 10);

function clampBatch(messages: MessageDraft[], limit: number): MessageDraft[] {
  return messages.slice(0, Math.max(limit, 1));
}

function sanitizeMessages(messages: MessageDraft[]): MessageDraft[] {
  return messages
    .map((message) => ({
      ...message,
      body: message.body.trim(),
    }))
    .filter((message) => message.body.length > 0);
}

export async function authenticate(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<AuthResult> {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }

  return { user: data.user, session: data.session };
}

export async function sendBatch(
  client: SupabaseClient,
  drafts: MessageDraft[],
  maxBatchSize = DEFAULT_BATCH_LIMIT,
) {
  if (drafts.length > maxBatchSize) {
    throw new Error(`Batch too large; maximum allowed is ${maxBatchSize} messages.`);
  }

  const payload = clampBatch(sanitizeMessages(drafts), maxBatchSize);
  if (payload.length === 0) {
    return { data: [], error: null };
  }

  const { data, error } = await client.rpc('send_message_batch', {
    messages: payload,
  });

  if (error) {
    throw error;
  }

  return { data, error: null };
}

export async function pullUpdates(
  client: SupabaseClient,
  since?: string | null,
  maxRows = DEFAULT_PULL_LIMIT,
): Promise<PullUpdatesResult> {
  const { data, error } = await client.rpc('pull_updates', { since: since ?? null });

  if (error) {
    throw error;
  }

  const result: PullUpdatesResult = {
    conversations: [],
    messages: [],
    sync_cursors: [],
  };

  if (data && typeof data === 'object') {
    result.conversations = Array.isArray(data.conversations)
      ? data.conversations.slice(0, maxRows)
      : [];
    result.messages = Array.isArray(data.messages) ? data.messages.slice(0, maxRows) : [];
    result.sync_cursors = Array.isArray(data.sync_cursors)
      ? data.sync_cursors.slice(0, maxRows)
      : [];
  }

  return result;
}
