import { describe, expect, it, vi } from 'vitest';
import { appConfig } from '../lib/config/env';
import {
  authenticate,
  beginSmsVerification,
  confirmSmsVerification,
  listDeviceSessions,
  pullUpdates,
  recordDeviceSession,
  resendGroupInvitation,
  revokeDeviceSession,
  sendBatch,
  togglePushSubscription,
  upsertPushSubscription,
  withdrawGroupInvitation,
} from '../lib/supabase/api';
import { MessageDraft } from '../lib/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('supabase api wrapper', () => {
  const mockClient = () => {
    const rpc = vi.fn();
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const single = vi.fn().mockResolvedValue({ data: {}, error: null });
    const select = vi.fn(() => ({ order, single }));
    const eq = vi.fn(() => ({ select, single }));
    const upsert = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ select, eq }));
    const from = vi.fn(() => ({ select, upsert, update, eq }));
    const auth = {
      signInWithPassword: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    } as unknown as SupabaseClient['auth'];
    return { rpc, auth, from } as unknown as SupabaseClient;
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

  it('clamps oversized client batch requests to the backend limit', async () => {
    const client = mockClient();
    (client.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: ['ok'], error: null });

    const backendLimit = appConfig.constraints.backendMaxMessageBatch.value;
    const drafts: MessageDraft[] = Array.from({ length: backendLimit + 5 }, (_, idx) => ({
      conversation_id: 'c1',
      body: `message-${idx}`,
    }));

    const result = await sendBatch(client, drafts, backendLimit + 10);

    const payload = (client.rpc as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].messages as MessageDraft[];
    expect(payload).toHaveLength(backendLimit);
    expect(payload[0]).toEqual({ conversation_id: 'c1', body: 'message-0' });
    expect(payload[payload.length - 1]).toEqual({
      conversation_id: 'c1',
      body: `message-${backendLimit - 1}`,
    });
    expect(result.dropped).toEqual([]);
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

  it('drops messages exceeding MAX_MESSAGE_BYTES', async () => {
    const client = mockClient();
    (client.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: ['ok'], error: null });

    const largeBody = 'x'.repeat(5000);
    const drafts: MessageDraft[] = [
      { conversation_id: 'c1', body: 'small message' },
      { conversation_id: 'c1', body: largeBody },
    ];

    const result = await sendBatch(client, drafts, 5);

    expect(result.data).toEqual(['ok']);
    expect(result.dropped).toEqual([
      expect.objectContaining({ draft: drafts[1], reason: 'oversize' }),
    ]);
  });

  it('records a device session via RPC', async () => {
    const client = mockClient();
    const sessionRecord = { id: 'ds-1', client_session_id: 'client-1' };
    (client.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: sessionRecord, error: null });

    const result = await recordDeviceSession(client, {
      client_session_id: 'client-1',
      device_model: 'iPhone',
      platform: 'ios',
      os_version: '17.0',
    });

    expect(client.rpc).toHaveBeenCalledWith('record_device_session', expect.any(Object));
    expect(result).toEqual(sessionRecord);
  });

  it('revokes a device session via RPC', async () => {
    const client = mockClient();
    const revoked = { id: 'ds-1', revoked_at: new Date().toISOString() };
    (client.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: revoked, error: null });

    const result = await revokeDeviceSession(client, 'ds-1');

    expect(client.rpc).toHaveBeenCalledWith('revoke_device_session', { target_id: 'ds-1' });
    expect(result).toEqual(revoked);
  });

  it('lists device sessions after verifying auth session', async () => {
    const client = mockClient();
    (client.from as unknown as ReturnType<typeof vi.fn>)().select().order.mockResolvedValue({
      data: [{ id: 'ds-1' }],
      error: null,
    });

    const result = await listDeviceSessions(client);

    expect(client.auth.getSession).toHaveBeenCalled();
    expect(client.from).toHaveBeenCalledWith('device_sessions');
    expect(result).toEqual([{ id: 'ds-1' }]);
  });

  it('throws when the auth session check fails before listing device sessions', async () => {
    const client = mockClient();
    const sessionError = new Error('session lookup failed');
    (client.auth.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: null },
      error: sessionError,
    });

    await expect(listDeviceSessions(client)).rejects.toThrow(sessionError);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('throws when listing device sessions without auth session', async () => {
    const client = mockClient();
    (client.auth.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { session: null }, error: null });

    await expect(listDeviceSessions(client)).rejects.toThrow('Cannot list device sessions without an active session');
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
    const device_sessions = [{ id: 1 }, { id: 2 }];
    const privacy_settings = [
      { user_id: 'user-1', share_location: true },
      { user_id: 'user-2', share_location: false },
      { user_id: 'user-3', share_location: true },
    ];
    const push_subscriptions: unknown[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const sms_alert_subscriptions: unknown[] = [{ id: 'sms-1' }, { id: 'sms-2' }, { id: 'sms-3' }];
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
        device_sessions,
        privacy_settings,
        push_subscriptions,
        sms_alert_subscriptions,
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
      device_sessions: device_sessions.slice(0, 2),
      privacy_settings: privacy_settings.slice(0, 2),
      push_subscriptions: push_subscriptions.slice(0, 2),
      sms_alert_subscriptions: sms_alert_subscriptions.slice(0, 2),
    });
  });

  it('resends and withdraws invitations with an active session', async () => {
    const client = mockClient();
    (client.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'invite-1' }, error: null });

    const resent = await resendGroupInvitation(client, 'invite-1');
    expect(client.rpc).toHaveBeenCalledWith('resend_group_invitation', { invitation_id: 'invite-1' });
    expect(resent).toEqual({ id: 'invite-1' });

    const withdrawn = await withdrawGroupInvitation(client, 'invite-1');
    expect(client.rpc).toHaveBeenCalledWith('withdraw_group_invitation', { invitation_id: 'invite-1' });
    expect(withdrawn).toEqual({ id: 'invite-1' });
  });

  it('throws when resending or withdrawing invitations without a session', async () => {
    const client = mockClient();
    (client.auth.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { session: null }, error: null });

    await expect(resendGroupInvitation(client, 'invite-1')).rejects.toThrow('Cannot resend invitation without an active session');
    await expect(withdrawGroupInvitation(client, 'invite-1')).rejects.toThrow('Cannot withdraw invitation without an active session');
  });

  it('upserts and toggles push subscriptions after session verification', async () => {
    const client = mockClient();
    const tableApi = (client.from as unknown as ReturnType<typeof vi.fn>)();
    tableApi.select().single.mockResolvedValueOnce({ data: { id: 'push-1' }, error: null });
    tableApi.select().single.mockResolvedValueOnce({ data: { id: 'push-1', enabled: false }, error: null });

    const upserted = await upsertPushSubscription(client, { token: 'token-1', platform: 'ios', environment: 'dev' });
    expect((client.from as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('push_subscriptions');
    expect(upserted).toEqual({ id: 'push-1' });

    const toggled = await togglePushSubscription(client, 'push-1', false);
    expect(toggled).toEqual({ id: 'push-1', enabled: false });
  });

  it('requires an active session for push subscription mutations', async () => {
    const client = mockClient();
    (client.auth.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { session: null }, error: null });

    await expect(upsertPushSubscription(client, { token: 'token-1' })).rejects.toThrow(
      'Cannot upsert push subscription without an active session',
    );
    await expect(togglePushSubscription(client, 'push-1', false)).rejects.toThrow(
      'Cannot toggle push subscription without an active session',
    );
  });

  it('begins and confirms SMS verification via RPC', async () => {
    const client = mockClient();
    (client.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { phone: '+10000000000' }, error: null });

    const beginResult = await beginSmsVerification(client, { phone: '+10000000000', allowCheckIns: true });
    expect(client.rpc).toHaveBeenCalledWith('begin_sms_verification', {
      phone: '+10000000000',
      allow_checkins: true,
      allow_sos: true,
    });
    expect(beginResult).toEqual({ phone: '+10000000000' });

    const confirmResult = await confirmSmsVerification(client, '123456');
    expect(client.rpc).toHaveBeenCalledWith('confirm_sms_verification', { code: '123456' });
    expect(confirmResult).toEqual({ phone: '+10000000000' });
  });

  it('requires authentication before SMS verification flows', async () => {
    const client = mockClient();
    (client.auth.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { session: null }, error: null });

    await expect(beginSmsVerification(client, { phone: '+19999999999' })).rejects.toThrow(
      'Authentication required to begin SMS verification',
    );
    await expect(confirmSmsVerification(client, '123456')).rejects.toThrow(
      'Authentication required to confirm SMS verification',
    );
  });

  it('throws when pull_updates returns an error', async () => {
    const client = mockClient();
    const rpcError = new Error('rpc failed');
    (client.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: rpcError });

    await expect(pullUpdates(client, 'cursor')).rejects.toThrow(rpcError);
  });
});
