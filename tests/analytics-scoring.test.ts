import assert from "node:assert/strict";
import { test } from "node:test";
import type { NormalizedSignal, SignalGroup } from "../src/lib/types";
import { calculateConfidenceScore, calculateImpactScore, minimumIndependentGroups } from "../src/server/analytics/scoring-engine";

function signal(group: SignalGroup, value = 1, reliability = 85): NormalizedSignal {
  return {
    key: `${group}_${value}`,
    label: group,
    value,
    previousValue: 0,
    change: value,
    direction: value > 0 ? "up" : value < 0 ? "down" : "flat",
    group,
    channel: group === "macro" ? "rates" : group === "flows" ? "etf_flows" : "liquidity",
    source: `${group} source`,
    quality: "live",
    reliability,
    timestamp: "2026-05-24T10:00:00+02:00",
  };
}

test("confidence is unavailable below the independent signal threshold", () => {
  const result = calculateConfidenceScore({
    signals: [signal("price"), signal("liquidity"), signal("macro")],
    signalAgreement: 80,
    historicalConsistency: 75,
    marketConfirmation: 70,
  });

  assert.equal(result.available, false);
  assert.equal(result.score, null);
  assert.equal(result.availableGroups.length, minimumIndependentGroups - 1);
});

test("confidence is calculated when at least four independent groups are available", () => {
  const result = calculateConfidenceScore({
    signals: [signal("price"), signal("liquidity"), signal("macro"), signal("sentiment")],
    signalAgreement: 82,
    historicalConsistency: 78,
    marketConfirmation: 72,
  });

  assert.equal(result.available, true);
  assert.equal(typeof result.score, "number");
  assert.ok((result.score ?? -1) >= 0);
  assert.match(result.formula, /امتیاز اطمینان/);
});

test("impact score uses signed weighted inputs and preserves direction", () => {
  const bearish = calculateImpactScore({
    regime_score: -70,
    liquidity_score: -62,
    correlation_score: -55,
    sentiment_score: -30,
    flow_score: -40,
    volatility_score: -45,
    news_severity_score: -25,
  });

  const bullish = calculateImpactScore({
    regime_score: 55,
    liquidity_score: 66,
    correlation_score: 42,
    sentiment_score: 18,
    flow_score: 58,
    volatility_score: 12,
    news_severity_score: 20,
  });

  assert.ok(bearish.score < 0);
  assert.ok(bullish.score > 0);
  assert.match(bearish.formula, /امتیاز اثر/);
});
