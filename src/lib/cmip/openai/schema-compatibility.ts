import outputSchema from "../contracts/output-schema.json";
import { hashCanonicalJson, stableJsonClone } from "../model-package";
import {
  CMIP_OPENAI_PROVIDER_SCHEMA_STRIPPED_KEYS,
  CMIP_OPENAI_SCHEMA_COMPATIBILITY_VERSION,
  CMIP_OPENAI_UNSUPPORTED_STRICT_SCHEMA_KEYWORDS,
} from "./constants";
import type { CmipOpenAiSchemaCompatibilityReport } from "./types";

export function createOpenAiProviderSchema(schema: Record<string, unknown> = outputSchema as Record<string, unknown>): {
  readonly schema: Record<string, unknown>;
  readonly report: CmipOpenAiSchemaCompatibilityReport;
} {
  const cloned = stableJsonClone(schema) as Record<string, unknown>;
  const transformations: string[] = [];

  for (const key of CMIP_OPENAI_PROVIDER_SCHEMA_STRIPPED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(cloned, key)) {
      delete cloned[key];
      transformations.push(`stripped ${key}`);
    }
  }

  const unsupportedKeywords = collectUnsupportedKeywords(cloned);
  return {
    schema: cloned,
    report: {
      compatibilityVersion: CMIP_OPENAI_SCHEMA_COMPATIBILITY_VERSION,
      compatible: unsupportedKeywords.length === 0,
      transformed: transformations.length > 0,
      transformations,
      unsupportedKeywords,
      providerSchemaHash: hashCanonicalJson(cloned),
      canonicalSchemaHash: hashCanonicalJson(schema),
    },
  };
}

export function collectUnsupportedKeywords(schema: unknown): readonly string[] {
  const found = new Set<string>();
  walk(schema, (key) => {
    if ((CMIP_OPENAI_UNSUPPORTED_STRICT_SCHEMA_KEYWORDS as readonly string[]).includes(key)) {
      found.add(key);
    }
  });
  return [...found].sort();
}

function walk(value: unknown, visitKey: (key: string) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visitKey);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      visitKey(key);
      walk(child, visitKey);
    }
  }
}

