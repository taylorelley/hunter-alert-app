import { Session, User } from '@supabase/supabase-js';

export interface MessageDraft {
  conversation_id: string;
  body: string;
  client_id?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface PullUpdatesResult {
  conversations: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  sync_cursors: Record<string, unknown>[];
}

export interface AuthResult {
  user: User | null;
  session: Session | null;
}
