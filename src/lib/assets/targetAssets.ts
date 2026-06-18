export type AssetCoverageTier = "full" | "medium" | "lite" | "stablecoin_monitor";

export type TargetAssetSymbol =
  | "USDT"
  | "BTC"
  | "TRX"
  | "ETH"
  | "TON"
  | "SOL"
  | "XRP"
  | "DOGE"
  | "BNB"
  | "ADA";

export type AssetRegistryItem = {
  symbol: TargetAssetSymbol;
  name: string;
  persianName: string;
  coingeckoId: string;
  category: "store_of_value" | "smart_contract" | "exchange" | "payments" | "meme" | "stablecoin" | "ecosystem";
  coverageTier: AssetCoverageTier;
  binanceFuturesSymbol?: string;
  allowDirectETF: boolean;
  allowPriceBias: boolean;
  allowDerivativesIfAvailable: boolean;
  allowCorrelationOnlyIfSamplesEnough: boolean;
  publicFactorMap: string[];
};

export const TARGET_ASSET_UNIVERSE_LABEL_FA = "فهرست پایش دارایی‌های پرکاربرد/پرمخاطب برای بازار ایران";
export const TARGET_ASSET_UNIVERSE_LABEL_EN = "Target Asset Universe — Iran-Relevant Crypto Watchlist";

export const TARGET_ASSETS: AssetRegistryItem[] = [
  {
    symbol: "USDT",
    name: "Tether",
    persianName: "تتر",
    coingeckoId: "tether",
    category: "stablecoin",
    coverageTier: "stablecoin_monitor",
    binanceFuturesSymbol: undefined,
    allowDirectETF: false,
    allowPriceBias: false,
    allowDerivativesIfAvailable: false,
    allowCorrelationOnlyIfSamplesEnough: false,
    publicFactorMap: ["peg_stability", "usdt_supply_trend", "stablecoin_market_cap_trend", "regulatory_sanction_news", "data_coverage"],
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    persianName: "بیت‌کوین",
    coingeckoId: "bitcoin",
    category: "store_of_value",
    coverageTier: "full",
    binanceFuturesSymbol: "BTCUSDT",
    allowDirectETF: true,
    allowPriceBias: true,
    allowDerivativesIfAvailable: true,
    allowCorrelationOnlyIfSamplesEnough: true,
    publicFactorMap: [
      "price_momentum",
      "volume_liquidity",
      "macro_sensitivity",
      "stablecoin_liquidity",
      "btc_etf_flow",
      "derivatives_if_available",
      "sentiment",
      "data_coverage",
    ],
  },
  {
    symbol: "TRX",
    name: "TRON",
    persianName: "ترون",
    coingeckoId: "tron",
    category: "payments",
    coverageTier: "medium",
    binanceFuturesSymbol: "TRXUSDT",
    allowDirectETF: false,
    allowPriceBias: true,
    allowDerivativesIfAvailable: true,
    allowCorrelationOnlyIfSamplesEnough: true,
    publicFactorMap: ["price_momentum", "volume_liquidity", "usdt_tron_context_proxy", "derivatives_if_available", "sentiment", "data_coverage"],
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    persianName: "اتریوم",
    coingeckoId: "ethereum",
    category: "smart_contract",
    coverageTier: "full",
    binanceFuturesSymbol: "ETHUSDT",
    allowDirectETF: true,
    allowPriceBias: true,
    allowDerivativesIfAvailable: true,
    allowCorrelationOnlyIfSamplesEnough: true,
    publicFactorMap: [
      "price_momentum",
      "volume_liquidity",
      "macro_sensitivity",
      "eth_etf_flow",
      "stablecoin_liquidity",
      "defi_context_proxy",
      "derivatives_if_available",
      "sentiment",
      "data_coverage",
    ],
  },
  {
    symbol: "TON",
    name: "Toncoin",
    persianName: "تون",
    coingeckoId: "the-open-network",
    category: "ecosystem",
    coverageTier: "medium",
    binanceFuturesSymbol: "TONUSDT",
    allowDirectETF: false,
    allowPriceBias: true,
    allowDerivativesIfAvailable: true,
    allowCorrelationOnlyIfSamplesEnough: true,
    publicFactorMap: ["price_momentum", "volume_liquidity", "ecosystem_news", "derivatives_if_available", "sentiment", "data_coverage"],
  },
  {
    symbol: "SOL",
    name: "Solana",
    persianName: "سولانا",
    coingeckoId: "solana",
    category: "smart_contract",
    coverageTier: "medium",
    binanceFuturesSymbol: "SOLUSDT",
    allowDirectETF: false,
    allowPriceBias: true,
    allowDerivativesIfAvailable: true,
    allowCorrelationOnlyIfSamplesEnough: true,
    publicFactorMap: ["price_momentum", "volume_liquidity", "risk_beta", "defi_dex_context_proxy", "derivatives_if_available", "sentiment", "data_coverage"],
  },
  {
    symbol: "XRP",
    name: "XRP",
    persianName: "ریپل",
    coingeckoId: "ripple",
    category: "payments",
    coverageTier: "medium",
    binanceFuturesSymbol: "XRPUSDT",
    allowDirectETF: false,
    allowPriceBias: true,
    allowDerivativesIfAvailable: true,
    allowCorrelationOnlyIfSamplesEnough: true,
    publicFactorMap: ["price_momentum", "volume_liquidity", "regulatory_news", "derivatives_if_available", "sentiment", "data_coverage"],
  },
  {
    symbol: "DOGE",
    name: "Dogecoin",
    persianName: "دوج‌کوین",
    coingeckoId: "dogecoin",
    category: "meme",
    coverageTier: "lite",
    binanceFuturesSymbol: "DOGEUSDT",
    allowDirectETF: false,
    allowPriceBias: true,
    allowDerivativesIfAvailable: true,
    allowCorrelationOnlyIfSamplesEnough: false,
    publicFactorMap: ["price_momentum", "volume_liquidity", "retail_sentiment", "speculative_heat", "derivatives_if_available", "data_coverage"],
  },
  {
    symbol: "BNB",
    name: "BNB",
    persianName: "بی‌ان‌بی",
    coingeckoId: "binancecoin",
    category: "exchange",
    coverageTier: "medium",
    binanceFuturesSymbol: "BNBUSDT",
    allowDirectETF: false,
    allowPriceBias: true,
    allowDerivativesIfAvailable: true,
    allowCorrelationOnlyIfSamplesEnough: true,
    publicFactorMap: ["price_momentum", "volume_liquidity", "exchange_ecosystem_risk", "derivatives_if_available", "sentiment", "data_coverage"],
  },
  {
    symbol: "ADA",
    name: "Cardano",
    persianName: "کاردانو",
    coingeckoId: "cardano",
    category: "smart_contract",
    coverageTier: "lite",
    binanceFuturesSymbol: "ADAUSDT",
    allowDirectETF: false,
    allowPriceBias: true,
    allowDerivativesIfAvailable: true,
    allowCorrelationOnlyIfSamplesEnough: false,
    publicFactorMap: ["price_momentum", "volume_liquidity", "ecosystem_sentiment_light", "derivatives_if_available", "data_coverage"],
  },
];

export function getTargetAsset(symbol: string) {
  return TARGET_ASSETS.find((asset) => asset.symbol === symbol);
}
