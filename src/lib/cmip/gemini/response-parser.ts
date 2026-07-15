import { sha256Hex, stableStringify } from "../model-package";
import { cmipGeminiIssue } from "./errors";
import { parseCmipGeminiTransportOutput, parseLooseCmipGeminiReportObject } from "./transport";
import type { CmipGeminiProviderExecutionResponse, CmipGeminiParsedOutput } from "./types";

export function parseCmipGeminiResponse(response: CmipGeminiProviderExecutionResponse): CmipGeminiParsedOutput {
  if (response.refusal || response.status === "blocked" || response.status === "refused") {
    return {
      report: null,
      outputTextHash: response.outputText ? sha256Hex(response.outputText) : null,
      canonicalReportHash: null,
      jsonParsed: false,
      errors: [cmipGeminiIssue({ code: "GEMINI_REFUSAL", path: "$.provider.refusal", message: "Gemini returned a refusal or safety block instead of CMIP JSON.", severity: "error" })],
    };
  }

  if (response.status !== "completed") {
    return {
      report: null,
      outputTextHash: response.outputText ? sha256Hex(response.outputText) : null,
      canonicalReportHash: null,
      jsonParsed: false,
      errors: [cmipGeminiIssue({
        code: response.status === "incomplete" ? "GEMINI_RESPONSE_INCOMPLETE" : response.status === "cancelled" ? "GEMINI_RESPONSE_CANCELLED" : "GEMINI_RESPONSE_FAILED",
        path: "$.provider.status",
        message: `Gemini provider response did not complete: ${response.status}.`,
        severity: "error",
      })],
    };
  }

  if (!response.outputText?.trim()) {
    return {
      report: null,
      outputTextHash: null,
      canonicalReportHash: null,
      jsonParsed: false,
      errors: [cmipGeminiIssue({ code: "GEMINI_OUTPUT_MISSING", path: "$.provider.outputText", message: "Gemini completed but did not return output text.", severity: "error" })],
    };
  }

  return parseCmipGeminiTransportOutput(response.outputText);
}

export function outputContainsSecretLikeValue(text: string | null): boolean {
  if (!text) return false;
  return /\bsk-(?:proj|live|test)?-[A-Za-z0-9_-]{20,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+=*\b|-----BEGIN\s+(?:RSA\s+)?PRIVATE KEY-----|AIza[0-9A-Za-z_-]{20,}/i.test(text);
}

export function numericalValuesChanged(original: unknown, repaired: unknown): boolean {
  const originalNumbers = collectNumbers(original);
  const repairedNumbers = collectNumbers(repaired);
  for (const [path, originalValue] of originalNumbers) {
    if (repairedNumbers.has(path) && repairedNumbers.get(path) !== originalValue) return true;
  }
  return false;
}

export function parseLooseJsonObject(text: string | null): unknown {
  return parseLooseCmipGeminiReportObject(text);
}

export function canonicalOutputText(report: unknown): string {
  return stableStringify(report);
}

function collectNumbers(value: unknown, path = "$", result = new Map<string, number>()): Map<string, number> {
  if (typeof value === "number" && Number.isFinite(value)) {
    result.set(path, value);
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectNumbers(item, `${path}[${index}]`, result));
    return result;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectNumbers(child, /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`, result);
    }
  }
  return result;
}
