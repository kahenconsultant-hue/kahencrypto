import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  applyConfidenceGuard,
  type ConfidenceEngineInput,
  type ConfidenceEngineKey,
} from "../src/lib/report/confidenceGuard";
import {
  buildEtfEvidenceClaim,
  explainPriceRegimeDivergence,
  interpretEtfFlow,
  interpretStablecoinLiquidity,
} from "../src/lib/report/dataEvidence";

function engine(status: ConfidenceEngineInput["status"] = "available_and_fresh"): ConfidenceEngineInput {
  return {
    status,
    confidence: status === "missing" ? null : 82,
    sourceName: status === "missing" ? null : "Test Source",
    sourceUrl: status === "missing" ? null : "https://example.com",
    fetchedAt: status === "missing" ? null : "2026-06-20T10:00:00.000Z",
    latestDataTimestamp: status === "missing" ? null : "2026-06-20T09:59:00.000Z",
    freshnessStatus: status === "missing" ? "missing" : status === "available_but_stale" ? "stale" : "fresh",
    parseStatus: status === "missing" ? "failed" : status === "partial" ? "partial" : "success",
    numericFieldsAvailable: status === "missing" ? [] : ["value"],
  };
}

function engines(overrides: Partial<Record<ConfidenceEngineKey, ConfidenceEngineInput>> = {}) {
  return {
    priceMomentum: engine(),
    stablecoinLiquidity: engine(),
    etfFlow: engine(),
    macro: engine(),
    derivatives: engine(),
    sentimentNews: engine(),
    ...overrides,
  };
}

test("missing derivatives cap public, risk and regime confidence", () => {
  const result = applyConfidenceGuard({ rawConfidence: 86, reportMode: "public", engines: engines({ derivatives: engine("missing") }) });
  assert.ok(result.finalConfidence <= 55);
  assert.ok(result.engineCaps.riskEngineConfidence <= 45);
  assert.ok(result.engineCaps.marketRegimeConfidence <= 55);
  assert.ok(result.capReasons.includes("missing_derivatives"));
  assert.match(result.capReasonsFa.join(" "), /مشتقات در دسترس نیست/);
});

test("missing stablecoin history disables directional liquidity and caps confidence", () => {
  const result = applyConfidenceGuard({ rawConfidence: 90, reportMode: "public", engines: engines({ stablecoinLiquidity: engine("missing") }) });
  assert.ok(result.finalConfidence <= 55);
  assert.ok(result.engineCaps.liquidityEngineConfidence <= 55);
  assert.equal(interpretStablecoinLiquidity(null, null), "unavailable");
});

test("missing ETF prevents a directional ETF claim and caps confidence", () => {
  const result = applyConfidenceGuard({ rawConfidence: 90, reportMode: "public", engines: engines({ etfFlow: engine("missing") }) });
  assert.ok(result.finalConfidence <= 60);
  assert.equal(interpretEtfFlow(null, null), "unavailable");
  assert.equal(buildEtfEvidenceClaim({ asset: "BTC", dailyFlowUsd: null, sevenDayFlowUsd: null, sourceName: null, latestDate: null }), null);
});

test("positive 24h action and negative 7D/30D regime remain separate", () => {
  const explanation = explainPriceRegimeDivergence(2.4, -28);
  assert.match(explanation ?? "", /قیمت امروز مثبت است/);
  assert.match(explanation ?? "", /رژیم ۷\/۳۰ روزه/);
});

test("negative ETF evidence allows a source-attributed numeric pressure claim", () => {
  assert.equal(interpretEtfFlow(-90_600_000, -310_000_000), "pressure");
  const claim = buildEtfEvidenceClaim({
    asset: "BTC",
    dailyFlowUsd: -90_600_000,
    sevenDayFlowUsd: -310_000_000,
    sourceName: "Farside Investors",
    latestDate: "2026-06-19",
  });
  assert.match(claim ?? "", /۹۰٫۶/);
  assert.match(claim ?? "", /۳۱۰/);
  assert.match(claim ?? "", /Farside Investors/);
  assert.match(claim ?? "", /2026-06-19/);
});

test("positive 7D and negative 30D stablecoin history is mixed, not strong pressure", () => {
  assert.equal(interpretStablecoinLiquidity(0.4, -0.2), "mixed");
});

test("public UI exposes capped confidence, evidence and separated horizons", () => {
  const source = readFileSync(new URL("../src/components/public/PublicMarketBrief.tsx", import.meta.url), "utf8");
  assert.match(source, /اعتماد نهایی پس از اعمال سقف داده/);
  assert.match(source, /داده‌های عددی کلیدی/);
  assert.match(source, /قیمت و حرکت ۲۴ ساعته/);
  assert.match(source, /برداشت رژیمی ۷\/۳۰ روزه/);
  assert.match(source, /محرک عددی اصلی/);
});

test("confidence cap reasons name missing liquidation and broad USD proxy explicitly", () => {
  const derivatives = { ...engine("partial"), confidence: 60, limitations: ["liquidation_missing", "exchange_level_proxy"] };
  const macro = { ...engine(), limitations: ["broad_usd_proxy_not_true_dxy"] };
  const result = applyConfidenceGuard({ rawConfidence: 86, reportMode: "public", engines: engines({ derivatives, macro }) });
  assert.ok(result.finalConfidence <= 60);
  assert.match(result.capReasonsFa.join(" "), /لیکوییدیشن/);
  assert.match(result.capReasonsFa.join(" "), /شاخص گسترده/);
  assert.match(result.capReasonsFa.join(" "), /صرافی‌محور/);
});
