export type ConfidenceEngineKey =
  | "priceMomentum"
  | "stablecoinLiquidity"
  | "etfFlow"
  | "macro"
  | "derivatives"
  | "sentimentNews";

export type EngineAvailability = "available_and_fresh" | "available_but_stale" | "partial" | "missing";
export type EvidenceFreshnessStatus = "fresh" | "last_trading_day" | "stale" | "missing";

export type ConfidenceEngineInput = {
  status: EngineAvailability;
  confidence: number | null;
  sourceName: string | null;
  sourceUrl: string | null;
  fetchedAt: string | null;
  latestDataTimestamp: string | null;
  freshnessStatus: EvidenceFreshnessStatus;
  parseStatus: "success" | "partial" | "failed";
  numericFieldsAvailable: string[];
};

export type ConfidenceGuardInput = {
  rawConfidence: number;
  reportMode: string;
  engines: Record<ConfidenceEngineKey, ConfidenceEngineInput>;
};

export type ConfidenceGuardResult = {
  rawConfidence: number;
  dataCoverageWeighted: number;
  confidenceCap: number;
  finalConfidence: number;
  capReasons: string[];
  capReasonsFa: string[];
  missingCriticalData: ConfidenceEngineKey[];
  staleSources: string[];
  engineCaps: {
    riskEngineConfidence: number;
    marketRegimeConfidence: number;
    liquidityEngineConfidence: number;
    byEngine: Record<ConfidenceEngineKey, number>;
  };
};

export const CONFIDENCE_ENGINE_WEIGHTS: Record<ConfidenceEngineKey, number> = {
  priceMomentum: 20,
  stablecoinLiquidity: 20,
  etfFlow: 15,
  macro: 15,
  derivatives: 20,
  sentimentNews: 10,
};

const availabilityFactor: Record<EngineAvailability, number> = {
  available_and_fresh: 1,
  available_but_stale: 0.4,
  partial: 0.5,
  missing: 0,
};

const reasonFa: Record<string, string> = {
  missing_price_momentum: "داده قیمت و مومنتوم موجود نیست",
  missing_stablecoin_liquidity: "داده تاریخی نقدینگی استیبل‌کوین موجود نیست",
  missing_etf_flow: "جریان عددی ETF موجود نیست",
  missing_macro: "داده عددی کلان موجود نیست",
  missing_derivatives: "داده مشتقات در دسترس نیست",
  missing_stablecoin_and_etf: "داده استیبل‌کوین و ETF هم‌زمان موجود نیست",
  missing_liquidity_etf_derivatives: "داده استیبل‌کوین، ETF و مشتقات هم‌زمان موجود نیست",
  weighted_coverage_below_50: "پوشش وزنی داده کمتر از ۵۰٪ است",
  weighted_coverage_below_35: "پوشش وزنی داده کمتر از ۳۵٪ است",
  stale_critical_source: "حداقل یک منبع حیاتی از بازه تازگی مجاز عبور کرده است",
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function businessDaysElapsed(from: Date, to: Date) {
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  let days = 0;
  for (let cursor = new Date(start); cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + 1);
    const weekday = next.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}

export function resolveEvidenceFreshness(
  category: ConfidenceEngineKey,
  timestamp: string | null,
  now = new Date(),
): EvidenceFreshnessStatus {
  if (!timestamp) return "missing";
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime())) return "missing";
  const ageMinutes = Math.max(0, (now.getTime() - parsed.getTime()) / 60_000);

  if (category === "priceMomentum" || category === "derivatives") return ageMinutes <= 15 ? "fresh" : "stale";
  if (category === "stablecoinLiquidity" || category === "sentimentNews") return ageMinutes <= 24 * 60 ? "fresh" : "stale";
  if (category === "etfFlow" || category === "macro") {
    if (ageMinutes <= 24 * 60) return "fresh";
    if (ageMinutes <= 96 * 60 && businessDaysElapsed(parsed, now) <= 1) return "last_trading_day";
    return "stale";
  }
  return "stale";
}

export function applyConfidenceGuard(input: ConfidenceGuardInput): ConfidenceGuardResult {
  const weightedCoverage = Object.entries(CONFIDENCE_ENGINE_WEIGHTS).reduce((sum, [key, weight]) => {
    return sum + weight * availabilityFactor[input.engines[key as ConfidenceEngineKey].status];
  }, 0);
  const dataCoverageWeighted = clampPercent(weightedCoverage);
  const missingCriticalData = (Object.keys(input.engines) as ConfidenceEngineKey[]).filter(
    (key) => input.engines[key].status === "missing",
  );
  const staleSources = Array.from(
    new Set(
      (Object.keys(input.engines) as ConfidenceEngineKey[])
        .filter((key) => input.engines[key].status === "available_but_stale")
        .map((key) => input.engines[key].sourceName)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const capReasons: string[] = [];
  let confidenceCap = 100;
  const cap = (value: number, reason: string) => {
    confidenceCap = Math.min(confidenceCap, value);
    if (!capReasons.includes(reason)) capReasons.push(reason);
  };

  if (input.engines.priceMomentum.status === "missing") cap(30, "missing_price_momentum");
  if (input.engines.stablecoinLiquidity.status === "missing") cap(55, "missing_stablecoin_liquidity");
  if (input.engines.etfFlow.status === "missing") cap(60, "missing_etf_flow");
  if (input.engines.macro.status === "missing") cap(65, "missing_macro");
  if (input.engines.derivatives.status === "missing") cap(55, "missing_derivatives");
  if (input.engines.stablecoinLiquidity.status === "missing" && input.engines.etfFlow.status === "missing") {
    cap(45, "missing_stablecoin_and_etf");
  }
  if (
    input.engines.stablecoinLiquidity.status === "missing" &&
    input.engines.etfFlow.status === "missing" &&
    input.engines.derivatives.status === "missing"
  ) {
    cap(40, "missing_liquidity_etf_derivatives");
  }
  if (dataCoverageWeighted < 35) cap(30, "weighted_coverage_below_35");
  else if (dataCoverageWeighted < 50) cap(40, "weighted_coverage_below_50");

  const hasStaleCriticalSource = (Object.keys(input.engines) as ConfidenceEngineKey[]).some(
    (key) => input.engines[key].status === "available_but_stale",
  );
  if (hasStaleCriticalSource) cap(60, "stale_critical_source");

  const derivativesMissing = input.engines.derivatives.status === "missing";
  const stablecoinMissing = input.engines.stablecoinLiquidity.status === "missing";
  const byEngine = Object.fromEntries(
    (Object.keys(input.engines) as ConfidenceEngineKey[]).map((key) => [
      key,
      input.engines[key].status === "missing"
        ? 0
        : Math.min(input.engines[key].confidence ?? 100, input.engines[key].status === "available_but_stale" ? 60 : 100),
    ]),
  ) as Record<ConfidenceEngineKey, number>;

  return {
    rawConfidence: clampPercent(input.rawConfidence),
    dataCoverageWeighted,
    confidenceCap,
    finalConfidence: Math.min(clampPercent(input.rawConfidence), confidenceCap),
    capReasons,
    capReasonsFa: capReasons.map((reason) => reasonFa[reason] ?? reason),
    missingCriticalData,
    staleSources,
    engineCaps: {
      riskEngineConfidence: derivativesMissing ? 45 : 100,
      marketRegimeConfidence: derivativesMissing ? 55 : 100,
      liquidityEngineConfidence: stablecoinMissing ? 55 : 100,
      byEngine,
    },
  };
}
