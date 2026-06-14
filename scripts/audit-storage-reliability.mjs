#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";

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

function connectionConfig() {
  if (process.env.SUPABASE_DATABASE_URL) {
    return {
      connectionString: process.env.SUPABASE_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    };
  }

  return {
    host: process.env.SUPABASE_DB_HOST,
    database: process.env.SUPABASE_DB_NAME || "postgres",
    user: process.env.SUPABASE_DB_USER || "postgres",
    password: process.env.SUPABASE_DB_PASSWORD,
    port: Number(process.env.SUPABASE_DB_PORT || "5432"),
    ssl: { rejectUnauthorized: false },
  };
}

const TABLES = [
  "raw_events",
  "raw_metrics",
  "normalized_events",
  "telemetry_logs",
  "ingestion_runs",
  "etf_daily_flows",
  "forecast_snapshots",
  "forecast_validations",
  "data_health_snapshots",
];

const EXPECTED_INDEX_PATTERNS = {
  raw_events: ["event_timestamp", "created_at", "source_id_text"],
  raw_metrics: ["metric_timestamp", "created_at", "source_id_text", "metric", "asset"],
  normalized_events: ["event_timestamp", "created_at", "source_id_text"],
  telemetry_logs: ["observed_at", "source_id_text", "table_name"],
  ingestion_runs: ["run_id", "finished_at"],
  etf_daily_flows: ["asset", "flow_date", "provider", "fetched_at"],
  forecast_snapshots: ["forecast_timestamp", "run_id", "validation_date", "asset"],
  forecast_validations: ["validated_at", "validation_date", "asset"],
  data_health_snapshots: ["observed_at", "run_id"],
};

async function tableExists(client, table) {
  const result = await client.query(
    "select 1 from information_schema.tables where table_schema = $1 and table_name = $2",
    ["public", table],
  );
  return result.rowCount > 0;
}

async function countRows(client, table) {
  const start = Date.now();
  const result = await client.query(`select count(*)::bigint as count from public.${table}`);
  return {
    count: Number(result.rows[0]?.count ?? 0),
    durationMs: Date.now() - start,
  };
}

async function indexesFor(client, table) {
  const result = await client.query(
    "select indexname, indexdef from pg_indexes where schemaname = $1 and tablename = $2 order by indexname",
    ["public", table],
  );
  return result.rows.map((row) => ({
    name: row.indexname,
    definition: row.indexdef,
  }));
}

function missingIndexHints(table, indexes) {
  const indexText = indexes.map((index) => index.definition.toLowerCase()).join("\n");
  return (EXPECTED_INDEX_PATTERNS[table] ?? []).filter((pattern) => !indexText.includes(pattern.toLowerCase()));
}

loadDotenvLocal();

const client = new Client(connectionConfig());

try {
  await client.connect();
  const tables = [];

  for (const table of TABLES) {
    const exists = await tableExists(client, table);
    if (!exists) {
      tables.push({
        table,
        exists: false,
        rowCount: null,
        countDurationMs: null,
        indexes: [],
        missingIndexHints: EXPECTED_INDEX_PATTERNS[table] ?? [],
      });
      continue;
    }

    const rowCount = await countRows(client, table);
    const indexes = await indexesFor(client, table);

    tables.push({
      table,
      exists: true,
      rowCount: rowCount.count,
      countDurationMs: rowCount.durationMs,
      indexes: indexes.map((index) => index.name),
      missingIndexHints: missingIndexHints(table, indexes),
    });
  }

  const latestRuns = await client.query(
    "select run_id, storage_mode, started_at, finished_at, successful_sources, degraded_sources, failed_sources, dead_letters from public.ingestion_runs order by finished_at desc nulls last limit 5",
  );

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        tables,
        latestIngestionRuns: latestRuns.rows,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end().catch(() => undefined);
}
