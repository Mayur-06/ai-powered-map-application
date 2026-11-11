import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client using public environment variables.
 * Never references the service role key.
 */
let clientInstance: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!rawUrl || !anonKey) {
    throw new Error(
      'Missing Supabase browser environment variables (NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY)'
    );
  }

  if (!clientInstance) {
    const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
    clientInstance = createSupabaseClient(supabaseUrl, anonKey);
  }

  return clientInstance;
}

export { createClient as createBrowserClient };
