import { CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS } from "../runtime-input/constants";

export const CMIP_NORMALIZATION_VERSION = "CMIP-NORMALIZATION-1.0";
export const CMIP_NORMALIZATION_POLICY_VERSION = "CMIP-NORMALIZATION-POLICY-1.0";

export const CMIP_NORMALIZATION_REQUIRED_ASSET_SYMBOLS = CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS;

export const CMIP_NORMALIZATION_CRITICAL_DOMAINS = ["meta", "run_context", "sources", "market", "assets", "data_quality"] as const;
export const CMIP_NORMALIZATION_CONDITIONALLY_CRITICAL_DOMAINS = ["etf", "stablecoins", "derivatives", "macro"] as const;
export const CMIP_NORMALIZATION_NON_BLOCKING_DOMAINS = [
  "options",
  "cross_asset",
  "breadth",
  "news",
  "historical_evidence",
  "decision_memory",
] as const;

export const CMIP_NORMALIZATION_FIXTURE_LABEL = "CMIP deterministic normalization fixture data; not live market data.";
