import type {
  CMIP_RUNTIME_DATA_POINT_STATUSES,
  CMIP_RUNTIME_DECISION_MEMORY_STATUSES,
  CMIP_RUNTIME_DOMAINS,
  CMIP_RUNTIME_ENVIRONMENTS,
  CMIP_RUNTIME_HISTORICAL_STATUSES,
  CMIP_RUNTIME_HORIZONS,
  CMIP_RUNTIME_IDENTITY_STATUSES,
  CMIP_RUNTIME_MARKET_REGIME_VALUES,
  CMIP_RUNTIME_NEWS_CATEGORIES,
  CMIP_RUNTIME_NEWS_IMPORTANCE,
  CMIP_RUNTIME_NEWS_SENTIMENT,
  CMIP_RUNTIME_NEWS_VERIFICATION_STATUSES,
  CMIP_RUNTIME_RUN_TYPES,
  CMIP_RUNTIME_SOURCE_STATUSES,
  CMIP_RUNTIME_SOURCE_TIERS,
  CMIP_RUNTIME_SOURCE_TYPES,
  CMIP_RUNTIME_TREND_STATES,
  CMIP_RUNTIME_TRIGGERED_BY,
  CmipRuntimeAssetSymbol,
} from "./constants";

export type CmipRuntimeEnvironment = (typeof CMIP_RUNTIME_ENVIRONMENTS)[number];
export type CmipRuntimeRunType = (typeof CMIP_RUNTIME_RUN_TYPES)[number];
export type CmipRuntimeTriggeredBy = (typeof CMIP_RUNTIME_TRIGGERED_BY)[number];
export type CmipRuntimeHorizon = (typeof CMIP_RUNTIME_HORIZONS)[number];
export type CmipRuntimeSourceType = (typeof CMIP_RUNTIME_SOURCE_TYPES)[number];
export type CmipRuntimeSourceStatus = (typeof CMIP_RUNTIME_SOURCE_STATUSES)[number];
export type CmipRuntimeSourceTier = (typeof CMIP_RUNTIME_SOURCE_TIERS)[number];
export type CmipRuntimeDataPointStatus = (typeof CMIP_RUNTIME_DATA_POINT_STATUSES)[number];
export type CmipRuntimeIdentityStatus = (typeof CMIP_RUNTIME_IDENTITY_STATUSES)[number];
export type CmipRuntimeTrendState = (typeof CMIP_RUNTIME_TREND_STATES)[number];
export type CmipRuntimeMarketRegimeValue = (typeof CMIP_RUNTIME_MARKET_REGIME_VALUES)[number];
export type CmipRuntimeNewsCategory = (typeof CMIP_RUNTIME_NEWS_CATEGORIES)[number];
export type CmipRuntimeNewsImportance = (typeof CMIP_RUNTIME_NEWS_IMPORTANCE)[number];
export type CmipRuntimeNewsSentiment = (typeof CMIP_RUNTIME_NEWS_SENTIMENT)[number];
export type CmipRuntimeNewsVerificationStatus = (typeof CMIP_RUNTIME_NEWS_VERIFICATION_STATUSES)[number];
export type CmipRuntimeHistoricalStatus = (typeof CMIP_RUNTIME_HISTORICAL_STATUSES)[number];
export type CmipRuntimeDecisionMemoryStatus = (typeof CMIP_RUNTIME_DECISION_MEMORY_STATUSES)[number];
export type CmipRuntimeDomain = (typeof CMIP_RUNTIME_DOMAINS)[number];

export type CmipRuntimePrimitive = string | number | boolean | null;
export type CmipRuntimeJsonValue = CmipRuntimePrimitive | CmipRuntimeJsonValue[] | { readonly [key: string]: CmipRuntimeJsonValue };
export type CmipRuntimeDataPointValue = string | number | boolean;

export interface CmipRuntimeInputEnvelope {
  readonly cmip_runtime_input: CmipRuntimeInput;
}

export interface CmipRuntimeInput {
  readonly meta: CmipRuntimeInputMeta;
  readonly run_context: CmipRuntimeRunContext;
  readonly sources: readonly CmipRuntimeSource[];
  readonly market: CmipRuntimeMarketSection;
  readonly assets: readonly CmipRuntimeAssetSnapshot[];
  readonly etf: CmipRuntimeEtfSection;
  readonly stablecoins: CmipRuntimeStablecoinSection;
  readonly derivatives: CmipRuntimeDerivativesSection;
  readonly options: CmipRuntimeOptionsSection;
  readonly macro: CmipRuntimeMacroSection;
  readonly cross_asset: CmipRuntimeCrossAssetSection;
  readonly breadth: CmipRuntimeBreadthSection;
  readonly news: readonly CmipRuntimeNewsEvent[];
  readonly historical_evidence: readonly CmipRuntimeHistoricalEvidenceRecord[];
  readonly decision_memory: CmipRuntimeDecisionMemory;
  readonly data_quality: CmipRuntimeDataQualitySummary;
}

export interface CmipRuntimeInputMeta {
  readonly spec_version: "CMIP-RUNTIME-INPUT-1.0";
  readonly input_id: string;
  readonly generated_at: string;
  readonly data_cutoff: string;
  readonly timezone: string;
  readonly environment: CmipRuntimeEnvironment;
}

export interface CmipRuntimeRunContext {
  readonly run_type: CmipRuntimeRunType;
  readonly requested_horizons: readonly CmipRuntimeHorizon[];
  readonly previous_report_id: string | null;
  readonly previous_input_id: string | null;
  readonly triggered_by: CmipRuntimeTriggeredBy;
  readonly requested_at: string;
}

export interface CmipRuntimeSource {
  readonly source_id: string;
  readonly provider: string;
  readonly source_type: CmipRuntimeSourceType;
  readonly url: string | null;
  readonly retrieved_at: string;
  readonly published_at: string | null;
  readonly fields: readonly string[];
  readonly status: CmipRuntimeSourceStatus;
  readonly tier: CmipRuntimeSourceTier;
}

export interface CmipRuntimeFreshness {
  readonly age_seconds: number | null;
  readonly max_age_seconds: number | null;
  readonly is_stale: boolean;
}

export interface CmipRuntimeCalculationTrace {
  readonly method: string;
  readonly formula: string;
  readonly inputs: readonly string[];
  readonly version: string;
}

export interface CmipRuntimeDataPoint<T extends CmipRuntimeDataPointValue = CmipRuntimeDataPointValue> {
  readonly value: T | null;
  readonly unit: string | null;
  readonly observed_at: string | null;
  readonly source_refs: readonly string[];
  readonly quality: number;
  readonly freshness: CmipRuntimeFreshness;
  readonly status: CmipRuntimeDataPointStatus;
  readonly calculation: CmipRuntimeCalculationTrace | null;
}

export type CmipRuntimeNumericDataPoint = CmipRuntimeDataPoint<number>;
export type CmipRuntimeCategoricalDataPoint<T extends string = string> = CmipRuntimeDataPoint<T>;

export interface CmipRuntimeMarketRegimeProxy {
  readonly value: CmipRuntimeMarketRegimeValue;
  readonly status: CmipRuntimeDataPointStatus;
  readonly method: string;
  readonly source_refs: readonly string[];
}

export interface CmipRuntimeMarketSection {
  readonly total_crypto_market_cap: CmipRuntimeNumericDataPoint;
  readonly total_crypto_volume_24h: CmipRuntimeNumericDataPoint;
  readonly btc_dominance: CmipRuntimeNumericDataPoint;
  readonly eth_dominance: CmipRuntimeNumericDataPoint;
  readonly fear_greed_index: CmipRuntimeNumericDataPoint;
  readonly market_regime_proxy: CmipRuntimeMarketRegimeProxy;
}

export interface CmipRuntimeAssetSnapshot {
  readonly symbol: CmipRuntimeAssetSymbol;
  readonly asset_id: string;
  readonly name: string;
  readonly identity_status: CmipRuntimeIdentityStatus;
  readonly price: CmipRuntimeNumericDataPoint;
  readonly market_cap: CmipRuntimeNumericDataPoint;
  readonly volume_24h: CmipRuntimeNumericDataPoint;
  readonly change_24h: CmipRuntimeNumericDataPoint;
  readonly change_7d: CmipRuntimeNumericDataPoint;
  readonly change_30d: CmipRuntimeNumericDataPoint;
  readonly realized_volatility_30d: CmipRuntimeNumericDataPoint;
  readonly relative_strength_vs_btc_7d: CmipRuntimeNumericDataPoint;
  readonly relative_strength_vs_btc_30d: CmipRuntimeNumericDataPoint;
  readonly trend_state: CmipRuntimeTrendState;
  readonly source_refs: readonly string[];
}

export interface CmipRuntimeEtfFundBreakdown {
  readonly fund_id: string;
  readonly ticker: string;
  readonly issuer: string;
  readonly daily_net_flow: CmipRuntimeNumericDataPoint;
  readonly aum: CmipRuntimeNumericDataPoint;
  readonly source_refs: readonly string[];
}

export interface CmipRuntimeEtfAssetFlow {
  readonly daily_net_flow: CmipRuntimeNumericDataPoint;
  readonly flow_7d: CmipRuntimeNumericDataPoint;
  readonly flow_30d: CmipRuntimeNumericDataPoint;
  readonly flow_acceleration: CmipRuntimeNumericDataPoint;
  readonly positive_streak_days: CmipRuntimeNumericDataPoint;
  readonly negative_streak_days: CmipRuntimeNumericDataPoint;
  readonly latest_trading_date: string | null;
  readonly fund_breakdown: readonly CmipRuntimeEtfFundBreakdown[];
  readonly source_refs: readonly string[];
}

export interface CmipRuntimeEtfSection {
  readonly btc: CmipRuntimeEtfAssetFlow;
  readonly eth: CmipRuntimeEtfAssetFlow;
}

export interface CmipRuntimeStablecoinSection {
  readonly total_market_cap: CmipRuntimeNumericDataPoint;
  readonly change_1d: CmipRuntimeNumericDataPoint;
  readonly change_7d: CmipRuntimeNumericDataPoint;
  readonly change_30d: CmipRuntimeNumericDataPoint;
  readonly usdt_supply: CmipRuntimeNumericDataPoint;
  readonly usdc_supply: CmipRuntimeNumericDataPoint;
  readonly usdt_change_7d: CmipRuntimeNumericDataPoint;
  readonly usdt_change_30d: CmipRuntimeNumericDataPoint;
  readonly usdc_change_7d: CmipRuntimeNumericDataPoint;
  readonly usdc_change_30d: CmipRuntimeNumericDataPoint;
  readonly exchange_reserves: CmipRuntimeNumericDataPoint | null;
  readonly chain_flows: CmipRuntimeNumericDataPoint | null;
}

export interface CmipRuntimeExchangeFunding {
  readonly exchange: string;
  readonly asset: "BTC" | "ETH";
  readonly funding_rate: CmipRuntimeNumericDataPoint;
  readonly interval: string;
  readonly source_refs: readonly string[];
}

export interface CmipRuntimeDerivativesSection {
  readonly market_open_interest: CmipRuntimeNumericDataPoint;
  readonly market_open_interest_change_24h: CmipRuntimeNumericDataPoint;
  readonly btc_open_interest: CmipRuntimeNumericDataPoint;
  readonly eth_open_interest: CmipRuntimeNumericDataPoint;
  readonly btc_funding: CmipRuntimeNumericDataPoint;
  readonly eth_funding: CmipRuntimeNumericDataPoint;
  readonly funding_by_exchange: readonly CmipRuntimeExchangeFunding[];
  readonly liquidations_24h: CmipRuntimeNumericDataPoint;
  readonly long_liquidations_24h: CmipRuntimeNumericDataPoint;
  readonly short_liquidations_24h: CmipRuntimeNumericDataPoint;
  readonly futures_basis: CmipRuntimeNumericDataPoint;
  readonly long_short_ratio: CmipRuntimeNumericDataPoint;
}

export interface CmipRuntimeOptionsTermPoint {
  readonly asset: "BTC" | "ETH";
  readonly tenor: string;
  readonly implied_volatility: CmipRuntimeNumericDataPoint;
  readonly source_refs: readonly string[];
}

export interface CmipRuntimeOptionsSection {
  readonly btc_put_call_ratio: CmipRuntimeNumericDataPoint | null;
  readonly eth_put_call_ratio: CmipRuntimeNumericDataPoint | null;
  readonly btc_iv: CmipRuntimeNumericDataPoint | null;
  readonly eth_iv: CmipRuntimeNumericDataPoint | null;
  readonly btc_25d_skew: CmipRuntimeNumericDataPoint | null;
  readonly eth_25d_skew: CmipRuntimeNumericDataPoint | null;
  readonly term_structure: readonly CmipRuntimeOptionsTermPoint[];
  readonly max_pain: CmipRuntimeNumericDataPoint | null;
  readonly gamma_risk: CmipRuntimeNumericDataPoint | null;
}

export interface CmipRuntimeMacroSection {
  readonly dxy: CmipRuntimeNumericDataPoint;
  readonly us_2y: CmipRuntimeNumericDataPoint;
  readonly us_10y: CmipRuntimeNumericDataPoint;
  readonly real_yield_10y: CmipRuntimeNumericDataPoint;
  readonly yield_curve_2s10s: CmipRuntimeNumericDataPoint;
  readonly nasdaq: CmipRuntimeNumericDataPoint;
  readonly sp500: CmipRuntimeNumericDataPoint;
  readonly vix: CmipRuntimeNumericDataPoint;
  readonly gold: CmipRuntimeNumericDataPoint;
  readonly oil: CmipRuntimeNumericDataPoint;
  readonly fed_policy_rate: CmipRuntimeNumericDataPoint;
  readonly fed_expectation: CmipRuntimeCategoricalDataPoint;
  readonly us_m2: CmipRuntimeNumericDataPoint;
  readonly global_liquidity_proxy: CmipRuntimeNumericDataPoint;
}

export interface CmipRuntimeCorrelation {
  readonly window: Extract<CmipRuntimeHorizon, "7D" | "30D" | "90D">;
  readonly value: number | null;
  readonly sample_count: number | null;
  readonly method: string;
  readonly observed_at: string | null;
  readonly source_refs: readonly string[];
  readonly calculation: CmipRuntimeCalculationTrace | null;
}

export interface CmipRuntimeCrossAssetSection {
  readonly btc_nasdaq_correlation: readonly CmipRuntimeCorrelation[];
  readonly btc_dxy_correlation: readonly CmipRuntimeCorrelation[];
  readonly btc_gold_correlation: readonly CmipRuntimeCorrelation[];
  readonly btc_us10y_correlation: readonly CmipRuntimeCorrelation[];
  readonly btc_eth_correlation: readonly CmipRuntimeCorrelation[];
}

export interface CmipRuntimeSelectedAssetBreadth {
  readonly symbol: CmipRuntimeAssetSymbol;
  readonly above_ma_7d: boolean | null;
  readonly above_ma_30d: boolean | null;
  readonly return_24h_positive: boolean | null;
  readonly return_7d_positive: boolean | null;
  readonly source_refs: readonly string[];
}

export interface CmipRuntimeBreadthSection {
  readonly assets_above_ma_7d: CmipRuntimeNumericDataPoint;
  readonly assets_above_ma_30d: CmipRuntimeNumericDataPoint;
  readonly positive_assets_24h: CmipRuntimeNumericDataPoint;
  readonly positive_assets_7d: CmipRuntimeNumericDataPoint;
  readonly altcoin_season_index: CmipRuntimeNumericDataPoint;
  readonly btc_leadership: CmipRuntimeNumericDataPoint;
  readonly eth_participation: CmipRuntimeNumericDataPoint;
  readonly selected_asset_breadth: readonly CmipRuntimeSelectedAssetBreadth[];
}

export interface CmipRuntimeNewsEvent {
  readonly news_id: string;
  readonly headline: string;
  readonly summary: string;
  readonly category: CmipRuntimeNewsCategory;
  readonly importance: CmipRuntimeNewsImportance;
  readonly sentiment: CmipRuntimeNewsSentiment;
  readonly affected_assets: readonly CmipRuntimeAssetSymbol[];
  readonly published_at: string;
  readonly retrieved_at: string;
  readonly source_refs: readonly string[];
  readonly verification_status: CmipRuntimeNewsVerificationStatus;
  readonly duplicate_group_id: string;
}

export interface CmipRuntimeHistoricalForwardResult {
  readonly horizon: CmipRuntimeHorizon;
  readonly positive_rate: number | null;
  readonly median_return: number | null;
  readonly mean_return: number | null;
  readonly max_drawdown: number | null;
  readonly sample_size: number | null;
  readonly return_unit: string | null;
}

export interface CmipRuntimeHistoricalEvidenceRecord {
  readonly evidence_id: string;
  readonly hypothesis: string;
  readonly event_definition: string;
  readonly period_start: string | null;
  readonly period_end: string | null;
  readonly sample_size: number | null;
  readonly forward_horizons: readonly CmipRuntimeHorizon[];
  readonly results: readonly CmipRuntimeHistoricalForwardResult[];
  readonly limitations: string;
  readonly method_version: string;
  readonly source_refs: readonly string[];
  readonly status: CmipRuntimeHistoricalStatus;
}

export interface CmipRuntimeDecisionMemory {
  readonly status: CmipRuntimeDecisionMemoryStatus;
  readonly previous_report: {
    readonly report_id: string;
    readonly published_at: string;
    readonly posture: string;
  } | null;
  readonly previous_engine_scores: readonly {
    readonly engine_id: string;
    readonly score: number | null;
  }[];
  readonly previous_coin_postures: readonly {
    readonly symbol: CmipRuntimeAssetSymbol;
    readonly posture: string;
    readonly score: number | null;
  }[];
  readonly registered_decisions: readonly {
    readonly report_id: string;
    readonly horizon: CmipRuntimeHorizon;
    readonly expected_posture: string;
    readonly evaluation_status: string;
  }[];
  readonly weekly_evaluation: {
    readonly accuracy: number | null;
    readonly sample_size: number | null;
    readonly status: string;
  };
}

export interface CmipRuntimeDataQualitySummary {
  readonly overall_coverage: number;
  readonly freshness_score: number;
  readonly source_agreement: number;
  readonly critical_missing_fields: readonly string[];
  readonly stale_fields: readonly string[];
  readonly conflicts: readonly string[];
  readonly failed_sources: readonly string[];
  readonly quality_by_domain: Record<CmipRuntimeDomain, number>;
}

export interface CmipRuntimeInputValidationError {
  readonly path: string;
  readonly message: string;
  readonly keyword?: string;
}

export type CmipRuntimeInputValidationResult =
  | {
      readonly valid: true;
      readonly data: CmipRuntimeInputEnvelope;
      readonly errors: [];
    }
  | {
      readonly valid: false;
      readonly data?: undefined;
      readonly errors: readonly CmipRuntimeInputValidationError[];
    };
