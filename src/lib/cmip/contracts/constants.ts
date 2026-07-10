export const CMIP_CONTRACT_VERSION = "cmip-contract-v1.0";
export const CMIP_MASTER_PROMPT_VERSION = "cmip-master-prompt-v1.0";
export const CMIP_OUTPUT_SCHEMA_VERSION = "cmip-output-schema-v1.0";

export const CMIP_REQUIRED_ASSET_SYMBOLS = [
  "BTC",
  "ETH",
  "USDT",
  "BNB",
  "SOL",
  "XRP",
  "TRX",
  "TON",
  "DOGE",
  "ADA",
] as const;

export type CmipAssetSymbol = (typeof CMIP_REQUIRED_ASSET_SYMBOLS)[number];

export type CmipAssetUniverseRecord = Readonly<{
  asset_id: string;
  symbol: CmipAssetSymbol;
  english_name: string;
  persian_name: string;
  identity_requirement: string;
}>;

const assetUniverseRecords = [
  {
    asset_id: "crypto:bitcoin",
    symbol: "BTC",
    english_name: "Bitcoin",
    persian_name: "بیت‌کوین",
    identity_requirement: "Canonical Bitcoin ID",
  },
  {
    asset_id: "crypto:ethereum",
    symbol: "ETH",
    english_name: "Ethereum",
    persian_name: "اتریوم",
    identity_requirement: "Canonical Ethereum ID",
  },
  {
    asset_id: "crypto:tether-usd",
    symbol: "USDT",
    english_name: "Tether USD",
    persian_name: "تتر",
    identity_requirement: "Tether USD, not ticker-only",
  },
  {
    asset_id: "crypto:bnb",
    symbol: "BNB",
    english_name: "BNB",
    persian_name: "بی‌ان‌بی",
    identity_requirement: "BNB chain asset",
  },
  {
    asset_id: "crypto:solana",
    symbol: "SOL",
    english_name: "Solana",
    persian_name: "سولانا",
    identity_requirement: "Solana",
  },
  {
    asset_id: "crypto:xrp",
    symbol: "XRP",
    english_name: "XRP",
    persian_name: "ریپل",
    identity_requirement: "XRP",
  },
  {
    asset_id: "crypto:tron",
    symbol: "TRX",
    english_name: "TRON",
    persian_name: "ترون",
    identity_requirement: "TRON",
  },
  {
    asset_id: "crypto:toncoin",
    symbol: "TON",
    english_name: "Toncoin",
    persian_name: "تون‌کوین",
    identity_requirement: "Toncoin; explicitly reject Tokamak Network",
  },
  {
    asset_id: "crypto:dogecoin",
    symbol: "DOGE",
    english_name: "Dogecoin",
    persian_name: "دوج‌کوین",
    identity_requirement: "Dogecoin",
  },
  {
    asset_id: "crypto:cardano",
    symbol: "ADA",
    english_name: "Cardano",
    persian_name: "کاردانو",
    identity_requirement: "Cardano",
  },
] as const satisfies readonly CmipAssetUniverseRecord[];

export const CMIP_ASSET_UNIVERSE: readonly CmipAssetUniverseRecord[] = Object.freeze(
  assetUniverseRecords.map((record) => Object.freeze({ ...record })),
);

export const CMIP_REQUIRED_ASSET_SYMBOL_SET: ReadonlySet<CmipAssetSymbol> = new Set(CMIP_REQUIRED_ASSET_SYMBOLS);

export const CMIP_DECISION_POSTURES = [
  "increase_selective_risk",
  "maintain_risk",
  "reduce_risk",
  "defensive",
] as const;

export const CMIP_EVIDENCE_VERDICTS = [
  "confirmed",
  "partially_confirmed",
  "not_confirmed",
  "contradicted",
  "insufficient_data",
] as const;

export const CMIP_IDENTITY_STATUSES = ["verified", "conflict", "unavailable"] as const;
export const CMIP_HISTORICAL_EVIDENCE_STATUSES = ["verified", "partial", "unavailable"] as const;
export const CMIP_SCENARIO_CALIBRATION_STATUSES = ["backtested", "prototype", "insufficient_data"] as const;
export const CMIP_SUPPORTED_CHART_TYPES = ["bar", "line", "area", "waterfall", "radar", "heatmap"] as const;
export const CMIP_SCENARIO_TIME_HORIZONS = ["1D", "7D", "30D"] as const;
