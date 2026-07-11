import type { CmipModelProfile } from "../model-package";
import { CMIP_GEMINI_MODEL_REGISTRY_VERSION } from "./constants";
import { cmipGeminiIssue } from "./errors";
import type { CmipGeminiIssue } from "./errors";
import type { CmipGeminiEnvConfig, CmipGeminiModelProfile, CmipGeminiResolvedModelProfile } from "./types";

export interface CmipGeminiModelProfileResolution {
  readonly ok: true;
  readonly resolution: CmipGeminiResolvedModelProfile;
  readonly errors: [];
} 

export interface CmipGeminiModelProfileFailure {
  readonly ok: false;
  readonly errors: readonly CmipGeminiIssue[];
}

export function resolveCmipGeminiModelProfile(
  cmipProfile: CmipModelProfile,
  config: CmipGeminiEnvConfig,
): CmipGeminiModelProfileResolution | CmipGeminiModelProfileFailure {
  const profile = geminiProfileFor(cmipProfile);
  const modelId = modelIdFor(profile, config);
  if (!modelId) {
    return {
      ok: false,
      errors: [cmipGeminiIssue({
        code: "GEMINI_MODEL_NOT_CONFIGURED",
        path: `$.env.${envKeyFor(profile)}`,
        message: `${envKeyFor(profile)} is required for this Gemini model profile. Registry version: ${CMIP_GEMINI_MODEL_REGISTRY_VERSION}.`,
        severity: "critical",
      })],
    };
  }

  return {
    ok: true,
    resolution: {
      profile,
      cmipModelProfile: cmipProfile,
      modelId,
      supportsInteractionsApi: true,
      supportsStructuredOutput: true,
      supportsGoogleSearch: true,
      supportsThinkingConfig: true,
      maxOutputTokens: config.maxOutputTokens,
      classification: modelId.includes("dry-run") || modelId.includes("test") ? "test" : "configured",
    },
    errors: [],
  };
}

export function geminiProfileFor(profile: CmipModelProfile): CmipGeminiModelProfile {
  if (profile === "cmip_fallback_reasoning") return "cmip_gemini_fallback_reasoning";
  if (profile === "cmip_validation_repair") return "cmip_gemini_validation_repair";
  return "cmip_gemini_primary_reasoning";
}

function modelIdFor(profile: CmipGeminiModelProfile, config: CmipGeminiEnvConfig): string | null {
  if (profile === "cmip_gemini_fallback_reasoning") return config.modelFallback;
  if (profile === "cmip_gemini_validation_repair") return config.modelRepair;
  return config.modelPrimary;
}

function envKeyFor(profile: CmipGeminiModelProfile): string {
  if (profile === "cmip_gemini_fallback_reasoning") return "CMIP_GEMINI_MODEL_FALLBACK";
  if (profile === "cmip_gemini_validation_repair") return "CMIP_GEMINI_MODEL_REPAIR";
  return "CMIP_GEMINI_MODEL_PRIMARY";
}
