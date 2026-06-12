import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSignalFreshness, resolveSourceFreshness, signalFreshnessClassification } from "../src/health/freshnessResolver";
import type { NormalizedSignal, SignalGroup, SmartAlert } from "../src/lib/types";
import { capCorrelationConfidenceByCoverage, getCorrelationWindowPlan, rollingCorrelation } from "../src/server/analytics/correlation-engine";
import { classifyGeopoliticalEvent } from "../src/server/analytics/geopolitical-classifier";
import { explainForecastOutcome } from "../src/server/analytics/forecast_failure_analyzer";
import { signalFreshnessState, validateAndCorrectAlerts } from "../src/server/analytics/intelligence-integrity-engine";
import { calculateLiquidityEngine } from "../src/server/analytics/liquidity-engine";
import { applyRiskFloors } from "../src/server/analytics/risk-engine";
import { calculateConfidenceScore } from "../src/server/analytics/scoring-engine";
import { calculateDataQualityScore, normalizeSignalScore, validationReason } from "../src/server/analytics/quality-engine";
import { calculateWeightedMarketSentiment, type StructuredHeadlineSignal } from "../src/server/analytics/sentiment-engine";
import { applyAlertSuppression, calculateAlertQualityScore, classifyAlertQuality } from "../src/server/alerts/alert-suppression-engine";
import { summarizeSourceHealthCounts, type DataSourceHealthRow } from "../src/server/admin/data-health-service";
import { freshnessFromLatestEtfDate } from "../src/server/data/farside-etf";
import { onchainAdapter } from "../src/server/data/adapters";
import type { SourceDefinition, SourceHealthSnapshot } from "../src/types/ingestion";

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

test("integrity validator downgrades high alert with weak evidence", () => {
  const now = new Date().toISOString();
  const alert: SmartAlert = {
    id: "test-alert",
    type: "Liquidity Alert",
    level: "Important",
    priority: "high",
    direction: "bearish",
    timeframe: "24h",
    titleFa: "هشدار تست",
    reasoningFa: "متن تست",
    affectedAssets: ["BTC"],
    confidence: 82,
    importance: 82,
    whyItMattersFa: "تست",
    monitoringFa: [],
    dataUsed: [
      { key: "stablecoin_market_cap_7d", label: "Stablecoins", source: "DefiLlama", status: "available", value: -0.4 },
      { key: "btc_etf_flow_24h", label: "BTC ETF Flow", source: "ETF", status: "missing", value: null },
    ],
    dataQuality: "partial_live",
    createdAt: now,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ttlMinutes: 1,
    indicatorCount: 1,
    severityReasonFa: "شدت تست",
    scenarioFa: "سناریو تست",
  };

  const [corrected] = validateAndCorrectAlerts([alert]);
  assert.equal(corrected.priority, "medium");
  assert.equal(corrected.level, "Watch");
  assert.ok(corrected.confidence <= 50);
});

test("alert suppression rejects low-quality visible alerts", () => {
  const now = new Date().toISOString();
  const alert: SmartAlert = {
    id: "zero-quality-alert",
    type: "Liquidity Alert",
    level: "Watch",
    priority: "medium",
    direction: "bearish",
    timeframe: "24h",
    titleFa: "هشدار بی‌کیفیت",
    reasoningFa: "نباید منتشر شود",
    affectedAssets: ["BTC"],
    confidence: 0,
    importance: 30,
    whyItMattersFa: "تست",
    monitoringFa: [],
    dataUsed: [],
    dataCoveragePercent: 0,
    alertQualityScore: 0,
    alertQualityLabel: "REJECTED",
    dataQuality: "unavailable",
    createdAt: now,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ttlMinutes: 1,
    indicatorCount: 0,
    severityReasonFa: "تست",
    scenarioFa: "تست",
  };
  const audit = applyAlertSuppression([alert]);

  assert.equal(audit.visible.length, 0);
  assert.equal(audit.suppressed.length, 1);
  assert.equal(audit.rejected.length, 1);
  assert.match(audit.suppressed[0].suppressionReason ?? "", /confidence|coverage|REJECTED/);
});

test("alert quality gate follows signal coverage source freshness formula", () => {
  const score = calculateAlertQualityScore({
    signalQuality: 80,
    dataCoverage: 60,
    sourceReliability: 70,
    freshness: 50,
  });

  assert.equal(score, 69);
  assert.equal(classifyAlertQuality(score), "MEDIUM");
  assert.equal(classifyAlertQuality(39), "REJECTED");
});

test("freshness validator uses macro-specific threshold", () => {
  const macroSignal = signal({
    key: "cpi_latest",
    group: "macro",
    value: 320,
    timestamp: new Date(Date.now() - 10 * 24 * 60 * 60_000).toISOString(),
  });
  const fundingSignal = signal({
    key: "funding_btc",
    group: "leverage",
    value: 0.01,
    timestamp: new Date(Date.now() - 25 * 60 * 60_000).toISOString(),
  });

  assert.equal(signalFreshnessState(macroSignal), "fresh");
  assert.equal(signalFreshnessState(fundingSignal), "stale");
});

test("ETF freshness uses shared market-day resolver instead of generic minute freshness", () => {
  const currentDate = new Date().toISOString().slice(0, 10);
  const etfSignal = signal({
    key: "btc_etf_flow_24h",
    group: "flows",
    value: 12_000_000,
    timestamp: `${currentDate}T21:00:00.000Z`,
  });

  assert.equal(freshnessFromLatestEtfDate("2026-06-05", new Date("2026-06-10T12:00:00.000Z")), "fresh");
  assert.equal(signalFreshnessState(etfSignal), "fresh");
});

test("source freshness resolver uses source-specific expected intervals", () => {
  const source = (params: Partial<SourceDefinition> & { id: string; pollingIntervalSeconds: number; category?: SourceDefinition["category"]; parser?: SourceDefinition["parser"] }): SourceDefinition => ({
    id: params.id,
    name: params.id,
    sourceType: "api",
    category: params.category ?? "market_data",
    tier: 1,
    enabled: true,
    pollingIntervalSeconds: params.pollingIntervalSeconds,
    timeoutMs: 1000,
    priorityScore: 90,
    parser: params.parser ?? "json",
    assetRelevance: ["BTC"],
    retryPolicy: { maxAttempts: 1, backoffMs: 0, backoffMultiplier: 1 },
    degradedMode: "allow_partial",
    accessModel: "core_free",
  });
  const health = (lastSuccessAt: string): SourceHealthSnapshot => ({
    sourceId: "test",
    sourceName: "test",
    status: "success",
    tier: 1,
    latencyMs: 10,
    freshnessMinutes: null,
    errorRate: 0,
    consecutiveFailures: 0,
    lastSuccessAt,
    lastFailureAt: null,
    updatedAt: lastSuccessAt,
  });

  const now = new Date("2026-06-05T12:00:00.000Z");
  const binance = source({ id: "binance", pollingIntervalSeconds: 5 * 60 });
  const rss = source({ id: "rss", pollingIntervalSeconds: 15 * 60, category: "crypto_media", parser: "rss" });
  const etf = source({ id: "etf", pollingIntervalSeconds: 30 * 60, category: "etf", parser: "farside_etf_flows" });

  assert.equal(resolveSourceFreshness(binance, health("2026-06-05T11:51:00.000Z"), now).state, "fresh");
  assert.notEqual(resolveSourceFreshness(binance, health("2026-06-05T11:30:00.000Z"), now).state, "fresh");
  assert.equal(resolveSourceFreshness(rss, health("2026-06-05T11:35:00.000Z"), now).state, "fresh");
  assert.equal(resolveSourceFreshness(etf, health("2026-06-03T12:00:00.000Z"), now).state, "fresh");
});

test("optional premium exchange flow signals are unavailable, not stale or obsolete", () => {
  const exchangeSignal = signal({
    key: "exchange_inflows",
    group: "onchain",
    value: null,
    quality: "unavailable",
  });
  exchangeSignal.timestamp = null;
  const resolved = resolveSignalFreshness(exchangeSignal);

  assert.equal(signalFreshnessClassification(exchangeSignal), "OPTIONAL_PREMIUM");
  assert.equal(resolved.state, "unavailable");
  assert.equal(resolved.countsAgainstGlobalFreshness, false);
});

test("optional free enrichment gaps do not count against global freshness", () => {
  const marketCap = signal({
    key: "eth_market_cap",
    group: "price",
    value: null,
    quality: "unavailable",
  });
  marketCap.timestamp = null;
  const resolved = resolveSignalFreshness(marketCap);

  assert.equal(signalFreshnessClassification(marketCap), "OPTIONAL_FREE");
  assert.equal(resolved.state, "unavailable");
  assert.equal(resolved.countsAgainstGlobalFreshness, false);
});

test("delayed Nasdaq proxy is not treated as obsolete while US cash market data is delayed", () => {
  const delayedNasdaq = signal({
    key: "nasdaq_trend_24h",
    group: "macro",
    value: -1.2,
    quality: "delayed",
    timestamp: new Date(Date.now() - 16 * 60 * 60_000).toISOString(),
  });
  const resolved = resolveSignalFreshness(delayedNasdaq);

  assert.equal(signalFreshnessClassification(delayedNasdaq), "CORE_DEGRADED");
  assert.equal(resolved.state, "delayed");
  assert.equal(resolved.countsAgainstGlobalFreshness, false);
});

test("unavailable BTC funding is core degraded missing, not an obsolete freshness failure", () => {
  const btcFunding = signal({
    key: "funding_btc",
    group: "leverage",
    value: null,
    quality: "unavailable",
  });
  btcFunding.timestamp = null;
  const resolved = resolveSignalFreshness(btcFunding);

  assert.equal(signalFreshnessClassification(btcFunding), "CORE_DEGRADED");
  assert.equal(resolved.state, "unavailable");
  assert.equal(resolved.countsAgainstGlobalFreshness, false);
});

test("correlation confidence cannot exceed correlation coverage", () => {
  assert.equal(capCorrelationConfidenceByCoverage(73, 36), 36);
  assert.equal(capCorrelationConfidenceByCoverage(73, 56), 56);
  assert.equal(capCorrelationConfidenceByCoverage(null, 56), null);
});

test("geopolitical classifier rejects administrative treasury noise", () => {
  const rejected = classifyGeopoliticalEvent("Treasury announces committee meeting and remarks by secretary on administrative agenda");
  const accepted = classifyGeopoliticalEvent("New sanctions and export controls escalate diplomatic conflict");

  assert.equal(rejected.accepted, false);
  assert.match(rejected.rejectionReason ?? "", /administrative|no_geopolitical/);
  assert.equal(accepted.accepted, true);
  assert.ok(accepted.geopoliticalConfidence > rejected.geopoliticalConfidence);
});

test("risk floor enforces elevated uncertainty when liquidity, ETF and stablecoins are weak", () => {
  const adjusted = applyRiskFloors({
    riskScore: 24,
    liquidityScore: 18,
    etfScore: 20,
    stablecoinScore: 35,
  });

  assert.equal(adjusted.score, 50);
  assert.equal(adjusted.appliedFloor, 50);
});

test("cross-market correlation 24h window is not calculated from mixed hourly/daily series", () => {
  const crossMarket = getCorrelationWindowPlan("BTC", "DXY", "24h");
  const cryptoOnly = getCorrelationWindowPlan("BTC", "ETH", "24h");

  assert.equal(crossMarket.enabled, false);
  assert.equal(crossMarket.frequency, "daily");
  assert.equal(cryptoOnly.enabled, true);
  assert.equal(cryptoOnly.frequency, "hourly");
});

test("source health counts are separated and non-contradictory", () => {
  const row = (params: Partial<DataSourceHealthRow> & { sourceId: string; status: DataSourceHealthRow["status"]; enabled: boolean; tier: number; accessModel: string }): DataSourceHealthRow => ({
    sourceId: params.sourceId,
    sourceName: params.sourceId,
    sourceType: "api",
    category: "market_data",
    tier: params.tier,
    accessModel: params.accessModel,
    enabled: params.enabled,
    status: params.status,
    lastSuccessfulUpdate: null,
    lastError: null,
    responseTimeMs: null,
    freshnessMinutes: null,
    coveragePercent: 0,
    warningFa: null,
  });
  const counts = summarizeSourceHealthCounts([
    row({ sourceId: "core-1", status: "connected", enabled: true, tier: 1, accessModel: "core_free" }),
    row({ sourceId: "core-2", status: "degraded", enabled: true, tier: 1, accessModel: "core_free" }),
    row({ sourceId: "optional-1", status: "disconnected", enabled: true, tier: 3, accessModel: "optional_api_key" }),
    row({ sourceId: "disabled-1", status: "disconnected", enabled: false, tier: 3, accessModel: "paid_premium" }),
  ]);

  assert.equal(counts.criticalCoreConnectedSources, 1);
  assert.equal(counts.criticalCoreTotalSources, 2);
  assert.equal(counts.allActiveConnectedSources, 1);
  assert.equal(counts.allActiveTotalSources, 3);
  assert.equal(counts.optionalPremiumTotalSources, 2);
  assert.equal(counts.disabledSources, 1);
  assert.ok(counts.criticalCoreConnectedSources <= counts.allActiveConnectedSources);
});

test("pure geopolitical news cannot dominate final crypto sentiment above category cap", () => {
  const headline = (id: string): StructuredHeadlineSignal => ({
    id,
    source: "test geopolitical rss",
    title: "Geopolitical shock without direct crypto rail disruption",
    timestamp: new Date().toISOString(),
    affectedAssets: ["Gold", "DXY"],
    sentimentPolarity: -80,
    confidence: 80,
    category: "geopolitics",
    transmissionChannel: "geopolitical_risk",
    expectedImpactDirection: "bearish",
    expectedImpactHorizon: "24h",
    severity: 80,
    novelty: 80,
    pricedIn: false,
    sourceCredibility: 80,
    marketReactionConfirmation: 20,
    marketRelevanceScore: 60,
    eventRelevanceScore: 60,
    impactScore: 60,
    relevanceLabel: "low_impact",
    weightedScore: -80,
  });
  const weighted = calculateWeightedMarketSentiment([headline("g1"), headline("g2"), headline("g3")]);

  assert.equal(weighted.sentimentScore, -8);
  assert.equal(weighted.concentration?.bucket, "geopolitical");
});

test("missing exchange flows remain unavailable and are not fabricated", async () => {
  const point = await onchainAdapter.fetchPoint("exchange_inflows");

  assert.equal(point.value, null);
  assert.equal(point.quality, "unavailable");
  assert.match(point.error ?? "", /no fallback value/i);
});

test("liquidity engine exposes contribution breakdown without fabricating unavailable layers", () => {
  const output = calculateLiquidityEngine({
    dxyTrend: 0.2,
    us10yTrend: 0.04,
    stablecoinMarketCapTrend: null,
    usdtSupplyTrend: null,
    usdcSupplyTrend: null,
    btcEtfFlow: null,
    ethEtfFlow: null,
    exchangeReserveTrend: null,
    exchangeInflows: null,
    exchangeOutflows: null,
    openInterestTrend: null,
    fundingRate: null,
    spotVolumeTrend: -1,
    futuresVolumeTrend: null,
  });

  assert.ok(output.liquidityContributionBreakdown?.length);
  assert.ok(output.liquidityContributionBreakdown?.some((item) => item.layer === "stablecoin" && item.contribution === null));
  assert.ok(output.decomposition?.some((line) => /Liquidity Contribution Breakdown/.test(line)));
});

test("forecast outcome labels remain user-facing and do not expose internal numeric scores", () => {
  const explanation = explainForecastOutcome({
    validationId: "validation:test",
    snapshotId: "forecast:test",
    asset: "BTC",
    assetType: "crypto",
    predictionHorizon: "24H",
    predictionTimestamp: "2026-06-01T00:00:00.000Z",
    validationDate: "2026-06-02T00:00:00.000Z",
    validatedAt: "2026-06-02T00:05:00.000Z",
    predictedDirection: "up",
    predictedConfidence: 62,
    priceAtPrediction: 100,
    actualPrice: 103,
    realizedChangePct: 3,
    realizedDirection: "up",
    result: "accurate",
    internalScore: 1,
    mainDrivers: ["ETF Engine contribution"],
    engineContributions: { "ETF Engine": 72 },
    quality: "direct",
  });

  assert.match(explanation.outcomeSummaryFa, /Accurate/);
  assert.doesNotMatch(explanation.outcomeSummaryFa, /\b1\b|\b0\.5\b|\b0\b/);
});
