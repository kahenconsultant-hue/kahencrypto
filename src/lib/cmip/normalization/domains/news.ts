import type { CmipRuntimeNewsEvent, CmipRuntimeSource } from "../../runtime-input";
import { cmipNormalizationIssue, type CmipNormalizationError, type CmipNormalizationWarning } from "../errors";
import { normalizationFail, normalizationOk, type CmipNormalizationResult } from "../result";
import { normalizeTimestamp } from "../timestamp-normalizer";
import type { CmipRawNewsEvent } from "../types";

const MAX_SUMMARY_LENGTH = 900;

export function normalizeNewsDomain(raw: readonly CmipRawNewsEvent[] | undefined, dataCutoff: string, sourceMap: ReadonlyMap<string, CmipRuntimeSource>): CmipNormalizationResult<readonly CmipRuntimeNewsEvent[]> {
  const errors: CmipNormalizationError[] = [];
  const warnings: CmipNormalizationWarning[] = [];
  const events = (raw ?? []).map((event, index) => {
    const path = `$.domains.news[${index}]`;
    const source_refs = [...(event.source_refs ?? event.sourceRefs ?? [])].sort();
    if (event.verification_status === "verified") {
      const blocked = source_refs.find((sourceRef) => {
        const source = sourceMap.get(sourceRef);
        return source?.status === "conflict" || source?.status === "failed";
      });
      if (blocked) errors.push(cmipNormalizationIssue({ code: "SOURCE_CONFLICT", path: `${path}.verification_status`, domain: "news", sourceRefs: [blocked], message: "Conflicting or failed sources cannot produce verified news.", severity: "error" }));
    }
    const published = normalizeTimestamp(event.published_at ?? event.publishedAt, { path: `${path}.published_at`, domain: "news", referenceTimestamp: dataCutoff, futureToleranceSeconds: 300 });
    const retrieved = normalizeTimestamp(event.retrieved_at ?? event.retrievedAt, { path: `${path}.retrieved_at`, domain: "news", referenceTimestamp: dataCutoff, futureToleranceSeconds: 300 });
    warnings.push(...published.warnings, ...retrieved.warnings);
    if (!published.ok) errors.push(...published.errors);
    if (!retrieved.ok) errors.push(...retrieved.errors);
    const duplicateGroup = event.duplicate_group_id ?? deterministicGroupId(event.headline ?? "", source_refs);
    return {
      news_id: event.news_id ?? duplicateGroup,
      headline: (event.headline ?? "Untitled normalized event").trim().slice(0, 240),
      summary: (event.summary ?? "No article body stored.").trim().slice(0, MAX_SUMMARY_LENGTH),
      category: event.category ?? "other",
      importance: event.importance ?? "medium",
      sentiment: event.sentiment ?? "neutral",
      affected_assets: (event.affected_assets ?? []).map((symbol) => symbol.toUpperCase()).filter((symbol) => ["BTC", "ETH", "USDT", "BNB", "SOL", "XRP", "TRX", "TON", "DOGE", "ADA"].includes(symbol)) as CmipRuntimeNewsEvent["affected_assets"],
      published_at: published.ok ? published.data : dataCutoff,
      retrieved_at: retrieved.ok ? retrieved.data : dataCutoff,
      source_refs,
      verification_status: event.verification_status ?? "single_source",
      duplicate_group_id: duplicateGroup,
    };
  });
  const seen = new Set<string>();
  events.forEach((event) => {
    if (seen.has(event.news_id)) errors.push(cmipNormalizationIssue({ code: "SOURCE_CONFLICT", path: "$.domains.news", domain: "news", message: `Duplicate news_id ${event.news_id}.`, severity: "error" }));
    seen.add(event.news_id);
  });
  return errors.length ? normalizationFail(errors, warnings) : normalizationOk(events, warnings);
}

function deterministicGroupId(headline: string, sourceRefs: readonly string[]): string {
  return `news-${Buffer.from(`${headline.toLowerCase()}|${sourceRefs.join(",")}`).toString("base64url").slice(0, 16)}`;
}
