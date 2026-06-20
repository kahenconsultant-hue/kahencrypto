import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDerivativesLiteSummary,
  calculateDerivativesCoverage,
  calculateLeverageRisk,
  classifyDerivativesBias,
  derivativesConfidence,
} from "../src/lib/intelligence/derivativesLite";
import type { NormalizedSignal } from "../src/lib/types";

function signal(key: string, value: number | null, source = "Binance public derivatives BTCUSDT", timestamp = new Date().toISOString()): NormalizedSignal {
  return {
    key,
    label: key,
    value,
    previousValue: null,
    change: null,
    direction: "unavailable",
    group: "leverage",
    channel: "leverage",
    source,
    sourceType: "API",
    quality: value === null ? "unavailable" : "partial_live",
    reliability: value === null ? 0 : 82,
    timestamp,
  };
}

function completeAsset(asset: string, sourceName = `Binance public derivatives ${asset}USDT`) {
  const lower = asset.toLowerCase();
  return {
    [`funding_${lower}`]: signal(`funding_${lower}`, 0.018, sourceName),
    [`funding_${lower}_24h_avg`]: signal(`funding_${lower}_24h_avg`, 0.012, sourceName),
    [`funding_${lower}_7d_avg`]: signal(`funding_${lower}_7d_avg`, 0.009, sourceName),
    [`open_interest_${lower}`]: signal(`open_interest_${lower}`, 10_000, sourceName),
    [`open_interest_${lower}_usd`]: signal(`open_interest_${lower}_usd`, 1_000_000_000, sourceName),
    [`open_interest_${lower}_24h`]: signal(`open_interest_${lower}_24h`, 3.5, sourceName),
    [`open_interest_${lower}_7d`]: signal(`open_interest_${lower}_7d`, 8.2, sourceName),
  };
}

test("Funding and OI make BTC and ETH derivatives available with Lite confidence", () => {
  const signals = { ...completeAsset("BTC"), ...completeAsset("ETH", "Binance public derivatives ETHUSDT") };
  const summary = buildDerivativesLiteSummary(signals, { BTC: { change24hPct: 1.2, change7dPct: 4 }, ETH: { change24hPct: 0.8, change7dPct: 3 } });
  for (const asset of ["BTC", "ETH"] as const) {
    const row = summary.assets.find((item) => item.asset === asset);
    assert.ok(row?.derivativesAvailable);
    assert.ok(row.derivativesConfidence >= 60 && row.derivativesConfidence <= 70);
    assert.equal(row.sourceUsed, "Binance");
    assert.ok(row.latestDataTimestamp);
  }
});

test("Funding-only evidence caps confidence at 45 and does not create OI values", () => {
  const signals = { funding_btc: signal("funding_btc", 0.01) };
  const btc = buildDerivativesLiteSummary(signals).assets.find((item) => item.asset === "BTC");
  assert.ok(btc);
  assert.equal(btc.latestOpenInterest, null);
  assert.ok(btc.derivativesConfidence <= 45);
  assert.equal(btc.leverageRiskScore !== null, true);
});

test("Rising OI, rising price and strongly positive funding identify leveraged bullish risk", () => {
  const risk = calculateLeverageRisk({ latestFundingRate: 0.09, fundingRate24hAvg: 0.02, openInterest24hChangePct: 9, openInterest7dChangePct: 22 });
  const bias = classifyDerivativesBias({ latestFundingRate: 0.09, fundingRateDirection: "rising", openInterest24hChangePct: 9, priceChange24hPct: 4 });
  assert.ok(risk !== null && risk >= 70);
  assert.equal(bias, "bullish");
});

test("Falling OI and falling price classify deleveraging without implying bullishness", () => {
  const bias = classifyDerivativesBias({ latestFundingRate: 0.002, fundingRateDirection: "falling", openInterest24hChangePct: -4, priceChange24hPct: -3 });
  const risk = calculateLeverageRisk({ latestFundingRate: 0.002, fundingRate24hAvg: 0.015, openInterest24hChangePct: -4, openInterest7dChangePct: -6 });
  assert.equal(bias, "deleveraging");
  assert.ok(risk !== null && risk < 60);
});

test("All derivatives sources missing keeps the engine missing and the market claim unavailable", () => {
  const summary = buildDerivativesLiteSummary({});
  assert.equal(summary.availableAssetsCount, 0);
  assert.equal(summary.marketLeverageRiskScore, null);
  assert.equal(summary.marketDerivativesBias, "N/A");
  assert.equal(summary.confidence, 0);
  assert.equal(summary.missingAssets.length, 9);
});

test("Missing liquidation proxy never blocks public derivatives evidence", () => {
  const summary = buildDerivativesLiteSummary(completeAsset("BTC"));
  const btc = summary.assets.find((item) => item.asset === "BTC");
  assert.ok(btc?.derivativesAvailable);
  assert.equal(btc.liquidationProxy, null);
  assert.ok(btc.missingFields.includes("liquidationProxy"));
  assert.equal(
    derivativesConfidence({ fundingAvailable: true, oiAvailable: true, sameSource: true, primarySource: true, longShortAvailable: false, liquidationAvailable: false, stale: false, sevenDayOiAvailable: true }),
    60,
  );
  assert.ok(summary.coverage <= 70);
  assert.ok(summary.confidence <= 60);
  assert.equal(summary.audit.liquidationAvailable, false);
  assert.equal(summary.audit.derivativesScope, "exchange_level_proxy");
});

test("component coverage cannot reach 100 without liquidation and broad exchange coverage", () => {
  const limited = calculateDerivativesCoverage({
    fundingCoverage: 1,
    openInterestCoverage: 1,
    liquidationCoverage: 0,
    crossExchangeCoverage: 0.5,
  });
  assert.equal(limited.coverage, 70);
  assert.equal(limited.maxAllowedConfidence, 60);

  const complete = calculateDerivativesCoverage({
    fundingCoverage: 1,
    openInterestCoverage: 1,
    liquidationCoverage: 1,
    crossExchangeCoverage: 1,
  });
  assert.equal(complete.coverage, 100);
  assert.equal(complete.maxAllowedConfidence, 80);
});
