export type PublicModuleState = {
  isIrrelevantToAsset?: boolean;
  coverage: number;
  confidence: number;
  isStale?: boolean;
  allowDelayedDisplay?: boolean;
};

export type ForecastPublicBadgeInput = {
  accurate: number;
  incorrect: number;
  inconclusive?: number;
  pending?: number;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeSigned(value: number, negativeBound: number, positiveBound: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value >= 0) return clamp((value / positiveBound) * 100, 0, 100);
  return -clamp((Math.abs(value) / Math.abs(negativeBound)) * 100, 0, 100);
}

export function shouldRenderPublicModule(module: PublicModuleState): boolean {
  if (module.isIrrelevantToAsset) return false;
  if (module.coverage < 60) return false;
  if (module.confidence < 40) return false;
  if (module.isStale && !module.allowDelayedDisplay) return false;
  return true;
}

export function publicModuleStatus(module: PublicModuleState) {
  if (module.isIrrelevantToAsset) return "hidden_irrelevant" as const;
  if (module.isStale && !module.allowDelayedDisplay) return "compact_stale" as const;
  if (module.coverage < 60 || module.confidence < 40) return "compact_limited" as const;
  return "visible" as const;
}

export function capPublicConfidence(params: {
  confidence: number;
  coverage: number;
  freshness: number;
  priceDataMissing?: boolean;
  stablecoinDataMissing?: boolean;
  assetCoverageBelowHalf?: boolean;
}) {
  let confidence = clamp(params.confidence, 0, 100);
  confidence = Math.min(confidence, clamp(params.coverage, 0, 100));
  confidence = Math.min(confidence, clamp(params.freshness, 0, 100));
  if (params.assetCoverageBelowHalf) confidence = Math.min(confidence, 45);
  if (params.freshness < 40) confidence = Math.min(confidence, 50);
  if (params.priceDataMissing) confidence = Math.min(confidence, 35);
  if (params.stablecoinDataMissing) confidence = Math.min(confidence, 55);
  return Math.round(confidence);
}

export function forecastPublicBadgeState(input: ForecastPublicBadgeInput) {
  const conclusive = Math.max(0, input.accurate) + Math.max(0, input.incorrect);
  const accuracy = conclusive > 0 ? Math.round((input.accurate / conclusive) * 100) : null;

  return {
    conclusive,
    accuracy,
    shouldShowPublicAccuracy: conclusive >= 100,
    labelFa: conclusive >= 100 ? `اعتبارسنجی forecast: ${accuracy}٪` : `اعتبارسنجی forecast در حال جمع‌آوری شواهد است. نمونه قابل قضاوت: ${conclusive}`,
  };
}
