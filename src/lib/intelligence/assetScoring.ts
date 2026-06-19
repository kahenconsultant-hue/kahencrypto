import type { AssetRegistryItem } from "@/lib/assets/targetAssets";
import type { AssetCoverageTier, TargetAssetSymbol } from "@/lib/assets/targetAssets";
import { clamp, normalizeSigned } from "@/lib/intelligence/moduleGating";

export type PublicFactorScore = {
  key: string;
  score: number | null;
  weight: number;
  available: boolean;
  labelFa: string;
};

export const PUBLIC_CONFIDENCE_CAPS: Record<AssetCoverageTier, number> = {
  full: 80,
  stablecoin_monitor: 70,
  medium: 70,
  lite: 65,
};

export function capAssetConfidenceByPublicQuality(params: {
  symbol: TargetAssetSymbol;
  coverageTier: AssetCoverageTier;
  confidence: number;
  deepDataLimited?: boolean;
  hasDerivatives?: boolean;
  hasAssetSpecificDeepData?: boolean;
  networkIssuerDataMissing?: boolean;
}) {
  let capped = Math.min(params.confidence, PUBLIC_CONFIDENCE_CAPS[params.coverageTier]);
  if (params.deepDataLimited) capped = Math.min(capped, 68);
  if (params.coverageTier === "medium" && !params.hasDerivatives && !params.hasAssetSpecificDeepData) capped = Math.min(capped, 65);
  if (params.coverageTier === "lite") capped = Math.min(capped, 62);
  if (params.symbol === "USDT" && params.networkIssuerDataMissing) capped = Math.min(capped, 70);
  return Math.round(clamp(capped, 0, 100));
}

export function priceMomentumScore(input: { change24hPct?: number | null; change7dPct?: number | null; change30dPct?: number | null }) {
  const factors = [
    { value: input.change24hPct, weight: 0.5, negative: -8, positive: 8 },
    { value: input.change7dPct, weight: 0.35, negative: -20, positive: 20 },
    { value: input.change30dPct, weight: 0.15, negative: -40, positive: 40 },
  ].filter((factor): factor is { value: number; weight: number; negative: number; positive: number } => typeof factor.value === "number" && Number.isFinite(factor.value));

  if (!factors.length) return null;
  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  return factors.reduce((sum, factor) => sum + normalizeSigned(factor.value, factor.negative, factor.positive) * (factor.weight / totalWeight), 0);
}

export function volumeLiquidityScore(input: { volume24h?: number | null; marketCap?: number | null }) {
  if (!input.volume24h || !input.marketCap || input.volume24h <= 0 || input.marketCap <= 0) return null;
  const ratio = input.volume24h / input.marketCap;
  if (ratio >= 0.2) return clamp(80 + ((ratio - 0.2) / 0.2) * 20, 80, 100);
  if (ratio >= 0.08) return 40 + ((ratio - 0.08) / 0.12) * 40;
  if (ratio >= 0.03) return ((ratio - 0.03) / 0.05) * 40;
  return -40 + (ratio / 0.03) * 40;
}

export function macroPressureScore(input: {
  dxyChangePct?: number | null;
  us10yChange?: number | null;
  nasdaqChangePct?: number | null;
  goldChangePct?: number | null;
  sentimentRiskHigh?: boolean;
}) {
  const dxy = typeof input.dxyChangePct === "number" ? -0.35 * normalizeSigned(input.dxyChangePct, -1.5, 1.5) : null;
  const us10y = typeof input.us10yChange === "number" ? -0.35 * normalizeSigned(input.us10yChange, -0.15, 0.15) : null;
  const nasdaq = typeof input.nasdaqChangePct === "number" ? 0.2 * normalizeSigned(input.nasdaqChangePct, -3, 3) : null;
  const gold =
    input.sentimentRiskHigh && typeof input.goldChangePct === "number"
      ? -0.1 * normalizeSigned(input.goldChangePct, -3, 3)
      : null;

  const parts = [dxy, us10y, nasdaq, gold].filter((value): value is number => value !== null);
  if (!parts.length) return null;
  return clamp(parts.reduce((sum, value) => sum + value, 0), -100, 100);
}

export function stablecoinLiquidityScore(input: {
  totalStablecoin7dPct?: number | null;
  usdtSupply7dPct?: number | null;
  usdcSupply7dPct?: number | null;
}) {
  const weighted = [
    { value: input.totalStablecoin7dPct, weight: 0.5 },
    { value: input.usdtSupply7dPct, weight: 0.3 },
    { value: input.usdcSupply7dPct, weight: 0.2 },
  ].filter((factor): factor is { value: number; weight: number } => typeof factor.value === "number" && Number.isFinite(factor.value));

  if (!weighted.length) return null;
  const totalWeight = weighted.reduce((sum, factor) => sum + factor.weight, 0);
  return weighted.reduce((sum, factor) => sum + normalizeSigned(factor.value, -1, 1) * (factor.weight / totalWeight), 0);
}

export function etfFlowScore(input: { flow24hUsd?: number | null; flow7dUsd?: number | null; assetMarketCapUsd?: number | null }) {
  if (!input.assetMarketCapUsd || input.assetMarketCapUsd <= 0) return null;
  const flow7dBps = typeof input.flow7dUsd === "number" ? (input.flow7dUsd / input.assetMarketCapUsd) * 10_000 : null;
  const flow24hBps = typeof input.flow24hUsd === "number" ? (input.flow24hUsd / input.assetMarketCapUsd) * 10_000 : null;
  if (flow7dBps === null && flow24hBps === null) return null;
  if (flow7dBps !== null && flow24hBps !== null) {
    return 0.65 * normalizeSigned(flow7dBps, -15, 15) + 0.35 * normalizeSigned(flow24hBps, -5, 5);
  }
  return normalizeSigned(flow7dBps ?? flow24hBps ?? 0, flow7dBps !== null ? -15 : -5, flow7dBps !== null ? 15 : 5);
}

export function weightedImpactScore(factors: PublicFactorScore[]) {
  const available = factors.filter((factor) => factor.available && factor.score !== null);
  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const availableWeight = available.reduce((sum, factor) => sum + factor.weight, 0);
  if (!available.length || availableWeight <= 0 || totalWeight <= 0) {
    return { impactScore: null, coverage: 0, missingWeight: totalWeight };
  }

  const impactScore = available.reduce((sum, factor) => sum + (factor.score ?? 0) * (factor.weight / availableWeight), 0);
  return {
    impactScore: Math.round(clamp(impactScore, -100, 100)),
    coverage: Math.round(clamp((availableWeight / totalWeight) * 100, 0, 100)),
    missingWeight: totalWeight - availableWeight,
  };
}

export function impactStatusLabelFa(impactScore: number | null) {
  if (impactScore === null || !Number.isFinite(impactScore)) return "داده محدود";
  if (impactScore >= 30) return "مثبت واضح";
  if (impactScore >= 20) return "مثبت ملایم";
  if (impactScore >= 10) return "خنثی متمایل به مثبت";
  if (impactScore >= -9) return "خنثی";
  if (impactScore >= -19) return "خنثی متمایل به منفی";
  if (impactScore >= -29) return "احتیاطی / فشار منفی ملایم";
  return "منفی واضح";
}

export function classifyAssetBias(asset: AssetRegistryItem, impactScore: number | null, confidence: number, coverage: number) {
  if (!asset.allowPriceBias) return "پایش ثبات/ریسک";
  void confidence;
  void coverage;
  return impactStatusLabelFa(impactScore);
}

export function coverageLabelFa(coverage: number) {
  if (coverage >= 75) return "پوشش خوب";
  if (coverage >= 50) return "پوشش متوسط";
  if (coverage >= 30) return "داده محدود";
  return "پایش فقط";
}
