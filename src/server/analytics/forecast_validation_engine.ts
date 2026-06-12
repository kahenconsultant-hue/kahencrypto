import type { DataSeriesPoint } from "@/lib/types";
import { explainForecastOutcome } from "@/server/analytics/forecast_failure_analyzer";
import { getSeriesHistory, type SeriesKey } from "@/server/analytics/market-signals";
import { getForecastSnapshotsSync, getForecastValidationsSync } from "@/storage/ingestion-store";
import type {
  ForecastDirection,
  ForecastPredictionHorizon,
  ForecastSnapshotInput,
  ForecastValidationInput,
  ForecastValidationResult,
} from "@/types/ingestion";

const horizonFrequency: Record<ForecastPredictionHorizon, "intraday" | "daily"> = {
  "24H": "intraday",
  "7D": "daily",
  "30D": "daily",
};

const pctNeutralThresholds: Partial<Record<string, Record<ForecastPredictionHorizon, number>>> = {
  BTC: { "24H": 2, "7D": 4, "30D": 9 },
  ETH: { "24H": 2, "7D": 4, "30D": 10 },
  SOL: { "24H": 3, "7D": 6, "30D": 14 },
  USDT: { "24H": 0.4, "7D": 1, "30D": 2 },
  DXY: { "24H": 0.25, "7D": 0.6, "30D": 1.4 },
  Gold: { "24H": 0.7, "7D": 1.5, "30D": 4 },
  Nasdaq: { "24H": 1, "7D": 2.5, "30D": 6 },
};

const absoluteNeutralThresholds: Partial<Record<string, Record<ForecastPredictionHorizon, number>>> = {
  US10Y: { "24H": 0.08, "7D": 0.15, "30D": 0.35 },
};

function sortHistory(history: DataSeriesPoint[]) {
  return history
    .filter((point) => Number.isFinite(point.value) && Boolean(point.timestamp))
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

function findOutcomePoint(snapshot: ForecastSnapshotInput) {
  const frequency = horizonFrequency[snapshot.predictionHorizon];
  const history = sortHistory(getSeriesHistory(snapshot.asset as SeriesKey, frequency));
  const validationTime = Date.parse(snapshot.validationDate);
  if (!Number.isFinite(validationTime)) return null;
  return history.find((point) => Date.parse(point.timestamp) >= validationTime) ?? null;
}

function realizedDirection(snapshot: ForecastSnapshotInput, actualPrice: number): { direction: ForecastDirection; changePct: number; magnitude: number } {
  const change = actualPrice - snapshot.priceAtPrediction;
  const changePct = snapshot.priceAtPrediction === 0 ? 0 : (change / Math.abs(snapshot.priceAtPrediction)) * 100;
  const absoluteThreshold = absoluteNeutralThresholds[snapshot.asset]?.[snapshot.predictionHorizon];
  const pctThreshold = pctNeutralThresholds[snapshot.asset]?.[snapshot.predictionHorizon] ?? 2;
  const magnitude = absoluteThreshold === undefined ? Math.abs(changePct) : Math.abs(change);
  const threshold = absoluteThreshold ?? pctThreshold;

  if (magnitude < threshold) return { direction: "neutral", changePct: Number(changePct.toFixed(4)), magnitude };
  return { direction: change > 0 ? "up" : "down", changePct: Number(changePct.toFixed(4)), magnitude };
}

function scoreResult(snapshot: ForecastSnapshotInput, actualPrice: number): {
  result: ForecastValidationResult;
  internalScore: number | null;
  realizedDirection: ForecastDirection;
  realizedChangePct: number;
} {
  const realized = realizedDirection(snapshot, actualPrice);
  const absoluteThreshold = absoluteNeutralThresholds[snapshot.asset]?.[snapshot.predictionHorizon];
  const pctThreshold = pctNeutralThresholds[snapshot.asset]?.[snapshot.predictionHorizon] ?? 2;
  const threshold = absoluteThreshold ?? pctThreshold;

  if (realized.direction === "neutral" || snapshot.predictedDirection === "neutral" || snapshot.predictedDirection === "mixed") {
    return {
      result: "inconclusive",
      internalScore: null,
      realizedDirection: realized.direction,
      realizedChangePct: realized.changePct,
    };
  }

  if (realized.direction !== snapshot.predictedDirection) {
    return {
      result: "incorrect",
      internalScore: 0,
      realizedDirection: realized.direction,
      realizedChangePct: realized.changePct,
    };
  }

  if (realized.magnitude >= threshold * 1.5) {
    return {
      result: "accurate",
      internalScore: 1,
      realizedDirection: realized.direction,
      realizedChangePct: realized.changePct,
    };
  }

  return {
    result: "acceptable",
    internalScore: 0.5,
    realizedDirection: realized.direction,
    realizedChangePct: realized.changePct,
  };
}

function inconclusiveValidation(snapshot: ForecastSnapshotInput, reason: string): ForecastValidationInput {
  const base = {
    validationId: `validation:${snapshot.snapshotId}`,
    snapshotId: snapshot.snapshotId,
    asset: snapshot.asset,
    assetType: snapshot.assetType,
    predictionHorizon: snapshot.predictionHorizon,
    predictionTimestamp: snapshot.timestamp,
    validationDate: snapshot.validationDate,
    validatedAt: new Date().toISOString(),
    predictedDirection: snapshot.predictedDirection,
    predictedConfidence: snapshot.predictedConfidence,
    priceAtPrediction: snapshot.priceAtPrediction,
    actualPrice: null,
    realizedChangePct: null,
    realizedDirection: "insufficient_data" as const,
    result: "inconclusive" as const,
    internalScore: null,
    mainDrivers: snapshot.mainDrivers,
    engineContributions: snapshot.engineContributions,
    quality: "insufficient_data" as const,
  };
  const explanation = explainForecastOutcome(base);
  return {
    ...base,
    outcomeSummaryFa: explanation.outcomeSummaryFa,
    explanationFa: `${explanation.explanationFa} دلیل: ${reason}`,
  };
}

export function validateDueForecasts(now = new Date()): ForecastValidationInput[] {
  const existingValidationIds = new Set(getForecastValidationsSync().map((validation) => validation.validationId));
  const dueSnapshots = getForecastSnapshotsSync()
    .filter((snapshot) => Date.parse(snapshot.validationDate) <= now.getTime())
    .filter((snapshot) => !existingValidationIds.has(`validation:${snapshot.snapshotId}`));

  return dueSnapshots.map((snapshot) => {
    const outcome = findOutcomePoint(snapshot);
    if (!outcome) {
      return inconclusiveValidation(snapshot, "برای این horizon هنوز نقطه واقعی بعد از زمان validation در history منبع موجود نیست.");
    }

    const scored = scoreResult(snapshot, outcome.value);
    const base = {
      validationId: `validation:${snapshot.snapshotId}`,
      snapshotId: snapshot.snapshotId,
      asset: snapshot.asset,
      assetType: snapshot.assetType,
      predictionHorizon: snapshot.predictionHorizon,
      predictionTimestamp: snapshot.timestamp,
      validationDate: snapshot.validationDate,
      validatedAt: new Date().toISOString(),
      predictedDirection: snapshot.predictedDirection,
      predictedConfidence: snapshot.predictedConfidence,
      priceAtPrediction: snapshot.priceAtPrediction,
      actualPrice: outcome.value,
      realizedChangePct: scored.realizedChangePct,
      realizedDirection: scored.realizedDirection,
      result: scored.result,
      internalScore: scored.internalScore,
      mainDrivers: snapshot.mainDrivers,
      engineContributions: snapshot.engineContributions,
      quality: "direct" as const,
    };
    const explanation = explainForecastOutcome(base);
    return {
      ...base,
      outcomeSummaryFa: explanation.outcomeSummaryFa,
      explanationFa: explanation.explanationFa,
    };
  });
}

