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
    name: string;
    phone: string;
    relationship?: string;
  }>;
  is_premium: boolean;
  privacy_settings: {
    shareLocation: boolean;
    showOnMap: boolean;
    notifyContacts: boolean;
  };
  created_at: string;
  updated_at: string;
}

export interface PullUpdatesResult {
  conversations: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  sync_cursors: Record<string, unknown>[];
  groups: Group[];
  waypoints: Waypoint[];
  geofences: Geofence[];
  profiles: Profile[];
}

export interface AuthResult {
  user: User | null;
  session: Session | null;
}
