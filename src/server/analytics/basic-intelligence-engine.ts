import type { ConfidenceResult, DataSourceStatus, IntelligenceAssetSymbol } from "@/lib/types";
import { aggregateLayerConfidence } from "@/server/analytics/adaptive-confidence-engine";
import { getAssetImpactProfiles } from "@/server/analytics/asset-impact-engine";
import { getLiquidityReport } from "@/server/analytics/liquidity-engine";
import { getMarketRegimeReport } from "@/server/analytics/market-regime-engine";
import { getEngineLastUpdatedAt } from "@/server/analytics/market-signals";
import { getRiskReport, type DominantPressure, type RiskLevel, type UncertaintyLevel } from "@/server/analytics/risk-engine";
import { getIntelligenceReliabilityReportSync } from "@/server/intelligence/reliability-engine";

export interface BasicAssetIntelligenceRow {
  asset: IntelligenceAssetSymbol;
  bias: string;
  impactScore: number;
  riskLevel: RiskLevel;
  confidence: number | null;
  summaryFa: string;
}

export interface BasicIntelligenceOutput {
  moduleName: "basic_intelligence_engine_v1";
  status: DataSourceStatus;
  sourceType: "direct" | "derived" | "proxy" | "unavailable";
  regime: string;
  liquidityState: string;
  riskLevel: RiskLevel;
  riskScore: number | null;
  dominantPressure: DominantPressure;
  uncertaintyLevel: UncertaintyLevel;
  confidence: {
    score: number | null;
    dispersion: number | null;
    warningFa: string;
  };
  summaryFa: string;
  dominantDriversFa: string[];
  invalidationFa: string[];
  monitoringFa: string[];
  assetMap: BasicAssetIntelligenceRow[];
  dataWarningsFa: string[];
  lastUpdatedAt: string;
}

const biasFa: Record<string, string> = {
  bullish: "مثبت",
  bearish: "منفی",
  mixed: "دوگانه",
  neutral: "خنثی",
};

const pressureFa: Record<DominantPressure, string> = {
  macro: "فشار کلان",
  liquidity: "فشار نقدینگی",
  leverage: "فشار اهرمی",
  volatility: "فشار نوسان",
  sentiment: "فشار خبری/سنتیمنت",
  data_quality: "ریسک کیفیت داده",
  mixed: "فشار ترکیبی",
  unavailable: "ناموجود",
};

const BASIC_INTELLIGENCE_CACHE_TTL_MS = 30_000;

let basicIntelligenceCache:
  | {
      expiresAt: number;
      value: BasicIntelligenceOutput;
    }
  | null = null;

function confidenceForAggregation(confidence: ConfidenceResult | undefined): ConfidenceResult {
  return (
    confidence ?? {
      available: false,
      score: null,
      label: "unavailable",
      formula: "confidence ناموجود است.",
      availableGroups: [],
      missingGroups: [],
      explanation: "confidence این لایه در دسترس نیست.",
    }
  );
}

function outputStatus(params: { riskStatus: DataSourceStatus; liquidityStatus: DataSourceStatus; coreReliability: number }): DataSourceStatus {
  if (params.coreReliability < 0.35) return "unavailable";
  if (params.riskStatus === "unavailable" && params.liquidityStatus === "unavailable") return "unavailable";
  if (params.riskStatus === "live" && params.liquidityStatus === "live") return "live";
  if (params.riskStatus === "delayed" || params.liquidityStatus === "delayed") return "delayed";
  return "partial_live";
}

function assetRow(asset: ReturnType<typeof getAssetImpactProfiles>[number], risk: ReturnType<typeof getRiskReport>): BasicAssetIntelligenceRow {
  const assetRisk = risk.assetRisks.find((row) => row.asset === asset.asset);
  return {
    asset: asset.asset,
    bias: biasFa[asset.directionalBias] ?? asset.directionalBias,
    impactScore: asset.impactScore,
    riskLevel: assetRisk?.riskLevel ?? "unavailable",
    confidence: asset.confidence.score,
    summaryFa:
      asset.confidence.available
        ? `${asset.asset}: سوگیری ${biasFa[asset.directionalBias] ?? asset.directionalBias} با امتیاز اثر ${asset.impactScore} و confidence ${asset.confidence.score}٪.`
        : `${asset.asset}: داده کافی برای برداشت جهت‌دار معتبر وجود ندارد.`,
  };
}

export function getBasicIntelligenceReport(): BasicIntelligenceOutput {
  const now = Date.now();
  if (basicIntelligenceCache && basicIntelligenceCache.expiresAt > now) {
    return basicIntelligenceCache.value;
  }

  const regime = getMarketRegimeReport();
  const liquidity = getLiquidityReport();
  const risk = getRiskReport();
  const assets = getAssetImpactProfiles();
  const reliability = getIntelligenceReliabilityReportSync();
  const confidence = aggregateLayerConfidence([
    { name: "regime", confidence: confidenceForAggregation(regime.confidenceDetail), weight: 0.32 },
    { name: "liquidity", confidence: confidenceForAggregation(liquidity.confidenceDetail), weight: 0.32 },
    { name: "risk", confidence: risk.confidence, weight: 0.24 },
    { name: "asset_map", confidence: confidenceForAggregation(assets.find((asset) => asset.asset === "BTC")?.confidence), weight: 0.12 },
  ]);
  const status = outputStatus({ riskStatus: risk.status, liquidityStatus: liquidity.dataQuality, coreReliability: reliability.coreReliability });
  const regimeLabel = regime.regimeLabel ?? regime.active;
  const liquidityState = liquidity.v2State ?? liquidity.liquidityState;
  const dataWarningsFa = [
    ...reliability.warningsFa.slice(0, 3),
    risk.uncertaintyLevel === "high" ? "عدم‌قطعیت لایه ریسک بالاست؛ خروجی باید سناریومحور خوانده شود." : "",
    liquidity.unavailablePremiumInputs?.length ? `داده‌های تکمیلی ناموجود: ${liquidity.unavailablePremiumInputs.slice(0, 3).join("، ")}` : "",
  ].filter(Boolean);

  const output: BasicIntelligenceOutput = {
    moduleName: "basic_intelligence_engine_v1",
    status,
    sourceType: status === "unavailable" ? "unavailable" : "derived",
    regime: regimeLabel,
    liquidityState,
    riskLevel: risk.riskLevel,
    riskScore: risk.riskScore,
    dominantPressure: risk.dominantPressure,
    uncertaintyLevel: risk.uncertaintyLevel,
    confidence,
    summaryFa:
      status === "unavailable"
        ? "داده کافی برای ساخت نمای پایه هوش بازار وجود ندارد؛ سیستم به‌جای ساخت عدد یا روایت جعلی، وضعیت را ناموجود نمایش می‌دهد."
        : `نمای پایه C.M.I.P نشان می‌دهد رژیم فعلی «${regimeLabel}»، وضعیت نقدینگی «${liquidityState}» و سطح ریسک «${risk.riskLevel}» است. فشار غالب ${pressureFa[risk.dominantPressure]} تشخیص داده شده و confidence کل ${confidence.score ?? "ناموجود"}٪ است.`,
    dominantDriversFa: [
      ...risk.driversFa.slice(0, 4),
      ...regime.alertContext.slice(0, 2),
      liquidity.explanation,
    ],
    invalidationFa: [...risk.invalidationFa.slice(0, 3), ...(regime.invalidationSignals ?? []).slice(0, 2)],
    monitoringFa: risk.monitoringFa,
    assetMap: assets.map((asset) => assetRow(asset, risk)),
    dataWarningsFa,
    lastUpdatedAt: getEngineLastUpdatedAt(),
  };
  basicIntelligenceCache = {
    expiresAt: now + BASIC_INTELLIGENCE_CACHE_TTL_MS,
    value: output,
  };
  return output;
}
