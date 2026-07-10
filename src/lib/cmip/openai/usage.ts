import type { CmipOpenAiUsage } from "./types";

export function emptyCmipOpenAiUsage(): CmipOpenAiUsage {
  return {
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    totalTokens: null,
  };
}

export function normalizeCmipOpenAiUsage(value: unknown): CmipOpenAiUsage | null {
  if (!isRecord(value)) return null;
  const inputTokens = finiteNumberOrNull(value.input_tokens);
  const outputTokens = finiteNumberOrNull(value.output_tokens);
  const totalTokens = finiteNumberOrNull(value.total_tokens);
  const inputDetails = isRecord(value.input_tokens_details) ? value.input_tokens_details : {};
  const outputDetails = isRecord(value.output_tokens_details) ? value.output_tokens_details : {};
  return {
    inputTokens,
    cachedInputTokens: finiteNumberOrNull(inputDetails.cached_tokens),
    outputTokens,
    reasoningTokens: finiteNumberOrNull(outputDetails.reasoning_tokens),
    totalTokens,
  };
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

