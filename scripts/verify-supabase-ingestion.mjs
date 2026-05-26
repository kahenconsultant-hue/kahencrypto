#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const tables = [
  "sources",
  "source_health",
  "raw_events",
  "raw_metrics",
  "ingestion_logs",
  "processing_errors",
  "dead_letters",
  "normalized_events",
  "event_clusters",
  "smart_alerts",
  "derived_signals",
  "liquidity_scores",
  "regime_inputs",
  "reliability_snapshots",
  "ingestion_runs",
];

if (!url || !key) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: "Supabase env is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        missing: {
          NEXT_PUBLIC_SUPABASE_URL: !url,
          SUPABASE_SERVICE_ROLE_KEY: !process.env.SUPABASE_SERVICE_ROLE_KEY,
        },
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const results = [];
for (const table of tables) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact" }).limit(1);
  results.push({ table, count: count ?? null, error: error?.message ?? null });
}

const failed = results.filter((row) => row.error || row.count === null);
console.log(
  JSON.stringify(
    {
      ok: failed.length === 0,
      generatedAt: new Date().toISOString(),
      results,
      failed,
    },
    null,
    2,
  ),
);

if (failed.length) process.exit(1);
