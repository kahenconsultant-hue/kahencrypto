import { NextResponse } from "next/server";

const apiHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
  "Cache-Control": "s-maxage=30, stale-while-revalidate=300",
};

export function apiJson<T>(payload: T, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      ...apiHeaders,
      ...init?.headers,
    },
  });
}

export function apiOptions() {
  return new NextResponse(null, {
    status: 204,
    headers: apiHeaders,
  });
}
