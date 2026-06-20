export type MacroSourceType = "TRUE_DXY" | "BROAD_USD_PROXY" | "OTHER_MACRO";

export type NormalizedMacroSource = {
  macroSourceType: MacroSourceType;
  sourceSymbol: string | null;
  publicLabel: string;
  publicLabelFa: string;
  technicalLabel: string;
  shortCode: "DXY" | "USD_BROAD" | "MACRO";
  isProxy: boolean;
  proxyWarning: string | null;
};

const BROAD_PROXY_WARNING = "DTWEXBGS is a broad USD index proxy and must not be labeled as DXY.";

export function normalizeMacroSource(params: {
  sourceId?: string | null;
  symbol?: string | null;
  sourceName?: string | null;
}): NormalizedMacroSource {
  const sourceId = params.sourceId?.trim().toUpperCase() ?? "";
  const symbol = params.symbol?.trim().toUpperCase() ?? "";
  const sourceName = params.sourceName?.trim() ?? "";
  const searchable = `${sourceId} ${symbol} ${sourceName}`.toUpperCase();

  if (sourceId === "FRED_DTWEXBGS" || symbol === "DTWEXBGS" || searchable.includes("DTWEXBGS")) {
    return {
      macroSourceType: "BROAD_USD_PROXY",
      sourceSymbol: "DTWEXBGS",
      publicLabel: "Broad USD Index",
      publicLabelFa: "شاخص گسترده دلار آمریکا",
      technicalLabel: "FRED DTWEXBGS — Nominal Broad U.S. Dollar Index",
      shortCode: "USD_BROAD",
      isProxy: true,
      proxyWarning: BROAD_PROXY_WARNING,
    };
  }

  if (symbol === "DXY" || searchable.includes("DX-Y.NYB") || /\bDXY\b/.test(searchable)) {
    return {
      macroSourceType: "TRUE_DXY",
      sourceSymbol: symbol || "DXY",
      publicLabel: "DXY",
      publicLabelFa: "شاخص دلار DXY",
      technicalLabel: sourceName || "DXY market index",
      shortCode: "DXY",
      isProxy: false,
      proxyWarning: null,
    };
  }

  return {
    macroSourceType: "OTHER_MACRO",
    sourceSymbol: symbol || null,
    publicLabel: sourceName || symbol || "Macro data",
    publicLabelFa: sourceName || symbol || "داده کلان",
    technicalLabel: sourceName || symbol || "Macro data source",
    shortCode: "MACRO",
    isProxy: false,
    proxyWarning: null,
  };
}

export function normalizePublicMacroText(text: string, source: NormalizedMacroSource) {
  if (source.macroSourceType !== "BROAD_USD_PROXY") return text;
  return text
    .replace(/شاخص دلار\s*\(DXY\)/gi, source.publicLabelFa)
    .replace(/شاخص دلار DXY/gi, source.publicLabelFa)
    .replace(/\bDXY\b/g, source.publicLabelFa);
}

