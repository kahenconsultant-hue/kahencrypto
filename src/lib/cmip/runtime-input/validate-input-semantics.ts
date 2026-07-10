import {
  CMIP_RUNTIME_ASSET_IDS,
  CMIP_RUNTIME_DERIVED_DATA_POINT_PATH_PARTS,
  CMIP_RUNTIME_MORNING_BRIEF_HORIZONS,
  CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS,
} from "./constants";
import type {
  CmipRuntimeAssetSnapshot,
  CmipRuntimeDataPoint,
  CmipRuntimeHistoricalEvidenceRecord,
  CmipRuntimeInputEnvelope,
  CmipRuntimeInputValidationError,
  CmipRuntimeNewsEvent,
  CmipRuntimeSource,
} from "./types";

const FORBIDDEN_RAW_PAYLOAD_PATTERNS: readonly RegExp[] = [
  /<\s*\/?\s*(html|body|script|style|svg|iframe|article|main|section|div)\b/i,
  /\bdata\s*:\s*image\//i,
  /\bbase64\b/i,
  /\bfunction\s*\(/i,
  /=>/,
];

const ASSET_MARKET_FIELDS = [
  "price",
  "market_cap",
  "volume_24h",
  "change_24h",
  "change_7d",
  "change_30d",
  "realized_volatility_30d",
  "relative_strength_vs_btc_7d",
  "relative_strength_vs_btc_30d",
] as const;

const CROSS_ASSET_CORRELATION_FIELDS = [
  "btc_nasdaq_correlation",
  "btc_dxy_correlation",
  "btc_gold_correlation",
  "btc_us10y_correlation",
  "btc_eth_correlation",
] as const;

export function validateCmipRuntimeInputSemantics(envelope: CmipRuntimeInputEnvelope): CmipRuntimeInputValidationError[] {
  const input = envelope.cmip_runtime_input;
  const errors: CmipRuntimeInputValidationError[] = [];
  const sourceMap = new Map<string, CmipRuntimeSource>();

  errors.push(...validateSourceRegistry(input.sources, sourceMap));
  errors.push(...validateDateOrder(input.meta.generated_at, input.meta.data_cutoff, "$.cmip_runtime_input.meta.data_cutoff"));
  errors.push(...validateRunContext(input.run_context.requested_horizons, input.run_context.run_type));
  errors.push(...validateAssetUniverse(input.assets));
  errors.push(...validateSelectedAssetBreadth(input.breadth.selected_asset_breadth));
  errors.push(...validateNews(input.news, sourceMap));
  errors.push(...validateHistoricalEvidence(input.historical_evidence));
  errors.push(...validateCorrelations(input.cross_asset));
  errors.push(...validateBreadthCounts(input.breadth));
  errors.push(...validateDataQuality(input.data_quality.failed_sources, sourceMap));
  errors.push(...validateAllSourceRefs(envelope, sourceMap));
  errors.push(...validateAllDataPoints(envelope, sourceMap));
  errors.push(...validateForbiddenRawPayloads(envelope));

  return errors;
}

function validateSourceRegistry(sources: readonly CmipRuntimeSource[], sourceMap: Map<string, CmipRuntimeSource>): CmipRuntimeInputValidationError[] {
  const errors: CmipRuntimeInputValidationError[] = [];
  const seen = new Map<string, number[]>();

  sources.forEach((source, index) => {
    const path = `$.cmip_runtime_input.sources[${index}]`;
    const indexes = seen.get(source.source_id) ?? [];
    indexes.push(index);
    seen.set(source.source_id, indexes);
    sourceMap.set(source.source_id, source);

    if (!source.source_id.trim()) {
      errors.push({ path: `${path}.source_id`, message: "source_id must not be empty.", keyword: "cmipRuntimeSourceId" });
    }

    if (source.url !== null && !isHttpUrl(source.url)) {
      errors.push({ path: `${path}.url`, message: `Source URL is malformed or unsupported: ${source.url}.`, keyword: "cmipRuntimeSourceUrl" });
    }

    if (!isValidTimestamp(source.retrieved_at)) {
      errors.push({ path: `${path}.retrieved_at`, message: "retrieved_at must be a valid date-time.", keyword: "cmipRuntimeSourceRetrievedAt" });
    }

    if (source.published_at !== null && !isValidTimestamp(source.published_at)) {
      errors.push({ path: `${path}.published_at`, message: "published_at must be null or a valid date-time.", keyword: "cmipRuntimeSourcePublishedAt" });
    }
  });

  for (const [sourceId, indexes] of seen) {
    if (indexes.length > 1) {
      errors.push({
        path: "$.cmip_runtime_input.sources",
        message: `Duplicate source_id ${sourceId} at indexes ${indexes.join(", ")}.`,
        keyword: "cmipRuntimeDuplicateSourceId",
      });
    }
  }

  return errors;
}

function validateDateOrder(generatedAt: string, dataCutoff: string, path: string): CmipRuntimeInputValidationError[] {
  const generatedTime = Date.parse(generatedAt);
  const cutoffTime = Date.parse(dataCutoff);
  if (!Number.isFinite(generatedTime) || !Number.isFinite(cutoffTime) || cutoffTime <= generatedTime) return [];
  return [{ path, message: "data_cutoff must not be later than generated_at.", keyword: "cmipRuntimeDataCutoffOrder" }];
}

function validateRunContext(requestedHorizons: readonly string[], runType: string): CmipRuntimeInputValidationError[] {
  if (runType !== "scheduled") return [];
  const requested = new Set(requestedHorizons);
  const missing = CMIP_RUNTIME_MORNING_BRIEF_HORIZONS.filter((horizon) => !requested.has(horizon));
  return missing.length
    ? [
        {
          path: "$.cmip_runtime_input.run_context.requested_horizons",
          message: `Scheduled morning runtime input must include horizons: ${missing.join(", ")}.`,
          keyword: "cmipRuntimeRequiredHorizons",
        },
      ]
    : [];
}

function validateAssetUniverse(assets: readonly CmipRuntimeAssetSnapshot[]): CmipRuntimeInputValidationError[] {
  const errors: CmipRuntimeInputValidationError[] = [];
  const symbolIndexes = new Map<string, number[]>();

  if (assets.length !== CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS.length) {
    errors.push({
      path: "$.cmip_runtime_input.assets",
      message: `Expected exactly ${CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS.length} asset snapshots; received ${assets.length}.`,
      keyword: "cmipRuntimeAssetUniverseSize",
    });
  }

  assets.forEach((asset, index) => {
    const indexes = symbolIndexes.get(asset.symbol) ?? [];
    indexes.push(index);
    symbolIndexes.set(asset.symbol, indexes);

    const path = `$.cmip_runtime_input.assets[${index}]`;
    const expectedAssetId = CMIP_RUNTIME_ASSET_IDS[asset.symbol];
    if (expectedAssetId === undefined) {
      errors.push({ path: `${path}.symbol`, message: `Unsupported CMIP runtime asset symbol: ${asset.symbol}.`, keyword: "cmipRuntimeUnsupportedAsset" });
    } else if (asset.asset_id !== expectedAssetId) {
      errors.push({
        path: `${path}.asset_id`,
        message: `Asset ${asset.symbol} must use canonical asset_id ${expectedAssetId}.`,
        keyword: "cmipRuntimeAssetId",
      });
    }

    if (asset.identity_status === "conflict" || asset.identity_status === "unavailable") {
      for (const field of ASSET_MARKET_FIELDS) {
        if (asset[field].value !== null) {
          errors.push({
            path: `${path}.${field}.value`,
            message: `Asset ${asset.symbol} has identity_status=${asset.identity_status}, so ${field}.value must be null.`,
            keyword: "cmipRuntimeAssetIdentityNull",
          });
        }
      }
    }
  });

  for (const [symbol, indexes] of symbolIndexes) {
    if (indexes.length > 1) {
      errors.push({
        path: "$.cmip_runtime_input.assets",
        message: `Duplicate asset symbol ${symbol} at indexes ${indexes.join(", ")}.`,
        keyword: "cmipRuntimeDuplicateAsset",
      });
    }
  }

  for (const symbol of CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS) {
    if (!symbolIndexes.has(symbol)) {
      errors.push({ path: "$.cmip_runtime_input.assets", message: `Missing required runtime asset symbol: ${symbol}.`, keyword: "cmipRuntimeMissingAsset" });
    }
  }

  return errors;
}

function validateSelectedAssetBreadth(items: readonly { symbol: string }[]): CmipRuntimeInputValidationError[] {
  const errors: CmipRuntimeInputValidationError[] = [];
  const symbols = new Set(items.map((item) => item.symbol));
  for (const symbol of CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS) {
    if (!symbols.has(symbol)) {
      errors.push({
        path: "$.cmip_runtime_input.breadth.selected_asset_breadth",
        message: `selected_asset_breadth is missing required symbol: ${symbol}.`,
        keyword: "cmipRuntimeBreadthAssetUniverse",
      });
    }
  }
  return errors;
}

function validateNews(news: readonly CmipRuntimeNewsEvent[], sourceMap: ReadonlyMap<string, CmipRuntimeSource>): CmipRuntimeInputValidationError[] {
  const errors: CmipRuntimeInputValidationError[] = [];
  const seen = new Map<string, number[]>();

  news.forEach((event, index) => {
    const path = `$.cmip_runtime_input.news[${index}]`;
    const indexes = seen.get(event.news_id) ?? [];
    indexes.push(index);
    seen.set(event.news_id, indexes);

    if (event.verification_status === "verified") {
      const conflictingSource = event.source_refs.find((sourceRef) => {
        const source = sourceMap.get(sourceRef);
        return source?.status === "conflict" || source?.status === "failed";
      });
      if (conflictingSource) {
        errors.push({
          path: `${path}.verification_status`,
          message: `Verified news cannot rely on failed or conflict source ${conflictingSource}.`,
          keyword: "cmipRuntimeVerifiedNewsSourceConflict",
        });
      }
    }
  });

  for (const [newsId, indexes] of seen) {
    if (indexes.length > 1) {
      errors.push({
        path: "$.cmip_runtime_input.news",
        message: `Duplicate news_id ${newsId} at indexes ${indexes.join(", ")}.`,
        keyword: "cmipRuntimeDuplicateNewsId",
      });
    }
  }

  return errors;
}

function validateHistoricalEvidence(records: readonly CmipRuntimeHistoricalEvidenceRecord[]): CmipRuntimeInputValidationError[] {
  const errors: CmipRuntimeInputValidationError[] = [];
  const seen = new Map<string, number[]>();

  records.forEach((record, index) => {
    const path = `$.cmip_runtime_input.historical_evidence[${index}]`;
    const indexes = seen.get(record.evidence_id) ?? [];
    indexes.push(index);
    seen.set(record.evidence_id, indexes);

    if (record.status === "unavailable") {
      if (record.sample_size !== null) {
        errors.push({ path: `${path}.sample_size`, message: "Unavailable historical evidence must use sample_size=null.", keyword: "cmipRuntimeUnavailableHistoricalSample" });
      }
      if (record.results.length > 0) {
        errors.push({ path: `${path}.results`, message: "Unavailable historical evidence must not contain results.", keyword: "cmipRuntimeUnavailableHistoricalResults" });
      }
    }

    if (record.status === "partial" && !record.limitations.trim()) {
      errors.push({ path: `${path}.limitations`, message: "Partial historical evidence must explain limitations.", keyword: "cmipRuntimeHistoricalLimitations" });
    }

    record.results.forEach((result, resultIndex) => {
      const resultPath = `${path}.results[${resultIndex}]`;
      const hasStat =
        result.positive_rate !== null ||
        result.median_return !== null ||
        result.mean_return !== null ||
        result.max_drawdown !== null;
      if (hasStat && (record.sample_size === null || result.sample_size === null)) {
        errors.push({
          path: `${resultPath}.sample_size`,
          message: "Historical statistical outputs require non-null record and result sample sizes.",
          keyword: "cmipRuntimeHistoricalStatSample",
        });
      }
      const hasReturn = result.median_return !== null || result.mean_return !== null || result.max_drawdown !== null;
      if (hasReturn && result.return_unit === null) {
        errors.push({
          path: `${resultPath}.return_unit`,
          message: "Historical return outputs must specify return_unit.",
          keyword: "cmipRuntimeHistoricalReturnUnit",
        });
      }
    });
  });

  for (const [evidenceId, indexes] of seen) {
    if (indexes.length > 1) {
      errors.push({
        path: "$.cmip_runtime_input.historical_evidence",
        message: `Duplicate evidence_id ${evidenceId} at indexes ${indexes.join(", ")}.`,
        keyword: "cmipRuntimeDuplicateEvidenceId",
      });
    }
  }

  return errors;
}

function validateCorrelations(crossAsset: CmipRuntimeInputEnvelope["cmip_runtime_input"]["cross_asset"]): CmipRuntimeInputValidationError[] {
  const errors: CmipRuntimeInputValidationError[] = [];
  for (const key of CROSS_ASSET_CORRELATION_FIELDS) {
    const correlations = crossAsset[key];
    correlations.forEach((correlation, index) => {
      const path = `$.cmip_runtime_input.cross_asset.${key}[${index}]`;
      if (correlation.value !== null && (correlation.value < -1 || correlation.value > 1)) {
        errors.push({ path: `${path}.value`, message: "Correlation value must be between -1 and 1.", keyword: "cmipRuntimeCorrelationRange" });
      }
      if (correlation.value !== null && correlation.calculation === null) {
        errors.push({ path: `${path}.calculation`, message: "Correlation values require calculation metadata.", keyword: "cmipRuntimeCorrelationCalculation" });
      }
      if (correlation.value !== null && correlation.sample_count === null) {
        errors.push({ path: `${path}.sample_count`, message: "Correlation values require sample_count.", keyword: "cmipRuntimeCorrelationSample" });
      }
    });
  }
  return errors;
}

function validateBreadthCounts(breadth: CmipRuntimeInputEnvelope["cmip_runtime_input"]["breadth"]): CmipRuntimeInputValidationError[] {
  const errors: CmipRuntimeInputValidationError[] = [];
  const countFields = ["assets_above_ma_7d", "assets_above_ma_30d", "positive_assets_24h", "positive_assets_7d"] as const;
  for (const field of countFields) {
    const value = breadth[field].value;
    if (typeof value === "number" && value > CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS.length) {
      errors.push({
        path: `$.cmip_runtime_input.breadth.${field}.value`,
        message: `${field} cannot exceed the ten-asset runtime universe.`,
        keyword: "cmipRuntimeBreadthCount",
      });
    }
  }
  return errors;
}

function validateDataQuality(failedSources: readonly string[], sourceMap: ReadonlyMap<string, CmipRuntimeSource>): CmipRuntimeInputValidationError[] {
  return failedSources.flatMap((sourceId, index) =>
    sourceMap.has(sourceId)
      ? []
      : [
          {
            path: `$.cmip_runtime_input.data_quality.failed_sources[${index}]`,
            message: `failed_sources entry ${sourceId} is not registered in sources.`,
            keyword: "cmipRuntimeFailedSourceRef",
          },
        ],
  );
}

function validateAllSourceRefs(root: unknown, sourceMap: ReadonlyMap<string, CmipRuntimeSource>): CmipRuntimeInputValidationError[] {
  const errors: CmipRuntimeInputValidationError[] = [];
  walk(root, "$", (value, path) => {
    if (!isRecord(value) || !Array.isArray(value.source_refs)) return;
    value.source_refs.forEach((sourceRef, index) => {
      if (typeof sourceRef !== "string" || !sourceMap.has(sourceRef)) {
        errors.push({
          path: `${path}.source_refs[${index}]`,
          message: `Source reference ${String(sourceRef)} does not exist in sources.`,
          keyword: "cmipRuntimeSourceRefMissing",
        });
      }
    });
  });
  return errors;
}

function validateAllDataPoints(root: unknown, sourceMap: ReadonlyMap<string, CmipRuntimeSource>): CmipRuntimeInputValidationError[] {
  const errors: CmipRuntimeInputValidationError[] = [];
  walk(root, "$", (value, path) => {
    if (!isDataPoint(value)) return;

    if ((value.status === "missing" || value.status === "conflict") && value.value !== null) {
      errors.push({ path: `${path}.value`, message: `Data point status=${value.status} requires value=null.`, keyword: "cmipRuntimeDataPointNull" });
    }

    if (value.status === "available" && value.source_refs.length === 0) {
      errors.push({ path: `${path}.source_refs`, message: "Available data points require at least one source reference.", keyword: "cmipRuntimeAvailableSourceRef" });
    }

    if (value.freshness.is_stale && value.status !== "stale") {
      errors.push({ path: `${path}.status`, message: "If freshness.is_stale=true, status must be stale.", keyword: "cmipRuntimeStaleStatus" });
    }

    if (value.status === "proxy" && !value.calculation?.method.trim()) {
      errors.push({ path: `${path}.calculation`, message: "Proxy data points must include calculation.method describing the proxy method.", keyword: "cmipRuntimeProxyMethod" });
    }

    if (isDerivedDataPointPath(path) && value.value !== null && value.calculation === null) {
      errors.push({ path: `${path}.calculation`, message: "Derived runtime input values require calculation metadata.", keyword: "cmipRuntimeDerivedCalculation" });
    }

    if (typeof value.value === "number") {
      if (isNonNegativeDataPointPath(path) && value.value < 0) {
        errors.push({ path: `${path}.value`, message: "This numeric runtime input value must be non-negative.", keyword: "cmipRuntimeNonNegativeValue" });
      }
      if (isBoundedPercentPath(path) && (value.value < 0 || value.value > 100)) {
        errors.push({ path: `${path}.value`, message: "Percentage runtime input value must be between 0 and 100.", keyword: "cmipRuntimePercentageRange" });
      }
    }

    if (["available", "stale", "proxy"].includes(value.status)) {
      const blockedSource = value.source_refs.find((sourceRef) => {
        const source = sourceMap.get(sourceRef);
        return source?.status === "failed" || source?.status === "conflict";
      });
      if (blockedSource) {
        errors.push({
          path: `${path}.source_refs`,
          message: `Data point status=${value.status} cannot be supported by failed or conflict source ${blockedSource}.`,
          keyword: "cmipRuntimeBlockedSourceRef",
        });
      }
    }
  });
  return errors;
}

function validateForbiddenRawPayloads(root: unknown): CmipRuntimeInputValidationError[] {
  const errors: CmipRuntimeInputValidationError[] = [];
  walk(root, "$", (value, path) => {
    if (typeof value === "string" && FORBIDDEN_RAW_PAYLOAD_PATTERNS.some((pattern) => pattern.test(value))) {
      errors.push({
        path,
        message: "Runtime input forbids raw documents, HTML, scripts, SVG, Base64 images and executable payloads.",
        keyword: "cmipRuntimeForbiddenPayload",
      });
    }
  });
  return errors;
}

function isDerivedDataPointPath(path: string): boolean {
  return CMIP_RUNTIME_DERIVED_DATA_POINT_PATH_PARTS.some((part) => path.includes(part));
}

function isNonNegativeDataPointPath(path: string): boolean {
  return [
    "market_cap",
    "volume",
    "supply",
    "open_interest",
    "liquidations",
    "aum",
    "reserves",
    "price",
    "total_crypto_market_cap",
    "total_crypto_volume_24h",
  ].some((part) => path.includes(part));
}

function isBoundedPercentPath(path: string): boolean {
  return ["dominance", "fear_greed_index", "altcoin_season_index", "btc_leadership", "eth_participation"].some((part) => path.includes(part));
}

function isDataPoint(value: unknown): value is CmipRuntimeDataPoint {
  return (
    isRecord(value) &&
    "value" in value &&
    "unit" in value &&
    "observed_at" in value &&
    Array.isArray(value.source_refs) &&
    typeof value.quality === "number" &&
    isRecord(value.freshness) &&
    typeof value.status === "string" &&
    "calculation" in value
  );
}

function walk(value: unknown, path: string, visit: (value: unknown, path: string) => void): void {
  visit(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, visit));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    walk(item, appendPropertyPath(path, key), visit);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function appendPropertyPath(basePath: string, property: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(property)) return `${basePath}.${property}`;
  if (/^\d+$/.test(property)) return `${basePath}[${property}]`;
  return `${basePath}[${JSON.stringify(property)}]`;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}
