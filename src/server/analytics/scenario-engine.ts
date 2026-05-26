import type { AssetScenario, IntelligenceAssetSymbol } from "@/lib/types";
import { getLiquidityReport } from "@/server/analytics/liquidity-engine";
import { getMarketRegimeReport } from "@/server/analytics/market-regime-engine";
import { getSignalSnapshot } from "@/server/analytics/market-signals";
import { clampPercent } from "@/server/analytics/scoring-engine";

const assetNames: Record<IntelligenceAssetSymbol, string> = {
  BTC: "BTC",
  ETH: "ETH",
  SOL: "SOL",
  USDT: "USDT",
  DXY: "DXY",
  Gold: "Gold",
  Nasdaq: "Nasdaq",
  US10Y: "US10Y",
};

function assetTrend(asset: IntelligenceAssetSymbol) {
  const { byKey } = getSignalSnapshot();
  if (asset === "BTC") return byKey.btc_trend_24h?.value ?? 0;
  if (asset === "ETH") return byKey.eth_trend_24h?.value ?? 0;
  if (asset === "SOL") return byKey.sol_trend_24h?.value ?? 0;
  if (asset === "DXY") return byKey.dxy_trend_24h?.value ?? 0;
  if (asset === "Gold") return byKey.gold_trend_24h?.value ?? 0;
  if (asset === "Nasdaq") return byKey.nasdaq_trend_24h?.value ?? 0;
  if (asset === "US10Y") return byKey.us10y_trend_24h?.value ?? 0;
  return byKey.usdt_supply_7d?.value ?? 0;
}

export function generateAssetScenarios(asset: IntelligenceAssetSymbol): AssetScenario[] {
  const liquidity = getLiquidityReport();
  const regime = getMarketRegimeReport().engine;
  const { byKey } = getSignalSnapshot();
  const trend = assetTrend(asset);
  const dxy = byKey.dxy_trend_24h?.value ?? null;
  const us10y = byKey.us10y_trend_24h?.value ?? null;
  const stablecoin = byKey.stablecoin_market_cap_7d?.value ?? null;
  const btcEtf = byKey.btc_etf_flow_24h?.value ?? null;
  const macroPressure = (dxy ?? 0) > 0.15 || (us10y ?? 0) > 0.03;
  const realLiquidityConfirmed = (liquidity.realSpotLiquidityScore ?? 0) > 25 && (stablecoin ?? 0) >= 0.35;
  const leverageHot = liquidity.leverageStress >= 70;
  const name = assetNames[asset];

  let bearish = 24 + (macroPressure ? 12 : 0) + (liquidity.liquidityScoreSigned < 0 ? 10 : 0) + (leverageHot ? 8 : 0);
  let bullish = 24 + (realLiquidityConfirmed ? 14 : 0) + (trend > 0.5 ? 8 : 0) + (btcEtf !== null && btcEtf > 0 ? 8 : 0);
  if (asset === "SOL") {
    bearish += leverageHot ? 8 : 0;
    bullish += trend > 1 ? 8 : 0;
  }
  if (asset === "Gold") {
    bullish += (byKey.geopolitical_event_score?.value ?? 0) > 55 ? 14 : 0;
    bearish += (us10y ?? 0) > 0.05 ? 7 : 0;
  }
  if (asset === "DXY" || asset === "US10Y") {
    bullish = 30 + (trend > 0 ? 14 : 0) + (macroPressure ? 10 : 0);
    bearish = 24 + (trend < 0 ? 14 : 0);
  }
  if (asset === "USDT") {
    bullish = 0;
    bearish = 28 + ((stablecoin ?? 0) < -0.35 ? 16 : 0);
  }
  bearish = clampPercent(bearish);
  bullish = clampPercent(bullish);
  const base = clampPercent(Math.max(25, 100 - bullish - bearish));
  const total = Math.max(1, base + bullish + bearish);
  const normalizedBase = clampPercent((base / total) * 100);
  const normalizedBullish = clampPercent((bullish / total) * 100);
  const normalizedBearish = clampPercent(100 - normalizedBase - normalizedBullish);

  return [
    {
      name: "base",
      labelFa: "سناریوی پایه",
      probability: normalizedBase,
      triggerConditions: [
        `رژیم فعلی: ${regime.regimeLabel ?? "Neutral / Transition"} با nuance ${regime.regimeNuance ?? "conflicting"}`,
        `liquidity score روی ${liquidity.liquidityScoreSigned}/100 و پایداری روی ${liquidity.liquiditySustainabilityScore ?? 0}/100 است.`,
      ],
      expectedDrivers: [`${name} بیشتر به ترکیب دلار، نرخ، نقدینگی اسپات و رفتار قیمت ۷ روزه واکنش نشان می‌دهد.`],
      riskFactors: ["ادامه فشار DXY/US10Y یا نبود تأیید ETF و استیبل‌کوین می‌تواند سناریوی پایه را دفاعی‌تر کند."],
    },
    {
      name: "bullish",
      labelFa: "سناریوی مثبت",
      probability: normalizedBullish,
      triggerConditions: [
        "stablecoin market cap بالای ۰٫۳۵٪ هفتگی رشد کند.",
        "DXY زیر روند کوتاه‌مدت خود برگردد و US10Y آرام شود.",
        "ETF یا spot volume جریان حمایتی نشان دهد.",
      ],
      expectedDrivers: ["نقدینگی واقعی به‌جای اهرم، محرک اصلی حرکت شود.", "همبستگی‌های ضعیف به سمت کانال risk-on پایدار برگردند."],
      riskFactors: ["اگر funding و OI سریع‌تر از spot flow رشد کنند، سناریوی مثبت به trap risk تبدیل می‌شود."],
    },
    {
      name: "bearish",
      labelFa: "سناریوی منفی",
      probability: normalizedBearish,
      triggerConditions: [
        "DXY بالای روند کوتاه‌مدت بماند یا US10Y بیش از ۳ bps دیگر رشد کند.",
        "leverage stress بالای ۷۰ تثبیت شود.",
        "ETF flow ناموجود/منفی بماند و stablecoin growth زیر ۰٫۳۵٪ باشد.",
      ],
      expectedDrivers: ["فشار دلار و نرخ از کانال نقدینگی به BTC، ETH و SOL منتقل شود.", "حرکت قیمت بیشتر اهرمی باشد تا نقدینگی‌محور."],
      riskFactors: ["بازگشت سریع ETF inflow یا رشد قوی استیبل‌کوین می‌تواند این سناریو را باطل کند."],
    },
    {
      name: "invalidation",
      labelFa: "ابطال سناریو",
      probability: clampPercent(Math.max(8, 100 - normalizedBase - normalizedBullish - normalizedBearish)),
      triggerConditions: [
        "دو محرک اصلی در دو بروزرسانی پشت‌سرهم خلاف جهت سناریوی فعلی حرکت کنند.",
        "ارتباط قیمت با نقدینگی یا همبستگی‌های کلیدی به‌طور عددی تغییر کند.",
      ],
      expectedDrivers: ["تغییر regime یا شکست واگرایی‌های فعلی."],
      riskFactors: ["نمونه ناکافی یا داده stale باعث می‌شود ابطال دیرتر تشخیص داده شود."],
    },
  ];
}
