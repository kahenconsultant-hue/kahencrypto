#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

loadDotenvLocal();

const migrations = [
  "202605230001_initial_crypto_macro_schema.sql",
  "202605250001_ingestion_foundation.sql",
  "202605250002_ingestion_runs_dead_letters.sql",
  "202605250003_production_persistence_activation.sql",
  "202605250004_sources_source_key_constraint.sql",
  "202605250005_normalized_events_clusters.sql",
  "202605250006_normalized_events_conflict_key.sql",
  "202605250007_free_data_proxy_model.sql",
  "202605250008_data_foundation_contracts.sql",
];

function connectionConfig() {
  if (process.env.SUPABASE_DATABASE_URL) {
    return {
      connectionString: process.env.SUPABASE_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    };
  }

  const host = process.env.SUPABASE_DB_HOST;
  const database = process.env.SUPABASE_DB_NAME || "postgres";
  const user = process.env.SUPABASE_DB_USER || "postgres";
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!host || !password) {
    throw new Error("Missing SUPABASE_DB_HOST or SUPABASE_DB_PASSWORD in .env.local.");
  }

  return {
    host,
    database,
    user,
    password,
    port: Number(process.env.SUPABASE_DB_PORT || "5432"),
    ssl: { rejectUnauthorized: false },
  };
}

const client = new Client(connectionConfig());

try {
  await client.connect();
  await client.query("create table if not exists public.schema_migrations (version text primary key, applied_at timestamptz not null default now())");

  for (const migration of migrations) {
    const { rowCount } = await client.query("select 1 from public.schema_migrations where version = $1", [migration]);
    if (rowCount) {
      console.log(`skip ${migration}`);
      continue;
    }
    const sql = readFileSync(join("supabase", "migrations", migration), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into public.schema_migrations (version) values ($1)", [migration]);
      await client.query("commit");
      console.log(`applied ${migration}`);
    } catch (error) {
      await client.query("rollback");
      throw new Error(`Migration failed: ${migration}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} finally {
  await client.end().catch(() => undefined);
}
