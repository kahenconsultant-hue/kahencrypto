import { CMIP_REQUIRED_ASSET_SYMBOLS, CMIP_REQUIRED_ASSET_SYMBOL_SET } from "./constants";
import type { CmipCoinDecision, CmipValidationError } from "./types";

export function validateCmipAssetUniverse(
  coins: readonly CmipCoinDecision[],
  pathPrefix = "$.cmip_report.coins",
): CmipValidationError[] {
  const errors: CmipValidationError[] = [];
  const symbolIndexes = new Map<string, number[]>();

  if (coins.length !== CMIP_REQUIRED_ASSET_SYMBOLS.length) {
    errors.push({
      path: pathPrefix,
      message: `Expected exactly ${CMIP_REQUIRED_ASSET_SYMBOLS.length} coin records; received ${coins.length}.`,
      keyword: "cmipAssetUniverseSize",
    });
  }

  coins.forEach((coin, index) => {
    const indexes = symbolIndexes.get(coin.symbol) ?? [];
    indexes.push(index);
    symbolIndexes.set(coin.symbol, indexes);

    if (!CMIP_REQUIRED_ASSET_SYMBOL_SET.has(coin.symbol)) {
      errors.push({
        path: `${pathPrefix}[${index}].symbol`,
        message: `Unsupported CMIP asset symbol: ${coin.symbol}.`,
        keyword: "cmipUnsupportedAsset",
      });
    }

    if (coin.identity_status === "conflict") {
      if (coin.price !== null) {
        errors.push({
          path: `${pathPrefix}[${index}].price`,
          message: `Asset ${coin.symbol} has identity_status=conflict, so price must be null.`,
          keyword: "cmipIdentityConflictPrice",
        });
      }
      if (coin.score !== null) {
        errors.push({
          path: `${pathPrefix}[${index}].score`,
          message: `Asset ${coin.symbol} has identity_status=conflict and no verified fallback-source contract exists, so score must be null.`,
          keyword: "cmipIdentityConflictScore",
        });
      }
    }

    if (coin.identity_status === "unavailable") {
      if (coin.price !== null) {
        errors.push({
          path: `${pathPrefix}[${index}].price`,
          message: `Asset ${coin.symbol} has identity_status=unavailable, so price must be null.`,
          keyword: "cmipIdentityUnavailablePrice",
        });
      }
      if (coin.score !== null) {
        errors.push({
          path: `${pathPrefix}[${index}].score`,
          message: `Asset ${coin.symbol} has identity_status=unavailable, so score must be null.`,
          keyword: "cmipIdentityUnavailableScore",
        });
      }
    }
  });

  for (const [symbol, indexes] of symbolIndexes) {
    if (indexes.length > 1) {
      errors.push({
        path: pathPrefix,
        message: `Duplicate CMIP asset symbol ${symbol} at indexes ${indexes.join(", ")}.`,
        keyword: "cmipDuplicateAsset",
      });
    }
  }

  for (const symbol of CMIP_REQUIRED_ASSET_SYMBOLS) {
    if (!symbolIndexes.has(symbol)) {
      errors.push({
        path: pathPrefix,
        message: `Missing required CMIP asset symbol: ${symbol}.`,
        keyword: "cmipMissingAsset",
      });
    }
  }

  return errors;
}
