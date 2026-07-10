import type { CmipRuntimeAssetSnapshot, CmipRuntimeTrendState } from "../../runtime-input";
import { CMIP_RUNTIME_ASSET_IDS, CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS, type CmipRuntimeAssetSymbol } from "../../runtime-input/constants";
import { resolveAssetIdentity } from "../asset-identity";
import { normalizeNumericDataPoint, missingNumericDataPoint } from "../data-point-normalizer";
import { cmipNormalizationIssue, type CmipNormalizationError, type CmipNormalizationWarning } from "../errors";
import { normalizationFail, normalizationOk, type CmipNormalizationResult } from "../result";
import type { CmipNormalizeDataPointOptions, CmipRawAssetRecord, CmipRawAssetsPayload, CmipRawDataPoint } from "../types";

const ASSET_NAMES: Readonly<Record<CmipRuntimeAssetSymbol, string>> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  USDT: "Tether",
  BNB: "BNB",
  SOL: "Solana",
  XRP: "XRP",
  TRX: "TRON",
  TON: "Toncoin",
  DOGE: "Dogecoin",
  ADA: "Cardano",
};

export function normalizeAssetsDomain(
  raw: CmipRawAssetsPayload | undefined,
  context: Pick<CmipNormalizeDataPointOptions, "dataCutoff" | "sourceMap">,
): CmipNormalizationResult<readonly CmipRuntimeAssetSnapshot[]> {
  const errors: CmipNormalizationError[] = [];
  const warnings: CmipNormalizationWarning[] = [];
  if (!raw?.assets?.length) {
    return normalizationFail([
      cmipNormalizationIssue({ code: "DOMAIN_FAILED", path: "$.domains.assets", domain: "assets", message: "Assets domain is required.", severity: "critical" }),
    ]);
  }

  const bySymbol = new Map<CmipRuntimeAssetSymbol, CmipRawAssetRecord>();
  raw.assets.forEach((asset, index) => {
    const identity = resolveAssetIdentity({
      symbol: asset.symbol,
      provider: asset.provider,
      providerAssetId: asset.provider_asset_id ?? asset.providerAssetId,
      assetId: asset.asset_id ?? asset.assetId,
      path: `$.domains.assets.assets[${index}]`,
    });
    if (!identity.ok) {
      errors.push(...identity.errors);
      return;
    }
    const resolution = identity.data;
    warnings.push(...resolution.warnings);
    errors.push(...resolution.errors);
    if (!resolution.canonicalSymbol) {
      errors.push(cmipNormalizationIssue({ code: "UNSUPPORTED_ASSET", path: `$.domains.assets.assets[${index}].symbol`, domain: "assets", message: "Asset could not be mapped to the canonical universe.", severity: "error" }));
      return;
    }
    if (bySymbol.has(resolution.canonicalSymbol)) {
      errors.push(cmipNormalizationIssue({ code: "DUPLICATE_ASSET", path: "$.domains.assets.assets", domain: "assets", message: `Duplicate canonical asset ${resolution.canonicalSymbol}.`, severity: "error" }));
    } else {
      bySymbol.set(resolution.canonicalSymbol, asset);
    }
  });

  const normalized = CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS.map((symbol) => {
    const asset = bySymbol.get(symbol);
    if (!asset) {
      errors.push(cmipNormalizationIssue({ code: "MISSING_ASSET", path: "$.domains.assets.assets", domain: "assets", message: `Missing canonical asset ${symbol}.`, severity: "critical" }));
      return unavailableAsset(symbol, "unavailable", []);
    }
    return normalizeAsset(asset, symbol, context, errors, warnings);
  });

  return errors.length ? normalizationFail(errors, warnings) : normalizationOk(normalized, warnings);
}

function normalizeAsset(
  asset: CmipRawAssetRecord,
  expectedSymbol: CmipRuntimeAssetSymbol,
  context: Pick<CmipNormalizeDataPointOptions, "dataCutoff" | "sourceMap">,
  errors: CmipNormalizationError[],
  warnings: CmipNormalizationWarning[],
): CmipRuntimeAssetSnapshot {
  const path = `$.domains.assets.${expectedSymbol}`;
  const identity = resolveAssetIdentity({
    symbol: asset.symbol,
    provider: asset.provider,
    providerAssetId: asset.provider_asset_id ?? asset.providerAssetId,
    assetId: asset.asset_id ?? asset.assetId,
    path,
  });
  if (!identity.ok) {
    errors.push(...identity.errors);
    return unavailableAsset(expectedSymbol, "unavailable", []);
  }
  warnings.push(...identity.data.warnings);
  errors.push(...identity.data.errors);
  const sourceRefs = [...(asset.source_refs ?? asset.sourceRefs ?? [])].map((sourceRef) => sourceRef.trim()).filter(Boolean).sort();
  if (identity.data.identityStatus !== "verified") {
    return unavailableAsset(expectedSymbol, identity.data.identityStatus, sourceRefs);
  }

  const normalize = (field: keyof CmipRawAssetRecord, targetUnit: "USD" | "PERCENT", derived = false) => {
    const rawPoint = asset[field] as CmipRawDataPoint | undefined;
    const result = normalizeNumericDataPoint(rawPoint, {
      path: `${path}.${String(field)}`,
      domain: "assets",
      dataCutoff: context.dataCutoff,
      sourceMap: context.sourceMap,
      fieldType: field === "volume_24h" ? "market_volume" : "market_price",
      targetUnit,
      percentage: targetUnit === "PERCENT",
      derived,
    });
    warnings.push(...result.warnings);
    if (!result.ok) {
      errors.push(...result.errors);
      return missingNumericDataPoint(targetUnit === "USD" ? "USD" : "percent", field === "volume_24h" ? "market_volume" : "market_price");
    }
    return result.data;
  };

  return {
    symbol: expectedSymbol,
    asset_id: CMIP_RUNTIME_ASSET_IDS[expectedSymbol],
    name: asset.name?.trim() || ASSET_NAMES[expectedSymbol],
    identity_status: "verified",
    price: normalize("price", "USD"),
    market_cap: normalize("market_cap", "USD"),
    volume_24h: normalize("volume_24h", "USD"),
    change_24h: normalize("change_24h", "PERCENT", true),
    change_7d: normalize("change_7d", "PERCENT", true),
    change_30d: normalize("change_30d", "PERCENT", true),
    realized_volatility_30d: normalize("realized_volatility_30d", "PERCENT", true),
    relative_strength_vs_btc_7d: normalize("relative_strength_vs_btc_7d", "PERCENT", true),
    relative_strength_vs_btc_30d: normalize("relative_strength_vs_btc_30d", "PERCENT", true),
    trend_state: isTrendState(asset.trend_state) ? asset.trend_state : "unavailable",
    source_refs: sourceRefs,
  };
}

function unavailableAsset(symbol: CmipRuntimeAssetSymbol, status: "conflict" | "unavailable", sourceRefs: readonly string[]): CmipRuntimeAssetSnapshot {
  const pointStatus: "conflict" | "missing" = status === "conflict" ? "conflict" : "missing";
  const nullPoint = (unit: string) => ({ value: null, unit, observed_at: null, source_refs: sourceRefs, quality: 0, freshness: { age_seconds: null, max_age_seconds: 3600, is_stale: false }, status: pointStatus, calculation: null });
  return {
    symbol,
    asset_id: CMIP_RUNTIME_ASSET_IDS[symbol],
    name: ASSET_NAMES[symbol],
    identity_status: status,
    price: nullPoint("USD"),
    market_cap: nullPoint("USD"),
    volume_24h: nullPoint("USD"),
    change_24h: nullPoint("percent"),
    change_7d: nullPoint("percent"),
    change_30d: nullPoint("percent"),
    realized_volatility_30d: nullPoint("percent"),
    relative_strength_vs_btc_7d: nullPoint("percent"),
    relative_strength_vs_btc_30d: nullPoint("percent"),
    trend_state: "unavailable",
    source_refs: sourceRefs,
  };
}

function isTrendState(value: unknown): value is CmipRuntimeTrendState {
  return value === "strong_up" || value === "up" || value === "neutral" || value === "down" || value === "strong_down" || value === "unavailable";
}
