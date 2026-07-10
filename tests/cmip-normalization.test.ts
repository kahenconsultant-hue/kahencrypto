import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import rawConflictFixture from "../src/lib/cmip/normalization/fixtures/raw-conflict.json";
import rawPartialFixture from "../src/lib/cmip/normalization/fixtures/raw-partial.json";
import rawValidFixture from "../src/lib/cmip/normalization/fixtures/raw-valid.json";
import { validateCmipRuntimeInput } from "../src/lib/cmip/runtime-input/validate-input";
import { CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS } from "../src/lib/cmip/runtime-input/constants";
import { resolveAssetIdentity } from "../src/lib/cmip/normalization/asset-identity";
import { normalizeBreadthDomain } from "../src/lib/cmip/normalization/domains/breadth";
import { normalizeCrossAssetDomain } from "../src/lib/cmip/normalization/domains/cross-asset";
import { normalizeDecisionMemoryDomain } from "../src/lib/cmip/normalization/domains/decision-memory";
import { normalizeDerivativesDomain } from "../src/lib/cmip/normalization/domains/derivatives";
import { normalizeEtfDomain } from "../src/lib/cmip/normalization/domains/etf";
import { normalizeHistoricalEvidenceDomain } from "../src/lib/cmip/normalization/domains/historical-evidence";
import { normalizeMacroDomain } from "../src/lib/cmip/normalization/domains/macro";
import { normalizeNewsDomain } from "../src/lib/cmip/normalization/domains/news";
import { normalizeOptionsDomain } from "../src/lib/cmip/normalization/domains/options";
import { normalizeNumericDataPoint } from "../src/lib/cmip/normalization/data-point-normalizer";
import { calculateFreshness } from "../src/lib/cmip/normalization/freshness";
import { calculatePointQuality, sourceQualityScore } from "../src/lib/cmip/normalization/quality";
import { normalizeCmipRuntimeInput } from "../src/lib/cmip/normalization/runtime-input-builder";
import { normalizeSources } from "../src/lib/cmip/normalization/source-normalizer";
import { normalizeTimestamp } from "../src/lib/cmip/normalization/timestamp-normalizer";
import type { CmipNormalizationErrorCode } from "../src/lib/cmip/normalization/errors";
import type { CmipNormalizationResult } from "../src/lib/cmip/normalization/result";
import type { CmipNormalizationRequest, CmipRawDataPoint } from "../src/lib/cmip/normalization/types";
import { normalizeUnitValue } from "../src/lib/cmip/normalization/units";

type Mutable<T> = T extends Date
  ? Date
  : T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

type MutableRequest = Mutable<CmipNormalizationRequest> & { fixture_label?: string };

const DATA_CUTOFF = "2026-07-10T06:30:00.000Z";

function cloneRequest(value: unknown = rawValidFixture): MutableRequest {
  return structuredClone(value) as unknown as MutableRequest;
}

function expectOk<T>(result: CmipNormalizationResult<T>): Extract<CmipNormalizationResult<T>, { ok: true }> {
  assert.equal(result.ok, true, result.ok ? undefined : formatIssues(result));
  return result as Extract<CmipNormalizationResult<T>, { ok: true }>;
}

function expectFail<T>(result: CmipNormalizationResult<T>, code: CmipNormalizationErrorCode): Extract<CmipNormalizationResult<T>, { ok: false }> {
  assert.equal(result.ok, false, "Expected normalization to fail.");
  const failed = result as Extract<CmipNormalizationResult<T>, { ok: false }>;
  assert.ok(failed.errors.some((error) => error.code === code), `Expected ${code}; received:\n${formatIssues(failed)}`);
  return failed;
}

function formatIssues(result: { warnings: readonly { code: string; path: string; message: string }[]; errors?: readonly { code: string; path: string; message: string }[] }): string {
  return [...(result.errors ?? []), ...result.warnings].map((issue) => `${issue.code} ${issue.path}: ${issue.message}`).join("\n");
}

function fixtureSourceMap(request: MutableRequest = cloneRequest()) {
  const sources = expectOk(normalizeSources(request.sources, DATA_CUTOFF)).data;
  return new Map(sources.map((source) => [source.source_id, source]));
}

function numericPoint(overrides: Partial<Mutable<CmipRawDataPoint>> = {}): CmipRawDataPoint {
  return {
    value: 10,
    unit: "USD",
    observed_at: "2026-07-10T06:20:00Z",
    source_refs: ["source:assets-coingecko"],
    ...overrides,
  };
}

function dataPointContext() {
  return {
    path: "$.test.value",
    domain: "test",
    dataCutoff: DATA_CUTOFF,
    sourceMap: fixtureSourceMap(),
    fieldType: "market_price" as const,
    targetUnit: "USD" as const,
  };
}

test("1. valid fixture normalizes successfully", () => {
  const result = expectOk(normalizeCmipRuntimeInput(cloneRequest()));
  assert.equal(result.data.cmip_runtime_input.assets.length, 10);
  assert.equal(result.warnings.length, 0);
});

test("2. partial fixture succeeds with warnings", () => {
  const result = expectOk(normalizeCmipRuntimeInput(cloneRequest(rawPartialFixture)));
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings.some((warning) => warning.code === "STALE_DATA" || warning.code === "DOMAIN_PARTIAL"));
  assertNoDuplicateWarningIdentities(result.warnings);
});

test("3. conflict fixture follows critical policy", () => {
  const result = expectFail(normalizeCmipRuntimeInput(cloneRequest(rawConflictFixture)), "IDENTITY_CONFLICT");
  assert.ok(result.errors.some((error) => error.code === "SOURCE_CONFLICT" || error.code === "STALE_DATA"));
});

test("4. same input produces deeply equal output", () => {
  const first = expectOk(normalizeCmipRuntimeInput(cloneRequest())).data;
  const second = expectOk(normalizeCmipRuntimeInput(cloneRequest())).data;
  assert.deepEqual(first, second);
});

test("5. input object is not mutated", () => {
  const request = cloneRequest();
  const before = structuredClone(request);
  expectOk(normalizeCmipRuntimeInput(request));
  assert.deepEqual(request, before);
});

test("6. final output passes Task 002 validation", () => {
  const result = expectOk(normalizeCmipRuntimeInput(cloneRequest()));
  assert.equal(validateCmipRuntimeInput(result.data).valid, true);
});

test("7. duplicate source ID fails", () => {
  const request = cloneRequest();
  request.sources[1].source_id = request.sources[0].source_id;
  expectFail(normalizeCmipRuntimeInput(request), "DUPLICATE_SOURCE");
});

test("8. invalid source URL fails", () => {
  const request = cloneRequest();
  request.sources[0].url = "not a url";
  expectFail(normalizeCmipRuntimeInput(request), "INVALID_SOURCE");
});

test("9. failed source cannot verify available value", () => {
  const request = cloneRequest();
  request.sources.find((source) => source.source_id === "source:market-index")!.status = "failed";
  expectFail(normalizeCmipRuntimeInput(request), "INVALID_SOURCE");
});

test("10. conflict source remains visible", () => {
  const request = cloneRequest(rawConflictFixture);
  const sources = expectOk(normalizeSources(request.sources, DATA_CUTOFF)).data;
  assert.equal(sources.find((source) => source.source_id === "source:conflict-market")?.status, "conflict");
});

test("11. source order does not change output semantics", () => {
  const normal = expectOk(normalizeCmipRuntimeInput(cloneRequest())).data;
  const reversed = cloneRequest();
  reversed.sources.reverse();
  const reordered = expectOk(normalizeCmipRuntimeInput(reversed)).data;
  assert.deepEqual(reordered, normal);
});

test("12. ISO timestamp normalizes to UTC", () => {
  const result = expectOk(normalizeTimestamp("2026-07-10T08:30:00+02:00", { path: "$.time", domain: "test" }));
  assert.equal(result.data, "2026-07-10T06:30:00.000Z");
});

test("13. Unix seconds normalize correctly", () => {
  const result = expectOk(normalizeTimestamp(1783665000, { path: "$.time", domain: "test" }));
  assert.equal(result.data, "2026-07-10T06:30:00.000Z");
});

test("14. Unix milliseconds normalize correctly", () => {
  const result = expectOk(normalizeTimestamp(1783665000000, { path: "$.time", domain: "test" }));
  assert.equal(result.data, "2026-07-10T06:30:00.000Z");
});

test("15. invalid date fails", () => {
  expectFail(normalizeTimestamp("not-a-date", { path: "$.time", domain: "test" }), "INVALID_TIMESTAMP");
});

test("16. timezone-less intraday date fails", () => {
  expectFail(normalizeTimestamp("2026-07-10T06:30:00", { path: "$.time", domain: "test" }), "INVALID_TIMESTAMP");
});

test("17. future timestamp beyond tolerance fails", () => {
  expectFail(normalizeTimestamp("2026-07-10T06:45:00Z", { path: "$.time", domain: "test", referenceTimestamp: DATA_CUTOFF, futureToleranceSeconds: 60 }), "FUTURE_TIMESTAMP");
});

test("18. DST boundary remains deterministic", () => {
  const result = expectOk(normalizeTimestamp("2026-03-29T01:30:00+01:00", { path: "$.time", domain: "test" }));
  assert.equal(result.data, "2026-03-29T00:30:00.000Z");
});

test("19. fresh field remains available", () => {
  const result = expectOk(normalizeNumericDataPoint(numericPoint({ observed_at: "2026-07-10T06:29:00Z" }), dataPointContext()));
  assert.equal(result.data.status, "available");
  assert.equal(result.warnings.length, 0);
});

test("20. stale field becomes stale", () => {
  const result = expectOk(normalizeNumericDataPoint(numericPoint({ observed_at: "2026-07-06T21:00:00Z", source_refs: ["source:etf-official"] }), { ...dataPointContext(), fieldType: "etf_flow" }));
  assert.equal(result.data.status, "stale");
  assert.equal(result.data.freshness.is_stale, true);
});

test("21. freshness uses data cutoff, not system clock", () => {
  const result = expectOk(calculateFreshness({ observedAt: "2030-01-01T00:00:00Z", dataCutoff: "2030-01-01T00:10:00Z", fieldType: "market_price", path: "$.freshness", domain: "test" }));
  assert.equal(result.data.age_seconds, 600);
});

test("22. official delayed macro policy works", () => {
  const result = expectOk(calculateFreshness({ observedAt: "2026-06-15T12:00:00Z", dataCutoff: DATA_CUTOFF, fieldType: "macro_release", path: "$.macro.release", domain: "macro" }));
  assert.equal(result.data.is_stale, false);
});

test("23. critical stale field follows blocking policy", () => {
  expectFail(calculateFreshness({ observedAt: "2026-07-10T04:00:00Z", dataCutoff: DATA_CUTOFF, fieldType: "market_price", path: "$.market.price", domain: "market" }), "STALE_DATA");
});

test("24. supported unit conversion passes", () => {
  const result = expectOk(normalizeUnitValue({ value: 2, unit: "USD_MILLION", targetUnit: "USD", path: "$.unit", domain: "test" }));
  assert.equal(result.data.value, 2_000_000);
  assert.equal(result.data.unit, "USD");
});

test("25. unsupported unit fails", () => {
  expectFail(normalizeUnitValue({ value: 2, unit: "widgets", targetUnit: "USD", path: "$.unit", domain: "test" }), "UNSUPPORTED_UNIT");
});

test("26. numeric string fails", () => {
  expectFail(normalizeNumericDataPoint(numericPoint({ value: "10" }), dataPointContext()), "INVALID_NUMBER");
});

test("27. NaN fails", () => {
  expectFail(normalizeNumericDataPoint(numericPoint({ value: Number.NaN }), dataPointContext()), "NON_FINITE_NUMBER");
});

test("28. Infinity fails", () => {
  expectFail(normalizeNumericDataPoint(numericPoint({ value: Number.POSITIVE_INFINITY }), dataPointContext()), "NON_FINITE_NUMBER");
});

test("29. negative market cap fails", () => {
  expectFail(normalizeNumericDataPoint(numericPoint({ value: -1 }), dataPointContext()), "NEGATIVE_VALUE");
});

test("30. percentage representation remains consistent", () => {
  const result = expectOk(normalizeNumericDataPoint(numericPoint({ value: 42, unit: "PERCENT" }), { ...dataPointContext(), targetUnit: "PERCENT", percentage: true }));
  assert.equal(result.data.value, 42);
  assert.equal(result.data.unit, "percent");
});

test("31. currency is not converted without FX input", () => {
  expectFail(normalizeUnitValue({ value: 2, unit: "EUR", targetUnit: "USD", path: "$.unit", domain: "test" }), "UNIT_MISMATCH");
});

test("32. USDT is not forced to 1", () => {
  const output = expectOk(normalizeCmipRuntimeInput(cloneRequest())).data;
  const usdt = output.cmip_runtime_input.assets.find((asset) => asset.symbol === "USDT");
  assert.equal(usdt?.price.value, 0.9992);
});

test("33. all ten canonical assets resolve", () => {
  const providerIds = ["bitcoin", "ethereum", "tether", "binancecoin", "solana", "ripple", "tron", "the-open-network", "dogecoin", "cardano"];
  for (const [index, symbol] of CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS.entries()) {
    const result = expectOk(resolveAssetIdentity({ symbol, provider: "coingecko", providerAssetId: providerIds[index] }));
    assert.equal(result.data.identityStatus, "verified");
    assert.equal(result.data.canonicalSymbol, symbol);
  }
});

test("34. TON resolves only from approved canonical/provider ID", () => {
  const result = expectOk(resolveAssetIdentity({ symbol: "TON", provider: "coingecko", providerAssetId: "the-open-network" }));
  assert.equal(result.data.identityStatus, "verified");
  assert.equal(result.data.canonicalAssetId, "crypto:toncoin");
});

test("35. TON/Tokamak conflict fails identity", () => {
  const result = expectOk(resolveAssetIdentity({ symbol: "TON", provider: "coingecko", providerAssetId: "tokamak-network" }));
  assert.equal(result.data.identityStatus, "conflict");
  assert.ok(result.data.errors.some((error) => error.code === "IDENTITY_CONFLICT"));
});

test("36. unknown asset becomes unavailable", () => {
  const result = expectOk(resolveAssetIdentity({ symbol: "BTC", provider: "unknown-provider", providerAssetId: "unknown-bitcoin" }));
  assert.equal(result.data.identityStatus, "unavailable");
});

test("37. duplicate canonical asset fails", () => {
  const request = cloneRequest();
  request.domains.assets!.assets![1] = structuredClone(request.domains.assets!.assets![0]);
  expectFail(normalizeCmipRuntimeInput(request), "DUPLICATE_ASSET");
});

test("38. symbol/provider ID mismatch becomes conflict", () => {
  const result = expectOk(resolveAssetIdentity({ symbol: "BTC", provider: "coingecko", providerAssetId: "ethereum" }));
  assert.equal(result.data.identityStatus, "conflict");
  assert.ok(result.data.errors.some((error) => error.code === "IDENTITY_CONFLICT"));
});

test("39. available point requires source", () => {
  expectFail(normalizeNumericDataPoint(numericPoint({ source_refs: [] }), dataPointContext()), "MISSING_SOURCE");
});

test("40. missing point requires null value", () => {
  expectFail(normalizeNumericDataPoint(numericPoint({ status: "missing", value: 1 }), dataPointContext()), "INVALID_NUMBER");
});

test("41. conflict point requires null value", () => {
  expectFail(normalizeNumericDataPoint(numericPoint({ status: "conflict", value: 1 }), dataPointContext()), "SOURCE_CONFLICT");
});

test("42. proxy requires method", () => {
  expectFail(normalizeNumericDataPoint(numericPoint({ status: "proxy" }), { ...dataPointContext(), proxy: true }), "PROXY_METHOD_MISSING");
});

test("43. derived requires calculation trace", () => {
  expectFail(normalizeNumericDataPoint(numericPoint(), { ...dataPointContext(), derived: true }), "CALCULATION_TRACE_MISSING");
});

test("43a. valid derived values generate no warning", () => {
  const result = expectOk(normalizeNumericDataPoint(numericPoint({
    source_refs: ["source:derived-normalization"],
    calculation: { method: "fixture", formula: "a - b", inputs: ["a", "b"], version: "test" },
  }), { ...dataPointContext(), sourceMap: fixtureSourceMap(), derived: true }));
  assert.equal(result.warnings.length, 0);
});

test("43b. valid proxy values generate at most one material warning per root cause", () => {
  const result = expectOk(normalizeNumericDataPoint(numericPoint({
    source_refs: ["source:stablecoin-api"],
    status: "proxy",
    calculation: { method: "fixture_proxy", formula: "proxy input", inputs: ["source:stablecoin-api"], version: "test" },
  }), { ...dataPointContext(), sourceMap: fixtureSourceMap(), proxy: true }));
  assert.ok(result.warnings.length <= 1);
  assertNoDuplicateWarningIdentities(result.warnings);
});

test("43c. optional missing non-critical fields do not generate repeated field-level warnings", () => {
  const point = expectOk(normalizeNumericDataPoint(undefined, dataPointContext()));
  assert.equal(point.data.status, "missing");
  assert.equal(point.warnings.length, 0);
  const options = expectOk(normalizeOptionsDomain(undefined, { dataCutoff: DATA_CUTOFF, sourceMap: fixtureSourceMap() }));
  assert.equal(options.warnings.length, 1);
  assert.equal(options.warnings[0].path, "$.domains.options");
});

test("44. stale point cannot remain available", () => {
  const result = expectOk(normalizeNumericDataPoint(numericPoint({ observed_at: "2026-07-06T21:00:00Z", source_refs: ["source:etf-official"] }), { ...dataPointContext(), fieldType: "etf_flow" }));
  assert.notEqual(result.data.status, "available");
  assert.equal(result.data.status, "stale");
});

test("45. ETF trading-day windows do not include weekends as zero", () => {
  const result = normalizeEtfDomain({ btc: { zero_flow_weekend_dates: ["2026-07-04"], fund_breakdown: [] }, eth: { fund_breakdown: [] } }, { dataCutoff: DATA_CUTOFF, sourceMap: fixtureSourceMap() });
  expectFail(result, "TIMEFRAME_CONFLICT");
});

test("46. BTC and ETH ETF flows remain separated", () => {
  const output = expectOk(normalizeCmipRuntimeInput(cloneRequest())).data.cmip_runtime_input;
  assert.notEqual(output.etf.btc.daily_net_flow.value, output.etf.eth.daily_net_flow.value);
});

test("47. funding interval metadata is preserved", () => {
  const output = expectOk(normalizeCmipRuntimeInput(cloneRequest())).data.cmip_runtime_input;
  assert.equal(output.derivatives.funding_by_exchange[0].interval, "8h");
});

test("48. OI currency mismatch blocks aggregation", () => {
  const result = normalizeDerivativesDomain({
    btc_open_interest: numericPoint({ unit: "USD" }),
    eth_open_interest: numericPoint({ unit: "USD_MILLION" }),
  }, { dataCutoff: DATA_CUTOFF, sourceMap: fixtureSourceMap() });
  expectFail(result, "UNIT_MISMATCH");
});

test("49. liquidation component inconsistency warns by tolerance", () => {
  const result = expectOk(normalizeDerivativesDomain({
    liquidations_24h: numericPoint({ value: 100 }),
    long_liquidations_24h: numericPoint({ value: 90 }),
    short_liquidations_24h: numericPoint({ value: 20 }),
    liquidation_tolerance_pct: 5,
  }, { dataCutoff: DATA_CUTOFF, sourceMap: fixtureSourceMap() }));
  assert.ok(result.warnings.some((warning) => warning.code === "SOURCE_CONFLICT"));
});

test("50. missing options domain remains partial", () => {
  const result = expectOk(normalizeOptionsDomain(undefined, { dataCutoff: DATA_CUTOFF, sourceMap: fixtureSourceMap() }));
  assert.equal(result.data.btc_put_call_ratio, null);
  assert.ok(result.warnings.some((warning) => warning.code === "DOMAIN_PARTIAL"));
});

test("51. macro release timestamp is preserved", () => {
  const output = expectOk(normalizeCmipRuntimeInput(cloneRequest())).data.cmip_runtime_input;
  assert.equal(output.macro.fed_policy_rate.observed_at, "2026-07-01T12:00:00.000Z");
});

test("52. correlation outside range fails", () => {
  const result = normalizeCrossAssetDomain({
    btc_eth_correlation: [{ window: "30D", value: 1.5, sample_count: 30, method: "daily returns", observed_at: "2026-07-10T05:30:00Z", source_refs: ["source:derived-normalization"], calculation: { method: "fixture", formula: "pearson", inputs: ["BTC", "ETH"], version: "test" } }],
  }, { dataCutoff: DATA_CUTOFF });
  expectFail(result, "INVALID_CORRELATION");
});

test("53. breadth count above universe fails", () => {
  const result = normalizeBreadthDomain({
    assets_above_ma_7d: { value: 11, unit: "COUNT", observed_at: "2026-07-10T06:00:00Z", source_refs: ["source:derived-normalization"], calculation: { method: "test", formula: "count", inputs: ["universe"], version: "test" } },
  }, { dataCutoff: DATA_CUTOFF, sourceMap: fixtureSourceMap() });
  expectFail(result, "INVALID_PERCENTAGE");
});

test("54. news conflict cannot become verified", () => {
  const sourceMap = fixtureSourceMap(cloneRequest(rawConflictFixture));
  const result = normalizeNewsDomain([
    { news_id: "news-conflict", headline: "Conflict", summary: "Fixture", category: "market", importance: "medium", sentiment: "mixed", affected_assets: ["BTC"], published_at: "2026-07-10T05:00:00Z", retrieved_at: "2026-07-10T06:00:00Z", source_refs: ["source:conflict-market"], verification_status: "verified", duplicate_group_id: "news-conflict" },
  ], DATA_CUTOFF, sourceMap);
  expectFail(result, "SOURCE_CONFLICT");
});

test("55. historical statistics require sample size", () => {
  const result = normalizeHistoricalEvidenceDomain([
    { evidence_id: "bad-history", hypothesis: "neutral_transition", event_definition: "bad", sample_size: null, forward_horizons: ["7D"], results: [{ horizon: "7D", positive_rate: 50, sample_size: null, return_unit: "percent" }], limitations: "fixture", method_version: "test", source_refs: [], status: "verified" },
  ]);
  expectFail(result, "INVALID_NUMBER");
});

test("56. missing decision memory becomes unavailable", () => {
  const result = expectOk(normalizeDecisionMemoryDomain(undefined, DATA_CUTOFF));
  assert.equal(result.data.status, "unavailable");
});

test("57. identity conflict lowers identity quality to zero", () => {
  const sourceMap = fixtureSourceMap();
  const verified = calculatePointQuality({ status: "missing", sourceRefs: [], sourceMap, isStale: false, hasValue: false, identityStatus: "verified", method: "missing" });
  const conflict = calculatePointQuality({ status: "missing", sourceRefs: [], sourceMap, isStale: false, hasValue: false, identityStatus: "conflict", method: "missing" });
  assert.equal(verified - conflict, 10);
});

test("58. proxy method quality is lower than verified direct data", () => {
  const sourceMap = fixtureSourceMap();
  const direct = calculatePointQuality({ status: "available", sourceRefs: ["source:market-index"], sourceMap, isStale: false, hasValue: true, method: "direct" });
  const proxy = calculatePointQuality({ status: "proxy", sourceRefs: ["source:market-index"], sourceMap, isStale: false, hasValue: true, method: "proxy" });
  assert.ok(proxy < direct);
  assert.ok(sourceQualityScore(sourceMap.get("source:market-index")) > 0);
});

test("59. missing domain reduces coverage", () => {
  const valid = expectOk(normalizeCmipRuntimeInput(cloneRequest())).data.cmip_runtime_input;
  const partial = expectOk(normalizeCmipRuntimeInput(cloneRequest(rawPartialFixture))).data.cmip_runtime_input;
  assert.ok(partial.data_quality.quality_by_domain.options < valid.data_quality.quality_by_domain.options);
});

test("60. conflict appears in data-quality conflict paths", () => {
  const result = expectFail(normalizeCmipRuntimeInput(cloneRequest(rawConflictFixture)), "IDENTITY_CONFLICT");
  assert.ok(result.errors.some((error) => error.path.includes("TON") || error.path.includes("providerAssetId")));
});

test("61. final validation failure returns RUNTIME_INPUT_INVALID", () => {
  const request = cloneRequest();
  request.runContext.requestedHorizons = ["1D", "7D"];
  expectFail(normalizeCmipRuntimeInput(request), "RUNTIME_INPUT_INVALID");
});

test("61a. raw-valid warning count equals approved final count", () => {
  const result = expectOk(normalizeCmipRuntimeInput(cloneRequest()));
  assert.equal(result.warnings.length, 0);
});

test("61b. raw-partial warnings are deduplicated", () => {
  const result = expectOk(normalizeCmipRuntimeInput(cloneRequest(rawPartialFixture)));
  assert.equal(result.warnings.length, 6);
  assertNoDuplicateWarningIdentities(result.warnings);
});

test("61c. critical conflict remains an error", () => {
  const result = expectFail(normalizeCmipRuntimeInput(cloneRequest(rawConflictFixture)), "IDENTITY_CONFLICT");
  assert.ok(result.errors.some((error) => error.severity === "error" || error.severity === "critical"));
});

test("61d. warning ordering is deterministic", () => {
  const first = expectOk(normalizeCmipRuntimeInput(cloneRequest(rawPartialFixture))).warnings.map(warningIdentity);
  const second = expectOk(normalizeCmipRuntimeInput(cloneRequest(rawPartialFixture))).warnings.map(warningIdentity);
  assert.deepEqual(first, second);
});

test("61e. same input produces identical warnings", () => {
  const first = expectOk(normalizeCmipRuntimeInput(cloneRequest(rawPartialFixture))).warnings;
  const second = expectOk(normalizeCmipRuntimeInput(cloneRequest(rawPartialFixture))).warnings;
  assert.deepEqual(first, second);
});

test("62. no normalization module writes to filesystem", () => {
  const files = normalizationTsFiles();
  const joined = files.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(joined, /\b(writeFile|appendFile|mkdir|createWriteStream|rmSync|unlinkSync)\b/);
});

test("63. no executable AI or network call is introduced", () => {
  const files = normalizationTsFiles();
  const joined = files.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(joined, /\bfetch\s*\(/);
  assert.doesNotMatch(joined, /\b(openai|Responses API|supabase|process\.env)\b/i);
});

function normalizationTsFiles(): string[] {
  const root = fileURLToPath(new URL("../src/lib/cmip/normalization", import.meta.url));
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        visit(path);
      } else if (path.endsWith(".ts")) {
        files.push(path);
      }
    }
  };
  visit(root);
  return files.sort();
}

function assertNoDuplicateWarningIdentities(warnings: readonly { code: string; path: string; domain: string; sourceRefs: readonly string[]; message: string }[]): void {
  const identities = warnings.map(warningIdentity);
  assert.equal(new Set(identities).size, identities.length, `Duplicate warning identities:\n${identities.join("\n")}`);
}

function warningIdentity(warning: { code: string; path: string; domain: string; sourceRefs: readonly string[]; message: string }): string {
  return JSON.stringify({
    code: warning.code,
    canonicalPath: warning.path,
    domain: warning.domain,
    sourceRefs: [...warning.sourceRefs].sort(),
    rootCause: warning.message,
  });
}
