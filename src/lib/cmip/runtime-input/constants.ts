import { CMIP_REQUIRED_ASSET_SYMBOLS } from "../contracts/constants";
import type { CmipAssetSymbol } from "../contracts";

export const CMIP_RUNTIME_INPUT_SPEC_VERSION = "CMIP-RUNTIME-INPUT-1.0";
export const CMIP_RUNTIME_INPUT_SCHEMA_ID = "https://cmip.local/runtime-input/input-schema.v1.json";

export const CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS = CMIP_REQUIRED_ASSET_SYMBOLS;
export type CmipRuntimeAssetSymbol = CmipAssetSymbol;

export const CMIP_RUNTIME_ASSET_IDS = {
  BTC: "crypto:bitcoin",
  ETH: "crypto:ethereum",
  USDT: "crypto:tether-usd",
  BNB: "crypto:bnb",
  SOL: "crypto:solana",
  XRP: "crypto:xrp",
  TRX: "crypto:tron",
  TON: "crypto:toncoin",
  DOGE: "crypto:dogecoin",
  ADA: "crypto:cardano",
} as const satisfies Record<CmipRuntimeAssetSymbol, string>;

export const CMIP_RUNTIME_ENVIRONMENTS = ["development", "preview", "production"] as const;
export const CMIP_RUNTIME_RUN_TYPES = ["manual", "scheduled", "regeneration", "backfill"] as const;
export const CMIP_RUNTIME_TRIGGERED_BY = ["admin", "scheduler", "system", "test"] as const;
export const CMIP_RUNTIME_HORIZONS = ["1D", "7D", "30D", "90D"] as const;
export const CMIP_RUNTIME_MORNING_BRIEF_HORIZONS = ["1D", "7D", "30D"] as const;

export const CMIP_RUNTIME_SOURCE_TYPES = ["api", "web", "official_release", "exchange", "database", "manual", "derived"] as const;
export const CMIP_RUNTIME_SOURCE_STATUSES = ["ok", "partial", "failed", "stale", "conflict"] as const;
export const CMIP_RUNTIME_SOURCE_TIERS = ["primary", "secondary", "fallback", "proxy"] as const;

export const CMIP_RUNTIME_DATA_POINT_STATUSES = ["available", "missing", "stale", "conflict", "proxy"] as const;
export const CMIP_RUNTIME_IDENTITY_STATUSES = ["verified", "conflict", "unavailable"] as const;
export const CMIP_RUNTIME_TREND_STATES = ["strong_up", "up", "neutral", "down", "strong_down", "unavailable"] as const;
export const CMIP_RUNTIME_MARKET_REGIME_VALUES = ["risk_on", "mild_risk_on", "neutral", "mild_risk_off", "risk_off", "unavailable"] as const;

export const CMIP_RUNTIME_NEWS_CATEGORIES = [
  "macro",
  "regulation",
  "etf",
  "institutional",
  "exchange",
  "security",
  "protocol",
  "geopolitical",
  "market",
  "other",
] as const;
export const CMIP_RUNTIME_NEWS_IMPORTANCE = ["low", "medium", "high", "critical"] as const;
export const CMIP_RUNTIME_NEWS_SENTIMENT = ["positive", "negative", "neutral", "mixed"] as const;
export const CMIP_RUNTIME_NEWS_VERIFICATION_STATUSES = ["verified", "single_source", "conflicting", "unverified"] as const;

export const CMIP_RUNTIME_HISTORICAL_STATUSES = ["verified", "partial", "unavailable"] as const;
export const CMIP_RUNTIME_DECISION_MEMORY_STATUSES = ["available", "partial", "unavailable"] as const;
export const CMIP_RUNTIME_DOMAINS = [
  "market",
  "assets",
  "etf",
  "stablecoins",
  "derivatives",
  "options",
  "macro",
  "cross_asset",
  "breadth",
  "news",
  "historical_evidence",
  "decision_memory",
] as const;

export const CMIP_RUNTIME_DERIVED_DATA_POINT_PATH_PARTS = [
  ".change_",
  ".flow_7d",
  ".flow_30d",
  ".flow_acceleration",
  ".realized_volatility_30d",
  ".relative_strength_vs_btc_",
  ".assets_above_ma_",
  ".positive_assets_",
  ".altcoin_season_index",
  ".btc_leadership",
  ".eth_participation",
  ".overall_coverage",
  ".freshness_score",
  ".source_agreement",
] as const;
