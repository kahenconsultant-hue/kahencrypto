import type { CmipProviderId, CmipProviderSelection } from "./types";

export function resolveCmipProviderSelection(env: Partial<Record<string, string | undefined>> = process.env): CmipProviderSelection {
  const primary = parseProvider(env.CMIP_PROVIDER_PRIMARY) ?? "openai";
  const fallback = parseProvider(env.CMIP_PROVIDER_FALLBACK);
  return {
    primary,
    fallback: fallback && fallback !== primary ? fallback : null,
    fallbackPolicy: "disabled",
  };
}

export function parseProvider(value: string | undefined): CmipProviderId | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === "openai" || normalized === "gemini" ? normalized : null;
}
