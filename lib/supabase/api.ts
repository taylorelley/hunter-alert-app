import { SupabaseClient } from '@supabase/supabase-js';
import { appConfig } from '@/lib/config/env';
import { MAX_MESSAGE_BYTES } from '@/lib/config/constants';
import { isValidEmail, validateGeofenceParams } from '@/lib/validation';
import {
  AuthResult,
  MessageDraft,
  PullUpdatesResult,
  Group,
  Waypoint,
  Geofence,
  GroupInvitation,
  DeviceSession,
  PrivacySettingsRow,
  PushSubscriptionRow,
  SmsAlertSubscriptionRow,
} from './types';

type EmergencyContactPayload = {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
  relationship?: string;
};

const DEFAULT_BATCH_LIMIT = appConfig.constraints.backendMaxMessageBatch.value;
const DEFAULT_PULL_LIMIT = appConfig.constraints.backendMaxPullLimit.value;

type SanitizedMessageRejectionReason =
  | 'empty_body'
  | 'oversize'
  | 'metadata_not_serializable';

interface SanitizedMessageRejection {
  draft: MessageDraft;
  reason: SanitizedMessageRejectionReason;
  bytes?: number;
}

interface SanitizeMessagesResult {
  accepted: MessageDraft[];
  rejected: SanitizedMessageRejection[];
}

interface SendBatchResult {
  data: Record<string, unknown>[];
  error: null;
  dropped: SanitizedMessageRejection[];
}

const textEncoder = new TextEncoder();

function getMessageSizeBytes(message: MessageDraft): number | null {
  const bodyBytes = textEncoder.encode(message.body ?? '').byteLength;

  if (!message.metadata) {
    return bodyBytes;
  }

  try {
    const serializedMetadata = JSON.stringify(message.metadata);
    const metadataBytes = textEncoder.encode(serializedMetadata).byteLength;
    return bodyBytes + metadataBytes;
  } catch (error) {
    console.warn('Unable to serialize message metadata; dropping message', error);
    return null;
  }
}

function clampBatch(messages: MessageDraft[], limit: number): MessageDraft[] {
  return messages.slice(0, Math.max(limit, 1));
}

function sanitizeMessages(messages: MessageDraft[]): SanitizeMessagesResult {
  const accepted: MessageDraft[] = [];
  const rejected: SanitizedMessageRejection[] = [];

  for (const message of messages) {
    const normalizedDraft: MessageDraft = {
      ...message,
      body: (message.body ?? '').trim(),
    };

    if (normalizedDraft.body.length === 0) {
      rejected.push({ draft: message, reason: 'empty_body' });
      continue;
    }

    const messageSize = getMessageSizeBytes(normalizedDraft);

    if (messageSize === null) {
      rejected.push({ draft: message, reason: 'metadata_not_serializable' });
      continue;
    }

    if (messageSize > MAX_MESSAGE_BYTES) {
      console.warn(
        `Dropping message exceeding ${MAX_MESSAGE_BYTES} bytes (got ${messageSize} bytes)`,
      );
      rejected.push({ draft: message, reason: 'oversize', bytes: messageSize });
      continue;
    }

    accepted.push(normalizedDraft);
  }

  return { accepted, rejected };
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
): Promise<SendBatchResult> {
  const requestedBatchSize = Math.max(1, maxBatchSize);
  const effectiveBatchSize = Math.min(requestedBatchSize, DEFAULT_BATCH_LIMIT);
  const { accepted, rejected } = sanitizeMessages(drafts);

  if (accepted.length > requestedBatchSize) {
    throw new Error(
      `Batch too large; maximum allowed is ${requestedBatchSize} messages.`,
    );
  }

  // Clamp defensively to the backend-enforced limit even when callers request more.
  const payload = clampBatch(accepted, effectiveBatchSize);
  if (payload.length === 0) {
    return { data: [], error: null, dropped: rejected };
  }

  const { data: sessionResult } = await client.auth.getSession();

  if (!sessionResult?.session) {
    throw new Error('Cannot send messages without an active session');
  }

  try {
    const { data, error } = await client.rpc('send_message_batch', {
      messages: payload,
    });

    if (error) {
      throw error;
    }

    return {
      data: (data ?? []) as Record<string, unknown>[],
      error: null,
      dropped: rejected,
    };
  } catch (err) {
    console.error('sendBatch failed:', err);
    throw err;
  }
}

/**
 * Pull updates from the server since the given timestamp.
 *
 * Note: maxRows is applied independently to each entity type (conversations, messages,
 * sync_cursors, groups, group_invitations, group_activity, waypoints, geofences, profiles),
 * so the total response may contain up to 9× maxRows entities across all collections.
 *
 * @param client - Supabase client
 * @param since - ISO timestamp of last sync, or null for initial sync
 * @param maxRows - Maximum rows per entity type (default: 100)
 * @returns Object containing arrays of updated entities
 */
export async function pullUpdates(
  client: SupabaseClient,
  since?: string | null,
  maxRows = DEFAULT_PULL_LIMIT,
): Promise<PullUpdatesResult> {
  const clampedMaxRows = Math.max(1, Math.min(maxRows, DEFAULT_PULL_LIMIT));

  const { data, error } = await client.rpc('pull_updates', {
    since: since ?? null,
    max_rows: clampedMaxRows,
  });

  if (error) {
    throw error;
  }

  const result: PullUpdatesResult = {
    conversations: [],
    messages: [],
    sync_cursors: [],
    groups: [],
    group_invitations: [],
    group_activity: [],
    waypoints: [],
    geofences: [],
    profiles: [],
    device_sessions: [],
    privacy_settings: [],
    push_subscriptions: [],
    sms_alert_subscriptions: [],
  };

  if (data && typeof data === 'object') {
    result.conversations = Array.isArray(data.conversations)
      ? data.conversations.slice(0, clampedMaxRows)
      : [];
    result.messages = Array.isArray(data.messages)
      ? data.messages.slice(0, clampedMaxRows)
      : [];
    result.sync_cursors = Array.isArray(data.sync_cursors)
      ? data.sync_cursors.slice(0, clampedMaxRows)
      : [];
    result.groups = Array.isArray(data.groups) ? data.groups.slice(0, clampedMaxRows) : [];
    result.group_invitations = Array.isArray(data.group_invitations)
      ? data.group_invitations.slice(0, clampedMaxRows)
      : [];
    result.group_activity = Array.isArray(data.group_activity)
      ? data.group_activity.slice(0, clampedMaxRows)
      : [];
    result.waypoints = Array.isArray(data.waypoints)
      ? data.waypoints.slice(0, clampedMaxRows)
      : [];
    result.geofences = Array.isArray(data.geofences)
      ? data.geofences.slice(0, clampedMaxRows)
      : [];
    result.profiles = Array.isArray(data.profiles)
      ? data.profiles.slice(0, clampedMaxRows)
      : [];
    result.device_sessions = Array.isArray(data.device_sessions)
      ? data.device_sessions.slice(0, clampedMaxRows)
      : [];
    result.privacy_settings = Array.isArray(data.privacy_settings)
      ? (data.privacy_settings.slice(0, clampedMaxRows) as PrivacySettingsRow[])
      : [];
    result.push_subscriptions = Array.isArray(data.push_subscriptions)
      ? data.push_subscriptions.slice(0, clampedMaxRows)
      : [];
    result.sms_alert_subscriptions = Array.isArray(data.sms_alert_subscriptions)
      ? data.sms_alert_subscriptions.slice(0, clampedMaxRows)
      : [];
  }

  return result;
}

// Group management functions
export async function createGroup(
  client: SupabaseClient,
  name: string,
  description?: string,
): Promise<Group> {
  // Client-side validation
  if (!name.trim()) {
    throw new Error('Group name cannot be empty');
  }

  const { data, error } = await client.rpc('create_group', {
    group_name: name.trim(),
    group_description: description ?? null,
  });

  if (error) {
    throw error;
  }

  return data as Group;
}

export async function updateGroup(
  client: SupabaseClient,
  groupId: string,
  updates: { name?: string; description?: string },
): Promise<Group> {
  // Client-side validation
  if (updates.name !== undefined && !updates.name.trim()) {
    throw new Error('Group name cannot be empty');
  }

  const { data, error } = await client.rpc('update_group', {
    group_id: groupId,
    new_name: updates.name?.trim() || null,
    new_description: updates.description?.trim() || null,
  });

  if (error) {
    throw error;
  }

  return data as Group;
}

export async function joinGroup(client: SupabaseClient, groupId: string): Promise<Group> {
  const { data, error } = await client.rpc('join_group', { group_id: groupId });

  if (error) {
    throw error;
  }

  return data as Group;
}

export async function recordDeviceSession(
  client: SupabaseClient,
  payload: {
    client_session_id: string;
    device_model: string;
    platform: string;
    os_version: string;
    app_version?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<DeviceSession> {
  const { data, error } = await client.rpc('record_device_session', {
    client_session: payload.client_session_id,
    device_model: payload.device_model,
    platform: payload.platform,
    os_version: payload.os_version,
    app_version: payload.app_version ?? null,
    metadata: payload.metadata ?? {},
  });

  if (error) {
    throw error;
  }

  return data as DeviceSession;
}

export async function revokeDeviceSession(client: SupabaseClient, id: string): Promise<DeviceSession> {
  const { data, error } = await client.rpc('revoke_device_session', { target_id: id });

  if (error) {
    throw error;
  }

  return data as DeviceSession;
}

export async function listDeviceSessions(client: SupabaseClient): Promise<DeviceSession[]> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) {
    throw sessionError;
  }

  if (!sessionData?.session) {
    throw new Error('Cannot list device sessions without an active session');
  }

  const { data, error } = await client
    .from('device_sessions')
    .select('*')
    .order('last_seen', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as DeviceSession[];
}

export async function upsertPushSubscription(
  client: SupabaseClient,
  payload: {
    token: string;
    deviceSessionId?: string | null;
    platform?: string | null;
    environment?: string | null;
    enabled?: boolean;
    metadata?: Record<string, unknown>;
  },
): Promise<PushSubscriptionRow> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData?.session) {
    throw new Error('Cannot upsert push subscription without an active session')
  }

  const userId = sessionData.session.user.id

  const { data, error } = await client
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userId,
        token: payload.token,
        device_session_id: payload.deviceSessionId ?? null,
        platform: payload.platform ?? null,
        environment: payload.environment ?? null,
        enabled: payload.enabled ?? true,
        metadata: payload.metadata ?? {},
      },
      { onConflict: 'user_id,token' },
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as PushSubscriptionRow;
}

export async function togglePushSubscription(
  client: SupabaseClient,
  id: string,
  enabled: boolean,
): Promise<PushSubscriptionRow> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData?.session) {
    throw new Error('Cannot toggle push subscription without an active session')
  }

  const { data, error } = await client
    .from('push_subscriptions')
    .update({ enabled })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as PushSubscriptionRow;
}

export async function beginSmsVerification(
  client: SupabaseClient,
  payload: { phone: string; allowCheckIns?: boolean; allowSos?: boolean },
): Promise<SmsAlertSubscriptionRow> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData?.session) {
    throw new Error('Authentication required to begin SMS verification');
  }

  const { data, error } = await client.rpc('begin_sms_verification', {
    phone: payload.phone,
    allow_checkins: payload.allowCheckIns ?? true,
    allow_sos: payload.allowSos ?? true,
  });

  if (error) {
    throw error;
  }

  return data as SmsAlertSubscriptionRow;
}

export async function confirmSmsVerification(client: SupabaseClient, code: string): Promise<SmsAlertSubscriptionRow> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData?.session) {
    throw new Error('Authentication required to confirm SMS verification');
  }

  const { data, error } = await client.rpc('confirm_sms_verification', { code });

  if (error) {
    throw error;
  }

  return data as SmsAlertSubscriptionRow;
}

export async function updateSmsPreferences(
  client: SupabaseClient,
  payload: Partial<Pick<SmsAlertSubscriptionRow, 'allow_checkins' | 'allow_sos' | 'status'>> & { phone?: string },
): Promise<SmsAlertSubscriptionRow> {
  const updatePayload: Partial<SmsAlertSubscriptionRow> = {};
  if (typeof payload.allow_checkins === 'boolean') updatePayload.allow_checkins = payload.allow_checkins;
  if (typeof payload.allow_sos === 'boolean') updatePayload.allow_sos = payload.allow_sos;
  if (typeof payload.status === 'string') {
    const validStatuses = ['pending', 'verified', 'disabled'] as const;
    if (!validStatuses.includes(payload.status as (typeof validStatuses)[number])) {
      throw new Error(`Invalid status value: ${payload.status}`);
    }
    updatePayload.status = payload.status as SmsAlertSubscriptionRow['status'];
  }
  if (typeof payload.phone === 'string') updatePayload.phone = payload.phone;

  const { data: userResult, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  const userId = userResult.user?.id;
  if (!userId) throw new Error('Authentication required');

  const { data, error } = await client
    .from('sms_alert_subscriptions')
    .update(updatePayload)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as SmsAlertSubscriptionRow;
}

export async function dispatchSmsAlert(
  client: SupabaseClient,
  payload: {
    type: 'checkin' | 'sos';
    message: string;
    tripId?: string | null;
    checkInId?: string | null;
    location?: { latitude: number; longitude: number; accuracy?: number } | null;
  },
): Promise<Record<string, unknown>> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData?.session) {
    throw new Error('Authentication required to dispatch SMS alerts');
  }

  try {
    const normalizedPayload = payload.location
      ? {
          ...payload,
          location: {
            lat: payload.location.latitude,
            lng: payload.location.longitude,
            accuracy: payload.location.accuracy,
          },
        }
      : payload;

    const { data, error } = await client.functions.invoke('dispatch-alerts', {
      body: normalizedPayload,
    });

    if (error) {
      throw error;
    }

    return (data ?? {}) as Record<string, unknown>;
  } catch (err) {
    console.error('dispatchSmsAlert failed:', err);
    throw err;
  }
}

export async function leaveGroup(client: SupabaseClient, groupId: string): Promise<boolean> {
  const { data, error } = await client.rpc('leave_group', { group_id: groupId });

  if (error) {
    throw error;
  }

  return data as boolean;
}

export async function inviteToGroup(
  client: SupabaseClient,
  params: { groupId: string; email: string; role?: 'member' | 'admin' },
): Promise<GroupInvitation> {
  const normalizedEmail = params.email.trim();
  if (!normalizedEmail) {
    throw new Error('Invitation email is required');
  }

  if (!isValidEmail(normalizedEmail)) {
    throw new Error('Invalid email format');
  }

  const { data, error } = await client.rpc('create_group_invitation', {
    group_id: params.groupId,
    invite_email: normalizedEmail,
    invite_role: params.role ?? 'member',
  });

  if (error) {
    throw error;
  }

  return data as GroupInvitation;
}

export async function respondToGroupInvite(
  client: SupabaseClient,
  invitationId: string,
  decision: 'accept' | 'decline',
): Promise<GroupInvitation> {
  const { data, error } = await client.rpc('respond_group_invitation', {
    invitation_id: invitationId,
    decision,
  });

  if (error) {
    throw error;
  }

  return data as GroupInvitation;
}

export async function resendGroupInvitation(
  client: SupabaseClient,
  invitationId: string,
): Promise<GroupInvitation> {
  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData?.session) {
    throw new Error('Cannot resend invitation without an active session');
  }

  const { data, error } = await client.rpc('resend_group_invitation', {
    invitation_id: invitationId,
  });

  if (error) {
    throw error;
  }

  return data as GroupInvitation;
}

export async function withdrawGroupInvitation(
  client: SupabaseClient,
  invitationId: string,
): Promise<GroupInvitation> {
  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData?.session) {
    throw new Error('Cannot withdraw invitation without an active session');
  }

  const { data, error } = await client.rpc('withdraw_group_invitation', {
    invitation_id: invitationId,
  });

  if (error) {
    throw error;
  }

  return data as GroupInvitation;
}

// Waypoint management functions
export async function addWaypoint(
  client: SupabaseClient,
  params: {
    name: string;
    latitude: number;
    longitude: number;
    type?: string;
    description?: string;
    tripId?: string;
    shared?: boolean;
  },
): Promise<Waypoint> {
  // Client-side validation
  if (!params.name.trim()) {
    throw new Error('Waypoint name cannot be empty');
  }
  if (params.latitude < -90 || params.latitude > 90) {
    throw new Error('Latitude must be between -90 and 90');
  }
  if (params.longitude < -180 || params.longitude > 180) {
    throw new Error('Longitude must be between -180 and 180');
  }

  const { data, error } = await client.rpc('add_waypoint', {
    waypoint_name: params.name,
    latitude: params.latitude,
    longitude: params.longitude,
    waypoint_type: params.type ?? 'custom',
    waypoint_description: params.description ?? null,
    trip_id: params.tripId ?? null,
    is_shared: params.shared ?? false,
  });

  if (error) {
    throw error;
  }

  return data as Waypoint;
}

export async function deleteWaypoint(client: SupabaseClient, waypointId: string): Promise<boolean> {
  const { data, error } = await client.rpc('delete_waypoint', { waypoint_id: waypointId });

  if (error) {
    throw error;
  }

  return data as boolean;
}

// Geofence management functions
export async function createGeofence(
  client: SupabaseClient,
  params: {
    name: string;
    latitude: number;
    longitude: number;
    radiusMeters?: number;
    description?: string;
    groupId?: string;
    conversationId?: string;
    notifyEntry?: boolean;
    notifyExit?: boolean;
  },
): Promise<Geofence> {
  // Client-side validation
  const validationError = validateGeofenceParams({
    name: params.name,
    latitude: params.latitude,
    longitude: params.longitude,
    radiusMeters: params.radiusMeters ?? 500,
  });

  if (validationError) {
    throw new Error(validationError);
  }

  const { data, error } = await client.rpc('create_geofence', {
    geofence_name: params.name.trim(),
    latitude: params.latitude,
    longitude: params.longitude,
    radius_meters: params.radiusMeters ?? 500,
    geofence_description: params.description ?? null,
    target_group_id: params.groupId ?? null,
    target_conversation_id: params.conversationId ?? null,
    notify_entry: params.notifyEntry ?? true,
    notify_exit: params.notifyExit ?? true,
  });

  if (error) {
    throw error;
  }

  return data as Geofence;
}

export async function toggleGeofence(
  client: SupabaseClient,
  geofenceId: string,
  enabled: boolean,
): Promise<Geofence> {
  const { data, error } = await client.rpc('toggle_geofence', {
    geofence_id: geofenceId,
    is_enabled: enabled,
  });

  if (error) {
    throw error;
  }

  return data as Geofence;
}

export async function updateGeofence(
  client: SupabaseClient,
  params: {
    geofenceId: string;
    name: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    description?: string;
  },
): Promise<Geofence> {
  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData?.session) {
    throw new Error('Cannot update geofence without an active session');
  }

  const validationError = validateGeofenceParams({
    name: params.name,
    latitude: params.latitude,
    longitude: params.longitude,
    radiusMeters: params.radiusMeters,
  });

  if (validationError) {
    throw new Error(validationError);
  }

  const { data, error } = await client.rpc('update_geofence', {
    geofence_id: params.geofenceId,
    geofence_name: params.name.trim(),
    geofence_description: params.description ?? null,
    latitude: params.latitude,
    longitude: params.longitude,
    radius_meters: params.radiusMeters,
  });

  if (error) {
    throw error;
  }

  return data as Geofence;
}

export async function updateGeofenceAlerts(
  client: SupabaseClient,
  params: { geofenceId: string; notifyOnEntry: boolean; notifyOnExit: boolean; enabled?: boolean },
): Promise<Geofence> {
  const { data, error } = await client.rpc('update_geofence_alerts', {
    geofence_id: params.geofenceId,
    notify_entry: params.notifyOnEntry,
    notify_exit: params.notifyOnExit,
    is_enabled: params.enabled ?? true,
  });

  if (error) {
    throw error;
  }

  return data as Geofence;
}

export async function deleteGeofence(client: SupabaseClient, geofenceId: string): Promise<boolean> {
  const { data, error } = await client.rpc('delete_geofence', { geofence_id: geofenceId });

  if (error) {
    throw error;
  }

  return data as boolean;
}

function sanitizeEmergencyContact(contact: EmergencyContactPayload): EmergencyContactPayload {
  const name = contact.name?.trim();
  const phone = contact.phone?.trim();
  const email = contact.email?.trim();
  const relationship = contact.relationship?.trim();

  if (!name) {
    throw new Error('Contact name is required');
  }

  if (!phone && !email) {
    throw new Error('A phone number or email is required for notifications');
  }

  return {
    id: contact.id,
    name,
    phone,
    email,
    relationship,
  };
}

export async function updateEmergencyContacts(
  client: SupabaseClient,
  contacts: EmergencyContactPayload[],
): Promise<EmergencyContactPayload[]> {
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) {
    throw authError;
  }

  const userId = authData?.user?.id;
  if (!userId) {
    throw new Error('Sign-in required to update emergency contacts');
  }

  const normalized = contacts.map((contact) => ({
    ...sanitizeEmergencyContact(contact),
    id: contact.id ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
  }));

  const { data, error } = await client
    .from('profiles')
    .update({ emergency_contacts: normalized })
    .eq('id', userId)
    .select()
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data?.emergency_contacts as EmergencyContactPayload[] | null) ?? normalized;
}

export async function sendTestNotification(
  client: SupabaseClient,
  params: { contact: EmergencyContactPayload; channel?: 'sms' | 'email' },
): Promise<Record<string, unknown>> {
  const contact = sanitizeEmergencyContact(params.contact);
  const channel = params.channel ?? (contact.phone ? 'sms' : 'email');

  const { data, error } = await client.functions.invoke('send-test-notification', {
    body: {
      contact,
      channel,
    },
  });

  if (error) {
    throw error;
  }

  if (data == null) {
    console.error('sendTestNotification returned no data', {
      contactId: contact.id,
      channel,
    });
    throw new Error('Unexpected empty response from send-test-notification');
  }

  return data as Record<string, unknown>;
}

export async function upsertPrivacySettings(
  client: SupabaseClient,
  settings: Omit<PrivacySettingsRow, 'created_at' | 'updated_at'>,
): Promise<PrivacySettingsRow> {
  const { data, error } = await client
    .from('privacy_settings')
    .upsert(settings)
    .select()
    .maybeSingle();

  if (error || !data) {
    throw error ?? new Error('Unable to persist privacy preferences');
  }

  return data as PrivacySettingsRow;
}
