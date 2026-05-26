import assert from "node:assert/strict";
import { test } from "node:test";
import type { NormalizedSignal, SignalGroup } from "../src/lib/types";
import { rollingCorrelation } from "../src/server/analytics/correlation-engine";
import { calculateConfidenceScore } from "../src/server/analytics/scoring-engine";
import { calculateDataQualityScore, normalizeSignalScore, validationReason } from "../src/server/analytics/quality-engine";

function signal(params: Partial<NormalizedSignal> & { key: string; group: SignalGroup; value: number | null }): NormalizedSignal {
  return {
    id: params.key,
    key: params.key,
    label: params.key,
    value: params.value,
    previousValue: 0,
    change: params.value,
    direction: params.value === null ? "unavailable" : params.value > 0 ? "up" : params.value < 0 ? "down" : "flat",
    group: params.group,
    channel: params.channel ?? "liquidity",
    source: params.source ?? "test source",
    sourceType: params.sourceType ?? "API",
    quality: params.quality ?? (params.value === null ? "unavailable" : "live"),
    reliability: params.reliability ?? 85,
    sampleSize: params.sampleSize ?? 30,
    timestamp: params.timestamp ?? new Date().toISOString(),
    error: params.error,
  };
}

test("correlation returns null when sample size is insufficient", () => {
  assert.equal(rollingCorrelation([0.1], [0.2]), null);
});

test("positive BTC/DXY correlation must be treated as divergence from usual inverse relation", () => {
  const corr = rollingCorrelation([0.01, 0.02, -0.01, 0.03], [0.02, 0.04, -0.02, 0.06]);
  assert.ok((corr ?? 0) > 0.9);
});

test("ETF unavailable does not create a normalized score", () => {
  const score = normalizeSignalScore({ key: "btc_etf_flow_24h", value: null, quality: "unavailable" });
  assert.equal(score, null);
});

test("stale data caps confidence", () => {
  const staleTimestamp = new Date(Date.now() - 220 * 60_000).toISOString();
  const result = calculateConfidenceScore({
    signals: [
      signal({ key: "btc_trend_24h", group: "price", value: 1, timestamp: staleTimestamp }),
      signal({ key: "dxy_trend_24h", group: "macro", value: -0.2, timestamp: staleTimestamp }),
      signal({ key: "stablecoin_market_cap_7d", group: "liquidity", value: 0.4, timestamp: staleTimestamp }),
      signal({ key: "news_sentiment_macro", group: "sentiment", value: 10, timestamp: staleTimestamp }),
    ],
    signalAgreement: 90,
    historicalConsistency: 90,
    marketConfirmation: 90,
  });

  assert.equal(result.available, true);
  assert.ok((result.score ?? 100) <= 35);
});

test("liquidity quality drops when required inputs are unavailable", () => {
  const quality = calculateDataQualityScore({
    requiredSignals: 6,
    signals: [
      signal({ key: "dxy_trend_24h", group: "macro", value: -0.1 }),
      signal({ key: "us10y_trend_24h", group: "macro", value: null, quality: "unavailable" }),
      signal({ key: "stablecoin_market_cap_7d", group: "liquidity", value: null, quality: "unavailable" }),
    ],
  });

  assert.ok(quality < 60);
});

test("regime validation rejects fewer than four independent groups", () => {
  const reason = validationReason([
    signal({ key: "btc_trend_24h", group: "price", value: 1 }),
    signal({ key: "dxy_trend_24h", group: "macro", value: 0.2 }),
    signal({ key: "stablecoin_market_cap_7d", group: "liquidity", value: 0.1 }),
  ]);

  assert.match(reason ?? "", /داده کافی/);
});

test("estimated data makes confidence unavailable", () => {
  const result = calculateConfidenceScore({
    signals: [
      signal({ key: "btc_trend_24h", group: "price", value: 1 }),
      signal({ key: "dxy_trend_24h", group: "macro", value: 0.2 }),
      signal({ key: "stablecoin_market_cap_7d", group: "liquidity", value: 0.1 }),
      signal({ key: "btc_etf_flow_24h", group: "flows", value: 10, quality: "estimated" }),
    ],
    signalAgreement: 80,
    historicalConsistency: 70,
    marketConfirmation: 65,
  });

  assert.equal(result.available, false);
  assert.equal(result.score, null);
});

test("DXY normalization maps dollar strength to bearish crypto score", () => {
  assert.equal(normalizeSignalScore({ key: "dxy_trend_24h", value: 0.55, quality: "live" }), -80);
  assert.equal(normalizeSignalScore({ key: "dxy_trend_24h", value: -0.55, quality: "live" }), 80);
});
