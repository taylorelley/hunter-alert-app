import { SupabaseClient } from '@supabase/supabase-js';
import { AuthResult, MessageDraft, PullUpdatesResult, Group, Waypoint, Geofence } from './types';

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
    groups: [],
    waypoints: [],
    geofences: [],
    profiles: [],
  };

  if (data && typeof data === 'object') {
    result.conversations = Array.isArray(data.conversations)
      ? data.conversations.slice(0, maxRows)
      : [];
    result.messages = Array.isArray(data.messages) ? data.messages.slice(0, maxRows) : [];
    result.sync_cursors = Array.isArray(data.sync_cursors)
      ? data.sync_cursors.slice(0, maxRows)
      : [];
    result.groups = Array.isArray(data.groups) ? data.groups.slice(0, maxRows) : [];
    result.waypoints = Array.isArray(data.waypoints) ? data.waypoints.slice(0, maxRows) : [];
    result.geofences = Array.isArray(data.geofences) ? data.geofences.slice(0, maxRows) : [];
    result.profiles = Array.isArray(data.profiles) ? data.profiles.slice(0, maxRows) : [];
  }

  return result;
}

// Group management functions
export async function createGroup(
  client: SupabaseClient,
  name: string,
  description?: string,
): Promise<Group> {
  const { data, error } = await client.rpc('create_group', {
    group_name: name,
    group_description: description ?? null,
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

export async function leaveGroup(client: SupabaseClient, groupId: string): Promise<boolean> {
  const { data, error } = await client.rpc('leave_group', { group_id: groupId });

  if (error) {
    throw error;
  }

  return data as boolean;
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
  const { data, error } = await client.rpc('create_geofence', {
    geofence_name: params.name,
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

export async function deleteGeofence(client: SupabaseClient, geofenceId: string): Promise<boolean> {
  const { data, error } = await client.rpc('delete_geofence', { geofence_id: geofenceId });

  if (error) {
    throw error;
  }

  return data as boolean;
}
