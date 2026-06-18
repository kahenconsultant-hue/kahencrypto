import assert from "node:assert/strict";
import { test } from "node:test";
import { TARGET_ASSETS } from "../src/lib/assets/targetAssets";
import { classifyAssetBias, etfFlowScore, volumeLiquidityScore, weightedImpactScore } from "../src/lib/intelligence/assetScoring";
import { forecastPublicBadgeState, publicModuleStatus, shouldRenderPublicModule } from "../src/lib/intelligence/moduleGating";

test("target asset registry contains exactly the Iran-relevant public watchlist", () => {
  assert.deepEqual(
    TARGET_ASSETS.map((asset) => asset.symbol),
    ["USDT", "BTC", "TRX", "ETH", "TON", "SOL", "XRP", "DOGE", "BNB", "ADA"],
  );
  assert.equal(new Set(TARGET_ASSETS.map((asset) => asset.coingeckoId)).size, 10);
});

test("USDT is a stability monitor and never receives a price-direction bias", () => {
  const usdt = TARGET_ASSETS.find((asset) => asset.symbol === "USDT");
  assert.ok(usdt);
  assert.equal(usdt.allowPriceBias, false);
  assert.equal(classifyAssetBias(usdt, 90, 90, 90), "پایش ثبات/ریسک");
  assert.equal(classifyAssetBias(usdt, -90, 90, 90), "پایش ثبات/ریسک");
});

test("direct ETF contribution is public only for BTC and ETH", () => {
  const directEtf = TARGET_ASSETS.filter((asset) => asset.allowDirectETF).map((asset) => asset.symbol);
  assert.deepEqual(directEtf, ["BTC", "ETH"]);
});

test("public module gating hides low coverage, low confidence, stale and irrelevant modules", () => {
  assert.equal(shouldRenderPublicModule({ coverage: 59, confidence: 80 }), false);
  assert.equal(shouldRenderPublicModule({ coverage: 80, confidence: 39 }), false);
  assert.equal(shouldRenderPublicModule({ coverage: 80, confidence: 80, isStale: true }), false);
  assert.equal(shouldRenderPublicModule({ coverage: 80, confidence: 80, isIrrelevantToAsset: true }), false);
  assert.equal(shouldRenderPublicModule({ coverage: 80, confidence: 80, isStale: true, allowDelayedDisplay: true }), true);
  assert.equal(publicModuleStatus({ coverage: 20, confidence: 80 }), "compact_limited");
});

test("forecast public accuracy excludes inconclusive and pending forecasts", () => {
  const badge = forecastPublicBadgeState({ accurate: 60, incorrect: 40, inconclusive: 900, pending: 120 });
  assert.equal(badge.conclusive, 100);
  assert.equal(badge.accuracy, 60);
  assert.equal(badge.shouldShowPublicAccuracy, true);

  const collecting = forecastPublicBadgeState({ accurate: 10, incorrect: 5, inconclusive: 300, pending: 90 });
  assert.equal(collecting.shouldShowPublicAccuracy, false);
  assert.match(collecting.labelFa, /در حال جمع‌آوری/);
});

test("missing derivatives or volume data do not become fake zero scores", () => {
  assert.equal(volumeLiquidityScore({ volume24h: null, marketCap: 1_000_000 }), null);
  const result = weightedImpactScore([
    { key: "price_momentum", score: null, weight: 0.6, available: false, labelFa: "price" },
    { key: "derivatives_if_available", score: null, weight: 0.4, available: false, labelFa: "derivatives" },
  ]);

  assert.equal(result.impactScore, null);
  assert.equal(result.coverage, 0);
});

test("ETF score is unavailable when market cap is missing and never implies zero flow", () => {
  assert.equal(etfFlowScore({ flow24hUsd: 10_000_000, flow7dUsd: 25_000_000, assetMarketCapUsd: null }), null);
});
