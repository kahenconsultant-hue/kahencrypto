import type { CmipRuntimeSource } from "../runtime-input";
import { cmipNormalizationIssue, type CmipNormalizationError, type CmipNormalizationWarning } from "./errors";
import { normalizationFail, normalizationOk, type CmipNormalizationResult } from "./result";
import { normalizeTimestamp } from "./timestamp-normalizer";
import type { RawSourceRecord } from "./types";

const NULL_URL_SOURCE_TYPES = new Set(["database", "manual", "derived"]);

export function normalizeSources(
  rawSources: readonly RawSourceRecord[],
  dataCutoff: string,
): CmipNormalizationResult<readonly CmipRuntimeSource[]> {
  const errors: CmipNormalizationError[] = [];
  const warnings: CmipNormalizationWarning[] = [];
  const seen = new Set<string>();
  const normalized: CmipRuntimeSource[] = [];

  rawSources.forEach((source, index) => {
    const path = `$.sources[${index}]`;
    const sourceId = (source.source_id ?? source.sourceId ?? source.id ?? "").trim();
    if (!sourceId) {
      errors.push(issue("INVALID_SOURCE", `${path}.source_id`, "Source ID is required."));
      return;
    }
    if (seen.has(sourceId)) {
      errors.push(issue("DUPLICATE_SOURCE", `${path}.source_id`, `Duplicate source_id ${sourceId}.`, [sourceId]));
      return;
    }
    seen.add(sourceId);

    const provider = (source.provider ?? source.name ?? "").trim();
    if (!provider) {
      errors.push(issue("INVALID_SOURCE", `${path}.provider`, "Provider name is required.", [sourceId]));
    }

    const sourceType = normalizeSourceType(source.source_type ?? source.sourceType);
    const status = normalizeSourceStatus(source.status);
    const tier = normalizeSourceTier(source.tier, sourceType);
    const url = normalizeUrl(source.url, sourceType);
    if (url === undefined) {
      errors.push(issue("INVALID_SOURCE", `${path}.url`, "Source URL is invalid or not allowed for this source type.", [sourceId]));
    }

    const retrieved = normalizeTimestamp(source.retrieved_at ?? source.retrievedAt, {
      path: `${path}.retrieved_at`,
      domain: "sources",
      referenceTimestamp: dataCutoff,
      futureToleranceSeconds: 300,
    });
    if (!retrieved.ok) errors.push(...retrieved.errors);
    warnings.push(...retrieved.warnings);

    let publishedAt: string | null = null;
    const rawPublished = source.published_at ?? source.publishedAt;
    if (rawPublished !== null && rawPublished !== undefined && rawPublished !== "") {
      const published = normalizeTimestamp(rawPublished, {
        path: `${path}.published_at`,
        domain: "sources",
        referenceTimestamp: dataCutoff,
        futureToleranceSeconds: 300,
      });
      if (!published.ok) errors.push(...published.errors);
      else publishedAt = published.data;
      warnings.push(...published.warnings);
    }

    if (!source.fields?.length) {
      errors.push(issue("INVALID_SOURCE", `${path}.fields`, "Source fields must not be empty.", [sourceId]));
    }

    if (provider && sourceType && status && tier && url !== undefined && retrieved.ok && source.fields?.length) {
      normalized.push({
        source_id: sourceId,
        provider,
        source_type: sourceType,
        url,
        retrieved_at: retrieved.data,
        published_at: publishedAt,
        fields: [...source.fields].map((field) => field.trim()).filter(Boolean),
        status,
        tier,
      });
    }
  });

  normalized.sort((a, b) => a.source_id.localeCompare(b.source_id));

  return errors.length ? normalizationFail(errors, warnings) : normalizationOk(normalized, warnings);
}

function issue(code: CmipNormalizationError["code"], path: string, message: string, sourceRefs: readonly string[] = []) {
  return cmipNormalizationIssue({ code, path, message, domain: "sources", sourceRefs, severity: "error" });
}

function normalizeUrl(value: string | null | undefined, sourceType: CmipRuntimeSource["source_type"]): string | null | undefined {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return NULL_URL_SOURCE_TYPES.has(sourceType) ? null : undefined;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function normalizeSourceType(value: string | undefined): CmipRuntimeSource["source_type"] {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "api" || normalized === "web" || normalized === "official_release" || normalized === "exchange" || normalized === "database" || normalized === "manual" || normalized === "derived") return normalized;
  if (normalized === "rss" || normalized === "scraper" || normalized === "social") return "web";
  if (normalized === "filings") return "official_release";
  return "api";
}

function normalizeSourceStatus(value: string | undefined): CmipRuntimeSource["status"] {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "ok" || normalized === "partial" || normalized === "failed" || normalized === "stale" || normalized === "conflict") return normalized;
  if (normalized === "success") return "ok";
  if (normalized === "degraded" || normalized === "api_key_missing" || normalized === "disabled") return "partial";
  return "ok";
}

function normalizeSourceTier(value: string | number | undefined, sourceType: CmipRuntimeSource["source_type"]): CmipRuntimeSource["tier"] {
  if (typeof value === "number") {
    if (value === 1) return "primary";
    if (value === 2) return "secondary";
    return "fallback";
  }
  const normalized = value?.trim().toLowerCase();
  if (normalized === "primary" || normalized === "secondary" || normalized === "fallback" || normalized === "proxy") return normalized;
  return sourceType === "derived" ? "proxy" : "primary";
}
