import outputSchema from "../contracts/output-schema.json";
import { hashCanonicalJson, stableJsonClone } from "../model-package";
import {
  CMIP_GEMINI_UNSAFE_SCHEMA_KEYWORDS,
} from "./constants";
import type { CmipGeminiSchemaCompatibilityResult } from "./types";
import {
  CMIP_GEMINI_TRANSPORT_MODE,
  CMIP_GEMINI_TRANSPORT_SCHEMA,
  collectCmipGeminiTransportSchemaGuardIssues,
} from "./transport";

export function createGeminiProviderSchema(schema: Record<string, unknown> = outputSchema as Record<string, unknown>): CmipGeminiSchemaCompatibilityResult {
  const providerSchema = stableJsonClone(CMIP_GEMINI_TRANSPORT_SCHEMA) as Record<string, unknown>;
  const transformedKeywords: CmipGeminiSchemaCompatibilityResult["transformedKeywords"] extends readonly (infer T)[] ? T[] : never = [];

  transformedKeywords.push({
    path: "$",
    canonicalKeyword: "full Task 001 output schema",
    providerRepresentation: CMIP_GEMINI_TRANSPORT_MODE,
    enforcement: "post_validation",
  });
  transformedKeywords.push({
    path: "$.cmip_report",
    canonicalKeyword: "canonical CMIP inner report child properties",
    providerRepresentation: "unconstrained transport object; application reconstructs canonical envelope before validation",
    enforcement: "post_validation",
  });

  const unsupportedKeywords = [...collectUnsafeKeywords(schema), ...collectCmipGeminiTransportSchemaGuardIssues(providerSchema)];
  const providerTransportSchemaHash = hashCanonicalJson(providerSchema);
  return {
    compatible: unsupportedKeywords.length === 0,
    providerSchema,
    canonicalSchemaHash: hashCanonicalJson(schema),
    providerSchemaHash: providerTransportSchemaHash,
    providerTransportSchemaHash,
    transportMode: CMIP_GEMINI_TRANSPORT_MODE,
    canonicalPostValidationRequired: true,
    reconstructedEnvelope: true,
    transformedKeywords,
    unsupportedKeywords,
  };
}

export function collectUnsafeKeywords(schema: unknown): readonly { readonly path: string; readonly keyword: string }[] {
  const found: { path: string; keyword: string }[] = [];
  walk(schema, "$", (path, key) => {
    if ((CMIP_GEMINI_UNSAFE_SCHEMA_KEYWORDS as readonly string[]).includes(key)) {
      found.push({ path, keyword: key });
    }
  });
  return found.sort((a, b) => `${a.path}:${a.keyword}`.localeCompare(`${b.path}:${b.keyword}`));
}

function walk(value: unknown, path: string, visitKey: (path: string, key: string) => void): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, visitKey));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      visitKey(path, key);
      walk(child, appendPath(path, key), visitKey);
    }
  }
}

function appendPath(path: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}
