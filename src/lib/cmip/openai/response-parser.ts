import type { CmipReportEnvelope } from "../contracts";
import { validateCmipReport } from "../contracts/validate-report";
import { hashCanonicalJson, sha256Hex, stableJsonClone, stableStringify } from "../model-package";
import { cmipOpenAiIssue } from "./errors";
import type { CmipOpenAiIssue } from "./errors";
import type { CmipOpenAiProviderExecutionResponse } from "./types";

export function parseCmipOpenAiResponse(response: CmipOpenAiProviderExecutionResponse): {
  readonly report: CmipReportEnvelope | null;
  readonly outputTextHash: string | null;
  readonly canonicalReportHash: string | null;
  readonly errors: readonly CmipOpenAiIssue[];
} {
  if (response.status !== "completed") {
    return {
      report: null,
      outputTextHash: response.outputText ? sha256Hex(response.outputText) : null,
      canonicalReportHash: null,
      errors: [
        cmipOpenAiIssue({
          code: response.status === "incomplete" ? "MODEL_RESPONSE_INCOMPLETE" : "MODEL_RESPONSE_FAILED",
          path: "$.provider.status",
          message: `Provider response did not complete: ${response.status}.`,
          severity: "error",
        }),
      ],
    };
  }

  if (response.refusal) {
    return {
      report: null,
      outputTextHash: response.outputText ? sha256Hex(response.outputText) : null,
      canonicalReportHash: null,
      errors: [
        cmipOpenAiIssue({
          code: "MODEL_REFUSAL",
          path: "$.provider.refusal",
          message: "Model returned a refusal instead of CMIP JSON.",
          severity: "error",
        }),
      ],
    };
  }

  if (!response.outputText?.trim()) {
    return {
      report: null,
      outputTextHash: null,
      canonicalReportHash: null,
      errors: [
        cmipOpenAiIssue({
          code: "MODEL_OUTPUT_MISSING",
          path: "$.provider.outputText",
          message: "Provider completed but did not return output text.",
          severity: "error",
        }),
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.outputText);
  } catch {
    return {
      report: null,
      outputTextHash: sha256Hex(response.outputText),
      canonicalReportHash: null,
      errors: [
        cmipOpenAiIssue({
          code: "MODEL_OUTPUT_JSON_INVALID",
          path: "$.provider.outputText",
          message: "Provider output text is not valid JSON.",
          severity: "error",
        }),
      ],
    };
  }

  const validation = validateCmipReport(parsed);
  if (!validation.valid) {
    return {
      report: null,
      outputTextHash: sha256Hex(response.outputText),
      canonicalReportHash: null,
      errors: validation.errors.map((error) =>
        cmipOpenAiIssue({
          code: "MODEL_OUTPUT_SCHEMA_INVALID",
          path: error.path,
          message: error.message,
          severity: "error",
        }),
      ),
    };
  }

  const report = stableJsonClone(validation.data);
  return {
    report,
    outputTextHash: sha256Hex(response.outputText),
    canonicalReportHash: hashCanonicalJson(report),
    errors: [],
  };
}

export function outputContainsSecretLikeValue(text: string | null): boolean {
  if (!text) return false;
  return /\bsk-(?:proj|live|test)?-[A-Za-z0-9_-]{20,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+=*\b|-----BEGIN\s+(?:RSA\s+)?PRIVATE KEY-----/i.test(text);
}

export function numericalValuesChanged(original: unknown, repaired: unknown): boolean {
  const originalNumbers = collectNumbers(original);
  const repairedNumbers = collectNumbers(repaired);
  for (const [path, originalValue] of originalNumbers) {
    if (repairedNumbers.has(path) && repairedNumbers.get(path) !== originalValue) return true;
  }
  return false;
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

export function parseLooseJsonObject(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function canonicalOutputText(report: unknown): string {
  return stableStringify(report);
}
