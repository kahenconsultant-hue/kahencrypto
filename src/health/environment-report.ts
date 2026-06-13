import { productionSources } from "@/collectors/registry";
import { createSupabaseServerClient } from "@/server/supabase/client";
import { getLatestIngestionRun, getLatestStorageWriteReportsSync } from "@/storage/ingestion-store";
import type { IngestionStorageMode } from "@/types/ingestion";

const optionalApiKeys = [
  "OPENAI_API_KEY",
  "COINGECKO_API_KEY",
  "TRADINGECONOMICS_API_KEY",
  "COINGLASS_API_KEY",
  "FRED_API_KEY",
  "WHALE_ALERT_API_KEY",
  "GLASSNODE_API_KEY",
  "CRYPTOQUANT_API_KEY",
];

export interface EnvironmentValidationReport {
  generatedAt: string;
  supabaseConfigured: boolean;
  supabaseConnected: boolean;
  serviceRoleAvailable: boolean;
  activeStorageMode: IngestionStorageMode;
  lastSupabaseWriteStatus: "success" | "failed" | "skipped" | "unknown";
  failedWrites: number;
  missingOptionalApiKeys: string[];
  enabledCollectors: Array<{
    id: string;
    name: string;
    sourceType: string;
    parser: string;
    requiredEnvKeys: string[];
    missingRequiredEnvKeys: string[];
  }>;
  lastIngestionRun: {
    runId: string;
    storageMode: IngestionStorageMode;
    pulledEvents: number;
    pulledMetrics: number;
    persistedEvents: number;
    persistedMetrics: number;
    failedSources: number;
    deadLetters: number;
  } | null;
  storageWriteReports: ReturnType<typeof getLatestStorageWriteReportsSync>;
  connectionError?: string;
}

async function withEnvTimeout<T>(promise: Promise<T>, timeoutMs = 5_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Environment Supabase check timed out after ${timeoutMs}ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function checkSupabaseConnection() {
  const client = createSupabaseServerClient();
  if (!client) return { connected: false, error: "Supabase env is not configured." };
  try {
    const { error } = await withEnvTimeout(Promise.resolve(client.from("source_health").select("id", { head: true, count: "exact" }).limit(1)));
    return { connected: !error, error: error?.message };
  } catch (error) {
    return { connected: false, error: error instanceof Error ? error.message : "Supabase connection check timed out." };
  }
}

export async function getEnvironmentValidationReport(): Promise<EnvironmentValidationReport> {
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
  const serviceRoleAvailable = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const connection = await checkSupabaseConnection();
  const writeReports = getLatestStorageWriteReportsSync(50);
  const failedWrites = writeReports.filter((report) => report.status === "failed").length;
  const lastSupabaseWriteStatus = writeReports.find((report) => report.storageMode === "supabase" || report.status === "failed")?.status ?? "unknown";
  const lastRun = await getLatestIngestionRun();
  const activeStorageMode: IngestionStorageMode = connection.connected && serviceRoleAvailable ? "supabase" : lastRun?.storageMode ?? "local_fallback";

  return {
    generatedAt: new Date().toISOString(),
    supabaseConfigured,
    supabaseConnected: connection.connected,
    serviceRoleAvailable,
    activeStorageMode,
    lastSupabaseWriteStatus,
    failedWrites,
    missingOptionalApiKeys: optionalApiKeys.filter((key) => !process.env[key]),
    enabledCollectors: productionSources
      .filter((source) => source.enabled)
      .map((source) => ({
        id: source.id,
        name: source.name,
        sourceType: source.sourceType,
        parser: source.parser,
        requiredEnvKeys: source.requiredEnvKeys ?? [],
        missingRequiredEnvKeys: (source.requiredEnvKeys ?? []).filter((key) => !process.env[key]),
      })),
    lastIngestionRun: lastRun
      ? {
          runId: lastRun.runId,
          storageMode: lastRun.storageMode,
          pulledEvents: lastRun.pulledEvents,
          pulledMetrics: lastRun.pulledMetrics,
          persistedEvents: lastRun.persistedEvents,
          persistedMetrics: lastRun.persistedMetrics,
          failedSources: lastRun.failedSources,
          deadLetters: lastRun.deadLetters,
        }
      : null,
    storageWriteReports: writeReports,
    connectionError: connection.error,
  };
}
