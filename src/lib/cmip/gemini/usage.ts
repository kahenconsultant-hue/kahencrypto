import type { CmipGeminiUsage } from "./types";

export function normalizeCmipGeminiUsage(value: unknown): CmipGeminiUsage | null {
  if (!isRecord(value)) return null;
  const inputTokens = firstNumber(value, ["input_tokens", "promptTokenCount", "prompt_tokens", "inputTokens"]);
  const cachedInputTokens = firstNumber(value, ["cached_input_tokens", "cachedContentTokenCount", "cachedInputTokens"]);
  const outputTokens = firstNumber(value, ["output_tokens", "candidatesTokenCount", "outputTokens"]);
  const reasoningTokens = firstNumber(value, ["reasoning_tokens", "thoughtsTokenCount", "thinkingTokens", "reasoningTokens"]);
  const totalTokens = firstNumber(value, ["total_tokens", "totalTokenCount", "totalTokens"]);
  return { inputTokens, cachedInputTokens, outputTokens, reasoningTokens, totalTokens };
}

function firstNumber(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
