import type { AssetSymbol, DataSourceStatus, DirectionalBias } from "@/lib/types";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";
import { getLiquidityReport } from "@/server/analytics/liquidity-engine";
import { getEngineLastUpdatedAt, getSignalSnapshot } from "@/server/analytics/market-signals";
import { getSentimentReport } from "@/server/analytics/sentiment-engine";
import { clampPercent } from "@/server/analytics/scoring-engine";

export interface DivergenceSignal {
  id: string;
  type: "price_vs_sentiment" | "price_vs_etf" | "price_vs_stablecoin" | "price_vs_nasdaq" | "price_vs_liquidity" | "price_vs_volatility";
  affectedAssets: AssetSymbol[];
  direction: DirectionalBias;
  severity: number;
  confidence: number;
  evidence: string[];
  interpretationFa: string;
  invalidationFa: string;
  dataQuality: DataSourceStatus;
}

function biasFromSeverity(direction: "positive" | "negative" | "mixed"): DirectionalBias {
  if (direction === "positive") return "bullish";
  if (direction === "negative") return "bearish";
  return "mixed";
}

export function getDivergenceReport() {
  const snapshot = getSignalSnapshot();
  const liquidity = getLiquidityReport();
  const sentiment = getSentimentReport();
  const correlations = getDynamicCorrelationReport().signals;
  const btcTrend = snapshot.byKey.btc_trend_24h?.value ?? null;
  const solTrend = snapshot.byKey.sol_trend_24h?.value ?? null;
  const nasdaqTrend = snapshot.byKey.nasdaq_trend_24h?.value ?? null;
  const vixTrend = snapshot.byKey.vix_trend_24h?.value ?? null;
  const stablecoinTrend = snapshot.byKey.stablecoin_market_cap_7d?.value ?? null;
  const btcEtfFlow = snapshot.byKey.btc_etf_flow_24h?.value ?? null;
  const btcNasdaq = correlations.find((signal) => signal.assetPair === "BTC ↔ Nasdaq");
  const signals: DivergenceSignal[] = [];

  if ((btcTrend ?? 0) > 0.35 && (btcEtfFlow === null || btcEtfFlow <= 0)) {
    signals.push({
      id: "price-vs-etf-weak-rally",
      type: "price_vs_etf",
      affectedAssets: ["BTC", "ETH", "SOL"],
      direction: "mixed",
      severity: clampPercent(58 + Math.max(0, btcTrend ?? 0) * 5 + (btcEtfFlow === null ? 10 : 0)),
      confidence: btcEtfFlow === null ? 42 : 62,
      evidence: [`BTC 24h trend: ${btcTrend?.toFixed(2)}٪`, btcEtfFlow === null ? "ETF flow ناموجود است" : `BTC ETF flow: ${Math.round(btcEtfFlow).toLocaleString("fa-IR")}`],
      interpretationFa: "قیمت BTC رشد کرده اما ETF flow آن را تأیید نمی‌کند. این حالت معمولاً به «رالی با مشارکت ضعیف» نزدیک‌تر است تا accumulation نهادی پایدار.",
      invalidationFa: "این واگرایی زمانی ضعیف می‌شود که ETF inflow مثبت شود یا حجم اسپات بالاتر از روند کوتاه‌مدت قرار بگیرد.",
      dataQuality: btcEtfFlow === null ? "partial_live" : "delayed",
    });
  }

  if (((btcTrend ?? 0) > 0.35 || (solTrend ?? 0) > 0.6) && (stablecoinTrend === null || stablecoinTrend < 0.35)) {
    signals.push({
      id: "price-vs-stablecoin-weak-participation",
      type: "price_vs_stablecoin",
      affectedAssets: ["BTC", "SOL", "USDT"],
      direction: "mixed",
      severity: clampPercent(55 + Math.max(0, solTrend ?? btcTrend ?? 0) * 4),
      confidence: stablecoinTrend === null ? 40 : 58,
      evidence: [`رشد ۷ روزه stablecoin market cap: ${stablecoinTrend === null ? "ناموجود" : `${stablecoinTrend.toFixed(2)}٪`}`, `پایداری نقدینگی: ${liquidity.liquiditySustainabilityScore ?? 0}/100`],
      interpretationFa: "قیمت با نقدینگی استیبل‌کوین همراه نشده است. اگر stablecoin market cap بالای ۰٫۳۵٪ هفتگی نرود، احتمال دارد رشد قیمت بیشتر ناشی از اهرم یا چرخش کوتاه‌مدت باشد.",
      invalidationFa: "رشد پایدار استیبل‌کوین‌ها، کاهش DXY و مثبت‌شدن ETF/spot flow این واگرایی را باطل می‌کند.",
      dataQuality: stablecoinTrend === null ? "partial_live" : "delayed",
    });
  }

  if ((btcTrend ?? 0) >= 0 && liquidity.liquidityScoreSigned < -15) {
    signals.push({
      id: "price-vs-liquidity-hidden-resilience",
      type: "price_vs_liquidity",
      affectedAssets: ["BTC", "ETH", "SOL"],
      direction: "mixed",
      severity: clampPercent(58 + Math.abs(liquidity.liquidityScoreSigned) * 0.4),
      confidence: liquidity.confidence,
      evidence: [`BTC افت را تأیید نکرده: ${btcTrend?.toFixed(2) ?? "ناموجود"}٪`, `liquidity score: ${liquidity.liquidityScoreSigned}/100`],
      interpretationFa: "قیمت در برابر فشار نقدینگی مقاومت نشان داده است. این می‌تواند نشانه hidden strength باشد، اما فقط وقتی معتبرتر می‌شود که حجم اسپات و استیبل‌کوین‌ها هم تأیید کنند.",
      invalidationFa: "اگر BTC زیر میانگین کوتاه‌مدت برگردد یا DXY/US10Y فشار را تشدید کنند، این مقاومت به ضعف پنهان تبدیل می‌شود.",
      dataQuality: liquidity.dataQuality,
    });
  }

  if ((btcTrend ?? 0) > 0.25 && (nasdaqTrend ?? 0) < -0.35 && Math.abs(btcNasdaq?.correlation7D ?? 0) < 0.2) {
    signals.push({
      id: "price-vs-nasdaq-decoupling",
      type: "price_vs_nasdaq",
      affectedAssets: ["BTC", "Nasdaq"],
      direction: "mixed",
      severity: 64,
      confidence: btcNasdaq?.confidence ?? 0,
      evidence: [`BTC/Nasdaq 7d correlation: ${btcNasdaq?.correlation7D?.toFixed(2) ?? "نمونه ناکافی"}`, `Nasdaq 24h: ${nasdaqTrend?.toFixed(2)}٪`],
      interpretationFa: "BTC فعلاً از Nasdaq جدایی نسبی نشان می‌دهد. در چنین شرایطی نباید صرفاً از ضعف سهام فناوری نتیجه گرفت که BTC هم الزاماً همان مسیر را دنبال می‌کند.",
      invalidationFa: "اگر همبستگی ۷ روزه BTC/Nasdaq دوباره بالای ۰٫۳۵ برود، روایت decoupling ضعیف می‌شود.",
      dataQuality: btcNasdaq?.dataQuality ?? "unavailable",
    });
  }

  if ((vixTrend ?? 0) > 3 && (btcTrend ?? 0) > 0.2) {
    signals.push({
      id: "price-vs-volatility-unstable-breakout",
      type: "price_vs_volatility",
      affectedAssets: ["BTC", "ETH", "SOL"],
      direction: biasFromSeverity("mixed"),
      severity: clampPercent(52 + (vixTrend ?? 0) * 2),
      confidence: 52,
      evidence: [`VIX 24h: ${vixTrend?.toFixed(2)}٪`, `BTC 24h: ${btcTrend?.toFixed(2)}٪`],
      interpretationFa: "قیمت در حالی بالا مانده که نوسان کلان رشد کرده است. این وضعیت می‌تواند breakout ناپایدار بسازد، مخصوصاً اگر funding و OI هم‌زمان بالا بروند.",
      invalidationFa: "کاهش VIX، افت leverage stress زیر ۶۵ و رشد spot volume بالای میانگین کوتاه‌مدت این هشدار را تضعیف می‌کند.",
      dataQuality: "partial_live",
    });
  }

  if (sentiment.sentimentScore > 12 && liquidity.liquiditySustainabilityScore !== undefined && liquidity.liquiditySustainabilityScore < 45) {
    signals.push({
      id: "sentiment-vs-liquidity-fragile-optimism",
      type: "price_vs_sentiment",
      affectedAssets: ["BTC", "ETH", "SOL"],
      direction: "mixed",
      severity: 61,
      confidence: sentiment.confidence.score ?? 0,
      evidence: [`sentiment score: ${sentiment.sentimentScore}`, `liquidity sustainability: ${liquidity.liquiditySustainabilityScore}/100`],
      interpretationFa: "سنتیمنت مثبت است اما نقدینگی پایدار آن را تأیید نمی‌کند. این ترکیب بیشتر «خوش‌بینی شکننده» است تا موج حمایتی قابل اتکا.",
      invalidationFa: "اگر پایداری نقدینگی بالای ۵۸ برود و spot/stablecoin flow مثبت شود، این واگرایی باطل می‌شود.",
      dataQuality: sentiment.confidence.available ? "partial_live" : "unavailable",
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    lastUpdatedAt: getEngineLastUpdatedAt(),
    signals: signals.sort((left, right) => right.severity - left.severity),
    summaryFa: signals.length ? "واگرایی‌ها نشان می‌دهند کدام حرکت قیمت با نقدینگی، ETF، سنتیمنت یا Nasdaq تأیید نشده است." : "واگرایی معناداری با داده فعلی شناسایی نشد.",
  };
}
