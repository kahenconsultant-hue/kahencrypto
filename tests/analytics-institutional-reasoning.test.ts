import assert from "node:assert/strict";
import { test } from "node:test";
import type { CorrelationSignal, LiquidityEngineOutput } from "../src/lib/types";
import { classifyCorrelation } from "../src/server/analytics/correlation-engine";
import { detectLiquidityV2State } from "../src/server/analytics/liquidity-engine";
import { applyRegimePenalties, evaluateRiskOnConfirmation, type RegimeInputVector } from "../src/server/analytics/market-regime-engine";

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

test("weak correlations must not be interpreted as strong risk-on relation", () => {
  assert.equal(classifyCorrelation(0.06), "ضعیف / ناپایدار");
});
