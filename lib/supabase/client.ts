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

  // During build time (SSR/SSG), use placeholder values for static export
  // These will be replaced with actual values at runtime in the browser
  const isBuildTime = typeof window === 'undefined';
  const finalUrl = supabaseUrl || (isBuildTime ? 'https://placeholder.supabase.co' : '');
  const finalKey = supabaseKey || (isBuildTime ? 'placeholder-anon-key' : '');

  if (!finalUrl || !finalKey) {
    throw new Error('Supabase URL and anon key are required to initialize the client');
  }

  return createClient(finalUrl, finalKey, {
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
