import type { CmipGeminiUsage } from "./types";

export function normalizeCmipGeminiUsage(value: unknown): CmipGeminiUsage | null {
  if (!isRecord(value)) return null;
  const inputTokens = firstNumber(value, ["total_input_tokens", "input_tokens", "promptTokenCount", "prompt_tokens", "inputTokens"]);
  const cachedInputTokens = firstNumber(value, ["total_cached_tokens", "cached_input_tokens", "cachedContentTokenCount", "cachedInputTokens"]);
  const outputTokens = firstNumber(value, ["total_output_tokens", "output_tokens", "candidatesTokenCount", "outputTokens"]);
  const reasoningTokens = firstNumber(value, ["total_thought_tokens", "reasoning_tokens", "thoughtsTokenCount", "thinkingTokens", "reasoningTokens"]);
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
