import { CMIP_RUNTIME_ASSET_IDS, CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS, type CmipRuntimeAssetSymbol } from "../runtime-input/constants";
import { cmipNormalizationIssue, type CmipNormalizationError, type CmipNormalizationWarning } from "./errors";
import { normalizationOk, type CmipNormalizationResult } from "./result";

export interface CmipProviderAssetAlias {
  readonly provider: string;
  readonly providerAssetId: string;
  readonly canonicalSymbol: CmipRuntimeAssetSymbol;
  readonly canonicalAssetId: string;
}

export interface AssetIdentityInput {
  readonly symbol?: string;
  readonly provider?: string;
  readonly providerAssetId?: string;
  readonly assetId?: string;
  readonly path?: string;
}

export interface AssetIdentityResolution {
  readonly canonicalSymbol: CmipRuntimeAssetSymbol | null;
  readonly canonicalAssetId: string | null;
  readonly identityStatus: "verified" | "conflict" | "unavailable";
  readonly warnings: readonly CmipNormalizationWarning[];
  readonly errors: readonly CmipNormalizationError[];
}

export const CMIP_PROVIDER_ASSET_ALIASES: readonly CmipProviderAssetAlias[] = [
  { provider: "coingecko", providerAssetId: "bitcoin", canonicalSymbol: "BTC", canonicalAssetId: CMIP_RUNTIME_ASSET_IDS.BTC },
  { provider: "coingecko", providerAssetId: "ethereum", canonicalSymbol: "ETH", canonicalAssetId: CMIP_RUNTIME_ASSET_IDS.ETH },
  { provider: "coingecko", providerAssetId: "tether", canonicalSymbol: "USDT", canonicalAssetId: CMIP_RUNTIME_ASSET_IDS.USDT },
  { provider: "task003_spec_alias", providerAssetId: "crypto:tether", canonicalSymbol: "USDT", canonicalAssetId: CMIP_RUNTIME_ASSET_IDS.USDT },
  { provider: "coingecko", providerAssetId: "binancecoin", canonicalSymbol: "BNB", canonicalAssetId: CMIP_RUNTIME_ASSET_IDS.BNB },
  { provider: "coingecko", providerAssetId: "bnb", canonicalSymbol: "BNB", canonicalAssetId: CMIP_RUNTIME_ASSET_IDS.BNB },
  { provider: "coingecko", providerAssetId: "solana", canonicalSymbol: "SOL", canonicalAssetId: CMIP_RUNTIME_ASSET_IDS.SOL },
  { provider: "coingecko", providerAssetId: "ripple", canonicalSymbol: "XRP", canonicalAssetId: CMIP_RUNTIME_ASSET_IDS.XRP },
  { provider: "coingecko", providerAssetId: "xrp", canonicalSymbol: "XRP", canonicalAssetId: CMIP_RUNTIME_ASSET_IDS.XRP },
  { provider: "coingecko", providerAssetId: "tron", canonicalSymbol: "TRX", canonicalAssetId: CMIP_RUNTIME_ASSET_IDS.TRX },
  { provider: "coingecko", providerAssetId: "the-open-network", canonicalSymbol: "TON", canonicalAssetId: CMIP_RUNTIME_ASSET_IDS.TON },
  { provider: "coingecko", providerAssetId: "dogecoin", canonicalSymbol: "DOGE", canonicalAssetId: CMIP_RUNTIME_ASSET_IDS.DOGE },
  { provider: "coingecko", providerAssetId: "cardano", canonicalSymbol: "ADA", canonicalAssetId: CMIP_RUNTIME_ASSET_IDS.ADA },
];

export function resolveAssetIdentity(input: AssetIdentityInput): CmipNormalizationResult<AssetIdentityResolution> {
  const path = input.path ?? "$.asset";
  const warnings: CmipNormalizationWarning[] = [];
  const errors: CmipNormalizationError[] = [];
  const symbol = normalizeSymbol(input.symbol);
  const provider = input.provider?.trim().toLowerCase() ?? "";
  const providerAssetId = input.providerAssetId?.trim().toLowerCase() ?? "";
  const suppliedAssetId = input.assetId?.trim() ?? "";

  const alias = provider && providerAssetId ? CMIP_PROVIDER_ASSET_ALIASES.find((item) => item.provider === provider && item.providerAssetId === providerAssetId) : undefined;

  if (providerAssetId === "tokamak-network") {
    errors.push(issue("IDENTITY_CONFLICT", `${path}.providerAssetId`, "TON ticker input resolves to Tokamak Network, not Toncoin."));
    return normalizationOk({
      canonicalSymbol: symbol === "TON" ? "TON" : null,
      canonicalAssetId: symbol === "TON" ? CMIP_RUNTIME_ASSET_IDS.TON : null,
      identityStatus: "conflict",
      warnings,
      errors,
    });
  }

  if (symbol && !CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS.includes(symbol)) {
    errors.push(issue("UNSUPPORTED_ASSET", `${path}.symbol`, `Unsupported asset symbol: ${input.symbol}.`));
    return normalizationOk({ canonicalSymbol: null, canonicalAssetId: null, identityStatus: "unavailable", warnings, errors });
  }

  if (alias && symbol && alias.canonicalSymbol !== symbol) {
    errors.push(issue("IDENTITY_CONFLICT", path, `Symbol ${symbol} conflicts with provider asset ${providerAssetId} (${alias.canonicalSymbol}).`));
    return normalizationOk({ canonicalSymbol: symbol, canonicalAssetId: CMIP_RUNTIME_ASSET_IDS[symbol], identityStatus: "conflict", warnings, errors });
  }

  if (alias) {
    if (suppliedAssetId && suppliedAssetId !== alias.canonicalAssetId && suppliedAssetId !== "crypto:tether") {
      errors.push(issue("IDENTITY_CONFLICT", `${path}.assetId`, `Supplied asset_id ${suppliedAssetId} conflicts with canonical ${alias.canonicalAssetId}.`));
      return normalizationOk({ canonicalSymbol: alias.canonicalSymbol, canonicalAssetId: alias.canonicalAssetId, identityStatus: "conflict", warnings, errors });
    }
    return normalizationOk({
      canonicalSymbol: alias.canonicalSymbol,
      canonicalAssetId: alias.canonicalAssetId,
      identityStatus: "verified",
      warnings,
      errors,
    });
  }

  if (symbol === "TON" && !alias && !suppliedAssetId) {
    warnings.push({ ...issue("ASSET_UNAVAILABLE", path, "TON requires an approved provider ID or canonical asset ID."), severity: "warning" });
    return normalizationOk({ canonicalSymbol: "TON", canonicalAssetId: CMIP_RUNTIME_ASSET_IDS.TON, identityStatus: "unavailable", warnings, errors });
  }

  if (symbol && suppliedAssetId === CMIP_RUNTIME_ASSET_IDS[symbol]) {
    return normalizationOk({ canonicalSymbol: symbol, canonicalAssetId: suppliedAssetId, identityStatus: "verified", warnings, errors });
  }

  if (symbol && !providerAssetId) {
    return normalizationOk({ canonicalSymbol: symbol, canonicalAssetId: CMIP_RUNTIME_ASSET_IDS[symbol], identityStatus: "verified", warnings, errors });
  }

  warnings.push({ ...issue("ASSET_UNAVAILABLE", path, "Provider asset ID is unknown to the canonical registry."), severity: "warning" });
  return normalizationOk({
    canonicalSymbol: symbol,
    canonicalAssetId: symbol ? CMIP_RUNTIME_ASSET_IDS[symbol] : null,
    identityStatus: "unavailable",
    warnings,
    errors,
  });
}

function normalizeSymbol(value: string | undefined): CmipRuntimeAssetSymbol | null {
  const symbol = value?.trim().toUpperCase();
  return CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS.includes(symbol as CmipRuntimeAssetSymbol) ? (symbol as CmipRuntimeAssetSymbol) : null;
}

function issue(code: CmipNormalizationError["code"], path: string, message: string): CmipNormalizationError {
  return cmipNormalizationIssue({ code, path, message, domain: "assets", severity: "error" });
}
