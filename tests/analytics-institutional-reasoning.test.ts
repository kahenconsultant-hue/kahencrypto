import assert from "node:assert/strict";
import { test } from "node:test";
import type { CorrelationSignal, LiquidityEngineOutput } from "../src/lib/types";
import { getCausalMarketGraph } from "../src/server/analytics/causal-market-graph";
import { classifyCorrelation } from "../src/server/analytics/correlation-engine";
import { deriveLiquidityRegimeV2, detectLiquidityV2State } from "../src/server/analytics/liquidity-engine";
import { applyRegimePenalties, calculateMarketRegime, evaluateRiskOnConfirmation, type RegimeInputVector } from "../src/server/analytics/market-regime-engine";

const baseLiquidity: LiquidityEngineOutput = {
  marketRiskScore: 50,
  liquidityScore: 42,
  macroStressScore: 58,
  narrativeStrength: 50,
  volatilityRisk: 54,
  liquidityState: "fragile",
  v2State: "weak_participation_rally",
  condition: "Stress",
  liquidityScoreSigned: -16,
  macroLiquidityScore: -22,
  cryptoLiquidityScore: -10,
  realSpotLiquidityScore: -8,
  leveragedLiquidityScore: 74,
  liquiditySustainabilityScore: 28,
  stablecoinTrend: "neutral",
  etfFlowStatus: "neutral",
  leverageStress: 76,
  institutionalFlow: 50,
  stablecoinExpansion: 48,
  speculativeHeat: 82,
  riskCompression: 31,
  confidence: 52,
  formula: "",
  explanation: "",
  historicalComparison: "",
  dataQuality: "partial_live",
  lastUpdatedAt: new Date().toISOString(),
};

const fragileRiskOnInput: RegimeInputVector = {
  btcTrend: 0.42,
  ethTrend: 0.28,
  solTrend: 0.8,
  nasdaqTrend: 0.7,
  dxyTrend: 0.24,
  us10yTrend: 0.04,
  goldTrend: 0.1,
  vixTrend: 1.2,
  stablecoinTrend: 0.05,
  btcEtfFlow: null,
  ethEtfFlow: null,
  fundingRate: 0.035,
  openInterest: 7.5,
  newsSentiment: 4,
  geopoliticalScore: 20,
};

const weakCorrelation: CorrelationSignal = {
  assetPair: "BTC ↔ Nasdaq",
  left: "BTC",
  right: "Nasdaq",
  correlation24H: 0.04,
  previous24H: null,
  correlation7D: 0.06,
  correlation30D: 0.12,
  correlation90D: 0.2,
  previous90D: 0.22,
  correlationChange: -0.06,
  state: "unstable",
  volatilityAdjusted30D: 0.1,
  beta30D: 0.2,
  stabilityScore: 38,
  structuralBreak: false,
  regimeChannel: "no_directional_channel",
  narrativeAllowed: false,
  statisticalStrength: "weak",
  leadLag: {
    leader: "none",
    lag: "1d",
    correlation: 0.06,
    confidence: 35,
    interpretationFa: "رابطه lead-lag معنادار نیست.",
  },
  confidence: 44,
  interpretation: "",
  regimeImpact: "",
  dataQuality: "delayed",
  lastUpdatedAt: new Date().toISOString(),
};

test("risk-on expansion requires multi-layer confirmation", () => {
  const confirmation = evaluateRiskOnConfirmation(fragileRiskOnInput, baseLiquidity);

  assert.equal(confirmation.flags.nasdaqPositive, true);
  assert.equal(confirmation.flags.cryptoLiquidityPositive, false);
  assert.equal(confirmation.flags.dxyNeutralOrWeakening, false);
  assert.equal(confirmation.flags.leverageNotOverheated, false);
  assert.equal(confirmation.flags.etfOrStablecoinConfirmation, false);
  assert.equal(confirmation.passed, false);
});

test("risk-on score is penalized by dollar strength, weak liquidity, ETF absence and leverage heat", () => {
  const result = applyRegimePenalties({
    label: "Risk-On Expansion",
    rawScore: 74,
    input: fragileRiskOnInput,
    liquidity: baseLiquidity,
    correlations: [weakCorrelation],
  });

  assert.ok(result.penalties.contradictionPenalty > 0);
  assert.ok(result.penalties.liquidityPenalty > 0);
  assert.ok(result.penalties.leveragePenalty > 0);
  assert.ok(result.penalties.dataQualityPenalty > 0);
  assert.ok(result.finalScore < 45);
});

test("probabilistic regime v2 exposes candidate probabilities and instability controls", () => {
  const output = calculateMarketRegime(fragileRiskOnInput);
  const probabilities = output.regimeProbabilities ?? [];
  const probabilitySum = probabilities.reduce((sum, item) => sum + item.probability, 0);

  assert.notEqual(output.regimeLabel, "Risk-On Expansion");
  assert.ok(probabilities.length >= 4);
  assert.ok(probabilitySum > 99 && probabilitySum < 101);
  assert.ok(output.probabilisticRegime);
  assert.ok(output.regimeInstability);
  assert.ok(output.regimePersistence);
  assert.ok(output.transitionAnalysis?.instabilityScore !== undefined);
});

test("liquidity v2 detects speculative overheating when leverage is high and spot is weak", () => {
  const state = detectLiquidityV2State({
    liquidityScoreSigned: 8,
    macroLiquidityScore: -10,
    cryptoLiquidityScore: 14,
    realSpotLiquidityScore: 4,
    leveragedLiquidityScore: 82,
    leverageStress: 79,
    sustainabilityScore: 33,
    stablecoinScore: 0,
    btcEtfFlow: null,
  });

  assert.equal(state, "speculative_overheating");
});

test("liquidity regime v2 requires multi-layer support before supportive classification", () => {
  const regime = deriveLiquidityRegimeV2({
    macroHealth: 64,
    realSpotHealth: 67,
    leveragedHealth: 42,
    stablecoinHealth: 61,
    etfHealth: 58,
    exchangeFlowHealth: 55,
    sustainability: 63,
    leverageStress: 48,
    coverage: 76,
    missingSignals: [],
  });

  assert.equal(regime.regime, "supportive");
  assert.ok(regime.confidence <= 76);
  assert.ok(regime.confirmations.length >= 3);
});

test("liquidity regime v2 downgrades weak spot plus high leverage to stressed", () => {
  const regime = deriveLiquidityRegimeV2({
    macroHealth: 47,
    realSpotHealth: 28,
    leveragedHealth: 82,
    stablecoinHealth: 35,
    etfHealth: 42,
    exchangeFlowHealth: null,
    sustainability: 31,
    leverageStress: 78,
    coverage: 58,
    missingSignals: ["exchange_inflows", "exchange_outflows"],
  });

  assert.equal(regime.regime, "stressed");
  assert.ok(regime.bottlenecks.some((item) => item.includes("اهرم")));
  assert.ok(regime.bottlenecks.some((item) => item.includes("صرافی")));
});

test("liquidity regime v2 stays fragmented when critical flows are missing and layers conflict", () => {
  const regime = deriveLiquidityRegimeV2({
    macroHealth: 62,
    realSpotHealth: 51,
    leveragedHealth: 72,
    stablecoinHealth: 44,
    etfHealth: null,
    exchangeFlowHealth: null,
    sustainability: 49,
    leverageStress: 64,
    coverage: 52,
    missingSignals: ["btc_etf_flow_7d", "exchange_inflows", "exchange_outflows"],
  });

  assert.equal(regime.regime, "fragmented");
  assert.ok(regime.confidence <= 52);
  assert.match(regime.narrativeFa, /directional|هم‌جهت|ناموجود/);
});

test("weak correlations must not be interpreted as strong risk-on relation", () => {
  assert.equal(classifyCorrelation(0.06), "از نظر آماری ضعیف");
});

test("causal graph does not assign fake certainty to unsupported paths", () => {
  const graph = getCausalMarketGraph();

  assert.equal(graph.moduleName, "causal_market_graph");
  assert.ok(graph.edges.length >= 8);
  assert.ok(graph.edges.every((edge) => edge.status !== "active" || (edge.probability !== null && edge.confidence !== null)));
  assert.ok(graph.edges.every((edge) => edge.status === "active" || edge.probability === null));
  assert.ok(graph.edges.every((edge) => edge.status === "active" || edge.relationship === "uncertain"));
  assert.ok(graph.missingInputs.every((input) => typeof input === "string" && input.length > 0));
});
