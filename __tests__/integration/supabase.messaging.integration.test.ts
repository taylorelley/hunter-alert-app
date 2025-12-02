import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sendBatch, pullUpdates } from '../../lib/supabase/api';
import {
  createThrottledFetch,
  createUserClient,
  startSupabaseStack,
  stopSupabaseStack,
  createAdminClient,
  SupabaseStack,
} from './utils/supabaseStack';

const RUN = process.env.RUN_SUPABASE_INTEGRATION === '1';
const describeIfEnabled = RUN ? describe : describe.skip;

const TEST_TIMEOUT = 180_000;

describeIfEnabled('supabase messaging integration', () => {
  let stack: SupabaseStack;
  let adminClient: SupabaseClient;
  let userClient: SupabaseClient;
  let userId: string;
  let conversationId: string;
  let credentials: { email: string; password: string };

  beforeAll(async () => {
    stack = await startSupabaseStack();
    adminClient = await createAdminClient(stack);

    credentials = {
      email: `integration-${Date.now()}@example.com`,
      password: 'SupabaseIntegration!23',
    };

    const userContext = await createUserClient(stack, credentials.email, credentials.password);
    userClient = userContext.client;
    userId = userContext.userId;

    const { data: conversation, error: conversationError } = await adminClient
      .from('conversations')
      .insert({
        participant_ids: [userId],
        title: 'Field Operations',
        metadata: {
          region: 'integration',
          checkInCadence: 4,
          status: 'active',
          destination: 'Field Operations',
        },
      })
      .select()
      .single();

    if (conversationError || !conversation) {
      throw conversationError ?? new Error('Failed to create conversation');
    }

    conversationId = conversation.id;

    await adminClient
      .from('sync_cursors')
      .upsert({
        user_id: userId,
        conversation_id: conversationId,
        last_cursor: new Date(0).toISOString(),
      })
      .select()
      .single();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await userClient?.auth.signOut();
    await stopSupabaseStack();
  }, TEST_TIMEOUT);

  it(
    'sends batches, enforces limits, and returns new rows via pull_updates',
    async () => {
      const drafts = [
        {
          conversation_id: conversationId,
          body: 'Ping from constrained link',
          metadata: { priority: 'low' },
          client_id: 'client-1',
          created_at: new Date().toISOString(),
        },
        {
          conversation_id: conversationId,
          body: 'Follow-up message',
          metadata: { priority: 'normal' },
          client_id: 'client-2',
          created_at: new Date(Date.now() + 1_000).toISOString(),
        },
      ];

      const sendResult = await sendBatch(userClient, drafts, 5);
      expect(sendResult.data).toBeDefined();
      expect(sendResult.data?.length).toBe(drafts.length);

      const pullResult = await pullUpdates(userClient, null, 10);
      expect(pullResult.messages.length).toBeGreaterThanOrEqual(drafts.length);
      expect(pullResult.conversations.find((c) => c.id === conversationId)).toBeTruthy();
    },
    TEST_TIMEOUT,
  );

  it(
    'caps pull_updates results per collection when requesting limited rows',
    async () => {
      const bulkMessages = Array.from({ length: 5 }, (_, idx) => ({
        conversation_id: conversationId,
        sender_id: userId,
        body: `bulk-${idx}`,
        metadata: { bulk: true, idx },
        client_id: `bulk-${idx}`,
        created_at: new Date(Date.now() + idx * 1_000).toISOString(),
      }));

      const { error: messageError } = await adminClient.from('messages').insert(bulkMessages);
      if (messageError) {
        throw messageError;
      }

      const geofences = Array.from({ length: 4 }, (_, idx) => ({
        user_id: userId,
        name: `limit-fence-${idx}`,
        description: 'Limit enforcement test',
        latitude: 40 + idx * 0.01,
        longitude: -105 - idx * 0.01,
        radius_meters: 500,
        enabled: true,
      }));

      const { error: geofenceError } = await adminClient.from('geofences').insert(geofences);
      if (geofenceError) {
        throw geofenceError;
      }

      const limitedResult = await pullUpdates(userClient, null, 2);

      expect(limitedResult.messages.length).toBe(2);
      expect(limitedResult.geofences.length).toBe(2);
    },
    TEST_TIMEOUT,
  );

  it('rejects rapid consecutive check-ins for free users', async () => {
    const firstCheckIn = {
      conversation_id: conversationId,
      body: 'Check-in',
      metadata: { status: 'ok', batteryLevel: 80 },
      client_id: 'checkin-1',
      created_at: new Date().toISOString(),
    };

    const initialResult = await sendBatch(userClient, [firstCheckIn], 5);
    expect(initialResult.data?.length).toBe(1);

    const rapidAttempt = {
      ...firstCheckIn,
      client_id: 'checkin-2',
      created_at: new Date().toISOString(),
    };

    await expect(sendBatch(userClient, [rapidAttempt], 5)).rejects.toThrow(/cadence/i);
  });

  it(
    'rejects oversized batches client-side and preserves queued work for replay',
    async () => {
      const queued = Array.from({ length: 6 }, (_, idx) => ({
        conversation_id: conversationId,
        body: `queued-message-${idx}`,
        metadata: { queued: true },
        client_id: `offline-${idx}`,
      }));

      await expect(sendBatch(userClient, queued, 5)).rejects.toThrow(/Batch too large/);

      const firstAttempt = await sendBatch(userClient, queued.slice(0, 3), 3);
      expect(firstAttempt.data?.length).toBe(3);

      const remainingQueue = queued.slice(3);
      const secondAttempt = await sendBatch(userClient, remainingQueue, 3);
      expect(secondAttempt.data?.length).toBe(remainingQueue.length);

      const lastCursor = firstAttempt.data?.[firstAttempt.data.length - 1]?.created_at as
        | string
        | undefined;
      if (lastCursor) {
        const delta = await pullUpdates(userClient, lastCursor, 5);
        expect(delta.messages.every((m) => new Date(m.created_at) > new Date(lastCursor))).toBe(
          true,
        );
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'simulates constrained links with throttling and enforces batch trimming',
    async () => {
      const throttledClient = createClient(stack.apiUrl, stack.anonKey, {
        global: {
          fetch: createThrottledFetch({ latencyMs: 400, maxPayloadBytes: 1_200 }),
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      const { error } = await throttledClient.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (error) {
        throw error;
      }

      const bulkyMessages = Array.from({ length: 3 }, (_, idx) => ({
        conversation_id: conversationId,
        body: 'x'.repeat(600) + idx,
        client_id: `bulky-${idx}`,
      }));

      await expect(sendBatch(throttledClient, bulkyMessages, 3)).rejects.toThrow(
        /Bandwidth cap exceeded/,
      );

      const start = performance.now();
      const trimmed = bulkyMessages.slice(0, 1);
      const response = await sendBatch(throttledClient, trimmed, 1);
      expect(response.data?.length).toBe(1);
      const elapsed = performance.now() - start;
      // Verify latency applied (with margin for CI variance)
      expect(elapsed).toBeGreaterThanOrEqual(300);
    },
    TEST_TIMEOUT,
  );
});
