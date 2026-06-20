import type { TargetAssetSymbol } from "@/lib/assets/targetAssets";
import type { NormalizedSignal } from "@/lib/types";

export type DerivativesBias = "bullish" | "bearish" | "neutral" | "squeeze-risk" | "deleveraging";
export type DerivativesTrend = "rising" | "falling" | "flat";
export type DerivativesAssetSymbol = Exclude<TargetAssetSymbol, "USDT">;

export type PublicDerivativesAsset = {
  asset: DerivativesAssetSymbol;
  symbol: string | null;
  derivativesAvailable: boolean;
  sourceUsed: string | null;
  latestFundingRate: number | null;
  fundingRate24hAvg: number | null;
  fundingRate7dAvg: number | null;
  fundingRateDirection: DerivativesTrend | null;
  latestFundingTimestamp: string | null;
  latestOpenInterest: number | null;
  latestOpenInterestUsdValue: number | null;
  openInterest24hChangePct: number | null;
  openInterest7dChangePct: number | null;
  openInterestTrend: DerivativesTrend | null;
  latestOiTimestamp: string | null;
  longShortRatio: number | null;
  liquidationProxy: null;
  directionalDerivativesBias: DerivativesBias;
  leverageRiskScore: number | null;
  derivativesConfidence: number;
  missingFields: string[];
  fetchedAt: string | null;
  latestDataTimestamp: string | null;
  stale: boolean;
};

export type MarketDerivativesSummary = {
  mode: "lite_public_exchange_api";
  availableAssetsCount: number;
  missingAssetsCount: number;
  btcDerivativesState: DerivativesBias | "N/A";
  ethDerivativesState: DerivativesBias | "N/A";
  avgFundingRateMajorAssets: number | null;
  avgOi24hChangeMajorAssets: number | null;
  avgOi7dChangeMajorAssets: number | null;
  marketLeverageRiskScore: number | null;
  marketDerivativesBias: DerivativesBias | "N/A";
  confidence: number;
  missingAssets: DerivativesAssetSymbol[];
  sourceBreakdown: Record<string, number>;
  assets: PublicDerivativesAsset[];
  generatedAt: string;
  audit: {
    mode: "lite_public_exchange_api";
    sourcesTried: string[];
    sourcesSucceeded: string[];
    perAssetStatus: Array<{ asset: DerivativesAssetSymbol; available: boolean; source: string | null; stale: boolean; missingFields: string[] }>;
    failedSymbols: DerivativesAssetSymbol[];
    staleSymbols: DerivativesAssetSymbol[];
    rateLimitEvents: number;
    parseErrors: number;
    fetchedAt: string;
    confidenceCapsApplied: Array<{ asset: DerivativesAssetSymbol; cap: number; reason: string }>;
  };
};

type SignalMap = Record<string, NormalizedSignal | undefined>;
type PriceContext = Partial<Record<DerivativesAssetSymbol, { change24hPct: number | null; change7dPct: number | null }>>;

export const DERIVATIVES_ASSETS: DerivativesAssetSymbol[] = ["BTC", "ETH", "TRX", "TON", "SOL", "XRP", "DOGE", "BNB", "ADA"];
const MAJOR_ASSETS: DerivativesAssetSymbol[] = ["BTC", "ETH", "SOL", "BNB", "XRP"];

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function value(signals: SignalMap, key: string) {
  const signal = signals[key];
  return signal && signal.value !== null && signal.quality !== "unavailable" ? signal.value : null;
}

function timestamp(signals: SignalMap, key: string) {
  return signals[key]?.timestamp ?? null;
}

function source(signals: SignalMap, keys: string[]) {
  const sources = [...new Set(keys.map((key) => signals[key]?.source).filter((item): item is string => Boolean(item)))];
  if (!sources.length) return null;
  const providers = ["Binance", "Bybit", "OKX"].filter((provider) => sources.some((item) => item.includes(provider)));
  return providers.length ? providers.join(" + ") : sources[0];
}

function latestTimestamp(...values: Array<string | null>) {
  const latest = values.map((item) => (item ? Date.parse(item) : NaN)).filter(Number.isFinite).sort((left, right) => right - left)[0];
  return Number.isFinite(latest) ? new Date(latest).toISOString() : null;
}

function direction(change: number | null, epsilon = 0.05): DerivativesTrend | null {
  if (change === null) return null;
  if (change > epsilon) return "rising";
  if (change < -epsilon) return "falling";
  return "flat";
}

function average(values: Array<number | null>) {
  const available = values.filter((item): item is number => item !== null && Number.isFinite(item));
  return available.length ? available.reduce((sum, item) => sum + item, 0) / available.length : null;
}

export function calculateLeverageRisk(params: {
  latestFundingRate: number | null;
  fundingRate24hAvg: number | null;
  openInterest24hChangePct: number | null;
  openInterest7dChangePct: number | null;
  liquidationAvailable?: boolean;
}) {
  const components: Array<{ value: number; weight: number }> = [];
  if (params.latestFundingRate !== null) components.push({ value: clamp((Math.abs(params.latestFundingRate) / 0.1) * 100), weight: 0.35 });
  if (params.latestFundingRate !== null && params.fundingRate24hAvg !== null) {
    components.push({ value: clamp((Math.abs(params.latestFundingRate - params.fundingRate24hAvg) / 0.05) * 100), weight: 0.2 });
  }
  if (params.openInterest24hChangePct !== null) components.push({ value: clamp((Math.abs(params.openInterest24hChangePct) / 10) * 100), weight: 0.25 });
  if (params.openInterest7dChangePct !== null) components.push({ value: clamp((Math.abs(params.openInterest7dChangePct) / 25) * 100), weight: 0.2 });
  if (!components.length) return null;
  const totalWeight = components.reduce((sum, item) => sum + item.weight, 0);
  return Math.round(components.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight);
}

export function classifyDerivativesBias(params: {
  latestFundingRate: number | null;
  fundingRateDirection: DerivativesTrend | null;
  openInterest24hChangePct: number | null;
  priceChange24hPct: number | null;
}): DerivativesBias {
  const { latestFundingRate: funding, openInterest24hChangePct: oi, priceChange24hPct: price } = params;
  if (oi !== null && oi < -1 && price !== null && price < -0.5) return "deleveraging";
  if (funding !== null && funding < -0.01 && ((oi !== null && oi > 1) || (price !== null && price > 0.5))) return "squeeze-risk";
  if (oi !== null && oi > 1 && price !== null && price > 0.5) return funding !== null && funding < -0.01 ? "squeeze-risk" : "bullish";
  if (oi !== null && oi > 1 && price !== null && price < -0.5) return "bearish";
  if (funding !== null && funding > 0.03 && params.fundingRateDirection === "rising") return price !== null && price < 0 ? "bearish" : "bullish";
  if (funding !== null && funding < -0.03) return "bearish";
  return "neutral";
}

export function derivativesConfidence(params: {
  fundingAvailable: boolean;
  oiAvailable: boolean;
  sameSource: boolean;
  primarySource: boolean;
  longShortAvailable: boolean;
  liquidationAvailable: boolean;
  stale: boolean;
  sevenDayOiAvailable: boolean;
}) {
  let confidence = 0;
  if (params.fundingAvailable && params.oiAvailable) confidence = params.sameSource ? (params.primarySource ? 70 : 65) : 60;
  else if (params.fundingAvailable || params.oiAvailable) confidence = 45;
  if (params.fundingAvailable && params.oiAvailable && params.longShortAvailable) confidence = Math.min(75, confidence + 10);
  if (params.fundingAvailable && params.oiAvailable && params.longShortAvailable && params.liquidationAvailable) confidence = Math.min(80, confidence + 5);
  if (!params.sevenDayOiAvailable) confidence = Math.max(0, confidence - 5);
  if (params.stale) confidence = Math.min(45, confidence);
  return Math.min(80, confidence);
}

function buildAsset(asset: DerivativesAssetSymbol, signals: SignalMap, prices: PriceContext): PublicDerivativesAsset {
  const suffix = asset.toLowerCase();
  const keys = {
    funding: `funding_${suffix}`,
    funding24h: `funding_${suffix}_24h_avg`,
    funding7d: `funding_${suffix}_7d_avg`,
    oi: `open_interest_${suffix}`,
    oiUsd: `open_interest_${suffix}_usd`,
    oi24h: `open_interest_${suffix}_24h`,
    oi7d: `open_interest_${suffix}_7d`,
    ratio: `long_short_ratio_${suffix}`,
  };
  const funding = value(signals, keys.funding);
  const funding24h = value(signals, keys.funding24h);
  const funding7d = value(signals, keys.funding7d);
  const oi = value(signals, keys.oi);
  const oiUsd = value(signals, keys.oiUsd);
  const oi24h = value(signals, keys.oi24h);
  const oi7d = value(signals, keys.oi7d);
  const ratio = value(signals, keys.ratio);
  const fundingTimestamp = timestamp(signals, keys.funding);
  const oiTimestamp = timestamp(signals, keys.oi);
  const latestDataTimestamp = latestTimestamp(fundingTimestamp, oiTimestamp, timestamp(signals, keys.ratio));
  const stale = latestDataTimestamp === null || Date.now() - Date.parse(latestDataTimestamp) > 15 * 60_000;
  const fundingSource = source(signals, [keys.funding, keys.funding24h, keys.funding7d]);
  const oiSource = source(signals, [keys.oi, keys.oi24h, keys.oi7d]);
  const sourceUsed = source(signals, Object.values(keys));
  const sameSource = Boolean(fundingSource && oiSource && fundingSource === oiSource);
  const confidence = derivativesConfidence({
    fundingAvailable: funding !== null,
    oiAvailable: oi !== null && oi24h !== null,
    sameSource,
    primarySource: sourceUsed?.includes("Binance") ?? false,
    longShortAvailable: ratio !== null,
    liquidationAvailable: false,
    stale,
    sevenDayOiAvailable: oi7d !== null,
  });
  const missingFields = [
    funding === null ? "latestFundingRate" : null,
    funding24h === null ? "fundingRate24hAvg" : null,
    funding7d === null ? "fundingRate7dAvg" : null,
    oi === null ? "latestOpenInterest" : null,
    oi24h === null ? "openInterest24hChangePct" : null,
    oi7d === null ? "openInterest7dChangePct" : null,
    ratio === null ? "longShortRatio" : null,
    "liquidationProxy",
  ].filter((item): item is string => Boolean(item));
  return {
    asset,
    symbol: sourceUsed?.includes("OKX") ? `${asset}-USDT-SWAP` : sourceUsed ? `${asset}USDT` : null,
    derivativesAvailable: funding !== null || oi !== null,
    sourceUsed,
    latestFundingRate: funding,
    fundingRate24hAvg: funding24h,
    fundingRate7dAvg: funding7d,
    fundingRateDirection: funding !== null && funding24h !== null ? direction(funding - funding24h, 0.0005) : null,
    latestFundingTimestamp: fundingTimestamp,
    latestOpenInterest: oi,
    latestOpenInterestUsdValue: oiUsd,
    openInterest24hChangePct: oi24h,
    openInterest7dChangePct: oi7d,
    openInterestTrend: direction(oi24h),
    latestOiTimestamp: oiTimestamp,
    longShortRatio: ratio,
    liquidationProxy: null,
    directionalDerivativesBias: classifyDerivativesBias({
      latestFundingRate: funding,
      fundingRateDirection: funding !== null && funding24h !== null ? direction(funding - funding24h, 0.0005) : null,
      openInterest24hChangePct: oi24h,
      priceChange24hPct: prices[asset]?.change24hPct ?? null,
    }),
    leverageRiskScore: calculateLeverageRisk({ latestFundingRate: funding, fundingRate24hAvg: funding24h, openInterest24hChangePct: oi24h, openInterest7dChangePct: oi7d }),
    derivativesConfidence: confidence,
    missingFields,
    fetchedAt: latestDataTimestamp,
    latestDataTimestamp,
    stale,
  };
}

export function buildDerivativesLiteSummary(signals: SignalMap, prices: PriceContext = {}): MarketDerivativesSummary {
  const assets = DERIVATIVES_ASSETS.map((asset) => buildAsset(asset, signals, prices));
  const available = assets.filter((asset) => asset.derivativesAvailable);
  const majors = assets.filter((asset) => MAJOR_ASSETS.includes(asset.asset) && asset.derivativesAvailable && !asset.stale);
  const sourceBreakdown = available.reduce<Record<string, number>>((result, asset) => {
    const key = asset.sourceUsed ?? "Unknown";
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
  const marketRisk = majors.length >= 3 ? average(majors.map((asset) => asset.leverageRiskScore)) : null;
  const biasCounts = majors.reduce<Record<DerivativesBias, number>>(
    (result, asset) => ({ ...result, [asset.directionalDerivativesBias]: result[asset.directionalDerivativesBias] + 1 }),
    { bullish: 0, bearish: 0, neutral: 0, "squeeze-risk": 0, deleveraging: 0 },
  );
  const marketBias = majors.length < 3 ? "N/A" : (Object.entries(biasCounts).sort((left, right) => right[1] - left[1])[0]?.[0] as DerivativesBias | undefined) ?? "neutral";
  const confidenceCapsApplied = assets.map((asset) => ({
    asset: asset.asset,
    cap: asset.derivativesConfidence,
    reason: asset.stale ? "stale_over_15m" : asset.missingFields.includes("liquidationProxy") ? "lite_mode_no_total_market_liquidation" : "public_exchange_lite_cap",
  }));
  const sourcesSucceeded = Object.keys(sourceBreakdown).flatMap((sourceName) => ["Binance", "Bybit", "OKX"].filter((provider) => sourceName.includes(provider)));
  return {
    mode: "lite_public_exchange_api",
    availableAssetsCount: available.length,
    missingAssetsCount: assets.length - available.length,
    btcDerivativesState: assets.find((asset) => asset.asset === "BTC")?.derivativesAvailable ? assets.find((asset) => asset.asset === "BTC")!.directionalDerivativesBias : "N/A",
    ethDerivativesState: assets.find((asset) => asset.asset === "ETH")?.derivativesAvailable ? assets.find((asset) => asset.asset === "ETH")!.directionalDerivativesBias : "N/A",
    avgFundingRateMajorAssets: average(majors.map((asset) => asset.latestFundingRate)),
    avgOi24hChangeMajorAssets: average(majors.map((asset) => asset.openInterest24hChangePct)),
    avgOi7dChangeMajorAssets: average(majors.map((asset) => asset.openInterest7dChangePct)),
    marketLeverageRiskScore: marketRisk === null ? null : Math.round(marketRisk),
    marketDerivativesBias: marketBias,
    confidence: majors.length < 3 ? Math.min(40, Math.round(average(majors.map((asset) => asset.derivativesConfidence)) ?? 0)) : Math.round(average(majors.map((asset) => asset.derivativesConfidence)) ?? 0),
    missingAssets: assets.filter((asset) => !asset.derivativesAvailable).map((asset) => asset.asset),
    sourceBreakdown,
    assets,
    generatedAt: new Date().toISOString(),
    audit: {
      mode: "lite_public_exchange_api",
      sourcesTried: ["Binance", "Bybit", "OKX"],
      sourcesSucceeded: [...new Set(sourcesSucceeded)],
      perAssetStatus: assets.map((asset) => ({ asset: asset.asset, available: asset.derivativesAvailable, source: asset.sourceUsed, stale: asset.stale, missingFields: asset.missingFields })),
      failedSymbols: assets.filter((asset) => !asset.derivativesAvailable).map((asset) => asset.asset),
      staleSymbols: assets.filter((asset) => asset.stale).map((asset) => asset.asset),
      rateLimitEvents: 0,
      parseErrors: 0,
      fetchedAt: new Date().toISOString(),
      confidenceCapsApplied,
    },
  };
}

export function derivativesBiasFa(bias: DerivativesBias | "N/A") {
  if (bias === "bullish") return "روند اهرمی صعودی";
  if (bias === "bearish") return "فشار اهرمی نزولی";
  if (bias === "squeeze-risk") return "ریسک فشردگی موقعیت‌ها";
  if (bias === "deleveraging") return "تخلیه اهرم";
  if (bias === "neutral") return "اهرم متعادل";
  return "داده معتبر در دسترس نیست";
}
