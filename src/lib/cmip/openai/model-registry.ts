import type { CmipModelProfile } from "../model-package";
import { cmipOpenAiIssue } from "./errors";
import type { CmipOpenAiIssue } from "./errors";
import type { CmipOpenAiEnvConfig, CmipOpenAiModelCapabilities, CmipOpenAiModelProfileResolution } from "./types";

export type CmipOpenAiModelProfileResolutionResult =
  | { readonly ok: true; readonly resolution: CmipOpenAiModelProfileResolution; readonly warnings: []; readonly errors: [] }
  | { readonly ok: false; readonly warnings: []; readonly errors: readonly CmipOpenAiIssue[] };

export function resolveCmipOpenAiModelProfile(
  profile: CmipModelProfile,
  config: CmipOpenAiEnvConfig,
): CmipOpenAiModelProfileResolutionResult {
  const model =
    profile === "cmip_primary_reasoning"
      ? config.modelPrimary
      : profile === "cmip_fallback_reasoning"
        ? config.modelFallback
        : config.modelRepair ?? config.modelPrimary;

  if (!model) {
    return {
      ok: false,
      warnings: [],
      errors: [
        cmipOpenAiIssue({
          code: "MODEL_PROFILE_NOT_CONFIGURED",
          path: `$.models.${profile}`,
          message: `No OpenAI model is configured for profile ${profile}.`,
          severity: "critical",
        }),
      ],
    };
  }

  const capabilities = inferModelCapabilities(model);
  if (!capabilities.structuredOutputs) {
    return {
      ok: false,
      warnings: [],
      errors: [
        cmipOpenAiIssue({
          code: "MODEL_CAPABILITY_UNSUPPORTED",
          path: `$.models.${profile}`,
          message: `Configured model profile ${profile} does not support structured JSON schema outputs.`,
          severity: "critical",
        }),
      ],
    };
  }

  return {
    ok: true,
    resolution: { profile, model, capabilities },
    warnings: [],
    errors: [],
  };
}

export function inferModelCapabilities(model: string): CmipOpenAiModelCapabilities {
  const normalized = model.toLowerCase();
  const unsupportedStructured = /\b(embedding|transcribe|tts|audio|image)\b/.test(normalized);
  const reasoningEffort = /^(gpt-5|o\d|o[134]|gpt-4\.1|gpt-4o)/.test(normalized);
  return {
    structuredOutputs: !unsupportedStructured,
    reasoningEffort,
    webSearch: /^(gpt-5|gpt-4\.1|gpt-4o|o\d|o[134])/.test(normalized),
    temperature: !/^o\d|^o[134]/.test(normalized),
  };
}
