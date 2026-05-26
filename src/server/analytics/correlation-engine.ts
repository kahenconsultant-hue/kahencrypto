import type { AssetSymbol, CorrelationPair, CorrelationSignal, CorrelationState } from "@/lib/types";
import { buildReturnSeries, getEngineLastUpdatedAt, getSignalSnapshot, type SeriesKey } from "@/server/analytics/market-signals";
import { calculateConfidenceScore, clampPercent } from "@/server/analytics/scoring-engine";

type CorrelationWindow = "24h" | "7d" | "30d" | "90d";

const minimumSamples: Record<CorrelationWindow, number> = {
  "24h": 20,
  "7d": 30,
  "30d": 30,
  "90d": 60,
};

const windowSamples: Record<CorrelationWindow, number> = {
  "24h": 24,
  "7d": 168,
  "30d": 30,
  "90d": 90,
};

const pairDefinitions: Array<{
  id: string;
  label: string;
  left: AssetSymbol | "VIX" | "Stablecoin dominance";
  right: AssetSymbol | "VIX" | "Stablecoin dominance" | "Liquidity" | "ETF flows" | "Tech Beta" | "Retail Risk Appetite";
}> = [
  { id: "btc-nasdaq", label: "BTC ↔ Nasdaq", left: "BTC", right: "Nasdaq" },
  { id: "btc-dxy", label: "BTC ↔ DXY", left: "BTC", right: "DXY" },
  { id: "btc-gold", label: "BTC ↔ Gold", left: "BTC", right: "Gold" },
  { id: "btc-us10y", label: "BTC ↔ US10Y", left: "BTC", right: "US10Y" },
  { id: "eth-btc", label: "ETH ↔ BTC", left: "ETH", right: "BTC" },
  { id: "sol-btc", label: "SOL ↔ BTC", left: "SOL", right: "BTC" },
  { id: "eth-nasdaq", label: "ETH ↔ Nasdaq", left: "ETH", right: "Nasdaq" },
  { id: "sol-nasdaq", label: "SOL ↔ Nasdaq", left: "SOL", right: "Nasdaq" },
  { id: "btc-vix", label: "BTC ↔ VIX", left: "BTC", right: "VIX" },
  { id: "btc-stablecoin-dominance", label: "BTC ↔ Stablecoin dominance", left: "BTC", right: "Stablecoin dominance" },
  { id: "btc-etf", label: "BTC ↔ ETF flows", left: "BTC", right: "ETF flows" },
];

export function rollingCorrelation(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (length < 2) return null;

  const xs = left.slice(-length);
  const ys = right.slice(-length);
  const avgX = xs.reduce((sum, value) => sum + value, 0) / length;
  const avgY = ys.reduce((sum, value) => sum + value, 0) / length;
  const numerator = xs.reduce((sum, value, index) => sum + (value - avgX) * (ys[index] - avgY), 0);
  const denomX = Math.sqrt(xs.reduce((sum, value) => sum + (value - avgX) ** 2, 0));
  const denomY = Math.sqrt(ys.reduce((sum, value) => sum + (value - avgY) ** 2, 0));

  if (denomX === 0 || denomY === 0) return null;
  return Number((numerator / (denomX * denomY)).toFixed(2));
}

function correlationForWindow(left: SeriesKey, right: SeriesKey, window: CorrelationWindow) {
  const frequency = window === "24h" || window === "7d" ? "intraday" : "daily";
  const leftReturns = buildReturnSeries(left, frequency).slice(-windowSamples[window]);
  const rightReturns = buildReturnSeries(right, frequency).slice(-windowSamples[window]);
  const sampleSize = Math.min(leftReturns.length, rightReturns.length);
  if (sampleSize < minimumSamples[window]) return { value: null, sampleSize };
  return { value: rollingCorrelation(leftReturns, rightReturns), sampleSize };
}

function previousCorrelationForWindow(left: SeriesKey, right: SeriesKey, window: CorrelationWindow) {
  const frequency = window === "24h" || window === "7d" ? "intraday" : "daily";
  const windowSize = windowSamples[window];
  const leftReturns = buildReturnSeries(left, frequency);
  const rightReturns = buildReturnSeries(right, frequency);
  const previousLeft = leftReturns.slice(-windowSize * 2, -windowSize);
  const previousRight = rightReturns.slice(-windowSize * 2, -windowSize);
  const sampleSize = Math.min(previousLeft.length, previousRight.length);
  if (sampleSize < minimumSamples[window]) return null;
  return rollingCorrelation(previousLeft, previousRight);
}

export function classifyCorrelation(value: number | null) {
  if (value === null) return "نمونه ناکافی";
  if (value >= 0.7) return "مثبت قوی";
  if (value >= 0.35) return "مثبت متوسط";
  if (value <= -0.7) return "منفی قوی";
  if (value <= -0.35) return "منفی متوسط";
  return "ضعیف / ناپایدار";
}

export function detectCorrelationState(signal: Pick<CorrelationSignal, "correlation24H" | "correlation7D" | "correlation30D" | "correlation90D" | "previous90D">): CorrelationState {
  if ([signal.correlation24H, signal.correlation7D, signal.correlation30D, signal.correlation90D].some((value) => value === null)) return "unstable";
  const c24 = signal.correlation24H ?? 0;
  const c7 = signal.correlation7D ?? 0;
  const c30 = signal.correlation30D ?? 0;
  const c90 = signal.correlation90D ?? 0;
  const previous90 = signal.previous90D ?? c90;
  const shortMediumGap = Math.abs(c7 - c30);
  const regimeShift = Math.abs(c90 - previous90);

  if (Math.abs(c24 - c7) >= 0.5) return "unstable";
  if (c7 <= -0.35 || c30 <= -0.35) return "inverse_correlation";
  if (shortMediumGap > 0.6 || (Math.sign(c7) !== Math.sign(c30) && Math.abs(c7) > 0.35 && Math.abs(c30) > 0.35)) return "unstable";
  if (Math.abs(c7) < 0.22 && Math.abs(c30) >= 0.42) return "decoupling";
  if (regimeShift >= 0.22 || Math.abs(c7) < Math.abs(c90) - 0.18) return "weakening";
  if (c30 >= 0.58 && c90 >= 0.52) return "strongly_correlated";
  return "weakening";
}

function signed(value: number | null) {
  if (value === null) return "ناموجود";
  return value.toFixed(2);
}

function pairInterpretation(pair: string, signal: CorrelationSignal) {
  const sampleWarning = Object.entries(signal.sampleSizes ?? {})
    .filter(([window, sample]) => sample < minimumSamples[window as CorrelationWindow])
    .map(([window]) => window);
  if (sampleWarning.length) {
    return `برای ${pair} نمونه کافی در پنجره‌های ${sampleWarning.join("، ")} وجود ندارد؛ بنابراین سیستم همبستگی قطعی یا عدد ساختگی نمایش نمی‌دهد. تا تکمیل history از منبع قیمت، این کارت فقط وضعیت کیفیت داده را نشان می‌دهد.`;
  }

  const c7Magnitude = Math.abs(signal.correlation7D ?? 0);
  const c30Magnitude = Math.abs(signal.correlation30D ?? 0);
  if (c7Magnitude < 0.1) {
    return `${pair}: همبستگی ۷ روزه ${signed(signal.correlation7D)} است؛ این رابطه از نظر آماری ضعیف است و نباید از آن نتیجه جهت‌دار ساخته شود. در این وضعیت، تفسیر درست «جدایی نسبی» است، نه risk-on یا hedge قطعی.`;
  }
  if (c7Magnitude < 0.2 && c30Magnitude < 0.35) {
    return `${pair}: همبستگی ۷ روزه ${signed(signal.correlation7D)} و ۳۰ روزه ${signed(signal.correlation30D)} است؛ رابطه ضعیف/ناپایدار است. شدت روایت پایین نگه داشته می‌شود تا خروجی بیش از کیفیت داده ادعا نکند.`;
  }

  if (pair === "BTC ↔ DXY" && (signal.correlation24H ?? 0) > 0.35) {
    return `رابطه کوتاه‌مدت BTC/DXY در ۲۴ ساعت اخیر مثبت شده (${signed(signal.correlation24H)}) و با رابطه معکوس معمول بازار هم‌خوان نیست. این یعنی فعلاً نباید فشار دلار را مکانیکی تفسیر کرد؛ اگر پنجره ۷ روزه دوباره منفی شود، کانال دلار برای BTC و ETH فعال‌تر می‌شود.`;
  }

  if (pair === "BTC ↔ DXY") {
    return `همبستگی ۷ روزه BTC/DXY برابر ${signed(signal.correlation7D)} و پنجره ۳۰ روزه برابر ${signed(signal.correlation30D)} است. هرچه این رابطه منفی‌تر شود، تقویت دلار با احتمال بیشتری به فشار نقدینگی روی BTC، ETH و SOL منتقل می‌شود.`;
  }

  if (pair === "BTC ↔ Nasdaq") {
    return `همبستگی ۷ روزه BTC/Nasdaq برابر ${signed(signal.correlation7D)} و ۳۰ روزه برابر ${signed(signal.correlation30D)} است. اگر این رابطه هم‌زمان با ضعف Nasdaq بالا بماند، BTC بیشتر در نقش دارایی ریسک‌پذیر معامله می‌شود تا پوشش ریسک کلان.`;
  }

  if (pair === "BTC ↔ Gold") {
    return `همبستگی BTC/Gold در پنجره ۷ روزه ${signed(signal.correlation7D)} است. افزایش این عدد در دوره تنش ژئوپلیتیک می‌تواند روایت hedge macro را تقویت کند، اما فقط وقتی معتبر است که فشار DXY و US10Y هم شدیدتر نشود.`;
  }

  if (pair.includes("US10Y")) {
    return `رابطه ${pair} در ۷ روز ${signed(signal.correlation7D)} است. اگر همبستگی با بازده اوراق منفی‌تر شود، کانال نرخ تنزیل برای دارایی‌های پرریسک فعال‌تر شده و جریان ETF باید برای خنثی کردن آن قوی‌تر باشد.`;
  }

  return `${pair}: همبستگی ۷ روزه ${signed(signal.correlation7D)}، ۳۰ روزه ${signed(signal.correlation30D)} و ۹۰ روزه ${signed(signal.correlation90D)} است. تفسیر فقط از همین اعداد و کیفیت نمونه ساخته شده و در صورت نمونه ناکافی نتیجه جهت‌دار تولید نمی‌شود.`;
}

function regimeImpact(pair: string, signal: CorrelationSignal) {
  if (signal.correlation7D === null || signal.correlation30D === null) return "داده کافی برای اثر رژیمی معتبر وجود ندارد.";
  if (Math.abs(signal.correlation7D) < 0.1) return "اثر رژیمی نامعتبر است؛ همبستگی ۷ روزه نزدیک صفر است و سیستم از نتیجه جهت‌دار خودداری می‌کند.";
  if (Math.abs(signal.correlation7D) < 0.2) return "اثر رژیمی ضعیف است؛ فقط به‌عنوان نشانه decoupling یا ناپایداری رابطه خوانده می‌شود.";
  if (Math.abs(signal.correlation7D - signal.correlation30D) > 0.6) return "اختلاف شدید پنجره ۷ و ۳۰ روزه نشان‌دهنده شکست رابطه قبلی است؛ alert فقط در صورت هم‌زمانی با نوسان یا فشار نقدینگی اولویت بالا می‌گیرد.";
  if (pair === "BTC ↔ Nasdaq" && signal.correlation7D > 0.35) return "BTC در معرض کانال risk-on/risk-off سهام فناوری است.";
  if (pair === "BTC ↔ DXY" && signal.correlation7D < -0.35) return "کانال دلار فعال است و رشد DXY می‌تواند برای BTC، ETH و SOL فشارزا باشد.";
  if (pair === "BTC ↔ Gold" && signal.correlation7D > 0.35) return "روایت پوشش ریسک کلان در حال تقویت است، اما با فشار نرخ و دلار باید راستی‌آزمایی شود.";
  return "اثر رژیمی فعلاً متوسط است و باید کنار نقدینگی، نوسان و جریان سرمایه تفسیر شود.";
}

function correlationDataQuality(signals: CorrelationSignal[]) {
  if (!signals.length || signals.every((signal) => signal.correlation7D === null && signal.correlation30D === null)) return "unavailable" as const;
  if (signals.some((signal) => signal.correlation7D === null || signal.correlation30D === null)) return "partial_live" as const;
  return "delayed" as const;
}

export function buildCorrelationSignal(definition: (typeof pairDefinitions)[number]): CorrelationSignal {
  const left = definition.left as SeriesKey;
  const right = definition.right as SeriesKey;
  const c24 = correlationForWindow(left, right, "24h");
  const c7 = correlationForWindow(left, right, "7d");
  const c30 = correlationForWindow(left, right, "30d");
  const c90 = correlationForWindow(left, right, "90d");
  const previous90D = previousCorrelationForWindow(left, right, "90d");
  const correlationChange = c7.value !== null && c30.value !== null ? Number((c7.value - c30.value).toFixed(2)) : null;
  const baseSignal = {
    assetPair: definition.label,
    left: definition.left,
    right: definition.right,
    correlation24H: c24.value,
    previous24H: previousCorrelationForWindow(left, right, "24h"),
    correlation7D: c7.value,
    correlation30D: c30.value,
    correlation90D: c90.value,
    previous90D,
    correlationChange,
    sampleSizes: { "24h": c24.sampleSize, "7d": c7.sampleSize, "30d": c30.sampleSize, "90d": c90.sampleSize },
  };
  const state = detectCorrelationState(baseSignal);
  const snapshot = getSignalSnapshot();
  const confidence = calculateConfidenceScore({
    signals: snapshot.signals,
    signalAgreement: c7.value !== null && c30.value !== null ? clampPercent(100 - Math.abs(c7.value - c30.value) * 85) : 20,
    historicalConsistency: c90.value !== null && previous90D !== null ? clampPercent(100 - Math.abs(c90.value - previous90D) * 100) : 30,
    marketConfirmation: c7.value !== null ? 64 : 20,
  });
  const signal: CorrelationSignal = {
    ...baseSignal,
    state,
    confidence: confidence.score,
    interpretation: "",
    regimeImpact: "",
    dataQuality: c7.value === null || c30.value === null ? "unavailable" : "delayed",
    lastUpdatedAt: getEngineLastUpdatedAt(),
  };

  return {
    ...signal,
    interpretation: pairInterpretation(definition.label, signal),
    regimeImpact: regimeImpact(definition.label, signal),
  };
}

export function getCorrelationSignals() {
  return pairDefinitions.map(buildCorrelationSignal);
}

export function getCorrelationMatrix() {
  const assets: SeriesKey[] = ["BTC", "ETH", "SOL", "DXY", "Gold", "Nasdaq", "US10Y", "VIX", "Stablecoin dominance"];

  return assets.map((row) => ({
    asset: row,
    values: assets.map((column) => {
      if (row === column) {
        const series = buildReturnSeries(row, "daily");
        return series.length >= minimumSamples["30d"] ? 1 : null;
      }
      return correlationForWindow(row, column, "30d").value;
    }),
  }));
}

function legacyPair(signal: CorrelationSignal, id: string): CorrelationPair {
  const sampleSizes = signal.sampleSizes ?? { "24h": 0, "7d": 0, "30d": 0, "90d": 0 };
  const sampleWarning = Object.entries(sampleSizes)
    .filter(([window, sample]) => sample < minimumSamples[window as CorrelationWindow])
    .map(([window, sample]) => `${window}: ${sample}/${minimumSamples[window as CorrelationWindow]}`)
    .join("، ");

  return {
    id,
    pair: signal.assetPair,
    left: signal.left as AssetSymbol,
    right: signal.right,
    rolling7d: signal.correlation7D,
    rolling24h: signal.correlation24H,
    rolling30d: signal.correlation30D,
    rolling90d: signal.correlation90D,
    change7d: signal.correlationChange,
    sampleSize: Math.min(...Object.values(sampleSizes)),
    sampleWarning: sampleWarning || undefined,
    regimeState: signal.state,
    interpretationFa: signal.interpretation,
    regimeImpact: signal.regimeImpact,
    confidence: signal.confidence,
    dataQuality: signal.dataQuality,
  };
}

export function getDynamicCorrelationReport() {
  const signals = getCorrelationSignals();
  const validSignals = signals.filter((signal) => signal.correlationChange !== null);

  return {
    generatedAt: new Date().toISOString(),
    lastUpdatedAt: getEngineLastUpdatedAt(),
    dataQuality: correlationDataQuality(signals),
    signals,
    topStrengthening: [...validSignals].sort((a, b) => (b.correlationChange ?? 0) - (a.correlationChange ?? 0)).slice(0, 3),
    topWeakening: [...validSignals].sort((a, b) => (a.correlationChange ?? 0) - (b.correlationChange ?? 0)).slice(0, 3),
    breakdownAlerts: validSignals
      .filter((signal) => {
        if (signal.correlation7D === null || signal.correlation30D === null) return false;
        return Math.abs(signal.correlation7D - signal.correlation30D) > 0.6 || (Math.sign(signal.correlation7D) !== Math.sign(signal.correlation30D) && Math.abs(signal.correlation7D) > 0.35 && Math.abs(signal.correlation30D) > 0.35);
      })
      .map((signal) => ({
        pair: signal.assetPair,
        change: signal.correlationChange,
        interpretation: signal.regimeImpact,
        traderInterpretation: signal.regimeImpact,
      })),
    pairs: signals.map((signal, index) => legacyPair(signal, pairDefinitions[index].id)),
    matrix: getCorrelationMatrix(),
    interpretationFa:
      "موتور همبستگی فقط از بازده لگاریتمی سری‌های واقعی موجود در cache استفاده می‌کند. اگر sample size کافی نباشد، عدد همبستگی، confidence یا هشدار شکست رابطه تولید نمی‌شود.",
  };
}
