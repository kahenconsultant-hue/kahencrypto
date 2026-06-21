import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
}

export function createSupabaseAnonServerClient(accessToken?: string | null): SupabaseClient | null {
  const url = supabaseUrl();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

export function createSupabaseServiceRoleClient(): SupabaseClient | null {
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

