import { createClient, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth/constants";

type AccessRow = { role: string; status: string };

function authClient(accessToken?: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

function unauthorized(request: NextRequest, api: boolean, pending = false) {
  if (api) return NextResponse.json({ error: pending ? "account_not_active" : "authentication_required" }, { status: pending ? 403 : 401 });
  const target = pending ? "/pending-activation" : "/login";
  const url = new URL(target, request.url);
  if (!pending) url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const api = request.nextUrl.pathname.startsWith("/api/v1");
  let accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value ?? null;
  let user: User | null = null;
  let refreshed: { accessToken: string; refreshToken: string; expiresIn: number } | null = null;

  let client = authClient(accessToken);
  if (client && accessToken) {
    const result = await client.auth.getUser(accessToken);
    user = result.data.user ?? null;
  }
  if (!user && refreshToken) {
    const refreshClient = authClient();
    const result = await refreshClient?.auth.refreshSession({ refresh_token: refreshToken });
    if (result?.data.session && result.data.user) {
      user = result.data.user;
      accessToken = result.data.session.access_token;
      refreshed = {
        accessToken,
        refreshToken: result.data.session.refresh_token,
        expiresIn: result.data.session.expires_in,
      };
      client = authClient(accessToken);
    }
  }
  if (!user || !client || !accessToken) return unauthorized(request, api);

  const { data: account } = await client.from("users").select("role,status").eq("id", user.id).maybeSingle<AccessRow>();
  if (!account) return unauthorized(request, api);
  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");
  if (isAdminRoute && account.role !== "admin") return NextResponse.redirect(new URL("/dashboard", request.url));
  if (!isAdminRoute && account.role !== "admin" && account.status !== "ACTIVE") return unauthorized(request, api, true);

  const response = NextResponse.next();
  if (refreshed) {
    const secure = process.env.NODE_ENV === "production";
    response.cookies.set(ACCESS_TOKEN_COOKIE, refreshed.accessToken, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: Math.max(60, refreshed.expiresIn - 30) });
    response.cookies.set(REFRESH_TOKEN_COOKIE, refreshed.refreshToken, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 30 });
  }
  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/assets/:path*",
    "/audit/:path*",
    "/correlations/:path*",
    "/liquidity/:path*",
    "/sentiment/:path*",
    "/usdt-risk/:path*",
    "/embed/:path*",
    "/admin/:path*",
    "/api/v1/:path*",
  ],
};
