import type { ForecastPredictionHorizon, ForecastValidationInput } from "@/types/ingestion";
import { getForecastSnapshotsSync, getForecastValidationsSync } from "@/storage/ingestion-store";

export const forecastResultLabels: Record<ForecastValidationInput["result"], { label: string; description: string }> = {
  accurate: {
    label: "🎯 Accurate",
    description: "جهت و شدت حرکت بازار با forecast هم‌خوان بود.",
  },
  acceptable: {
    label: "✅ Acceptable",
    description: "جهت درست بود اما شدت حرکت ضعیف‌تر یا قوی‌تر از انتظار بود.",
  },
  inconclusive: {
    label: "⚠️ Inconclusive",
    description: "بازار خنثی ماند یا داده کافی برای validation وجود نداشت.",
  },
  incorrect: {
    label: "❌ Incorrect",
    description: "بازار برخلاف جهت forecast حرکت کرد.",
  },
};

const trackedAssets = ["BTC", "ETH", "SOL", "USDT", "DXY", "Gold", "Nasdaq", "US10Y"];
const trackedEngines = [
  "ETF Engine",
  "Liquidity Engine",
  "Stablecoin Engine",
  "Macro Engine",
  "Sentiment Engine",
  "Correlation Engine",
  "Risk Engine",
  "Regime Engine",
];

function mean(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function accuracy(validations: ForecastValidationInput[]) {
  const scored = validations.filter((validation) => validation.internalScore !== null);
  const value = mean(scored.map((validation) => (validation.internalScore ?? 0) * 100));
  return {
    value,
    count: scored.length,
  };
}

function byHorizon(validations: ForecastValidationInput[], horizon: ForecastPredictionHorizon) {
  return validations.filter((validation) => validation.predictionHorizon === horizon);
}

function confidenceAverage(rows: Array<{ predictedConfidence: number | null }>) {
  return mean(rows.map((row) => row.predictedConfidence).filter((value): value is number => typeof value === "number"));
}

function confidenceBucket(value: number | null) {
  if (value === null) return null;
  if (value >= 90) return "90-100%";
  if (value >= 80) return "80-90%";
  if (value >= 70) return "70-80%";
  if (value >= 60) return "60-70%";
  if (value >= 50) return "50-60%";
  return null;
}

function weekKey(date: string) {
  const parsed = new Date(date);
  const day = parsed.getUTCDay() || 7;
  parsed.setUTCDate(parsed.getUTCDate() - day + 1);
  parsed.setUTCHours(0, 0, 0, 0);
  return parsed.toISOString().slice(0, 10);
}

function lastEightWeekKeys(now = new Date()) {
  return Array.from({ length: 8 }, (_, index) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - (7 - index) * 7);
    return weekKey(date.toISOString());
  });
}

function performanceRank(rows: Array<{ name: string; accuracy: number | null; forecastCount: number }>) {
  const valid = rows.filter((row) => row.accuracy !== null && row.forecastCount > 0);
  const best = valid.slice().sort((left, right) => (right.accuracy ?? 0) - (left.accuracy ?? 0))[0] ?? null;
  const worst = valid.slice().sort((left, right) => (left.accuracy ?? 0) - (right.accuracy ?? 0))[0] ?? null;
  return { best, worst };
}

function calibrationQuality(gap: number | null) {
  if (gap === null) return "در انتظار داده";
  const abs = Math.abs(gap);
  if (abs <= 5) return "هم‌کالیبره";
  if (abs <= 15) return "قابل قبول";
  return gap > 0 ? "محافظه‌کارانه" : "بیش‌اعتماد";
}

export function getForecastValidationCenter() {
  const snapshots = getForecastSnapshotsSync();
  const validations = getForecastValidationsSync();
  const scoredValidations = validations.filter((validation) => validation.internalScore !== null);
  const accuracy24h = accuracy(byHorizon(validations, "24H"));
  const accuracy7d = accuracy(byHorizon(validations, "7D"));
  const averageForecastConfidence = confidenceAverage(validations.length ? validations : snapshots);
  const latestSnapshotByAsset = new Map(
    trackedAssets.map((asset) => [
      asset,
      snapshots
        .filter((snapshot) => snapshot.asset === asset)
        .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))[0] ?? null,
    ]),
  );

  const assetRows = trackedAssets.map((asset) => {
    const assetValidations = validations.filter((validation) => validation.asset === asset);
    const horizon24h = accuracy(byHorizon(assetValidations, "24H"));
    const horizon7d = accuracy(byHorizon(assetValidations, "7D"));
    const latestValidation = assetValidations.sort((left, right) => Date.parse(right.validatedAt) - Date.parse(left.validatedAt))[0] ?? null;
    const latestSnapshot = latestSnapshotByAsset.get(asset) ?? null;
    return {
      asset,
      accuracy24h: horizon24h.value,
      accuracy7d: horizon7d.value,
      forecastCount: assetValidations.length,
      currentConfidence: latestSnapshot?.predictedConfidence ?? null,
      validationStatus: latestValidation?.result ?? "inconclusive",
      validationLabel: latestValidation ? forecastResultLabels[latestValidation.result].label : "در انتظار",
    };
  });

  const assetRanking = performanceRank(assetRows.map((row) => ({
    name: row.asset,
    accuracy: row.accuracy24h ?? row.accuracy7d,
    forecastCount: row.forecastCount,
  })));

  const engineRows = trackedEngines.map((engine) => {
    const engineValidations = validations.filter((validation) => typeof validation.engineContributions?.[engine] === "number");
    const engineAccuracy = accuracy(engineValidations);
    const avgContribution = mean(engineValidations.map((validation) => validation.engineContributions?.[engine]).filter((value): value is number => typeof value === "number"));
    const avgConfidence = confidenceAverage(engineValidations);
    const gap = engineAccuracy.value === null || avgConfidence === null ? null : Math.round((engineAccuracy.value - avgConfidence) * 10) / 10;
    return {
      engine,
      accuracy: engineAccuracy.value,
      forecastCount: engineAccuracy.count,
      contributionScore: avgContribution,
      confidenceCalibration: calibrationQuality(gap),
      confidenceReliability: gap === null ? null : Math.max(0, Math.round(100 - Math.abs(gap))),
      calibrationGap: gap,
    };
  });

  const engineRanking = performanceRank(engineRows.map((row) => ({
    name: row.engine,
    accuracy: row.accuracy,
    forecastCount: row.forecastCount,
  })));

  const weeklyKeys = lastEightWeekKeys();
  const trend = weeklyKeys.map((key) => {
    const weekRows = scoredValidations.filter((validation) => weekKey(validation.validatedAt) === key);
    const btcRows = weekRows.filter((validation) => validation.asset === "BTC");
    const ethRows = weekRows.filter((validation) => validation.asset === "ETH");
    const solRows = weekRows.filter((validation) => validation.asset === "SOL");
    return {
      week: key,
      overall: accuracy(weekRows).value,
      btc: accuracy(btcRows).value,
      eth: accuracy(ethRows).value,
      sol: accuracy(solRows).value,
      count: weekRows.length,
    };
  });

  const calibrationBuckets = ["50-60%", "60-70%", "70-80%", "80-90%", "90-100%"].map((bucket) => {
    const bucketRows = scoredValidations.filter((validation) => confidenceBucket(validation.predictedConfidence) === bucket);
    const actual = accuracy(bucketRows).value;
    const midpoint = Number(bucket.slice(0, 2)) + 5;
    return {
      bucket,
      predictedConfidence: midpoint,
      actualAccuracy: actual,
      calibrationGap: actual === null ? null : Math.round((actual - midpoint) * 10) / 10,
      count: bucketRows.length,
    };
  });

  const bestForecasts = scoredValidations
    .filter((validation) => validation.result === "accurate" || validation.result === "acceptable")
    .sort((left, right) => (right.internalScore ?? 0) - (left.internalScore ?? 0) || Math.abs(right.realizedChangePct ?? 0) - Math.abs(left.realizedChangePct ?? 0))
    .slice(0, 10);

  const worstForecasts = scoredValidations
    .filter((validation) => validation.result === "incorrect")
    .sort((left, right) => Math.abs(right.realizedChangePct ?? 0) - Math.abs(left.realizedChangePct ?? 0))
    .slice(0, 10);

  const nextValidation = snapshots
    .filter((snapshot) => !validations.some((validation) => validation.snapshotId === snapshot.snapshotId))
    .sort((left, right) => Date.parse(left.validationDate) - Date.parse(right.validationDate))[0] ?? null;

  const calibrationScores = calibrationBuckets
    .map((bucket) => bucket.calibrationGap)
    .filter((value): value is number => typeof value === "number")
    .map((gap) => Math.max(0, 100 - Math.abs(gap)));

  return {
    generatedAt: new Date().toISOString(),
    status: snapshots.length ? validations.length ? "active" : "collecting" : "no_forecasts_yet",
    summary: {
      overallAccuracy24h: accuracy24h.value,
      overallAccuracy7d: accuracy7d.value,
      forecastsValidated: validations.length,
      scoredForecasts: scoredValidations.length,
      currentValidationWindow: nextValidation?.validationDate ?? null,
      averageForecastConfidence,
      bestPerformingAsset: assetRanking.best?.name ?? null,
      worstPerformingAsset: assetRanking.worst?.name ?? null,
      bestEngine: engineRanking.best?.name ?? null,
      currentCalibrationScore: mean(calibrationScores),
    },
    trend,
    assets: assetRows,
    engines: engineRows,
    calibrationBuckets,
    recentValidatedForecasts: validations.slice(0, 12),
    bestForecasts,
    worstForecasts,
    snapshotsStored: snapshots.length,
    noSyntheticAccuracy: true,
  };
}

