import outputSchema from "../contracts/output-schema.json";
import { hashCanonicalJson, stableJsonClone } from "../model-package";
import {
  CMIP_GEMINI_POST_VALIDATED_SCHEMA_KEYWORDS,
  CMIP_GEMINI_PROVIDER_SCHEMA_STRIPPED_KEYS,
  CMIP_GEMINI_UNSAFE_SCHEMA_KEYWORDS,
} from "./constants";
import type { CmipGeminiSchemaCompatibilityResult } from "./types";

export function createGeminiProviderSchema(schema: Record<string, unknown> = outputSchema as Record<string, unknown>): CmipGeminiSchemaCompatibilityResult {
  const providerSchema = stableJsonClone(schema) as Record<string, unknown>;
  const transformedKeywords: CmipGeminiSchemaCompatibilityResult["transformedKeywords"] extends readonly (infer T)[] ? T[] : never = [];

  for (const key of CMIP_GEMINI_PROVIDER_SCHEMA_STRIPPED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(providerSchema, key)) {
      delete providerSchema[key];
      transformedKeywords.push({ path: "$", canonicalKeyword: key, providerRepresentation: "removed from provider projection", enforcement: "post_validation" });
    }
  }

  transformPostValidatedKeywords(providerSchema, "$", transformedKeywords);
  const unsupportedKeywords = collectUnsafeKeywords(providerSchema);
  return {
    compatible: unsupportedKeywords.length === 0,
    providerSchema,
    canonicalSchemaHash: hashCanonicalJson(schema),
    providerSchemaHash: hashCanonicalJson(providerSchema),
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

function transformPostValidatedKeywords(value: unknown, path: string, transformed: { path: string; canonicalKeyword: string; providerRepresentation: string; enforcement: "gemini" | "post_validation" }[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => transformPostValidatedKeywords(item, `${path}[${index}]`, transformed));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if ((CMIP_GEMINI_POST_VALIDATED_SCHEMA_KEYWORDS as readonly string[]).includes(key)) {
      transformed.push({ path, canonicalKeyword: key, providerRepresentation: key === "oneOf" ? "anyOf" : "canonical AJV post-validation", enforcement: "post_validation" });
      if (key === "oneOf") {
        record.anyOf = record.oneOf;
        delete record.oneOf;
      }
    }
  }
  for (const [key, child] of Object.entries(record)) {
    transformPostValidatedKeywords(child, appendPath(path, key), transformed);
  }
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
