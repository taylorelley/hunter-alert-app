import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseClientConfig {
  supabaseUrl?: string;
  supabaseKey?: string;
}

export function createSupabaseClient(config: SupabaseClientConfig = {}): SupabaseClient {
  const supabaseUrl =
    config.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey =
    config.supabaseKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL and anon key are required to initialize the client');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      headers: {
        'X-Client-Name': 'hunter-alert-app',
      },
    },
  });
}
