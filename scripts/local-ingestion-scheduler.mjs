#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

function loadDotenvLocal() {
  if (!existsSync(".env.local")) return;
  const text = readFileSync(".env.local", "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotenvLocal();

const args = new Set(process.argv.slice(2));
const runOnce = args.has("--once");
const baseUrl = process.env.CMIP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3004";
const intervalMinutes = Number(process.env.CMIP_INGEST_INTERVAL_MINUTES || "30");
const cronSecret = process.env.INGESTION_CRON_SECRET || process.env.CRON_SECRET || "";
const localTarget = process.env.CMIP_LOCAL_INGEST_TARGET || "cron-async";

if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
  console.error("CMIP_INGEST_INTERVAL_MINUTES must be a positive number.");
  process.exit(1);
}

async function runIngestion() {
  const path =
    localTarget === "cron-sync"
      ? "/api/cron/ingest?sync=1"
      : localTarget === "cron-async"
        ? "/api/cron/ingest"
        : "/api/v1/refresh";
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const started = new Date().toISOString();
  const headers = cronSecret ? { authorization: `Bearer ${cronSecret}` } : {};

  try {
    const response = await fetch(url, { method: "GET", headers });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
    }
    const payload = JSON.parse(body);
    if (payload.accepted) {
      console.log(
        JSON.stringify(
          {
            started,
            finished: new Date().toISOString(),
            url,
            accepted: true,
            mode: payload.mode,
            message: payload.message,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (typeof payload.refreshed === "boolean") {
      console.log(
        JSON.stringify(
          {
            started,
            finished: new Date().toISOString(),
            url,
            refreshed: payload.refreshed,
            reason: payload.reason,
            cacheGeneratedAt: payload.refresh?.generatedAt ?? payload.status?.generatedAt ?? null,
            cacheExpiresAt: payload.refresh?.expiresAt ?? payload.status?.expiresAt ?? null,
            cacheAgeMinutes: payload.status?.ageMinutes ?? null,
            nextScheduledUpdateMinutes: payload.nextScheduledUpdateMinutes ?? null,
            signalCounts: payload.refresh?.counts ?? null,
            backgroundIngestionScheduled: payload.backgroundIngestionScheduled ?? false,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (payload.schedulerRun) {
      console.log(
        JSON.stringify(
          {
            started,
            finished: new Date().toISOString(),
            url,
            runId: payload.schedulerRun.runId,
            status: payload.schedulerRun.status,
            durationMs: payload.schedulerRun.durationMs,
            successRate: payload.schedulerRun.successRate,
            failedStage: payload.schedulerRun.failedStage,
            retryCount: payload.schedulerRun.retryCount,
            staleSignals: payload.schedulerRun.staleSignals,
            stages: payload.result?.stages ?? [],
          },
          null,
          2,
        ),
      );
      return;
    }
    console.log(
      JSON.stringify(
        {
          started,
          finished: new Date().toISOString(),
          url,
          runId: payload.ingestion?.runId,
          storageMode: payload.ingestion?.storageMode,
          pulledEvents: payload.ingestion?.pulledEvents,
          pulledMetrics: payload.ingestion?.pulledMetrics,
          rawEventsInserted: payload.ingestion?.rawEventsInserted,
          rawEventsUpdated: payload.ingestion?.rawEventsUpdated,
          normalizedEventsCreated: payload.ingestion?.normalizedEventsCreated,
          eventClustersCreated: payload.ingestion?.eventClustersCreated,
          duplicatesDetected: payload.ingestion?.duplicatesDetected,
          failedSources: payload.ingestion?.failedSources,
          deadLetters: payload.ingestion?.deadLetters,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          started,
          finished: new Date().toISOString(),
          url,
          error: error instanceof Error ? error.message : "Unknown ingestion scheduler failure.",
        },
        null,
        2,
      ),
    );
    if (runOnce) process.exit(1);
  }
}

await runIngestion();

if (!runOnce) {
  const intervalMs = intervalMinutes * 60_000;
  console.log(`C.M.I.P local ingestion scheduler active: every ${intervalMinutes} minutes -> ${baseUrl} (${localTarget} mode)`);
  setInterval(runIngestion, intervalMs);
}
