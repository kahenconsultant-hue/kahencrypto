import { type NextRequest } from "next/server";
import { apiJson } from "@/lib/api-response";
import { persistTelemetryLogs } from "@/storage/ingestion-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;
export const runtime = "nodejs";
export const preferredRegion = "fra1";

type FailureClassification =
  | "none"
  | "geo_blocked"
  | "cloudflare/security_blocked"
  | "endpoint_blocked_from_vercel"
  | "parser_failure"
  | "timeout"
  | "schema_mismatch"
  | "endpoint_removed"
  | "endpoint_changed"
  | "authentication_required"
  | "rate_limited"
  | "unknown";

interface DiagnosticResult {
  name: string;
  provider: "binance" | "bybit";
  endpoint: string;
  queryParams: Record<string, string>;
  status: "success" | "failed";
  httpStatus: number | null;
  statusText: string | null;
  responseHeaders: Record<string, string>;
  responseBodyPreview: string | null;
  payloadShape: Record<string, unknown>;
  parserResult: {
    success: boolean;
    reason: string;
    sampleSize?: number;
  };
  failureClassification: FailureClassification;
  errorReason: string | null;
  timeoutMs: number;
  durationMs: number;
  userAgent: string;
  vercelRegion: string | null;
  executionEnvironment: string;
  fetchedAt: string;
}

const timeoutMs = 8_000;
const userAgent = "CMIP/1.0 production adapter diagnostic";

const diagnosticTargets = [
  {
    name: "binance_spot_ticker_btcusdt",
    provider: "binance" as const,
    url: "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT",
    parse: (payload: unknown) => {
      const row = objectPayload(payload);
      const ok = Number.isFinite(Number(row.lastPrice)) && Number.isFinite(Number(row.quoteVolume));
      return { success: ok, reason: ok ? "ticker_lastPrice_quoteVolume_present" : "missing_lastPrice_or_quoteVolume" };
    },
  },
  {
    name: "binance_futures_funding_btcusdt",
    provider: "binance" as const,
    url: "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT",
    parse: (payload: unknown) => {
      const row = objectPayload(payload);
      const ok = Number.isFinite(Number(row.lastFundingRate));
      return { success: ok, reason: ok ? "lastFundingRate_present" : "missing_lastFundingRate" };
    },
  },
  {
    name: "binance_futures_open_interest_btcusdt",
    provider: "binance" as const,
    url: "https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=25",
    parse: (payload: unknown) => {
      const rows = Array.isArray(payload) ? payload : [];
      const ok = rows.length >= 2 && Number.isFinite(Number(objectPayload(rows.at(-1)).sumOpenInterestValue));
      return { success: ok, reason: ok ? `sample_${rows.length}` : `sample_${rows.length}_missing_sumOpenInterestValue`, sampleSize: rows.length };
    },
  },
  {
    name: "bybit_spot_ticker_btcusdt",
    provider: "bybit" as const,
    url: "https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT",
    parse: (payload: unknown) => {
      const row = bybitFirstListRow(payload);
      const ok = bybitRetCode(payload) === 0 && Number.isFinite(Number(row.lastPrice)) && Number.isFinite(Number(row.volume24h ?? row.turnover24h));
      return { success: ok, reason: ok ? "retCode_0_lastPrice_volume_present" : `retCode_${bybitRetCode(payload)}_missing_ticker_fields` };
    },
  },
  {
    name: "bybit_linear_funding_btcusdt",
    provider: "bybit" as const,
    url: "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT",
    parse: (payload: unknown) => {
      const row = bybitFirstListRow(payload);
      const ok = bybitRetCode(payload) === 0 && Number.isFinite(Number(row.fundingRate));
      return { success: ok, reason: ok ? "retCode_0_fundingRate_present" : `retCode_${bybitRetCode(payload)}_missing_fundingRate` };
    },
  },
  {
    name: "bybit_linear_open_interest_btcusdt",
    provider: "bybit" as const,
    url: "https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1h&limit=25",
    parse: (payload: unknown) => {
      const rows = bybitList(payload);
      const ok = bybitRetCode(payload) === 0 && rows.length >= 2 && Number.isFinite(Number(objectPayload(rows.at(-1)).openInterest));
      return { success: ok, reason: ok ? `retCode_0_sample_${rows.length}` : `retCode_${bybitRetCode(payload)}_sample_${rows.length}_missing_openInterest`, sampleSize: rows.length };
    },
  },
] satisfies Array<{
  name: string;
  provider: "binance" | "bybit";
  url: string;
  parse: (payload: unknown) => { success: boolean; reason: string; sampleSize?: number };
}>;

function objectPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function bybitRetCode(payload: unknown) {
  const value = objectPayload(payload).retCode;
  return typeof value === "number" ? value : null;
}

function bybitList(payload: unknown): Array<unknown> {
  const result = objectPayload(objectPayload(payload).result);
  return Array.isArray(result.list) ? result.list : [];
}

function bybitFirstListRow(payload: unknown): Record<string, unknown> {
  return objectPayload(bybitList(payload)[0]);
}

function basicAuthSecret(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("basic ")) return null;
  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return null;
    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    return username === "cmip-cron" ? password : null;
  } catch {
    return null;
  }
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.INGESTION_CRON_SECRET ?? process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7) : "";
  const header = request.headers.get("x-cmip-cron-secret") ?? "";
  const basic = basicAuthSecret(request) ?? "";
  return bearer === secret || header === secret || basic === secret;
}

function executionEnvironment() {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV;
  if (process.env.VERCEL) return "vercel";
  return process.env.NODE_ENV ?? "local";
}

function vercelRegion() {
  return process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? process.env.NOW_REGION ?? null;
}

function redactedUrlParts(url: string) {
  const parsed = new URL(url);
  const queryParams: Record<string, string> = {};
  for (const [key, value] of parsed.searchParams.entries()) {
    queryParams[key] = /key|secret|token|authorization|password/i.test(key) ? "[redacted]" : value;
  }
  return {
    endpoint: `${parsed.origin}${parsed.pathname}`,
    queryParams,
  };
}

function responseHeadersSummary(headers: Headers) {
  const keys = [
    "content-type",
    "server",
    "cf-ray",
    "cf-mitigated",
    "retry-after",
    "x-mbx-used-weight",
    "x-mbx-used-weight-1m",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-bapi-limit",
    "x-bapi-limit-status",
    "x-bapi-limit-reset-timestamp",
    "date",
  ];
  const summary: Record<string, string> = {};
  for (const key of keys) {
    const value = headers.get(key);
    if (value) summary[key] = value.slice(0, 180);
  }
  return summary;
}

function payloadShape(payload: unknown): Record<string, unknown> {
  if (Array.isArray(payload)) {
    return {
      type: "array",
      length: payload.length,
      firstItemType: typeof payload[0],
      firstItemKeys: objectPayload(payload[0]) ? Object.keys(objectPayload(payload[0])).slice(0, 12) : [],
    };
  }
  const root = objectPayload(payload);
  const result = objectPayload(root.result);
  return {
    type: payload === null ? "null" : typeof payload,
    rootKeys: Object.keys(root).slice(0, 16),
    retCode: typeof root.retCode === "number" ? root.retCode : null,
    retMsg: typeof root.retMsg === "string" ? root.retMsg.slice(0, 120) : null,
    resultKeys: Object.keys(result).slice(0, 16),
    listLength: Array.isArray(result.list) ? result.list.length : null,
  };
}

function classifyFailure(params: {
  httpStatus: number | null;
  responseHeaders?: Record<string, string>;
  bodyPreview?: string | null;
  errorReason?: string | null;
  parserSuccess?: boolean;
}): FailureClassification {
  const headers = params.responseHeaders ?? {};
  const combined = `${params.bodyPreview ?? ""} ${params.errorReason ?? ""} ${Object.entries(headers).map(([key, value]) => `${key}:${value}`).join(" ")}`.toLowerCase();
  if (params.errorReason && /abort|timeout|timed out/i.test(params.errorReason)) return "timeout";
  if (params.httpStatus === 429 || params.httpStatus === 418) return "rate_limited";
  if (params.httpStatus === 401) return "authentication_required";
  if (params.httpStatus === 404 || params.httpStatus === 410) return "endpoint_removed";
  if (params.httpStatus === 451) return "geo_blocked";
  if (params.httpStatus === 403) {
    if (/cloudflare|cf-|challenge|captcha|bot|security|forbidden|access denied|blocked/i.test(combined)) return "cloudflare/security_blocked";
    if (process.env.VERCEL || process.env.VERCEL_ENV) return "endpoint_blocked_from_vercel";
    return "geo_blocked";
  }
  if (typeof params.httpStatus === "number" && params.httpStatus >= 400 && params.httpStatus < 500) return "endpoint_changed";
  if (typeof params.httpStatus === "number" && params.httpStatus >= 500) return "unknown";
  if (params.parserSuccess === false) return "parser_failure";
  if (params.httpStatus === null && params.errorReason) return "unknown";
  return "none";
}

async function probe(target: typeof diagnosticTargets[number]): Promise<DiagnosticResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const { endpoint, queryParams } = redactedUrlParts(target.url);
  try {
    const response = await fetch(target.url, {
      signal: controller.signal,
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent": userAgent,
      },
    });
    const text = await response.text();
    let payload: unknown = null;
    let parseError: string | null = null;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      parseError = error instanceof Error ? error.message : "JSON parse failed.";
    }
    const parserResult = payload === null ? { success: false, reason: parseError ?? "empty_or_invalid_json" } : target.parse(payload);
    const responseHeaders = responseHeadersSummary(response.headers);
    const responseBodyPreview = text.slice(0, 500);
    const failureClassification = classifyFailure({
      httpStatus: response.status,
      responseHeaders,
      bodyPreview: responseBodyPreview,
      errorReason: parseError,
      parserSuccess: parserResult.success,
    });
    return {
      name: target.name,
      provider: target.provider,
      endpoint,
      queryParams,
      status: response.ok && parserResult.success ? "success" : "failed",
      httpStatus: response.status,
      statusText: response.statusText || null,
      responseHeaders,
      responseBodyPreview,
      payloadShape: payloadShape(payload),
      parserResult,
      failureClassification,
      errorReason: response.ok ? parseError : response.statusText || `HTTP ${response.status}`,
      timeoutMs,
      durationMs: Date.now() - started,
      userAgent,
      vercelRegion: vercelRegion(),
      executionEnvironment: executionEnvironment(),
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    const errorReason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return {
      name: target.name,
      provider: target.provider,
      endpoint,
      queryParams,
      status: "failed",
      httpStatus: null,
      statusText: null,
      responseHeaders: {},
      responseBodyPreview: null,
      payloadShape: { type: "unavailable" },
      parserResult: { success: false, reason: "fetch_exception" },
      failureClassification: classifyFailure({ httpStatus: null, errorReason, parserSuccess: false }),
      errorReason,
      timeoutMs,
      durationMs: Date.now() - started,
      userAgent,
      vercelRegion: vercelRegion(),
      executionEnvironment: executionEnvironment(),
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return apiJson({ error: "unauthorized" }, { status: 401 });

  const startedAt = new Date().toISOString();
  const results = await Promise.all(diagnosticTargets.map(probe));
  const failed = results.filter((result) => result.status === "failed");
  const finishedAt = new Date().toISOString();
  const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  const level = failed.length ? "warning" : "info";
  const storageMode = await persistTelemetryLogs([
    {
      scope: "adapter_diagnostics",
      eventType: "binance_bybit_http_diagnostic",
      level,
      message: failed.length
        ? `Binance/Bybit HTTP diagnostic found ${failed.length} failed probes.`
        : "Binance/Bybit HTTP diagnostic completed successfully.",
      durationMs,
      sourceId: "binance-bybit-production-diagnostic",
      tableName: "telemetry_logs",
      payload: {
        startedAt,
        finishedAt,
        executionEnvironment: executionEnvironment(),
        vercelRegion: vercelRegion(),
        timeoutMs,
        results,
      },
      observedAt: finishedAt,
    },
  ]);

  return apiJson({
    generatedAt: finishedAt,
    mode: "binance_bybit_production_http_diagnostic",
    executionEnvironment: executionEnvironment(),
    vercelRegion: vercelRegion(),
    storageMode,
    summary: {
      total: results.length,
      success: results.length - failed.length,
      failed: failed.length,
      classifications: results.reduce<Record<string, number>>((acc, result) => {
        acc[result.failureClassification] = (acc[result.failureClassification] ?? 0) + 1;
        return acc;
      }, {}),
    },
    results,
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}

