import "server-only";

import { cookies } from "next/headers";
import type { Session, User } from "@supabase/supabase-js";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth/constants";
import { createSupabaseAnonServerClient, createSupabaseServiceRoleClient } from "@/server/supabase/auth-client";
import { accountFromRow, type CustomerAccount } from "@/server/auth/types";

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function setSessionCookies(session: Session) {
  const store = await cookies();
  store.set(ACCESS_TOKEN_COOKIE, session.access_token, { ...cookieBase, maxAge: Math.max(60, session.expires_in - 30) });
  store.set(REFRESH_TOKEN_COOKIE, session.refresh_token, { ...cookieBase, maxAge: 60 * 60 * 24 * 30 });
}

export async function clearSessionCookies() {
  const store = await cookies();
  store.set(ACCESS_TOKEN_COOKIE, "", { ...cookieBase, maxAge: 0 });
  store.set(REFRESH_TOKEN_COOKIE, "", { ...cookieBase, maxAge: 0 });
}

export async function getCurrentAuth(): Promise<{ user: User; account: CustomerAccount } | null> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) return null;
  const authClient = createSupabaseAnonServerClient(accessToken);
  const service = createSupabaseServiceRoleClient();
  if (!authClient || !service) return null;
  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data.user) return null;
  const { data: row, error: accountError } = await service.from("users").select("*").eq("id", data.user.id).maybeSingle();
  if (accountError || !row) return null;
  return { user: data.user, account: accountFromRow(row as Record<string, unknown>) };
}

export async function requireAdminAccount() {
  const auth = await getCurrentAuth();
  if (!auth || auth.account.role !== "admin") throw new Error("دسترسی ادمین معتبر نیست.");
  return auth;
}

