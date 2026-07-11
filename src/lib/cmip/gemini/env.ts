import { CMIP_GEMINI_DEFAULTS } from "./constants";
import { cmipGeminiIssue } from "./errors";
import type { CmipGeminiIssue } from "./errors";
import type { CmipGeminiEnvConfig } from "./types";

export type CmipGeminiEnvResult =
  | { readonly ok: true; readonly config: CmipGeminiEnvConfig; readonly warnings: []; readonly errors: [] }
  | { readonly ok: false; readonly warnings: []; readonly errors: readonly CmipGeminiIssue[] };

export function loadCmipGeminiEnv(env: Partial<Record<string, string | undefined>> = process.env): CmipGeminiEnvResult {
  const apiKey = trimOrNull(env.GEMINI_API_KEY);
  const modelPrimary = trimOrNull(env.CMIP_GEMINI_MODEL_PRIMARY);
  const errors: CmipGeminiIssue[] = [];

  if (!apiKey) {
    errors.push(cmipGeminiIssue({
      code: "GEMINI_API_KEY_MISSING",
      path: "$.env.GEMINI_API_KEY",
      message: "GEMINI_API_KEY is required for live Gemini execution and was not present.",
      severity: "critical",
    }));
  }
  if (!modelPrimary) {
    errors.push(cmipGeminiIssue({
      code: "GEMINI_MODEL_NOT_CONFIGURED",
      path: "$.env.CMIP_GEMINI_MODEL_PRIMARY",
      message: "CMIP_GEMINI_MODEL_PRIMARY is required for live Gemini execution and was not present.",
      severity: "critical",
    }));
  }
  if (Object.keys(env).some((key) => key.startsWith("NEXT_PUBLIC_GEMINI"))) {
    errors.push(cmipGeminiIssue({
      code: "GEMINI_CONFIG_MISSING",
      path: "$.env",
      message: "Gemini credentials must not use NEXT_PUBLIC_ environment variables.",
      severity: "critical",
    }));
  }
  if (errors.length) return { ok: false, warnings: [], errors };

  return {
    ok: true,
    config: {
      apiKey: apiKey as string,
      modelPrimary,
      modelFallback: trimOrNull(env.CMIP_GEMINI_MODEL_FALLBACK),
      modelRepair: trimOrNull(env.CMIP_GEMINI_MODEL_REPAIR),
      enableGoogleSearch: parseBoolean(env.CMIP_GEMINI_ENABLE_GOOGLE_SEARCH, false),
      maxOutputTokens: parsePositiveInteger(env.CMIP_GEMINI_MAX_OUTPUT_TOKENS, CMIP_GEMINI_DEFAULTS.maxOutputTokens),
      timeoutMs: parsePositiveInteger(env.CMIP_GEMINI_TIMEOUT_MS, CMIP_GEMINI_DEFAULTS.timeoutMs),
      maxAttempts: parsePositiveInteger(env.CMIP_GEMINI_MAX_ATTEMPTS, CMIP_GEMINI_DEFAULTS.maxAttempts),
      thinkingLevel: parseThinkingLevel(env.CMIP_GEMINI_THINKING_LEVEL),
      allowLiveSmoke: parseBoolean(env.CMIP_ALLOW_LIVE_GEMINI_SMOKE, false),
    },
    warnings: [],
    errors: [],
  };
}

export function dryRunGeminiConfig(env: Partial<Record<string, string | undefined>> | undefined): CmipGeminiEnvConfig {
  return {
    apiKey: "[dry-run]",
    modelPrimary: trimOrNull(env?.CMIP_GEMINI_MODEL_PRIMARY) ?? "gemini-cmip-dry-run",
    modelFallback: trimOrNull(env?.CMIP_GEMINI_MODEL_FALLBACK) ?? "gemini-cmip-dry-run-fallback",
    modelRepair: trimOrNull(env?.CMIP_GEMINI_MODEL_REPAIR) ?? "gemini-cmip-dry-run-repair",
    enableGoogleSearch: parseBoolean(env?.CMIP_GEMINI_ENABLE_GOOGLE_SEARCH, false),
    maxOutputTokens: parsePositiveInteger(env?.CMIP_GEMINI_MAX_OUTPUT_TOKENS, CMIP_GEMINI_DEFAULTS.maxOutputTokens),
    timeoutMs: parsePositiveInteger(env?.CMIP_GEMINI_TIMEOUT_MS, CMIP_GEMINI_DEFAULTS.timeoutMs),
    maxAttempts: parsePositiveInteger(env?.CMIP_GEMINI_MAX_ATTEMPTS, CMIP_GEMINI_DEFAULTS.maxAttempts),
    thinkingLevel: parseThinkingLevel(env?.CMIP_GEMINI_THINKING_LEVEL),
    allowLiveSmoke: false,
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

function parseThinkingLevel(value: string | undefined): CmipGeminiEnvConfig["thinkingLevel"] {
  if (value === "low" || value === "medium" || value === "high" || value === "auto") return value;
  if (value === "off" || value === "none" || value === "false") return null;
  return CMIP_GEMINI_DEFAULTS.thinkingLevel;
}
