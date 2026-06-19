import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { TARGET_ASSETS } from "../src/lib/assets/targetAssets";
import { capAssetConfidenceByPublicQuality, classifyAssetBias, etfFlowScore, volumeLiquidityScore, weightedImpactScore } from "../src/lib/intelligence/assetScoring";
import { HUMANIZER_VERSION, humanizeReportBlock, renderHumanizedBlockText, validateHumanizedBlock, validateHumanizedMeaningDiversity } from "../src/lib/intelligence/humanReport";
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

test("forecast badge avoids public accuracy language when no conclusive samples exist", () => {
  const badge = forecastPublicBadgeState({ accurate: 0, incorrect: 0, inconclusive: 168, pending: 832 });
  assert.equal(badge.conclusive, 0);
  assert.equal(badge.accuracy, null);
  assert.equal(badge.shouldShowPublicAccuracy, false);
  assert.match(badge.labelFa, /هنوز برای نمایش عمومی دقت کافی ندارد/);
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

test("public confidence caps prevent deep-data-limited assets from overclaiming", () => {
  assert.equal(
    capAssetConfidenceByPublicQuality({
      symbol: "TRX",
      coverageTier: "medium",
      confidence: 84,
      deepDataLimited: true,
      hasDerivatives: false,
      hasAssetSpecificDeepData: false,
    }),
    65,
  );
  assert.equal(capAssetConfidenceByPublicQuality({ symbol: "DOGE", coverageTier: "lite", confidence: 84 }), 62);
  assert.equal(capAssetConfidenceByPublicQuality({ symbol: "USDT", coverageTier: "stablecoin_monitor", confidence: 88, networkIssuerDataMissing: true }), 70);
  assert.equal(capAssetConfidenceByPublicQuality({ symbol: "BTC", coverageTier: "full", confidence: 95 }), 80);
});

test("humanized report blocks are valid and render human explanation before technical details", () => {
  const block = humanizeReportBlock(
    { impactScore: -12, confidence: 64, coverage: 72, driversFa: ["مومنتوم قیمت: فشارزا"], invalidationFa: "اگر محرک‌ها تغییر کنند، سناریو بازنگری می‌شود." },
    { kind: "asset", titleFa: "TRX — ترون", assetSymbol: "TRX", statusFa: "خنثی", confidence: 64, coverage: 72, impactScore: -12 },
  );
  assert.equal(HUMANIZER_VERSION, "cmip-humanizer-v1.1");
  assert.equal(validateHumanizedBlock(block), true);
  assert.match(block.watch_next, /بروزرسانی بعدی/);
  assert.match(block.non_advisory_note, /سیگنال خرید یا فروش نیست/);

  const rendered = renderHumanizedBlockText(block);
  assert.ok(rendered.indexOf("۱. خلاصه انسانی") < rendered.indexOf("۴. برای رصد بعدی"));
  assert.ok(rendered.indexOf("۴. برای رصد بعدی") < rendered.indexOf("۶. جزئیات فنی"));
  assert.ok(rendered.indexOf("۶. جزئیات فنی") < rendered.indexOf("۷. جزئیات Audit"));
});

test("humanizer v1.1 does not echo raw engine jargon in human sections", () => {
  const block = humanizeReportBlock(
    {
      impactScore: -4,
      confidence: 63,
      coverage: 80,
      driversFa: ["مومنتوم قیمت: خنثی / نیازمند تأیید", "نقدشوندگی حجم: فشارزا", "داده عمیق محدود است"],
    },
    { kind: "asset", titleFa: "TON — تون", assetSymbol: "TON", confidence: 63, coverage: 80, impactScore: -4 },
  );
  const humanText = [block.human_summary, block.user_meaning, block.reasoning, block.watch_next].join("\n");
  for (const forbidden of ["فشارزا", "سناریویی", "ابطال", "پروکسی", "ریسک افزایشی", "اثر کلی", "رژیم بازار", "نیازمند تأیید", "داده عمیق محدود است"]) {
    assert.equal(humanText.includes(forbidden), false, `human text still contains raw jargon: ${forbidden}`);
  }
  assert.match(block.reasoning, /حرکت قیمت|حجم معاملات|داده/);
});

test("asset user meanings are not repeated across the public watchlist", () => {
  const blocks = TARGET_ASSETS.map((asset, index) =>
    humanizeReportBlock(
      { impactScore: index % 3 === 0 ? -4 : index % 3 === 1 ? -16 : 14, confidence: 66, coverage: 78, driversFa: ["مومنتوم قیمت: خنثی / نیازمند تأیید", "نقدشوندگی حجم: خنثی / نیازمند تأیید"] },
      { kind: "asset", titleFa: `${asset.symbol} — ${asset.persianName}`, assetSymbol: asset.symbol, assetNameFa: asset.persianName, confidence: 66, coverage: 78, impactScore: index % 3 === 0 ? -4 : index % 3 === 1 ? -16 : 14 },
    ),
  );
  const diversity = validateHumanizedMeaningDiversity(blocks);
  assert.equal(diversity.valid, true, `user meanings are too repetitive: ${diversity.maxSimilarity}`);
});

test("public market brief component no longer contains obvious raw customer-facing terms", () => {
  const source = readFileSync(new URL("../src/components/public/PublicMarketBrief.tsx", import.meta.url), "utf8");
  for (const forbidden of ["N/A", "source health", "raw logs", "scenario invalidation", "fallback active", "validation weak", "پوشش / اطمینان", "وضعیت / Bias", "اقدام در public", "شروط ابطال", "رژیم بازار"]) {
    assert.equal(source.includes(forbidden), false, `public component still contains raw visible term: ${forbidden}`);
  }
  assert.match(source, /پوشش داده:/);
  assert.match(source, /اطمینان تحلیلی:/);
});

test("public brief builder avoids raw public-facing jargon outside audit details", () => {
  const source = readFileSync(new URL("../src/lib/intelligence/publicBriefBuilder.ts", import.meta.url), "utf8");
  for (const forbidden of ["در وضعیت سناریویی خوانده می‌شود", "فشارزا", "نیازمند تأیید", "داده عمیق محدود است", "رژیم بازار", "ریسک افزایشی"]) {
    assert.equal(source.includes(forbidden), false, `public brief builder still emits raw visible term: ${forbidden}`);
  }
});
