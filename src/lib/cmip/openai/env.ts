import { CMIP_OPENAI_DEFAULTS } from "./constants";
import { cmipOpenAiIssue } from "./errors";
import type { CmipOpenAiIssue } from "./errors";
import type { CmipOpenAiEnvConfig, CmipOpenAiReasoningEffort, CmipOpenAiServiceTier } from "./types";

export type CmipOpenAiEnvResult =
  | { readonly ok: true; readonly config: CmipOpenAiEnvConfig; readonly warnings: []; readonly errors: [] }
  | { readonly ok: false; readonly warnings: []; readonly errors: readonly CmipOpenAiIssue[] };

export function loadCmipOpenAiEnv(env: Partial<Record<string, string | undefined>> = process.env): CmipOpenAiEnvResult {
  const apiKey = trimOrNull(env.OPENAI_API_KEY);
  const modelPrimary = trimOrNull(env.CMIP_OPENAI_MODEL_PRIMARY);

  const errors = [];
  if (!apiKey) {
    errors.push(cmipOpenAiIssue({
      code: "OPENAI_CONFIG_MISSING",
      path: "$.env.OPENAI_API_KEY",
      message: "OPENAI_API_KEY is required for live OpenAI execution and was not present.",
      severity: "critical",
    }));
  }
  if (!modelPrimary) {
    errors.push(cmipOpenAiIssue({
      code: "MODEL_PROFILE_NOT_CONFIGURED",
      path: "$.env.CMIP_OPENAI_MODEL_PRIMARY",
      message: "CMIP_OPENAI_MODEL_PRIMARY is required for live OpenAI execution and was not present.",
      severity: "critical",
    }));
  }
  if (errors.length) return { ok: false, warnings: [], errors };

  return {
    ok: true,
    config: {
      apiKey: apiKey as string,
      organizationId: trimOrNull(env.OPENAI_ORGANIZATION_ID),
      projectId: trimOrNull(env.OPENAI_PROJECT_ID),
      modelPrimary,
      modelFallback: trimOrNull(env.CMIP_OPENAI_MODEL_FALLBACK),
      modelRepair: trimOrNull(env.CMIP_OPENAI_MODEL_REPAIR),
      enableWebSearch: parseBoolean(env.CMIP_OPENAI_ENABLE_WEB_SEARCH, false),
      maxOutputTokens: parsePositiveInteger(env.CMIP_OPENAI_MAX_OUTPUT_TOKENS, CMIP_OPENAI_DEFAULTS.maxOutputTokens),
      timeoutMs: parsePositiveInteger(env.CMIP_OPENAI_TIMEOUT_MS, CMIP_OPENAI_DEFAULTS.timeoutMs),
      maxAttempts: parsePositiveInteger(env.CMIP_OPENAI_MAX_ATTEMPTS, CMIP_OPENAI_DEFAULTS.maxAttempts),
      reasoningEffort: parseReasoningEffort(env.CMIP_OPENAI_REASONING_EFFORT),
      serviceTier: parseServiceTier(env.CMIP_OPENAI_SERVICE_TIER),
      allowLiveSmoke: parseBoolean(env.CMIP_ALLOW_LIVE_OPENAI_SMOKE, false),
    },
    warnings: [],
    errors: [],
  };
}

function trimOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return /^(1|true|yes)$/i.test(value.trim());
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseReasoningEffort(value: string | undefined): CmipOpenAiReasoningEffort {
  return value === "minimal" || value === "low" || value === "medium" || value === "high" ? value : CMIP_OPENAI_DEFAULTS.reasoningEffort;
}

function parseServiceTier(value: string | undefined): CmipOpenAiServiceTier {
  return value === "default" || value === "flex" || value === "priority" || value === "auto" ? value : CMIP_OPENAI_DEFAULTS.serviceTier;
}
