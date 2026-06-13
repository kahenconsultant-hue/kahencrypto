import type { DataPoint, DataQuality, NormalizedSignal } from "@/lib/types";

export type AdapterDiagnosticStatus = "success" | "degraded" | "failed";
export type AdapterBundleStatus = "success" | "degraded" | "failed";
export type AdapterDiagnosticClass = "core" | "optional";

type DiagnosticSignal = Pick<
  DataPoint | NormalizedSignal,
  "key" | "value" | "quality" | "source" | "timestamp" | "error" | "sampleSize"
>;

export interface AdapterDiagnosticRow {
  adapterName: string;
  source: string;
  class: AdapterDiagnosticClass;
  status: AdapterDiagnosticStatus;
  requiredInputs: string[];
  missingInputs: string[];
  outputMetricsGenerated: string[];
  freshnessMinutes: number | null;
  errorMessage: string | null;
  blocking: boolean;
}

export interface AdapterBundleBreakdown {
  status: AdapterBundleStatus;
  coreHealthy: number;
  coreTotal: number;
  optionalHealthy: number;
  optionalTotal: number;
  blockingFailures: string[];
  nonBlockingMissingInputs: string[];
  rows: AdapterDiagnosticRow[];
  summaryFa: string;
}

const adapterDefinitions: Array<{
  adapterName: string;
  source: string;
  class: AdapterDiagnosticClass;
  requiredInputs: string[];
  optionalInputs?: string[];
}> = [
  {
    adapterName: "Core market fallback adapter",
    source: "Binance spot public REST / Bybit public ticker / CoinGecko Simple Price fallback",
    class: "core",
    requiredInputs: ["btc_price_usd", "eth_price_usd", "sol_price_usd", "btc_volume_24h_usd", "eth_volume_24h_usd", "sol_volume_24h_usd"],
    optionalInputs: ["btc_trend_24h", "eth_trend_24h", "sol_trend_24h", "spot_volume_btc_24h", "spot_volume_eth_24h", "spot_volume_sol_24h"],
  },
  {
    adapterName: "Bybit derivatives adapter",
    source: "Bybit public REST target / Binance Futures public metrics currently consumed / CoinAnk proxy validation fallback",
    class: "optional",
    requiredInputs: ["funding_btc", "funding_eth", "funding_sol", "open_interest_btc_24h", "open_interest_eth_24h", "open_interest_sol_24h"],
    optionalInputs: ["liquidation_btc_24h"],
  },
  {
    adapterName: "DefiLlama stablecoin adapter",
    source: "DefiLlama public stablecoin API",
    class: "core",
    requiredInputs: ["usdt_supply_7d", "usdt_supply_30d", "usdc_supply_7d", "usdc_supply_30d", "stablecoin_market_cap_7d", "stablecoin_market_cap_30d", "total_stablecoin_market_cap_usd"],
    optionalInputs: ["stablecoin_dominance"],
  },
  {
    adapterName: "CoinGecko market cap enrichment",
    source: "CoinGecko public API",
    class: "optional",
    requiredInputs: ["btc_market_cap", "eth_market_cap", "sol_market_cap"],
    optionalInputs: ["stablecoin_dominance"],
  },
  {
    adapterName: "FRED macro adapter",
    source: "FRED API / Yahoo macro proxy fallback for market series",
    class: "core",
    requiredInputs: ["dxy_trend_24h", "us10y_trend_24h", "cpi_latest", "ppi_latest", "fed_funds_rate", "unemployment_rate"],
    optionalInputs: ["us2y_trend_24h", "yield_curve_10y2y"],
  },
  {
    adapterName: "RSS/news adapter",
    source: "Fed/CNBC/CoinDesk/Cointelegraph/Treasury/White House/NATO RSS baskets",
    class: "core",
    requiredInputs: ["news_sentiment_macro", "geopolitical_event_score"],
  },
  {
    adapterName: "ETF flow adapter",
    source: "Farside primary ETF tables with The Block public JSON fallback",
    class: "optional",
    requiredInputs: ["btc_etf_flow_24h", "eth_etf_flow_24h"],
    optionalInputs: ["btc_etf_flow_7d", "btc_etf_flow_30d", "eth_etf_flow_7d", "eth_etf_flow_30d"],
  },
  {
    adapterName: "Exchange flow adapter",
    source: "Glassnode/CryptoQuant configured source / MacroMicro BTC exchange balance proxy",
    class: "optional",
    requiredInputs: ["exchange_inflows", "exchange_outflows", "exchange_reserves_btc_7d"],
  },
  {
    adapterName: "CoinAnk derivatives proxy",
    source: "CoinAnk public site/API validation endpoints",
    class: "optional",
    requiredInputs: ["liquidation_btc_24h"],
  },
  {
    adapterName: "Whale tracking adapter",
    source: "Whale Alert API",
    class: "optional",
    requiredInputs: [],
  },
  {
    adapterName: "Glassnode adapter",
    source: "Glassnode API",
    class: "optional",
    requiredInputs: [],
  },
  {
    adapterName: "CryptoQuant adapter",
    source: "CryptoQuant API",
    class: "optional",
    requiredInputs: [],
  },
  {
    adapterName: "CoinGlass adapter",
    source: "CoinGlass API",
    class: "optional",
    requiredInputs: [],
  },
  {
    adapterName: "Trading Economics adapter",
    source: "Trading Economics API",
    class: "optional",
    requiredInputs: [],
  },
  {
    adapterName: "Reuters licensed feed",
    source: "Reuters licensed feed",
    class: "optional",
    requiredInputs: [],
  },
];

function minutesSince(timestamp: string | null | undefined) {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 60_000));
}

function isUsableQuality(quality: DataQuality) {
  return quality !== "unavailable" && quality !== "estimated";
}

function isAvailable(signal: DiagnosticSignal | undefined) {
  return Boolean(signal && typeof signal.value === "number" && Number.isFinite(signal.value) && isUsableQuality(signal.quality));
}

function buildSignalMap(signals: DiagnosticSignal[]) {
  return new Map(signals.map((signal) => [signal.key, signal]));
}

export function buildAdapterBundleBreakdown(signals: DiagnosticSignal[]): AdapterBundleBreakdown {
  const byKey = buildSignalMap(signals);
  const rows = adapterDefinitions.map((definition): AdapterDiagnosticRow => {
    const requiredSignals = definition.requiredInputs.map((key) => byKey.get(key));
    const optionalSignals = (definition.optionalInputs ?? []).map((key) => byKey.get(key));
    const outputMetricsGenerated = [...definition.requiredInputs, ...(definition.optionalInputs ?? [])].filter((key) => isAvailable(byKey.get(key)));
    const missingInputs = definition.requiredInputs.filter((key) => !isAvailable(byKey.get(key)));
    const freshnessValues = [...requiredSignals, ...optionalSignals]
      .map((signal) => minutesSince(signal?.timestamp))
      .filter((value): value is number => value !== null);
    const errorMessages = [...requiredSignals, ...optionalSignals]
      .map((signal) => signal?.error)
      .filter((message): message is string => Boolean(message));

    let status: AdapterDiagnosticStatus;
    if (!definition.requiredInputs.length) {
      status = "degraded";
    } else if (!missingInputs.length) {
      status = "success";
    } else if (outputMetricsGenerated.length) {
      status = "degraded";
    } else {
      status = "failed";
    }

    const notConfiguredMessage = !definition.requiredInputs.length ? "این enrichment اختیاری هنوز به منبع تولیدی وصل نیست." : null;

    return {
      adapterName: definition.adapterName,
      source: definition.source,
      class: definition.class,
      status,
      requiredInputs: definition.requiredInputs,
      missingInputs,
      outputMetricsGenerated,
      freshnessMinutes: freshnessValues.length ? Math.min(...freshnessValues) : null,
      errorMessage: errorMessages[0] ?? notConfiguredMessage,
      blocking: definition.class === "core" && status === "failed",
    };
  });

  const coreRows = rows.filter((row) => row.class === "core");
  const optionalRows = rows.filter((row) => row.class === "optional");
  const blockingFailures = coreRows.filter((row) => row.status === "failed").map((row) => row.adapterName);
  const nonBlockingMissingInputs = optionalRows
    .filter((row) => row.status !== "success")
    .flatMap((row) => (row.missingInputs.length ? row.missingInputs : [row.adapterName]));
  const hasCoreDegradation = coreRows.some((row) => row.status === "degraded");
  const hasOptionalGaps = optionalRows.some((row) => row.status !== "success");
  const status: AdapterBundleStatus = blockingFailures.length ? "failed" : hasCoreDegradation || hasOptionalGaps ? "degraded" : "success";

  return {
    status,
    coreHealthy: coreRows.filter((row) => row.status === "success").length,
    coreTotal: coreRows.length,
    optionalHealthy: optionalRows.filter((row) => row.status === "success").length,
    optionalTotal: optionalRows.length,
    blockingFailures,
    nonBlockingMissingInputs: Array.from(new Set(nonBlockingMissingInputs)),
    rows,
    summaryFa:
      status === "failed"
        ? `حداقل یک adapter هسته‌ای شکست خورده است: ${blockingFailures.join("، ")}`
        : status === "degraded"
          ? "هسته اصلی قابل استفاده است، اما بخشی از enrichment یا برخی ورودی‌ها کامل نیستند."
          : "تمام adapterهای هسته‌ای و اختیاری در این اجرای ingestion سالم بوده‌اند.",
  };
}
