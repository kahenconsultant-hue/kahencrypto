import assert from "node:assert/strict";
import { test } from "node:test";
import sampleInput from "../src/lib/cmip/runtime-input/sample-input.json";
import { validateCmipRuntimeInput } from "../src/lib/cmip/runtime-input/validate-input";
import type { CmipRuntimeAssetSnapshot, CmipRuntimeAssetSymbol, CmipRuntimeInputEnvelope, CmipRuntimeNumericDataPoint } from "../src/lib/cmip/runtime-input";

type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

type MutableRuntimeInputEnvelope = DeepMutable<CmipRuntimeInputEnvelope>;
type MutableRuntimeNumericDataPoint = DeepMutable<CmipRuntimeNumericDataPoint>;
type MutableRuntimeAssetSnapshot = DeepMutable<CmipRuntimeAssetSnapshot>;

function mutableSample(): MutableRuntimeInputEnvelope {
  return structuredClone(sampleInput) as MutableRuntimeInputEnvelope;
}

function expectValid(input: unknown): void {
  const result = validateCmipRuntimeInput(input);
  assert.equal(result.valid, true, result.valid ? undefined : formatErrors(result.errors));
}

function expectInvalid(input: unknown, expectedPath: string, expectedText: RegExp): void {
  const result = validateCmipRuntimeInput(input);
  assert.equal(result.valid, false, "Expected CMIP runtime input validation to fail.");
  const formatted = formatErrors(result.errors);
  assert.match(formatted, expectedText);
  assert.ok(
    result.errors.some((error) => error.path.includes(expectedPath)),
    `Expected error path to include ${expectedPath}; received:\n${formatted}`,
  );
}

function formatErrors(errors: readonly { path: string; message: string; keyword?: string }[]): string {
  return errors.map((error) => `${error.path}: ${error.message}${error.keyword ? ` [${error.keyword}]` : ""}`).join("\n");
}

function findAsset(input: MutableRuntimeInputEnvelope, symbol: CmipRuntimeAssetSymbol): MutableRuntimeAssetSnapshot {
  const asset = input.cmip_runtime_input.assets.find((item) => item.symbol === symbol);
  assert.ok(asset, `Expected ${symbol} in runtime asset universe.`);
  return asset;
}

function requireDataPoint(value: MutableRuntimeNumericDataPoint | null): MutableRuntimeNumericDataPoint {
  assert.ok(value, "Expected nullable field to contain a data point.");
  return value;
}

const assetMarketFields = [
  "price",
  "market_cap",
  "volume_24h",
  "change_24h",
  "change_7d",
  "change_30d",
  "realized_volatility_30d",
  "relative_strength_vs_btc_7d",
  "relative_strength_vs_btc_30d",
] as const;

test("canonical runtime input sample passes", () => {
  expectValid(mutableSample());
});

test("asset order does not matter", () => {
  const input = mutableSample();
  input.cmip_runtime_input.assets.reverse();
  expectValid(input);
});

test("missing options fields pass when correctly marked", () => {
  const input = mutableSample();
  const option = requireDataPoint(input.cmip_runtime_input.options.btc_put_call_ratio);
  assert.equal(option.status, "missing");
  assert.equal(option.value, null);
  expectValid(input);
});

test("conflict asset with null values passes", () => {
  const input = mutableSample();
  const ton = findAsset(input, "TON");
  assert.equal(ton.identity_status, "conflict");
  for (const field of assetMarketFields) {
    assert.equal(ton[field].value, null);
  }
  expectValid(input);
});

test("derived value with calculation trace passes", () => {
  const input = mutableSample();
  assert.ok(input.cmip_runtime_input.stablecoins.change_7d.calculation);
  expectValid(input);
});

test("stale value with stale status passes", () => {
  const input = mutableSample();
  assert.equal(input.cmip_runtime_input.macro.dxy.status, "stale");
  assert.equal(input.cmip_runtime_input.macro.dxy.freshness.is_stale, true);
  expectValid(input);
});

test("unavailable historical evidence with null result passes", () => {
  const input = mutableSample();
  const unavailable = input.cmip_runtime_input.historical_evidence.find((record) => record.status === "unavailable");
  assert.ok(unavailable);
  assert.equal(unavailable.sample_size, null);
  assert.equal(unavailable.results.length, 0);
  expectValid(input);
});

test("missing required top-level section fails", () => {
  const input = mutableSample();
  delete (input.cmip_runtime_input as Partial<typeof input.cmip_runtime_input>).market;
  expectInvalid(input, "$.cmip_runtime_input.market", /Missing required property: market/);
});

test("unknown root property fails", () => {
  const input = mutableSample() as MutableRuntimeInputEnvelope & { unexpected_root?: boolean };
  input.unexpected_root = true;
  expectInvalid(input, "$.unexpected_root", /Unknown property is not allowed: unexpected_root/);
});

test("duplicate asset fails", () => {
  const input = mutableSample();
  const eth = findAsset(input, "ETH");
  eth.symbol = "BTC";
  eth.asset_id = "crypto:bitcoin";
  expectInvalid(input, "$.cmip_runtime_input.assets", /Duplicate asset symbol BTC/);
});

test("missing asset fails", () => {
  const input = mutableSample();
  const ton = findAsset(input, "TON");
  ton.symbol = "BTC";
  ton.asset_id = "crypto:bitcoin";
  expectInvalid(input, "$.cmip_runtime_input.assets", /Missing required runtime asset symbol: TON/);
});

test("unsupported asset fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.assets[0].symbol = "NOT" as CmipRuntimeAssetSymbol;
  expectInvalid(input, "$.cmip_runtime_input.assets[0].symbol", /supported CMIP runtime input enum|enum/i);
});

test("TON identity conflict with non-null price fails", () => {
  const input = mutableSample();
  findAsset(input, "TON").price.value = 4.25;
  expectInvalid(input, "$.cmip_runtime_input.assets", /identity_status=conflict.*price\.value must be null/);
});

test("available value without source ref fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.market.total_crypto_market_cap.source_refs = [];
  expectInvalid(input, "$.cmip_runtime_input.market.total_crypto_market_cap.source_refs", /Available data points require/);
});

test("source ref not found fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.market.total_crypto_market_cap.source_refs = ["src-not-registered"];
  expectInvalid(input, "$.cmip_runtime_input.market.total_crypto_market_cap.source_refs[0]", /does not exist in sources/);
});

test("duplicate source ID fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.sources[1].source_id = input.cmip_runtime_input.sources[0].source_id;
  expectInvalid(input, "$.cmip_runtime_input.sources", /Duplicate source_id/);
});

test("invalid source URL fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.sources[0].url = "not a url";
  expectInvalid(input, "$.cmip_runtime_input.sources[0].url", /uri|URL|format/i);
});

test("invalid date-time fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.meta.generated_at = "not-a-date-time";
  expectInvalid(input, "$.cmip_runtime_input.meta.generated_at", /date-time|format/i);
});

test("data cutoff after generated time fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.meta.generated_at = "2026-01-15T12:00:00Z";
  input.cmip_runtime_input.meta.data_cutoff = "2026-01-15T12:01:00Z";
  expectInvalid(input, "$.cmip_runtime_input.meta.data_cutoff", /data_cutoff must not be later/);
});

test("stale freshness with available status fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.macro.dxy.status = "available";
  expectInvalid(input, "$.cmip_runtime_input.macro.dxy.status", /freshness\.is_stale=true/);
});

test("missing value with non-null value fails", () => {
  const input = mutableSample();
  requireDataPoint(input.cmip_runtime_input.options.btc_put_call_ratio).value = 1.2;
  expectInvalid(input, "$.cmip_runtime_input.options.btc_put_call_ratio.value", /status=missing requires value=null/);
});

test("derived value without calculation trace fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.stablecoins.change_7d.calculation = null;
  expectInvalid(input, "$.cmip_runtime_input.stablecoins.change_7d.calculation", /Derived runtime input values require/);
});

test("proxy value without method fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.macro.global_liquidity_proxy.calculation = null;
  expectInvalid(input, "$.cmip_runtime_input.macro.global_liquidity_proxy.calculation", /Proxy data points must include/);
});

test("correlation above 1 fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.cross_asset.btc_eth_correlation[0].value = 1.2;
  expectInvalid(input, "$.cmip_runtime_input.cross_asset.btc_eth_correlation[0].value", /1|maximum/);
});

test("correlation below -1 fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.cross_asset.btc_eth_correlation[0].value = -1.2;
  expectInvalid(input, "$.cmip_runtime_input.cross_asset.btc_eth_correlation[0].value", /-1|minimum/);
});

test("statistical result with null sample size fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.historical_evidence[0].results[0].sample_size = null;
  expectInvalid(input, "$.cmip_runtime_input.historical_evidence[0].results[0].sample_size", /sample sizes/);
});

test("negative market cap fails", () => {
  const input = mutableSample();
  findAsset(input, "BTC").market_cap.value = -1;
  expectInvalid(input, "$.cmip_runtime_input.assets[0].market_cap.value", /non-negative/);
});

test("negative volume fails", () => {
  const input = mutableSample();
  findAsset(input, "BTC").volume_24h.value = -1;
  expectInvalid(input, "$.cmip_runtime_input.assets[0].volume_24h.value", /non-negative/);
});

test("percentage above 100 fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.market.btc_dominance.value = 101;
  expectInvalid(input, "$.cmip_runtime_input.market.btc_dominance.value", /between 0 and 100/);
});

test("numeric string in numeric field fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.market.total_crypto_market_cap.value = "3500000000000" as unknown as number;
  expectInvalid(input, "$.cmip_runtime_input.market.total_crypto_market_cap.value", /number|type/i);
});

test("NaN fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.market.total_crypto_market_cap.value = Number.NaN;
  expectInvalid(input, "$.cmip_runtime_input.market.total_crypto_market_cap.value", /Non-finite numbers/);
});

test("Infinity fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.market.total_crypto_market_cap.value = Number.POSITIVE_INFINITY;
  expectInvalid(input, "$.cmip_runtime_input.market.total_crypto_market_cap.value", /Non-finite numbers/);
});

test("news event marked verified with conflicting source status fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.news[1].verification_status = "verified";
  expectInvalid(input, "$.cmip_runtime_input.news[1].verification_status", /Verified news cannot rely/);
});

test("duplicate news ID fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.news[1].news_id = input.cmip_runtime_input.news[0].news_id;
  expectInvalid(input, "$.cmip_runtime_input.news", /Duplicate news_id/);
});

test("duplicate historical evidence ID fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.historical_evidence[1].evidence_id = input.cmip_runtime_input.historical_evidence[0].evidence_id;
  expectInvalid(input, "$.cmip_runtime_input.historical_evidence", /Duplicate evidence_id/);
});

test("invalid mandatory horizon set for normal scheduled run fails", () => {
  const input = mutableSample();
  input.cmip_runtime_input.run_context.requested_horizons = ["1D", "7D"];
  expectInvalid(input, "$.cmip_runtime_input.run_context.requested_horizons", /must include horizons: 30D/);
});
