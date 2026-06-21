import "server-only";

import { createSupabaseServiceRoleClient } from "@/server/supabase/auth-client";
import { accountFromRow, type CustomerAccount, type CustomerStatus } from "@/server/auth/types";

export async function getCustomerAccounts(params: { search?: string; status?: CustomerStatus | "ALL" } = {}) {
  const service = createSupabaseServiceRoleClient();
  if (!service) throw new Error("Supabase service role configured نیست.");
  let query = service.from("users").select("*").order("created_at", { ascending: false }).limit(200);
  if (params.status && params.status !== "ALL") query = query.eq("status", params.status);
  const search = params.search?.trim();
  if (search) {
    const safeSearch = search.replace(/[%_,()]/g, " ").trim();
    if (safeSearch) query = query.or(`email.ilike.%${safeSearch}%,full_name.ilike.%${safeSearch}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`خواندن فهرست مشتریان ناموفق بود: ${error.message}`);
  return (data ?? []).map((row) => accountFromRow(row as Record<string, unknown>));
}

export async function getCustomerAccountById(id: string): Promise<CustomerAccount | null> {
  const service = createSupabaseServiceRoleClient();
  if (!service) return null;
  const { data, error } = await service.from("users").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return accountFromRow(data as Record<string, unknown>);
}

export async function getCustomerEmailLogs(id: string) {
  const service = createSupabaseServiceRoleClient();
  if (!service) return [];
  const { data } = await service.from("email_logs").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(30);
  return data ?? [];
}

