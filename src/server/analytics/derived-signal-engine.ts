import type { AssetSymbol, DataQuality, NormalizedSignal } from "@/lib/types";
import { getSignalSnapshot } from "@/server/analytics/market-signals";
import { clampPercent, clampSigned } from "@/server/analytics/scoring-engine";
import {
  getLatestDerivedSignalsSync,
  getLatestLiquidityScoreSync,
  getLatestRegimeInputSync,
  persistDerivedSignals,
  persistLiquidityScoreSnapshot,
  persistRegimeInputSnapshot,
} from "@/storage/ingestion-store";
import type { DerivedSignalInput, LiquidityScoreSnapshotInput, RegimeInputSnapshotInput } from "@/types/ingestion";

type DerivedSignalKey =
  | "macro_pressure_proxy"
  | "crypto_liquidity_proxy"
  | "leverage_stress_proxy"
  | "institutional_risk_appetite_proxy"
  | "volatility_regime_proxy"
  | "stablecoin_liquidity_signal";

const requiredInputs: Record<DerivedSignalKey, string[]> = {
  macro_pressure_proxy: ["dxy_trend_24h", "us10y_trend_24h", "nasdaq_trend_24h", "gold_trend_24h"],
  crypto_liquidity_proxy: ["stablecoin_market_cap_7d", "spot_volume_btc_24h", "btc_trend_24h", "eth_trend_24h", "sol_trend_24h"],
  leverage_stress_proxy: ["btc_trend_24h", "spot_volume_btc_24h", "futures_volume_btc_24h", "funding_btc", "open_interest_btc_24h"],
  institutional_risk_appetite_proxy: ["btc_trend_24h", "nasdaq_trend_24h", "dxy_trend_24h", "gold_trend_24h", "stablecoin_market_cap_7d", "btc_etf_flow_24h"],
  volatility_regime_proxy: ["btc_trend_24h", "eth_trend_24h", "sol_trend_24h", "spot_volume_btc_24h", "vix_trend_24h"],
  stablecoin_liquidity_signal: ["stablecoin_market_cap_7d", "usdt_supply_7d", "usdc_supply_7d"],
};

const premiumInputs = new Set(["btc_etf_flow_24h", "eth_etf_flow_24h", "exchange_reserves_btc_7d"]);

function isAvailable(signal: NormalizedSignal | undefined) {
  return Boolean(signal && signal.value !== null && signal.quality !== "unavailable" && signal.quality !== "estimated");
}

function value(signals: Record<string, NormalizedSignal>, key: string) {
  const signal = signals[key];
  return isAvailable(signal) ? signal.value : null;
}

function usedInputs(signals: Record<string, NormalizedSignal>, keys: string[]) {
  return keys.filter((key) => isAvailable(signals[key]));
}

function missingInputs(signals: Record<string, NormalizedSignal>, keys: string[]) {
  return keys.filter((key) => !isAvailable(signals[key]));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0;
}

function qualityFor(signals: Record<string, NormalizedSignal>, keys: string[]): DataQuality {
  const selected = keys.map((key) => signals[key]).filter(Boolean);
  const available = selected.filter(isAvailable);
  if (!available.length) return "unavailable";
  if (available.some((signal) => signal.quality === "live") && available.length === selected.length) return "partial_live";
  if (available.some((signal) => signal.quality === "proxy")) return available.length < selected.length ? "partial_live" : "proxy";
  if (available.some((signal) => signal.quality === "delayed")) return available.length < selected.length ? "partial_live" : "delayed";
  return available.length < selected.length ? "partial_live" : "live";
}

function confidenceFor(signals: Record<string, NormalizedSignal>, keys: string[], sourceType: DerivedSignalInput["sourceType"]) {
  const used = usedInputs(signals, keys);
  if (used.length < Math.min(2, keys.length)) return null;
  const availability = (used.length / keys.length) * 100;
  const reliability = average(used.map((key) => signals[key]?.reliability ?? 0));
  const sample = average(used.map((key) => Math.min(100, ((signals[key]?.sampleSize ?? 1) / 30) * 100)));
  const proxyPenalty = sourceType === "proxy" ? 10 : sourceType === "derived" ? 5 : 0;
  const premiumMissingPenalty = keys.filter((key) => premiumInputs.has(key) && !isAvailable(signals[key])).length * 6;
  return clampPercent(availability * 0.34 + reliability * 0.34 + sample * 0.16 + 58 * 0.16 - proxyPenalty - premiumMissingPenalty);
}

function scoreDxy(valuePct: number | null) {
  if (valuePct === null) return null;
  if (valuePct <= -0.5) return 80;
  if (valuePct <= -0.15) return 40;
  if (valuePct < 0.15) return 0;
  if (valuePct < 0.5) return -40;
  return -80;
}

function scoreUs10y(valuePoint: number | null) {
  if (valuePoint === null) return null;
  const bps = valuePoint * 100;
  if (bps <= -8) return 80;
  if (bps <= -3) return 40;
  if (bps < 3) return 0;
  if (bps < 8) return -40;
  return -80;
}

function scoreNasdaq(valuePct: number | null) {
  if (valuePct === null) return null;
  if (valuePct >= 1.5) return 80;
  if (valuePct >= 0.5) return 40;
  if (valuePct > -0.5) return 0;
  if (valuePct > -1.5) return -40;
  return -80;
}

function scoreStablecoins(valuePct: number | null) {
  if (valuePct === null) return null;
  if (valuePct >= 0.35) return 60;
  if (valuePct <= -0.25) return -60;
  return 0;
}

function scoreVolume(valuePct: number | null) {
  if (valuePct === null) return null;
  if (valuePct >= 25) return 60;
  if (valuePct >= 8) return 30;
  if (valuePct <= -25) return -55;
  if (valuePct <= -8) return -25;
  return 0;
}

function weighted(values: Array<{ value: number | null; weight: number }>) {
  const available = values.filter((item): item is { value: number; weight: number } => item.value !== null && Number.isFinite(item.value));
  if (!available.length) return null;
  const total = available.reduce((sum, item) => sum + item.weight, 0);
  return clampSigned(available.reduce((sum, item) => sum + item.value * item.weight, 0) / total);
}

function buildSignal(params: {
  runId?: string;
  key: DerivedSignalKey;
  labelFa: string;
  sourceType: DerivedSignalInput["sourceType"];
  score: number | null;
  affectedAssets: AssetSymbol[];
  timeHorizon: string;
  explanationFa: string;
  formula: string;
  payload: Record<string, unknown>;
}): DerivedSignalInput {
  const signals = getSignalSnapshot().byKey;
  const keys = requiredInputs[params.key];
  return {
    runId: params.runId,
    signalKey: params.key,
    labelFa: params.labelFa,
    sourceType: params.score === null ? "unavailable" : params.sourceType,
    score: params.score,
    confidence: params.score === null ? null : confidenceFor(signals, keys, params.sourceType),
    quality: qualityFor(signals, keys),
    affectedAssets: params.affectedAssets,
    timeHorizon: params.timeHorizon,
    usedInputs: usedInputs(signals, keys),
    missingInputs: missingInputs(signals, keys),
    explanationFa: params.explanationFa,
    formula: params.formula,
    payload: params.payload,
    generatedAt: new Date().toISOString(),
  };
}

export function calculateDerivedSignals(runId?: string): DerivedSignalInput[] {
  const signals = getSignalSnapshot().byKey;
  const dxy = value(signals, "dxy_trend_24h");
  const us10y = value(signals, "us10y_trend_24h");
  const nasdaq = value(signals, "nasdaq_trend_24h");
  const gold = value(signals, "gold_trend_24h");
  const btc = value(signals, "btc_trend_24h");
  const eth = value(signals, "eth_trend_24h");
  const sol = value(signals, "sol_trend_24h");
  const stablecoins = value(signals, "stablecoin_market_cap_7d");
  const usdt = value(signals, "usdt_supply_7d");
  const usdc = value(signals, "usdc_supply_7d");
  const spotVolume = value(signals, "spot_volume_btc_24h");
  const futuresVolume = value(signals, "futures_volume_btc_24h");
  const funding = value(signals, "funding_btc");
  const openInterest = value(signals, "open_interest_btc_24h");
  const vix = value(signals, "vix_trend_24h");
  const etf = value(signals, "btc_etf_flow_24h");

  const macroPressureScore = weighted([
    { value: scoreDxy(dxy), weight: 0.32 },
    { value: scoreUs10y(us10y), weight: 0.32 },
    { value: scoreNasdaq(nasdaq), weight: 0.24 },
    { value: gold === null ? null : gold > 0.5 && (dxy ?? 0) > 0 ? -10 : gold > 0 ? 8 : 0, weight: 0.12 },
  ]);

  const cryptoLiquidityProxyScore = weighted([
    { value: scoreStablecoins(stablecoins), weight: 0.34 },
    { value: scoreVolume(spotVolume), weight: 0.22 },
    { value: btc === null ? null : clampSigned(btc * 12), weight: 0.18 },
    { value: eth === null ? null : clampSigned(eth * 10), weight: 0.13 },
    { value: sol === null ? null : clampSigned(sol * 8), weight: 0.13 },
  ]);

  const leverageHeat = weighted([
    { value: funding === null ? null : funding > 0.06 ? -85 : funding > 0.025 ? -60 : funding > 0 ? -18 : 10, weight: 0.28 },
    { value: openInterest === null ? null : openInterest >= 8 ? -75 : openInterest >= 3 ? -45 : openInterest <= -5 ? 15 : 0, weight: 0.28 },
    {
      value: futuresVolume === null ? null : clampSigned(-Math.max(0, futuresVolume - Math.max(0, spotVolume ?? 0)) * 4 + Math.max(0, spotVolume ?? 0)),
      weight: 0.24,
    },
    { value: btc === null || spotVolume === null ? null : clampSigned(-Math.abs(btc) * 6 + scoreVolume(spotVolume)! * 0.25), weight: 0.2 },
  ]);

  const institutionalRiskAppetiteScore = weighted([
    { value: btc === null ? null : clampSigned(btc * 12), weight: 0.25 },
    { value: scoreNasdaq(nasdaq), weight: 0.22 },
    { value: scoreDxy(dxy), weight: 0.2 },
    { value: gold === null ? null : gold > 0.5 && (dxy ?? 0) > 0 ? -12 : gold > 0 ? 12 : -8, weight: 0.1 },
    { value: scoreStablecoins(stablecoins), weight: 0.15 },
    { value: etf === null ? null : clampSigned(etf / 2_000_000), weight: 0.08 },
  ]);

  const volatilityScore = weighted([
    { value: btc === null ? null : clampSigned(-Math.abs(btc) * 16), weight: 0.24 },
    { value: eth === null ? null : clampSigned(-Math.abs(eth) * 13), weight: 0.18 },
    { value: sol === null ? null : clampSigned(-Math.abs(sol) * 10), weight: 0.18 },
    { value: spotVolume === null ? null : clampSigned(-Math.max(0, spotVolume - 20) * 2), weight: 0.18 },
    { value: vix === null ? null : clampSigned(-vix * 5), weight: 0.22 },
  ]);

  const stablecoinLiquiditySignal = weighted([
    { value: scoreStablecoins(stablecoins), weight: 0.5 },
    { value: scoreStablecoins(usdt), weight: 0.32 },
    { value: scoreStablecoins(usdc), weight: 0.18 },
  ]);

  return [
    buildSignal({
      runId,
      key: "macro_pressure_proxy",
      labelFa: "پروکسی فشار کلان",
      sourceType: "proxy",
      score: macroPressureScore,
      affectedAssets: ["BTC", "ETH", "SOL", "DXY", "Gold", "Nasdaq", "US10Y"],
      timeHorizon: "24h-7d",
      explanationFa:
        macroPressureScore === null
          ? "داده کافی برای ساخت پروکسی فشار کلان وجود ندارد."
          : macroPressureScore < -25
            ? "دلار، نرخ بهره یا ضعف نزدک در جهت فشار بر دارایی‌های پرریسک حرکت می‌کنند؛ این خروجی پروکسی است و جایگزین داده نهادی کامل نیست."
            : macroPressureScore > 25
              ? "ترکیب دلار/نرخ/نزدک فعلاً برای ریسک‌پذیری کریپتو حمایتی‌تر است، اما این تحلیل با داده‌های عمومی و پروکسی ساخته شده است."
              : "فشار کلان در محدوده خنثی یا دوگانه است؛ جهت‌گیری قوی فقط با هم‌راستایی DXY، US10Y و Nasdaq معتبر می‌شود.",
      formula: "macro_pressure_proxy = 0.32×DXY score + 0.32×US10Y score + 0.24×Nasdaq score + 0.12×Gold hedge adjustment",
      payload: { dxy, us10y, nasdaq, gold },
    }),
    buildSignal({
      runId,
      key: "crypto_liquidity_proxy",
      labelFa: "پروکسی نقدینگی کریپتو",
      sourceType: "proxy",
      score: cryptoLiquidityProxyScore,
      affectedAssets: ["BTC", "ETH", "SOL", "USDT"],
      timeHorizon: "24h-7d",
      explanationFa:
        cryptoLiquidityProxyScore === null
          ? "داده کافی برای پروکسی نقدینگی کریپتو وجود ندارد."
          : cryptoLiquidityProxyScore > 25
            ? "استیبل‌کوین، حجم اسپات یا روند قیمت‌ها از نقدینگی کوتاه‌مدت حمایت می‌کنند؛ چون ETF و ذخایر صرافی کامل نیستند، نتیجه با برچسب proxy نمایش داده می‌شود."
            : cryptoLiquidityProxyScore < -25
              ? "نقدینگی عمومی کریپتو حمایتی نیست؛ اگر رشد قیمت رخ دهد باید با حجم اسپات و استیبل‌کوین راستی‌آزمایی شود."
              : "نقدینگی کریپتو از داده‌های عمومی نشانه قوی نمی‌دهد و خروجی باید محتاطانه خوانده شود.",
      formula: "crypto_liquidity_proxy = 0.34×stablecoin trend + 0.22×spot volume + weighted BTC/ETH/SOL momentum",
      payload: { stablecoins, spotVolume, btc, eth, sol },
    }),
    buildSignal({
      runId,
      key: "leverage_stress_proxy",
      labelFa: "پروکسی فشار اهرمی",
      sourceType: "proxy",
      score: leverageHeat,
      affectedAssets: ["BTC", "ETH", "SOL"],
      timeHorizon: "intraday-3d",
      explanationFa:
        leverageHeat === null
          ? "داده کافی برای سنجش فشار اهرمی وجود ندارد."
          : leverageHeat < -35
            ? "رشد فاندینگ، موقعیت‌های باز یا برتری حجم فیوچرز نسبت به اسپات ریسک برگشت تند و لیکوییدیشن را بالا می‌برد."
            : "از داده‌های عمومی Binance فشار اهرمی بحرانی تأیید نشده است؛ این نتیجه با نبود داده CoinGlass همچنان proxy است.",
      formula: "leverage_stress_proxy = funding heat + OI heat + futures-vs-spot imbalance + price acceleration",
      payload: { funding, openInterest, futuresVolume, spotVolume, btc },
    }),
    buildSignal({
      runId,
      key: "institutional_risk_appetite_proxy",
      labelFa: "پروکسی اشتهای ریسک نهادی",
      sourceType: "proxy",
      score: institutionalRiskAppetiteScore,
      affectedAssets: ["BTC", "ETH", "SOL", "Nasdaq", "DXY", "Gold"],
      timeHorizon: "24h-7d",
      explanationFa:
        institutionalRiskAppetiteScore === null
          ? "داده کافی برای اشتهای ریسک نهادی وجود ندارد."
          : institutionalRiskAppetiteScore > 25
            ? "رفتار BTC، نزدک و فشار دلار نشان می‌دهد اشتهای ریسک بهتر شده، اما نبود ETF flow مستقیم confidence را محدود می‌کند."
            : institutionalRiskAppetiteScore < -25
              ? "داده‌های عمومی نشان می‌دهند ریسک‌پذیری نهادی یا شبه‌نهادی ضعیف است؛ تأیید ETF اگر اضافه شود می‌تواند این برداشت را تغییر دهد."
              : "اشتهای ریسک نهادی از داده‌های عمومی جهت مشخصی ندارد.",
      formula: "institutional_risk_appetite_proxy = BTC trend + Nasdaq trend + inverse DXY + Gold adjustment + stablecoin trend + optional ETF flow",
      payload: { btc, nasdaq, dxy, gold, stablecoins, etf },
    }),
    buildSignal({
      runId,
      key: "volatility_regime_proxy",
      labelFa: "پروکسی رژیم نوسان",
      sourceType: "proxy",
      score: volatilityScore,
      affectedAssets: ["BTC", "ETH", "SOL"],
      timeHorizon: "intraday-7d",
      explanationFa:
        volatilityScore === null
          ? "داده کافی برای رژیم نوسان وجود ندارد."
          : volatilityScore < -35
            ? "دامنه حرکت قیمت، حجم و VIX نشان می‌دهد نوسان در حال گسترش است؛ در چنین وضعیتی confidence تحلیل جهت‌دار کاهش می‌یابد."
            : "پروکسی نوسان فعلاً فشار غیرعادی نشان نمی‌دهد، اما این خروجی جایگزین داده آپشن یا DVOL نیست.",
      formula: "volatility_regime_proxy = realized price movement + volume expansion + VIX proxy",
      payload: { btc, eth, sol, spotVolume, vix },
    }),
    buildSignal({
      runId,
      key: "stablecoin_liquidity_signal",
      labelFa: "سیگنال نقدینگی استیبل‌کوین",
      sourceType: "derived",
      score: stablecoinLiquiditySignal,
      affectedAssets: ["USDT", "BTC", "ETH", "SOL"],
      timeHorizon: "7d",
      explanationFa:
        stablecoinLiquiditySignal === null
          ? "داده کافی برای استیبل‌کوین‌ها وجود ندارد."
          : stablecoinLiquiditySignal > 20
            ? "عرضه استیبل‌کوین‌ها در حال رشد است و می‌تواند سوخت نقدینگی نقدی بازار را تقویت کند؛ اثر آن باید با حجم اسپات تأیید شود."
            : stablecoinLiquiditySignal < -20
              ? "عرضه استیبل‌کوین‌ها حمایتی نیست و می‌تواند نشانه کاهش ظرفیت خرید نقدی باشد."
              : "استیبل‌کوین‌ها در محدوده خنثی هستند و هنوز نشانه قوی از ورود یا خروج نقدینگی نقدی نمی‌دهند.",
      formula: "stablecoin_liquidity_signal = 0.50×total stablecoin supply + 0.32×USDT + 0.18×USDC",
      payload: { stablecoins, usdt, usdc },
    }),
  ];
}

export function buildLiquidityProxySnapshot(runId?: string): LiquidityScoreSnapshotInput {
  const signals = calculateDerivedSignals(runId);
  const byKey = Object.fromEntries(signals.map((signal) => [signal.signalKey, signal]));
  const generatedAt = new Date().toISOString();
  const macro = byKey.macro_pressure_proxy?.score ?? null;
  const crypto = byKey.crypto_liquidity_proxy?.score ?? null;
  const stablecoin = byKey.stablecoin_liquidity_signal?.score ?? null;
  const usedConfidences = [byKey.macro_pressure_proxy, byKey.crypto_liquidity_proxy, byKey.stablecoin_liquidity_signal]
    .map((signal) => signal?.confidence)
    .filter((item): item is number => typeof item === "number");
  const unavailablePremiumInputs = ["ETF flows", "exchange reserves", "Glassnode/CryptoQuant reserves"].filter((name) =>
    name === "ETF flows" ? byKey.institutional_risk_appetite_proxy?.missingInputs.includes("btc_etf_flow_24h") : true,
  );
  return {
    runId,
    scoreKey: "free_data_liquidity_proxy",
    sourceType: crypto === null && macro === null ? "unavailable" : "proxy",
    cryptoLiquidityProxyScore: crypto,
    macroLiquidityPressureScore: macro,
    stablecoinPressure: stablecoin,
    confidence: usedConfidences.length ? clampPercent(average(usedConfidences) - unavailablePremiumInputs.length * 2) : null,
    quality: [byKey.macro_pressure_proxy, byKey.crypto_liquidity_proxy, byKey.stablecoin_liquidity_signal].some((signal) => signal?.quality === "partial_live")
      ? "partial_live"
      : byKey.crypto_liquidity_proxy?.quality ?? "unavailable",
    unavailablePremiumInputs,
    explanationFa:
      "این امتیاز نقدینگی از داده‌های عمومی و پروکسی ساخته می‌شود: DefiLlama، Binance، CoinGecko/Yahoo proxy و RSS. نبود ETF یا ذخایر صرافی کل تحلیل را قطع نمی‌کند، اما confidence را پایین می‌آورد.",
    payload: { derivedSignals: signals },
    generatedAt,
  };
}

export function buildRegimeInputSnapshot(runId?: string): RegimeInputSnapshotInput {
  const signals = calculateDerivedSignals(runId);
  const byKey = Object.fromEntries(signals.map((signal) => [signal.signalKey, signal]));
  const macro = byKey.macro_pressure_proxy?.score;
  const liquidity = byKey.crypto_liquidity_proxy?.score;
  const volatility = byKey.volatility_regime_proxy?.score;
  const leverage = byKey.leverage_stress_proxy?.score;
  const stablecoin = byKey.stablecoin_liquidity_signal?.score;
  const used = signals.filter((signal) => signal.score !== null).map((signal) => signal.signalKey);
  const missing = signals.filter((signal) => signal.score === null).map((signal) => signal.signalKey);
  let regime = "neutral_mixed";
  if (used.length < 3) regime = "insufficient_core_data";
  else if ((macro ?? 0) < -35) regime = "macro_pressure";
  else if ((liquidity ?? 0) < -30 || (stablecoin ?? 0) < -35) regime = "liquidity_contraction_proxy";
  else if ((volatility ?? 0) < -38) regime = "volatility_expansion";
  else if ((leverage ?? 0) < -45) regime = "leverage_stress_proxy";
  else if ((liquidity ?? 0) > 30 && (macro ?? 0) > -10) regime = "liquidity_expansion_proxy";
  else if ((macro ?? 0) > 20 && (liquidity ?? 0) > 15) regime = "risk_on";
  else if ((macro ?? 0) < -20 && (liquidity ?? 0) < 10) regime = "risk_off";
  const confidences = signals.map((signal) => signal.confidence).filter((item): item is number => typeof item === "number");
  return {
    runId,
    regimeKey: "free_data_regime_proxy",
    sourceType: used.length < 3 ? "unavailable" : "proxy",
    regime,
    confidence: confidences.length ? clampPercent(average(confidences) - (regime === "neutral_mixed" ? 5 : 0)) : null,
    quality: used.length < 3 ? "unavailable" : "partial_live",
    usedInputs: used,
    missingInputs: missing,
    explanationFa:
      regime === "insufficient_core_data"
        ? "داده‌های عمومی اصلی برای تشخیص رژیم کافی نیستند."
        : "رژیم بازار از پروکسی‌های عمومی ساخته شده است؛ نبود داده‌های premium مثل CoinGlass، Glassnode یا ETF مستقیم باعث کاهش confidence می‌شود، نه توقف کل تحلیل.",
    payload: { derivedSignals: signals },
    generatedAt: new Date().toISOString(),
  };
}

export async function runDerivedSignalProcessing(runId?: string) {
  const signals = calculateDerivedSignals(runId);
  const liquidity = buildLiquidityProxySnapshot(runId);
  const regimeInput = buildRegimeInputSnapshot(runId);
  const [derivedStore, liquidityStore, regimeStore] = await Promise.all([
    persistDerivedSignals(signals),
    persistLiquidityScoreSnapshot(liquidity),
    persistRegimeInputSnapshot(regimeInput),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    derivedSignals: signals,
    liquidity,
    regimeInput,
    persisted: {
      derivedSignals: derivedStore.persisted,
      derivedSignalsStorageMode: derivedStore.storageMode,
      liquidityStorageMode: liquidityStore,
      regimeInputStorageMode: regimeStore,
    },
  };
}

export function getDerivedSignalReport() {
  const latest = getLatestDerivedSignalsSync();
  const signals = latest.length ? latest : calculateDerivedSignals();
  return {
    generatedAt: new Date().toISOString(),
    signals,
    liquidity: getLatestLiquidityScoreSync() ?? buildLiquidityProxySnapshot(),
    regimeInput: getLatestRegimeInputSync() ?? buildRegimeInputSnapshot(),
  };
}
