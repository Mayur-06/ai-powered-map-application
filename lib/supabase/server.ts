import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client using the Service Role Key.
 *
 * IMPORTANT: This file must never be imported from any client component ('use client').
 */
export function createClient(): SupabaseClient {
  const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!rawUrl || !supabaseServiceRoleKey) {
    throw new Error(
      'Missing Supabase server environment variables (SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY)'
    );
  }

  // Normalize URL to handle trailing slashes or accidentally included REST endpoints
  const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

  return createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export { createClient as createServerClient };
