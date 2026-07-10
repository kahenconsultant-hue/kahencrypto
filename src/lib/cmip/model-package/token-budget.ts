import { CMIP_CONTEXT_BUDGET_LIMITS } from "./constants";
import { stableStringify } from "./stable-json";
import type { CmipContextBudgetReport, CmipContextReduction, CmipTokenBudgetProfile } from "./types";

export function estimateTokensFromText(value: string): number {
  return Math.ceil(Buffer.byteLength(value, "utf8") / 4);
}

export function estimateTokensFromJson(value: unknown): number {
  return estimateTokensFromText(stableStringify(value));
}

export function reduceRuntimeContextForBudget(params: {
  runtimeContext: Record<string, unknown>;
  profile: CmipTokenBudgetProfile;
  staticText: string;
  schemaText: string;
}): { readonly runtimeContext: Record<string, unknown>; readonly budget: CmipContextBudgetReport } {
  const limits = CMIP_CONTEXT_BUDGET_LIMITS[params.profile];
  const reductions: CmipContextReduction[] = [];
  let context = cloneRecord(params.runtimeContext);

  context = limitNews(context, limits.newsLimit, reductions);
  context = limitHistoricalEvidence(context, limits.historicalLimit, reductions);
  if (!limits.includeFundBreakdown) context = removeFundBreakdowns(context, reductions);

  let budget = buildBudgetReport({
    profile: params.profile,
    staticText: params.staticText,
    runtimeContext: context,
    schemaText: params.schemaText,
    reductions,
  });

  if (!budget.withinBudget) {
    context = removeSourceMetadataDetail(context, reductions);
    budget = buildBudgetReport({
      profile: params.profile,
      staticText: params.staticText,
      runtimeContext: context,
      schemaText: params.schemaText,
      reductions,
    });
  }

  return { runtimeContext: context, budget };
}

export function buildBudgetReport(params: {
  profile: CmipTokenBudgetProfile;
  staticText: string;
  runtimeContext: unknown;
  schemaText: string;
  reductions: readonly CmipContextReduction[];
}): CmipContextBudgetReport {
  const limits = CMIP_CONTEXT_BUDGET_LIMITS[params.profile];
  const estimatedStaticTokens = estimateTokensFromText(params.staticText);
  const estimatedRuntimeTokens = estimateTokensFromJson(params.runtimeContext);
  const estimatedSchemaTokens = estimateTokensFromText(params.schemaText);
  const estimatedInputTokens = estimatedStaticTokens + estimatedRuntimeTokens + estimatedSchemaTokens;
  return {
    profile: params.profile,
    estimatedInputTokens,
    estimatedStaticTokens,
    estimatedRuntimeTokens,
    estimatedSchemaTokens,
    maxInputTokens: limits.maxInputTokens,
    reservedOutputTokens: limits.reservedOutputTokens,
    withinBudget: estimatedInputTokens <= limits.maxInputTokens,
    reductionsApplied: params.reductions,
  };
}

function limitNews(context: Record<string, unknown>, limit: number, reductions: CmipContextReduction[]): Record<string, unknown> {
  const news = getArray(context, ["runtime_input", "cmip_runtime_input", "news"]);
  if (!news || news.length <= limit) return context;
  const beforeBytes = Buffer.byteLength(stableStringify(news), "utf8");
  const sorted = [...news].sort((a, b) => newsRank(b) - newsRank(a) || stringField(a, "published_at").localeCompare(stringField(b, "published_at")) || stringField(a, "news_id").localeCompare(stringField(b, "news_id")));
  const kept = sorted.slice(0, limit);
  const output = setAtPath(context, ["runtime_input", "cmip_runtime_input", "news"], kept);
  reductions.push({
    reductionId: "limit_news_by_importance",
    reason: "News context exceeded deterministic profile limit; low importance items are removed before high importance items.",
    affectedPaths: ["$.runtime_input.cmip_runtime_input.news"],
    beforeBytes,
    afterBytes: Buffer.byteLength(stableStringify(kept), "utf8"),
  });
  return output;
}

function limitHistoricalEvidence(context: Record<string, unknown>, limit: number, reductions: CmipContextReduction[]): Record<string, unknown> {
  const records = getArray(context, ["runtime_input", "cmip_runtime_input", "historical_evidence"]);
  if (!records || records.length <= limit) return context;
  const beforeBytes = Buffer.byteLength(stableStringify(records), "utf8");
  const kept = [...records].sort((a, b) => historyRank(b) - historyRank(a) || stringField(a, "evidence_id").localeCompare(stringField(b, "evidence_id"))).slice(0, limit);
  const output = setAtPath(context, ["runtime_input", "cmip_runtime_input", "historical_evidence"], kept);
  reductions.push({
    reductionId: "limit_historical_evidence",
    reason: "Historical evidence exceeded deterministic profile limit; verified records are retained before partial and unavailable records.",
    affectedPaths: ["$.runtime_input.cmip_runtime_input.historical_evidence"],
    beforeBytes,
    afterBytes: Buffer.byteLength(stableStringify(kept), "utf8"),
  });
  return output;
}

function removeFundBreakdowns(context: Record<string, unknown>, reductions: CmipContextReduction[]): Record<string, unknown> {
  const etf = getRecord(context, ["runtime_input", "cmip_runtime_input", "etf"]);
  if (!etf) return context;
  const beforeBytes = Buffer.byteLength(stableStringify(etf), "utf8");
  const nextEtf = cloneRecord(etf);
  for (const key of ["btc", "eth"]) {
    const asset = isRecord(nextEtf[key]) ? cloneRecord(nextEtf[key] as Record<string, unknown>) : undefined;
    if (asset && Array.isArray(asset.fund_breakdown) && asset.fund_breakdown.length) {
      asset.fund_breakdown = [];
      nextEtf[key] = asset;
    }
  }
  const afterBytes = Buffer.byteLength(stableStringify(nextEtf), "utf8");
  if (afterBytes === beforeBytes) return context;
  reductions.push({
    reductionId: "remove_fund_breakdown_detail",
    reason: "Compact budget removes fund-level ETF detail while preserving aggregate flows.",
    affectedPaths: ["$.runtime_input.cmip_runtime_input.etf.*.fund_breakdown"],
    beforeBytes,
    afterBytes,
  });
  return setAtPath(context, ["runtime_input", "cmip_runtime_input", "etf"], nextEtf);
}

function removeSourceMetadataDetail(context: Record<string, unknown>, reductions: CmipContextReduction[]): Record<string, unknown> {
  const sources = getArray(context, ["runtime_input", "cmip_runtime_input", "sources"]);
  if (!sources) return context;
  const beforeBytes = Buffer.byteLength(stableStringify(sources), "utf8");
  const reduced = sources.map((source) => {
    if (!isRecord(source)) return source;
    return {
      source_id: source.source_id,
      provider: source.provider,
      source_type: source.source_type,
      status: source.status,
      tier: source.tier,
      fields: source.fields,
    };
  });
  reductions.push({
    reductionId: "dedupe_source_metadata",
    reason: "Repeated source URL and timestamp metadata removed after registry validation; source IDs remain traceable.",
    affectedPaths: ["$.runtime_input.cmip_runtime_input.sources"],
    beforeBytes,
    afterBytes: Buffer.byteLength(stableStringify(reduced), "utf8"),
  });
  return setAtPath(context, ["runtime_input", "cmip_runtime_input", "sources"], reduced);
}

function newsRank(value: unknown): number {
  const importance = isRecord(value) && typeof value.importance === "string" ? value.importance : "";
  if (importance === "critical") return 4;
  if (importance === "high") return 3;
  if (importance === "medium") return 2;
  if (importance === "low") return 1;
  return 0;
}

function historyRank(value: unknown): number {
  const status = isRecord(value) && typeof value.status === "string" ? value.status : "";
  if (status === "verified") return 3;
  if (status === "partial") return 2;
  if (status === "unavailable") return 1;
  return 0;
}

function stringField(value: unknown, field: string): string {
  return isRecord(value) && typeof value[field] === "string" ? value[field] : "";
}

function getArray(root: Record<string, unknown>, path: readonly string[]): unknown[] | undefined {
  const value = getAtPath(root, path);
  return Array.isArray(value) ? value : undefined;
}

function getRecord(root: Record<string, unknown>, path: readonly string[]): Record<string, unknown> | undefined {
  const value = getAtPath(root, path);
  return isRecord(value) ? value : undefined;
}

function getAtPath(root: Record<string, unknown>, path: readonly string[]): unknown {
  return path.reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), root);
}

function setAtPath(root: Record<string, unknown>, path: readonly string[], value: unknown): Record<string, unknown> {
  if (path.length === 0) return isRecord(value) ? cloneRecord(value) : root;
  const [head, ...tail] = path;
  const output = cloneRecord(root);
  output[head] = tail.length === 0 ? value : setAtPath(isRecord(output[head]) ? (output[head] as Record<string, unknown>) : {}, tail, value);
  return output;
}

function cloneRecord(record: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(stableStringify(record)) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
