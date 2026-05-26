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

if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
  console.error("CMIP_INGEST_INTERVAL_MINUTES must be a positive number.");
  process.exit(1);
}

async function runIngestion() {
  const url = `${baseUrl.replace(/\/$/, "")}/api/cron/ingest`;
  const started = new Date().toISOString();
  const headers = cronSecret ? { authorization: `Bearer ${cronSecret}` } : {};

  try {
    const response = await fetch(url, { method: "GET", headers });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
    }
    const payload = JSON.parse(body);
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
  console.log(`C.M.I.P local ingestion scheduler active: every ${intervalMinutes} minutes -> ${baseUrl}`);
  setInterval(runIngestion, intervalMs);
}
