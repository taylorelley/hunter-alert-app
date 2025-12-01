import { describe, expect, it, vi } from 'vitest';
import { authenticate, pullUpdates, sendBatch } from '../lib/supabase/api';
import { MessageDraft } from '../lib/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('supabase api wrapper', () => {
  const mockClient = () => {
    const rpc = vi.fn();
    const auth = { signInWithPassword: vi.fn() } as unknown as SupabaseClient['auth'];
    return { rpc, auth } as unknown as SupabaseClient;
  };

  it('authenticates and returns user/session payload', async () => {
    const client = mockClient();
    const user = { id: 'user-1' };
    const session = { access_token: 'token' };
    (client.auth.signInWithPassword as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user, session },
      error: null,
    });

    const result = await authenticate(client, 'email@example.com', 'hunter2');
    expect(result).toEqual({ user, session });
  });

  it('throws when authentication fails', async () => {
    const client = mockClient();
    const authError = new Error('bad creds');
    (client.auth.signInWithPassword as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: null, session: null },
      error: authError,
    });

    await expect(authenticate(client, 'email@example.com', 'hunter2')).rejects.toThrow(authError);
  });

  it('rejects batches above the configured limit', async () => {
    const client = mockClient();
    const drafts: MessageDraft[] = Array.from({ length: 3 }, (_, idx) => ({
      conversation_id: 'c1',
      body: `message-${idx}`,
    }));

    await expect(sendBatch(client, drafts, 2)).rejects.toThrow('Batch too large');
  });

  it('trims and filters messages before sending', async () => {
    const client = mockClient();
    (client.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: ['ok'], error: null });

    const drafts: MessageDraft[] = [
      { conversation_id: 'c1', body: '  hello  ' },
      { conversation_id: 'c1', body: '   ' },
    ];

    const result = await sendBatch(client, drafts, 5);
    expect(client.rpc).toHaveBeenCalledWith('send_message_batch', {
      messages: [
        { conversation_id: 'c1', body: 'hello' },
      ],
    });
    expect(result.data).toEqual(['ok']);
    expect(result.dropped).toEqual([{ draft: drafts[1], reason: 'empty_body' }]);
  });

  it('skips RPC when sanitized payload is empty', async () => {
    const client = mockClient();
    (client.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], error: null });

    const drafts: MessageDraft[] = [{ conversation_id: 'c1', body: '   ' }];
    const result = await sendBatch(client, drafts, 5);

    expect(client.rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ data: [], error: null, dropped: [{ draft: drafts[0], reason: 'empty_body' }] });
  });

  it('drops messages with unserializable metadata without failing the batch', async () => {
    const client = mockClient();
    (client.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: ['ok'], error: null });

    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const drafts: MessageDraft[] = [
      { conversation_id: 'c1', body: 'valid message' },
      { conversation_id: 'c1', body: 'bad metadata', metadata: circular },
    ];

    const result = await sendBatch(client, drafts, 5);

    expect(result.data).toEqual(['ok']);
    expect(result.dropped).toEqual([
      { draft: drafts[1], reason: 'metadata_not_serializable' },
    ]);
  });

  it('slices pull_updates responses to maxRows and handles missing collections', async () => {
    const client = mockClient();
    const conversations = [{ id: 1 }, { id: 2 }];
    const messages = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const sync_cursors = [{ id: 1 }];
    const groups = [{ id: 1 }];
    const group_invitations = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const group_activity = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const waypoints = [{ id: 1 }];
    const geofences = [{ id: 1 }];
    const profiles = [{ id: 1 }];
    (client.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        conversations,
        messages,
        sync_cursors,
        groups,
        group_invitations,
        group_activity,
        waypoints,
        geofences,
        profiles,
      },
      error: null,
    });

    const result = await pullUpdates(client, null, 2);
    expect(result).toEqual({
      conversations: conversations.slice(0, 2),
      messages: messages.slice(0, 2),
      sync_cursors,
      groups,
      group_invitations: group_invitations.slice(0, 2),
      group_activity: group_activity.slice(0, 2),
      waypoints,
      geofences,
      profiles,
    });
  });

  it('throws when pull_updates returns an error', async () => {
    const client = mockClient();
    const rpcError = new Error('rpc failed');
    (client.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: rpcError });

    await expect(pullUpdates(client, 'cursor')).rejects.toThrow(rpcError);
  });
});
