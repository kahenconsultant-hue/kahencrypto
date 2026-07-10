import type {
  CmipRuntimeDataPointStatus,
  CmipRuntimeEnvironment,
  CmipRuntimeHorizon,
  CmipRuntimeNewsCategory,
  CmipRuntimeNewsImportance,
  CmipRuntimeNewsSentiment,
  CmipRuntimeNewsVerificationStatus,
  CmipRuntimeRunType,
  CmipRuntimeSourceStatus,
  CmipRuntimeSourceTier,
  CmipRuntimeSourceType,
  CmipRuntimeTriggeredBy,
} from "../runtime-input";
import type { CmipRuntimeAssetSymbol } from "../runtime-input/constants";
import type { CmipFreshnessFieldType } from "./freshness";
import type { CmipCanonicalUnit } from "./units";

export type CmipRawTimestamp = string | number | Date | null | undefined;

export interface CmipNormalizationMeta {
  readonly inputId: string;
  readonly generatedAt: CmipRawTimestamp;
  readonly dataCutoff: CmipRawTimestamp;
  readonly timezone: string;
  readonly environment: CmipRuntimeEnvironment;
}

export interface CmipNormalizationRunContext {
  readonly runType: CmipRuntimeRunType;
  readonly requestedHorizons: readonly CmipRuntimeHorizon[];
  readonly previousReportId?: string | null;
  readonly previousInputId?: string | null;
  readonly triggeredBy: CmipRuntimeTriggeredBy;
  readonly requestedAt: CmipRawTimestamp;
}

export interface RawSourceRecord {
  readonly id?: string;
  readonly sourceId?: string;
  readonly source_id?: string;
  readonly provider?: string;
  readonly name?: string;
  readonly sourceType?: string;
  readonly source_type?: string;
  readonly url?: string | null;
  readonly retrievedAt?: CmipRawTimestamp;
  readonly retrieved_at?: CmipRawTimestamp;
  readonly publishedAt?: CmipRawTimestamp;
  readonly published_at?: CmipRawTimestamp;
  readonly fields?: readonly string[];
  readonly status?: string;
  readonly tier?: string | number;
}

export interface CmipRawCalculationTrace {
  readonly method: string;
  readonly formula: string;
  readonly inputs: readonly string[];
  readonly version: string;
}

export interface CmipRawDataPoint {
  readonly value?: unknown;
  readonly unit?: string | null;
  readonly observedAt?: CmipRawTimestamp;
  readonly observed_at?: CmipRawTimestamp;
  readonly sourceRefs?: readonly string[];
  readonly source_refs?: readonly string[];
  readonly status?: CmipRuntimeDataPointStatus;
  readonly calculation?: CmipRawCalculationTrace | null;
  readonly quality?: number;
  readonly fieldType?: CmipFreshnessFieldType;
  readonly proxyMethod?: string;
  readonly missingReason?: string;
  readonly conflictReason?: string;
}

export interface CmipRawMarketRegimeProxy {
  readonly value?: string | null;
  readonly status?: CmipRuntimeDataPointStatus;
  readonly method?: string;
  readonly sourceRefs?: readonly string[];
  readonly source_refs?: readonly string[];
}

export interface CmipRawMarketPayload {
  readonly total_crypto_market_cap?: CmipRawDataPoint;
  readonly total_crypto_volume_24h?: CmipRawDataPoint;
  readonly btc_dominance?: CmipRawDataPoint;
  readonly eth_dominance?: CmipRawDataPoint;
  readonly fear_greed_index?: CmipRawDataPoint;
  readonly market_regime_proxy?: CmipRawMarketRegimeProxy;
}

export interface CmipRawAssetRecord {
  readonly symbol?: string;
  readonly provider?: string;
  readonly providerAssetId?: string;
  readonly provider_asset_id?: string;
  readonly assetId?: string;
  readonly asset_id?: string;
  readonly name?: string;
  readonly sourceRefs?: readonly string[];
  readonly source_refs?: readonly string[];
  readonly price?: CmipRawDataPoint;
  readonly market_cap?: CmipRawDataPoint;
  readonly volume_24h?: CmipRawDataPoint;
  readonly change_24h?: CmipRawDataPoint;
  readonly change_7d?: CmipRawDataPoint;
  readonly change_30d?: CmipRawDataPoint;
  readonly realized_volatility_30d?: CmipRawDataPoint;
  readonly relative_strength_vs_btc_7d?: CmipRawDataPoint;
  readonly relative_strength_vs_btc_30d?: CmipRawDataPoint;
  readonly trend_state?: string;
}

export interface CmipRawAssetsPayload {
  readonly assets?: readonly CmipRawAssetRecord[];
}

export interface CmipRawEtfFundBreakdown {
  readonly fund_id: string;
  readonly ticker: string;
  readonly issuer: string;
  readonly daily_net_flow?: CmipRawDataPoint;
  readonly aum?: CmipRawDataPoint;
  readonly sourceRefs?: readonly string[];
  readonly source_refs?: readonly string[];
}

export interface CmipRawEtfAssetPayload {
  readonly daily_net_flow?: CmipRawDataPoint;
  readonly flow_7d?: CmipRawDataPoint;
  readonly flow_30d?: CmipRawDataPoint;
  readonly flow_acceleration?: CmipRawDataPoint;
  readonly positive_streak_days?: CmipRawDataPoint;
  readonly negative_streak_days?: CmipRawDataPoint;
  readonly latest_trading_date?: string | null;
  readonly included_dates_7d?: readonly string[];
  readonly included_dates_30d?: readonly string[];
  readonly zero_flow_weekend_dates?: readonly string[];
  readonly fund_breakdown?: readonly CmipRawEtfFundBreakdown[];
  readonly sourceRefs?: readonly string[];
  readonly source_refs?: readonly string[];
}

export interface CmipRawEtfPayload {
  readonly btc?: CmipRawEtfAssetPayload;
  readonly eth?: CmipRawEtfAssetPayload;
}

export type CmipRawStablecoinPayload = Readonly<Record<string, CmipRawDataPoint | null | undefined>>;

export interface CmipRawExchangeFunding {
  readonly exchange: string;
  readonly asset: "BTC" | "ETH";
  readonly funding_rate?: CmipRawDataPoint;
  readonly interval: string;
  readonly sourceRefs?: readonly string[];
  readonly source_refs?: readonly string[];
}

export interface CmipRawDerivativesPayload {
  readonly market_open_interest?: CmipRawDataPoint;
  readonly market_open_interest_change_24h?: CmipRawDataPoint;
  readonly btc_open_interest?: CmipRawDataPoint;
  readonly eth_open_interest?: CmipRawDataPoint;
  readonly btc_funding?: CmipRawDataPoint;
  readonly eth_funding?: CmipRawDataPoint;
  readonly funding_by_exchange?: readonly CmipRawExchangeFunding[];
  readonly liquidations_24h?: CmipRawDataPoint;
  readonly long_liquidations_24h?: CmipRawDataPoint;
  readonly short_liquidations_24h?: CmipRawDataPoint;
  readonly futures_basis?: CmipRawDataPoint;
  readonly long_short_ratio?: CmipRawDataPoint;
  readonly liquidation_tolerance_pct?: number;
}

export type CmipRawOptionsPayload = Readonly<Record<string, CmipRawDataPoint | null | readonly CmipRawOptionsTermPoint[] | undefined>>;

export interface CmipRawOptionsTermPoint {
  readonly asset: "BTC" | "ETH";
  readonly tenor: string;
  readonly implied_volatility?: CmipRawDataPoint;
  readonly sourceRefs?: readonly string[];
  readonly source_refs?: readonly string[];
}

export interface CmipRawMacroPayload {
  readonly dxy?: CmipRawDataPoint;
  readonly us_2y?: CmipRawDataPoint;
  readonly us_10y?: CmipRawDataPoint;
  readonly real_yield_10y?: CmipRawDataPoint;
  readonly yield_curve_2s10s?: CmipRawDataPoint;
  readonly nasdaq?: CmipRawDataPoint;
  readonly sp500?: CmipRawDataPoint;
  readonly vix?: CmipRawDataPoint;
  readonly gold?: CmipRawDataPoint;
  readonly oil?: CmipRawDataPoint;
  readonly fed_policy_rate?: CmipRawDataPoint;
  readonly fed_expectation?: CmipRawDataPoint;
  readonly us_m2?: CmipRawDataPoint;
  readonly global_liquidity_proxy?: CmipRawDataPoint;
}

export interface CmipRawCorrelationRecord {
  readonly window: "7D" | "30D" | "90D";
  readonly value?: unknown;
  readonly sample_count?: number | null;
  readonly method: string;
  readonly observedAt?: CmipRawTimestamp;
  readonly observed_at?: CmipRawTimestamp;
  readonly sourceRefs?: readonly string[];
  readonly source_refs?: readonly string[];
  readonly calculation?: CmipRawCalculationTrace | null;
}

export type CmipRawCrossAssetPayload = Readonly<Record<string, readonly CmipRawCorrelationRecord[] | undefined>>;

export interface CmipRawSelectedAssetBreadth {
  readonly symbol: string;
  readonly above_ma_7d?: boolean | null;
  readonly above_ma_30d?: boolean | null;
  readonly return_24h_positive?: boolean | null;
  readonly return_7d_positive?: boolean | null;
  readonly sourceRefs?: readonly string[];
  readonly source_refs?: readonly string[];
}

export interface CmipRawBreadthPayload {
  readonly assets_above_ma_7d?: CmipRawDataPoint;
  readonly assets_above_ma_30d?: CmipRawDataPoint;
  readonly positive_assets_24h?: CmipRawDataPoint;
  readonly positive_assets_7d?: CmipRawDataPoint;
  readonly altcoin_season_index?: CmipRawDataPoint;
  readonly btc_leadership?: CmipRawDataPoint;
  readonly eth_participation?: CmipRawDataPoint;
  readonly selected_asset_breadth?: readonly CmipRawSelectedAssetBreadth[];
  readonly universe_size?: number;
}

export interface CmipRawNewsEvent {
  readonly news_id?: string;
  readonly headline?: string;
  readonly summary?: string;
  readonly category?: CmipRuntimeNewsCategory;
  readonly importance?: CmipRuntimeNewsImportance;
  readonly sentiment?: CmipRuntimeNewsSentiment;
  readonly affected_assets?: readonly string[];
  readonly publishedAt?: CmipRawTimestamp;
  readonly published_at?: CmipRawTimestamp;
  readonly retrievedAt?: CmipRawTimestamp;
  readonly retrieved_at?: CmipRawTimestamp;
  readonly sourceRefs?: readonly string[];
  readonly source_refs?: readonly string[];
  readonly verification_status?: CmipRuntimeNewsVerificationStatus;
  readonly duplicate_group_id?: string;
}

export interface CmipRawHistoricalResult {
  readonly horizon: CmipRuntimeHorizon;
  readonly positive_rate?: number | null;
  readonly median_return?: number | null;
  readonly mean_return?: number | null;
  readonly max_drawdown?: number | null;
  readonly sample_size?: number | null;
  readonly return_unit?: string | null;
}

export interface CmipRawHistoricalEvidenceRecord {
  readonly evidence_id?: string;
  readonly hypothesis?: string;
  readonly event_definition?: string;
  readonly period_start?: string | null;
  readonly period_end?: string | null;
  readonly sample_size?: number | null;
  readonly forward_horizons?: readonly CmipRuntimeHorizon[];
  readonly results?: readonly CmipRawHistoricalResult[];
  readonly limitations?: string;
  readonly method_version?: string;
  readonly sourceRefs?: readonly string[];
  readonly source_refs?: readonly string[];
  readonly status?: "verified" | "partial" | "unavailable";
}

export interface CmipRawDecisionMemoryPayload {
  readonly status?: "available" | "partial" | "unavailable";
  readonly previous_report?: {
    readonly report_id: string;
    readonly published_at: CmipRawTimestamp;
    readonly posture: string;
  } | null;
}

export interface CmipRawDomainPayloads {
  readonly market?: CmipRawMarketPayload;
  readonly assets?: CmipRawAssetsPayload;
  readonly etf?: CmipRawEtfPayload;
  readonly stablecoins?: CmipRawStablecoinPayload;
  readonly derivatives?: CmipRawDerivativesPayload;
  readonly options?: CmipRawOptionsPayload;
  readonly macro?: CmipRawMacroPayload;
  readonly cross_asset?: CmipRawCrossAssetPayload;
  readonly breadth?: CmipRawBreadthPayload;
  readonly news?: readonly CmipRawNewsEvent[];
  readonly historical_evidence?: readonly CmipRawHistoricalEvidenceRecord[];
  readonly decision_memory?: CmipRawDecisionMemoryPayload;
}

export interface CmipNormalizationRequest {
  readonly meta: CmipNormalizationMeta;
  readonly runContext: CmipNormalizationRunContext;
  readonly sources: readonly RawSourceRecord[];
  readonly domains: CmipRawDomainPayloads;
  readonly previous?: {
    readonly reportId?: string | null;
    readonly inputId?: string | null;
  };
}

export interface CmipNormalizeDataPointOptions {
  readonly path: string;
  readonly domain: string;
  readonly dataCutoff: string;
  readonly sourceMap: ReadonlyMap<string, import("../runtime-input").CmipRuntimeSource>;
  readonly fieldType: CmipFreshnessFieldType;
  readonly targetUnit: CmipCanonicalUnit;
  readonly allowNegative?: boolean;
  readonly percentage?: boolean;
  readonly correlation?: boolean;
  readonly derived?: boolean;
  readonly proxy?: boolean;
  readonly required?: boolean;
}
