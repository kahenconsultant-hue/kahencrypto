export type AssetSymbol = "BTC" | "ETH" | "SOL" | "USDT" | "DXY" | "Gold" | "Nasdaq" | "US10Y" | "Fed";
export type IntelligenceAssetSymbol = Exclude<AssetSymbol, "Fed">;

export type NewsCategory =
  | "central_banks"
  | "economic_data"
  | "financial_media"
  | "crypto_media"
  | "onchain"
  | "derivatives"
  | "stablecoins"
  | "etf"
  | "sentiment"
  | "geopolitics"
  | "alternative_data"
  | "exchange_health"
  | "volatility_regime";

export type AlertLevel = "Info" | "Watch" | "Important" | "Critical";

export type MarketRegime =
  | "Risk-On"
  | "Risk-Off"
  | "Liquidity Expansion"
  | "Liquidity Contraction"
  | "Macro Uncertainty"
  | "Panic"
  | "Euphoria"
  | "ETF Accumulation"
  | "ETF Distribution"
  | "Stablecoin Expansion"
  | "Stablecoin Stress"
  | "Geopolitical Stress"
  | "Leverage Overheating";

export type TimeHorizon = "short" | "medium" | "long";

export type SourceType = "API" | "RSS" | "crawler" | "manual" | "premium";
export type DataSourceStatus = "live" | "partial_live" | "delayed" | "estimated" | "unavailable";
export type DataFreshnessStatus = "live" | "fresh" | "delayed" | "stale" | "invalid_stale_critical";
export type CorrelationState = "strongly_correlated" | "weakening" | "decoupling" | "inverse_correlation" | "unstable";
export type LiquidityState = "expansion" | "contraction" | "overheating" | "fragile" | "neutral";
export type LiquidityV2State =
  | "healthy_expansion"
  | "leverage_driven_expansion"
  | "liquidity_squeeze"
  | "speculative_overheating"
  | "weak_participation_rally"
  | "defensive_positioning"
  | "neutral_mixed";
export type DirectionalBias = "bullish" | "bearish" | "neutral" | "mixed";
export type RegimeNuance = "strong" | "moderate" | "fragile" | "conflicting";
export type IntelligenceTimeframe = "intraday" | "24h" | "3d" | "7d";
export type TransmissionChannel =
  | "liquidity"
  | "rates"
  | "dollar"
  | "risk_on_risk_off"
  | "etf_flows"
  | "stablecoin_flows"
  | "onchain_activity"
  | "geopolitical_risk"
  | "regulatory_risk"
  | "sentiment_news_shock"
  | "correlation_breakdown"
  | "leverage";
export type SignalGroup =
  | "price"
  | "macro"
  | "liquidity"
  | "flows"
  | "stablecoins"
  | "onchain"
  | "leverage"
  | "volatility"
  | "correlation"
  | "news"
  | "sentiment"
  | "geopolitical";
export type DataQuality = DataSourceStatus;
export type IntelligenceOutputSourceType = "direct" | "derived" | "proxy" | "unavailable";
export type ConfidenceLabel = "weak" | "limited" | "moderate" | "strong" | "very_strong" | "unavailable";
export type TraderAlertPriority = "low" | "medium" | "high" | "critical";
export type EngineRegimeState =
  | "risk_on"
  | "risk_off"
  | "macro_uncertainty"
  | "liquidity_expansion"
  | "leverage_overheating"
  | "panic"
  | "accumulation"
  | "distribution"
  | "euphoric"
  | "defensive";

export type MacroRegimeLabel =
  | "Risk-On Expansion"
  | "Weak Risk-On"
  | "Fragile Risk-On"
  | "Liquidity-Constrained Risk-On"
  | "Risk-Off Defensive"
  | "Liquidity Squeeze"
  | "Dollar Strength Pressure"
  | "Rates Shock"
  | "Crypto-Specific Bullish"
  | "Crypto-Specific Stress"
  | "Geopolitical Shock"
  | "Neutral / Transition"
  | "High Volatility Unclear Regime";

export type IntelligenceSourceCategory =
  | "Central Banks / Macro Policy"
  | "Economic Data / Calendar"
  | "Newswires / Financial Media"
  | "On-chain Analytics"
  | "Wallet / Whale Tracking"
  | "Derivatives / Leverage"
  | "ETF Flows / Institutional Flows"
  | "Stablecoin / Liquidity Flows"
  | "DeFi / Ecosystem Flows"
  | "Layer 1 / Ecosystem-specific Data"
  | "Market Data / Correlations"
  | "Sentiment / Social Intelligence"
  | "Geopolitics / Security"
  | "AI / Alternative Data"
  | "Exchange Health / Risk"
  | "Fear / Volatility / Regime"
  | "Smart Alert Sources";

export interface IntelligenceSourceConfig {
  id: string;
  name: string;
  category: IntelligenceSourceCategory;
  sourceType: SourceType;
  assetRelevance: IntelligenceAssetSymbol[];
  horizonRelevance: TimeHorizon[];
  reliabilityScore: number;
  updateFrequency: string;
  currentStatus: DataSourceStatus;
  notes: string;
}

export interface SourceSignal {
  sourceId: string;
  sourceName: string;
  category: IntelligenceSourceCategory;
  status: DataSourceStatus;
  reliabilityScore: number;
  freshnessMinutes?: number;
  dataQuality?: DataSourceStatus;
  lastUpdatedAt: string;
  confidence: number;
  signalFa: string;
}

export interface ForecastStructure {
  currentMarketStatus: string;
  shortTermScenario: string;
  mediumTermScenario: string;
  mainRisks: string[];
  monitoringData: string[];
  analysisConfidenceText: string;
}

export interface HorizonIntelligence {
  asset: IntelligenceAssetSymbol;
  horizon: TimeHorizon;
  horizonLabelFa: string;
  regime: MarketRegime;
  summary: string;
  bullishFactors: string[];
  bearishFactors: string[];
  liquiditySignal: string;
  macroSignal: string;
  flowSignal: string;
  sentimentSignal: string;
  correlationSignal: string;
  keyRisks: string[];
  confidence: number;
  dataQuality: DataSourceStatus;
  forecast: ForecastStructure;
  quantitativeScores: SignalScores;
  recommendedMonitoring: string[];
  usedSources: SourceSignal[];
  lastUpdatedAt: string;
}

export interface AssetImpact {
  asset: AssetSymbol;
  horizon: TimeHorizon;
  direction: "supportive" | "pressure" | "mixed" | "neutral";
  confidence: number;
  explanationFa: string;
  invalidationFa: string;
}

export interface ProcessedNewsItem {
  id: string;
  source: string;
  sourceTier: "primary" | "premium" | "market" | "social";
  category: NewsCategory;
  title: string;
  titleFa: string;
  summaryFa: string;
  keyPointsFa: string[];
  url: string;
  timestamp: string;
  language: string;
  fingerprintHash: string;
  importance: number;
  alertLevel: AlertLevel;
  tags: string[];
  marketRegime: MarketRegime[];
  impacts: AssetImpact[];
  analysisFa: string;
}

export interface SmartAlert {
  id: string;
  type:
    | "Macro Alert"
    | "Fed Alert"
    | "ETF Alert"
    | "Stablecoin Alert"
    | "Whale Alert"
    | "Correlation Alert"
    | "Geopolitical Alert"
    | "Derivatives Alert"
    | "Liquidity Alert"
    | "Exchange Risk Alert"
    | "Correlation Breakdown Alert"
    | "Regime Shift Alert"
    | "ETF Flow Alert"
    | "Stablecoin Risk Alert"
    | "Geopolitical Shock Alert"
    | "Rates Shock Alert"
    | "Dollar Pressure Alert"
    | "Sentiment Shock Alert"
    | "On-chain Confirmation Alert"
    | "Leverage Risk Alert"
    | "Contradiction Alert"
    | "Weak Rally Alert"
    | "Leverage Trap Alert"
    | "Hidden Weakness Alert"
    | "Hidden Strength Alert"
    | "Macro Divergence Alert"
    | "Liquidity Mismatch Alert"
    | "Unstable Breakout Alert"
    | "Data Quality Alert"
    | "macro_pressure_proxy_alert"
    | "liquidity_proxy_alert"
    | "stablecoin_pressure_alert"
    | "volatility_expansion_alert"
    | "risk_off_transition_alert"
    | "risk_on_recovery_alert"
    | "data_degradation_alert"
    | "premium_data_missing_notice";
  level: AlertLevel;
  priority?: TraderAlertPriority;
  direction?: DirectionalBias;
  timeframe?: IntelligenceTimeframe;
  triggerCondition?: string;
  evidence?: string[];
  causalChain?: string;
  invalidationCondition?: string;
  suggestedTraderAction?: string;
  titleFa: string;
  reasoningFa: string;
  affectedAssets: AssetSymbol[];
  confidence: number;
  importance: number;
  scenarioProbability?: number;
  continuationProbability?: number;
  exhaustionProbability?: number;
  urgency?: TraderAlertPriority;
  trapRisk?: number;
  whyItMattersFa: string;
  monitoringFa: string[];
  dataUsed?: Array<{
    label: string;
    key: string;
    source: string;
    status: "available" | "missing" | "estimated" | "stale";
    value?: number | null;
  }>;
  missingCriticalInputs?: string[];
  confidenceCapReason?: string | null;
  dataQuality: DataSourceStatus;
  createdAt: string;
  scenarioFa: string;
}

export interface CorrelationPair {
  id: string;
  pair: string;
  left: AssetSymbol;
  right: AssetSymbol | "VIX" | "Stablecoin dominance" | "Liquidity" | "ETF flows" | "Tech Beta" | "Retail Risk Appetite";
  rolling24h?: number | null;
  rolling7d: number | null;
  rolling30d: number | null;
  rolling90d: number | null;
  change7d: number | null;
  sampleSize?: number;
  sampleWarning?: string;
  regimeState: CorrelationState;
  interpretationFa: string;
  regimeImpact?: string;
  confidence?: number | null;
  dataQuality?: DataSourceStatus;
}

export interface CorrelationSignal {
  assetPair: string;
  left: AssetSymbol | "VIX" | "Stablecoin dominance";
  right: AssetSymbol | "VIX" | "Stablecoin dominance" | "Liquidity" | "ETF flows" | "Tech Beta" | "Retail Risk Appetite";
  correlation24H: number | null;
  previous24H: number | null;
  correlation7D: number | null;
  correlation30D: number | null;
  correlation90D: number | null;
  previous90D: number | null;
  correlationChange: number | null;
  sampleSizes?: Record<"24h" | "7d" | "30d" | "90d", number>;
  state: CorrelationState;
  confidence: number | null;
  interpretation: string;
  regimeImpact: string;
  dataQuality: DataSourceStatus;
  lastUpdatedAt: string;
}

export interface SignalScores {
  marketRiskScore: number;
  liquidityScore: number;
  macroStressScore: number;
  narrativeStrength: number;
  volatilityRisk: number;
}

export interface DataSeriesPoint {
  timestamp: string;
  value: number;
}

export interface DataPoint<T = number> {
  id?: string;
  key: string;
  asset?: AssetSymbol | "VIX" | "Stablecoins";
  metric?: string;
  value: T | null;
  previousValue?: T | null;
  changeAbs?: number | null;
  changePct?: number | null;
  timestamp: string | null;
  delayMinutes?: number;
  source: string;
  sourceType?: SourceType;
  quality: DataQuality;
  reliability: number;
  confidenceBase?: number;
  sampleSize?: number;
  history?: DataSeriesPoint[];
  intradayHistory?: DataSeriesPoint[];
  group: SignalGroup;
  error?: string;
  estimatedReason?: string;
}

export interface NormalizedSignal {
  id?: string;
  key: string;
  label: string;
  asset?: AssetSymbol | "VIX" | "Stablecoins";
  metric?: string;
  value: number | null;
  previousValue: number | null;
  changeAbs?: number | null;
  changePct?: number | null;
  change: number | null;
  direction: "up" | "down" | "flat" | "unavailable";
  zScore?: number;
  group: SignalGroup;
  channel: TransmissionChannel;
  source: string;
  sourceType?: SourceType;
  quality: DataQuality;
  reliability: number;
  confidenceBase?: number;
  sampleSize?: number;
  delayMinutes?: number;
  history?: DataSeriesPoint[];
  intradayHistory?: DataSeriesPoint[];
  timestamp: string | null;
  error?: string;
  estimatedReason?: string;
}

export interface ConfidenceResult {
  available: boolean;
  score: number | null;
  label?: ConfidenceLabel;
  formula: string;
  availableGroups: SignalGroup[];
  missingGroups: SignalGroup[];
  explanation: string;
}

export interface DirectionalImpactProfile {
  asset: IntelligenceAssetSymbol;
  directionalBias: DirectionalBias;
  impactScore: number;
  confidence: ConfidenceResult;
  timeframe: IntelligenceTimeframe;
  mainDrivers: string[];
  opposingDrivers: string[];
  transmissionChannels: TransmissionChannel[];
  regimeDependency: string;
  invalidationCondition: string;
  traderInterpretation: string;
  evidence: string[];
  scoreFormula: string;
  scenarios?: AssetScenario[];
  lastUpdatedAt: string;
}

export interface AssetScenario {
  name: "base" | "bullish" | "bearish" | "invalidation";
  labelFa: string;
  probability: number;
  triggerConditions: string[];
  expectedDrivers: string[];
  riskFactors: string[];
}

export interface CausalInsight {
  observation: string;
  causalChain: string;
  affectedAssets: AssetSymbol[];
  directionalEffect: DirectionalBias;
  timeframe: IntelligenceTimeframe;
  confidence: ConfidenceResult;
  invalidation: string;
  traderInterpretation: string;
}

export interface LiquidityEngineOutput extends SignalScores {
  liquidityState: LiquidityState;
  v2State?: LiquidityV2State;
  condition: "Expanding" | "Contracting" | "Neutral" | "Stress" | "Unclear";
  liquidityScoreSigned: number;
  macroLiquidityScore: number;
  cryptoLiquidityScore: number;
  realSpotLiquidityScore?: number;
  leveragedLiquidityScore?: number;
  liquiditySustainabilityScore?: number;
  stablecoinTrend: DirectionalBias;
  etfFlowStatus: DirectionalBias;
  leverageStress: number;
  institutionalFlow: number;
  stablecoinExpansion: number;
  speculativeHeat: number;
  riskCompression: number;
  confidence: number;
  confidenceDetail?: ConfidenceResult;
  formula?: string;
  decomposition?: string[];
  warnings?: string[];
  explanation: string;
  historicalComparison: string;
  dataQuality: DataSourceStatus;
  sourceType?: IntelligenceOutputSourceType;
  unavailablePremiumInputs?: string[];
  missingInputs?: string[];
  proxySignals?: string[];
  lastUpdatedAt: string;
}

export interface MarketRegimeEngineOutput extends SignalScores {
  regime: EngineRegimeState;
  regimeLabel?: MacroRegimeLabel;
  regimeNuance?: RegimeNuance;
  confidence: number;
  confidenceDetail?: ConfidenceResult;
  previousRegime: EngineRegimeState;
  previousRegimeLabel?: MacroRegimeLabel;
  changedLast24h?: boolean;
  rawRegimeScore?: number;
  finalRegimeScore?: number;
  penalties?: {
    contradictionPenalty: number;
    liquidityPenalty: number;
    leveragePenalty: number;
    dataQualityPenalty: number;
    correlationPenalty: number;
  };
  transitionAnalysis?: {
    state: string;
    probability: number;
    targetRegime: MacroRegimeLabel;
    explanation: string;
  };
  transitionProbability: number;
  keyDrivers: string[];
  affectedAssets: AssetSymbol[];
  invalidationSignals?: string[];
  explanation: string;
  historicalComparison: string;
  dataQuality: DataSourceStatus;
  sourceType?: IntelligenceOutputSourceType;
  missingInputs?: string[];
  proxySignals?: string[];
  lastUpdatedAt: string;
}

export interface AssetIntelligence {
  symbol: IntelligenceAssetSymbol;
  titleFa: string;
  roleFa?: string;
  marketStructure: string;
  macroPressure: number;
  liquidityScore: number;
  sentimentScore: number;
  whaleFlow: string;
  etfFlow: string;
  onchainSummary: string;
  aiInterpretation: string;
  keyRisks: string[];
  regimeSensitivity: string[];
  metrics: Array<{ label: string; value: string; tone: "good" | "warn" | "bad" | "neutral" }>;
  horizons?: Record<TimeHorizon, HorizonIntelligence>;
  sourceMapping?: IntelligenceSourceConfig[];
}

export interface LiquiditySnapshot {
  liquidityScore: number;
  fedBalanceSheet: number;
  reverseRepo: number;
  tga: number;
  dxy: number;
  us10y: number;
  stablecoinSupplyChange7d: number;
  etfNetFlows5d: number;
  exchangeReserveTrend: "declining" | "rising" | "flat";
  interpretationFa: string;
}
