import { Session, User } from '@supabase/supabase-js';

export interface MessageDraft {
  conversation_id: string;
  body: string;
  client_id?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  member_ids: string[];
  member_roles: Record<string, 'owner' | 'admin' | 'member'>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface GroupInvitation {
  id: string;
  group_id: string;
  sender_id: string;
  recipient_id: string | null;
  recipient_email: string | null;
  role: 'member' | 'admin';
  status: 'pending' | 'accepted' | 'declined';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface GroupActivity {
  id: string;
  group_id: string;
  actor_id: string;
  activity_type: 'create' | 'invite' | 'join' | 'leave' | 'geofence' | 'waypoint' | 'role_change' | 'alert';
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Waypoint {
  id: string;
  conversation_id: string | null;
  user_id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  waypoint_type: 'stand' | 'camera' | 'camp' | 'vehicle' | 'water' | 'landmark' | 'custom';
  shared: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Geofence {
  id: string;
  group_id: string | null;
  conversation_id: string | null;
  user_id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  enabled: boolean;
  notify_on_entry: boolean;
  notify_on_exit: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  emergency_contacts: Array<{
    id?: string;
    name: string;
    phone?: string;
    email?: string;
    relationship?: string;
  }>;
  is_premium: boolean;
  privacy_settings: {
    shareLocation: boolean;
    showOnMap: boolean;
    notifyContacts: boolean;
  };
  metadata?: {
    last_location?: {
      latitude?: number;
      longitude?: number;
      lat?: number;
      lng?: number;
      accuracy?: number;
      heading?: number;
      updated_at?: string;
      timestamp?: string;
      [key: string]: unknown;
    };
    lastLocation?: {
      latitude?: number;
      longitude?: number;
      lat?: number;
      lng?: number;
      accuracy?: number;
      heading?: number;
      updated_at?: string;
      timestamp?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

export interface DeviceSession {
  id: string;
  user_id: string;
  client_session_id: string;
  device_model: string | null;
  platform: string | null;
  os_version: string | null;
  app_version: string | null;
  metadata: Record<string, unknown>;
  last_seen: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PullUpdatesResult {
  conversations: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  sync_cursors: Record<string, unknown>[];
  groups: Group[];
  group_invitations: GroupInvitation[];
  group_activity: GroupActivity[];
  waypoints: Waypoint[];
  geofences: Geofence[];
  profiles: Profile[];
  device_sessions: DeviceSession[];
}

export interface AuthResult {
  user: User | null;
  session: Session | null;
}
