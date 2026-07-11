import type { CmipProviderId } from "./types";

export interface CmipProviderCapabilities {
  readonly providerId: CmipProviderId;
  readonly supportsStructuredOutput: boolean;
  readonly supportsStatelessExecution: boolean;
  readonly supportsLiveSmoke: boolean;
  readonly supportsWebSearch: boolean;
}

export const CMIP_PROVIDER_CAPABILITIES: readonly CmipProviderCapabilities[] = [
  {
    providerId: "openai",
    supportsStructuredOutput: true,
    supportsStatelessExecution: true,
    supportsLiveSmoke: true,
    supportsWebSearch: true,
  },
  {
    providerId: "gemini",
    supportsStructuredOutput: true,
    supportsStatelessExecution: true,
    supportsLiveSmoke: true,
    supportsWebSearch: true,
  },
] as const;

export function getCmipProviderCapabilities(providerId: CmipProviderId): CmipProviderCapabilities {
  return CMIP_PROVIDER_CAPABILITIES.find((capability) => capability.providerId === providerId) as CmipProviderCapabilities;
}
