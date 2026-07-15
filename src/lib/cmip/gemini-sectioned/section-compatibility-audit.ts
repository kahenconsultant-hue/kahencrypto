import { hashCanonicalJson, stableJsonClone, stableStringify } from "../model-package";
import type { CmipGeminiMappedRequest } from "../gemini/types";
import { CMIP_GEMINI_SECTION_PROVIDER_PROJECTION_VERSION } from "./constants";
import type { CmipGeminiSectionDefinition, CmipGeminiSectionId } from "./types";

export const CMIP_GEMINI_SECTION_SCHEMA_COMPATIBILITY_BUDGETS = {
  maxSchemaBytes: 8192,
  maxNestingDepth: 8,
  maxTotalProperties: 80,
  maxEnumValuesInOneEnum: 20,
  avoidCombinators: true,
} as const;

export type CmipGeminiSectionProjectionDecision = "KEEP_CURRENT_SCHEMA" | "USE_PROVIDER_SAFE_PROJECTION" | "SPLIT_SECTION_PROPOSAL_REQUIRED";
export type CmipGeminiSectionSchemaVariantId = "current" | "descriptions_removed" | "provider_safe_constraints" | "shallow_transport";

export interface CmipGeminiSchemaKeywordInventoryItem {
  readonly path: string;
  readonly keyword: string;
  readonly valueType: string;
  readonly nestingDepth: number;
  readonly presentInMetaDecision: boolean;
  readonly providerRequired: boolean;
  readonly movableToPostValidation: boolean;
}

export interface CmipGeminiSectionSchemaComplexityMetrics {
  readonly bytes: number;
  readonly maxObjectDepth: number;
  readonly maxArrayDepth: number;
  readonly maxNestingDepth: number;
  readonly propertyCount: number;
  readonly requiredFieldCount: number;
  readonly enumValueCount: number;
  readonly maxEnumValuesInOneEnum: number;
  readonly arraySchemaCount: number;
  readonly objectSchemaCount: number;
  readonly combinatorKeywordCount: number;
  readonly longestDescriptionBytes: number;
  readonly totalDescriptionBytes: number;
}

export interface CmipGeminiProviderProjectionReport {
  readonly sectionId: CmipGeminiSectionId;
  readonly projectionVersion: typeof CMIP_GEMINI_SECTION_PROVIDER_PROJECTION_VERSION;
  readonly decision: CmipGeminiSectionProjectionDecision;
  readonly canonicalSectionSchemaHash: string;
  readonly providerSectionSchemaHash: string;
  readonly requiredFieldsPreserved: Record<string, readonly string[]>;
  readonly providerConstraints: readonly string[];
  readonly postValidationConstraints: readonly string[];
  readonly providerSchemaBytes: number;
  readonly providerSchemaDepth: number;
  readonly providerPropertyCount: number;
}

export interface CmipGeminiSectionSchemaVariantReport {
  readonly variantId: CmipGeminiSectionSchemaVariantId;
  readonly metrics: CmipGeminiSectionSchemaComplexityMetrics;
  readonly constraintsRetainedProviderSide: readonly string[];
  readonly constraintsMovedToPostValidation: readonly string[];
  readonly finalTask001EnforcementUnchanged: true;
}

export interface CmipGeminiSectionRequestSnapshot {
  readonly sectionId: CmipGeminiSectionId;
  readonly topLevelKeys: readonly string[];
  readonly generationConfig: Record<string, string | number | boolean | null>;
  readonly responseFormat: {
    readonly type: string | null;
    readonly mimeType: string | null;
    readonly schemaHash: string;
    readonly schemaBytes: number;
    readonly schemaMaxDepth: number;
    readonly schemaPropertyCount: number;
    readonly schemaRequiredFieldCount: number;
    readonly schemaEnumValueCount: number;
  };
  readonly toolsPresent: boolean;
  readonly inputType: string;
  readonly systemInstructionType: string;
  readonly approximateContextBytes: number;
  readonly approximateContextTokens: number;
  readonly unsupportedTopLevelKeys: readonly string[];
  readonly unsupportedGenerationConfigKeys: readonly string[];
  readonly containsRuntimeContent: false;
  readonly containsSecrets: false;
}

export interface CmipGeminiSectionRequestDiff {
  readonly leftSectionId: CmipGeminiSectionId;
  readonly rightSectionId: CmipGeminiSectionId;
  readonly topLevelOnlyInLeft: readonly string[];
  readonly topLevelOnlyInRight: readonly string[];
  readonly generationConfigDifferences: readonly string[];
  readonly responseFormatDifferences: readonly string[];
  readonly schemaMetricDifferences: Record<string, { readonly left: number | string | boolean | null; readonly right: number | string | boolean | null }>;
}

const PROVIDER_REQUIRED_KEYWORDS = new Set(["type", "properties", "required", "items", "enum", "minItems", "maxItems", "additionalProperties"]);
const POST_VALIDATION_KEYWORDS = new Set(["minimum", "maximum", "minLength", "maxLength", "pattern", "format", "const", "propertyNames", "dependentRequired", "contains", "unevaluatedProperties"]);
const COMBINATOR_KEYWORDS = new Set(["anyOf", "oneOf", "allOf"]);
const ANNOTATION_KEYWORDS = new Set(["$schema", "$id", "title", "description", "examples", "default"]);

export function providerSchemaForCmipGeminiSection(section: CmipGeminiSectionDefinition): Record<string, unknown> {
  return projectCmipGeminiSectionProviderSchema(section).providerSchema;
}

export function projectCmipGeminiSectionProviderSchema(section: CmipGeminiSectionDefinition): CmipGeminiProviderProjectionReport & {
  readonly providerSchema: Record<string, unknown>;
} {
  const canonicalSchema = stableJsonClone(section.schema) as Record<string, unknown>;
  const providerSchema = projectProviderSafeSchema(canonicalSchema);
  const providerMetrics = calculateCmipGeminiSectionSchemaComplexity(providerSchema);
  const requiredFieldsPreserved = section.sectionId === "engines_reasons"
    ? requiredFieldsPreservedForEnginesReasons(canonicalSchema)
    : {};
  const moved = [
    "repeated maxLength",
    "numeric minimum/maximum",
    "nested additionalProperties",
    "recursive or empty subschemas",
    "nullable type arrays",
    "complex combinators and conditionals",
    "format and pattern validation",
  ];
  return {
    sectionId: section.sectionId,
    projectionVersion: CMIP_GEMINI_SECTION_PROVIDER_PROJECTION_VERSION,
    decision: "USE_PROVIDER_SAFE_PROJECTION",
    canonicalSectionSchemaHash: hashCanonicalJson(canonicalSchema),
    providerSectionSchemaHash: hashCanonicalJson(providerSchema),
    requiredFieldsPreserved,
    providerConstraints: section.sectionId === "engines_reasons"
      ? [
          "top-level object",
          "required engine_scores",
          "required reasons",
          "engine_scores array min/max",
          "reasons array min/max",
          "engine_scores required item fields",
          "reasons required item fields",
          "historical_evidence required child fields",
          "evidence_verdict enum",
          "source_refs string items",
        ]
      : [
          "top-level object",
          "required canonical section fields",
          "required nested object fields where provider-compatible",
          "array item structure",
          "small enum values",
        ],
    postValidationConstraints: moved,
    providerSchemaBytes: providerMetrics.bytes,
    providerSchemaDepth: providerMetrics.maxNestingDepth,
    providerPropertyCount: providerMetrics.propertyCount,
    providerSchema,
  };
}

export function inventoryCmipGeminiSectionSchemaKeywords(params: {
  readonly schema: Record<string, unknown>;
  readonly metaDecisionSchema: Record<string, unknown>;
}): readonly CmipGeminiSchemaKeywordInventoryItem[] {
  const metaKeywords = new Set(collectKeywordPaths(params.metaDecisionSchema).map((item) => item.keyword));
  return collectKeywordPaths(params.schema).map((item) => ({
    ...item,
    presentInMetaDecision: metaKeywords.has(item.keyword),
    providerRequired: PROVIDER_REQUIRED_KEYWORDS.has(item.keyword),
    movableToPostValidation: !PROVIDER_REQUIRED_KEYWORDS.has(item.keyword) || POST_VALIDATION_KEYWORDS.has(item.keyword) || COMBINATOR_KEYWORDS.has(item.keyword),
  }));
}

export function calculateCmipGeminiSectionSchemaComplexity(schema: Record<string, unknown>): CmipGeminiSectionSchemaComplexityMetrics {
  const metrics = {
    maxObjectDepth: 0,
    maxArrayDepth: 0,
    propertyCount: 0,
    requiredFieldCount: 0,
    enumValueCount: 0,
    maxEnumValuesInOneEnum: 0,
    arraySchemaCount: 0,
    objectSchemaCount: 0,
    combinatorKeywordCount: 0,
    longestDescriptionBytes: 0,
    totalDescriptionBytes: 0,
  };
  visitSchema(schema, "$", 0, 0, 0, (value, key, objectDepth, arrayDepth) => {
    if (key === "properties" && isRecord(value)) metrics.propertyCount += Object.keys(value).length;
    if (key === "required" && Array.isArray(value)) metrics.requiredFieldCount += value.length;
    if (key === "enum" && Array.isArray(value)) {
      metrics.enumValueCount += value.length;
      metrics.maxEnumValuesInOneEnum = Math.max(metrics.maxEnumValuesInOneEnum, value.length);
    }
    if (key === "description" && typeof value === "string") {
      const bytes = Buffer.byteLength(value, "utf8");
      metrics.longestDescriptionBytes = Math.max(metrics.longestDescriptionBytes, bytes);
      metrics.totalDescriptionBytes += bytes;
    }
    if (key && COMBINATOR_KEYWORDS.has(key)) metrics.combinatorKeywordCount += 1;
    if (isRecord(value) && value.type === "object") metrics.objectSchemaCount += 1;
    if (isRecord(value) && value.type === "array") metrics.arraySchemaCount += 1;
    metrics.maxObjectDepth = Math.max(metrics.maxObjectDepth, objectDepth);
    metrics.maxArrayDepth = Math.max(metrics.maxArrayDepth, arrayDepth);
  });
  return {
    bytes: Buffer.byteLength(stableStringify(schema), "utf8"),
    maxNestingDepth: Math.max(metrics.maxObjectDepth, metrics.maxArrayDepth),
    ...metrics,
  };
}

export function buildCmipGeminiSectionSchemaVariants(section: CmipGeminiSectionDefinition): readonly CmipGeminiSectionSchemaVariantReport[] {
  const current = stripRootSchemaKeyword(stableJsonClone(section.schema) as Record<string, unknown>);
  const descriptionsRemoved = removeAnnotations(current);
  const projection = projectCmipGeminiSectionProviderSchema(section);
  const shallow = shallowTransportSchema(section.sectionId);
  return [
    variant("current", current, [], []),
    variant("descriptions_removed", descriptionsRemoved, [], ["descriptions and annotations"]),
    variant("provider_safe_constraints", projection.providerSchema, projection.providerConstraints, projection.postValidationConstraints),
    variant("shallow_transport", shallow, ["top-level arrays only"], ["all nested constraints"]),
  ];
}

export function snapshotCmipGeminiSectionRequest(sectionId: CmipGeminiSectionId, request: CmipGeminiMappedRequest): CmipGeminiSectionRequestSnapshot {
  const schemaMetrics = calculateCmipGeminiSectionSchemaComplexity(request.response_format.schema);
  const topLevelKeys = Object.keys(request).sort();
  return {
    sectionId,
    topLevelKeys,
    generationConfig: Object.fromEntries(Object.entries(request.generation_config).sort()) as Record<string, string | number | boolean | null>,
    responseFormat: {
      type: request.response_format.type,
      mimeType: request.response_format.mime_type,
      schemaHash: hashCanonicalJson(request.response_format.schema),
      schemaBytes: schemaMetrics.bytes,
      schemaMaxDepth: schemaMetrics.maxNestingDepth,
      schemaPropertyCount: schemaMetrics.propertyCount,
      schemaRequiredFieldCount: schemaMetrics.requiredFieldCount,
      schemaEnumValueCount: schemaMetrics.enumValueCount,
    },
    toolsPresent: Array.isArray(request.tools) && request.tools.length > 0,
    inputType: typeof request.input,
    systemInstructionType: typeof request.system_instruction,
    approximateContextBytes: Buffer.byteLength(request.input, "utf8"),
    approximateContextTokens: Math.ceil(request.input.length / 4),
    unsupportedTopLevelKeys: topLevelKeys.filter((key) => !["background", "generation_config", "input", "model", "response_format", "store", "stream", "system_instruction", "tools"].includes(key)),
    unsupportedGenerationConfigKeys: Object.keys(request.generation_config).filter((key) => !["max_output_tokens", "thinking_level"].includes(key)).sort(),
    containsRuntimeContent: false,
    containsSecrets: false,
  };
}

export function diffCmipGeminiSectionRequestSnapshots(
  left: CmipGeminiSectionRequestSnapshot,
  right: CmipGeminiSectionRequestSnapshot,
): CmipGeminiSectionRequestDiff {
  const leftKeys = new Set(left.topLevelKeys);
  const rightKeys = new Set(right.topLevelKeys);
  const schemaMetricDifferences: CmipGeminiSectionRequestDiff["schemaMetricDifferences"] = {};
  for (const key of ["schemaBytes", "schemaMaxDepth", "schemaPropertyCount", "schemaRequiredFieldCount", "schemaEnumValueCount"] as const) {
    if (left.responseFormat[key] !== right.responseFormat[key]) {
      schemaMetricDifferences[key] = { left: left.responseFormat[key], right: right.responseFormat[key] };
    }
  }
  return {
    leftSectionId: left.sectionId,
    rightSectionId: right.sectionId,
    topLevelOnlyInLeft: left.topLevelKeys.filter((key) => !rightKeys.has(key)),
    topLevelOnlyInRight: right.topLevelKeys.filter((key) => !leftKeys.has(key)),
    generationConfigDifferences: diffRecordKeys(left.generationConfig, right.generationConfig),
    responseFormatDifferences: diffRecordKeys(left.responseFormat, right.responseFormat),
    schemaMetricDifferences,
  };
}

export function validateCmipGeminiSectionContextPayload(value: unknown): readonly string[] {
  const issues: string[] = [];
  try {
    stableStringify(value);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Context is not canonical JSON.");
  }
  visitUnknown(value, "$", (item, path, key) => {
    if (typeof item === "number" && !Number.isFinite(item)) issues.push(`${path}: non-finite number`);
    if (typeof item === "bigint") issues.push(`${path}: bigint`);
    if (typeof item === "function") issues.push(`${path}: function`);
    if (typeof item === "symbol") issues.push(`${path}: symbol`);
    if (typeof key === "string" && ["model", "generation_config", "response_format", "system_instruction", "tools", "labels", "thinking_config"].includes(key)) {
      issues.push(`${path}: request-configuration-like key`);
    }
    if (typeof item === "string" && /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(item)) {
      issues.push(`${path}: control character`);
    }
  });
  return [...new Set(issues)].sort();
}

function requiredFieldsPreservedForEnginesReasons(strictSchema: Record<string, unknown>): Record<string, readonly string[]> {
  const resolved = resolveSchemaNode(strictSchema, strictSchema);
  const properties = recordAt(strictSchema, "properties");
  const engineItems = resolveSchemaNode(recordAt(recordAt(properties, "engine_scores"), "items"), strictSchema);
  const reasonItems = resolveSchemaNode(recordAt(recordAt(properties, "reasons"), "items"), strictSchema);
  const reasonProperties = recordAt(reasonItems, "properties");
  const historicalEvidence = resolveSchemaNode(recordAt(reasonProperties, "historical_evidence"), strictSchema);
  return {
    root: requiredStrings(resolved),
    engine_scores_item: requiredStrings(engineItems),
    reasons_item: requiredStrings(reasonItems),
    historical_evidence: requiredStrings(historicalEvidence),
  };
}

function projectProviderSafeSchema(strictSchema: Record<string, unknown>): Record<string, unknown> {
  const projected = projectSchemaNode(strictSchema, strictSchema, 0, new Set<string>());
  return isRecord(projected) ? projected : { type: "object" };
}

function projectSchemaNode(value: unknown, root: Record<string, unknown>, depth: number, seenRefs: ReadonlySet<string>): unknown {
  const resolved = resolveSchemaNode(value, root, seenRefs);
  if (!isRecord(resolved)) return {};

  const oneOfProjection = projectCombinatorAsSimpleSchema(resolved, root, depth, seenRefs);
  if (oneOfProjection) return oneOfProjection;

  const type = simplifiedType(resolved.type);
  const nullable = schemaAllowsNull(resolved);
  if (type === "object") {
    const required = requiredStrings(resolved);
    const properties = recordAt(resolved, "properties");
    const keys = Object.keys(properties).sort();
    const projectedProperties = Object.fromEntries(keys.map((key) => [key, projectSchemaNode(properties[key], root, depth + 1, seenRefs)]));
    const objectSchema: Record<string, unknown> = {
      type: "object",
      properties: projectedProperties,
    };
    if (required.length > 0) objectSchema.required = required;
    if (depth === 0) objectSchema.additionalProperties = false;
    if (nullable) objectSchema.nullable = true;
    return objectSchema;
  }
  if (type === "array") {
    const arraySchema: Record<string, unknown> = {
      type: "array",
      items: projectSchemaNode(resolved.items, root, depth + 1, seenRefs),
    };
    if (typeof resolved.minItems === "number") arraySchema.minItems = resolved.minItems;
    if (typeof resolved.maxItems === "number") arraySchema.maxItems = resolved.maxItems;
    if (nullable) arraySchema.nullable = true;
    return arraySchema;
  }
  const scalar: Record<string, unknown> = { type };
  if (nullable) scalar.nullable = true;
  if (Array.isArray(resolved.enum) && resolved.enum.length <= CMIP_GEMINI_SECTION_SCHEMA_COMPATIBILITY_BUDGETS.maxEnumValuesInOneEnum) {
    scalar.enum = resolved.enum;
  }
  return scalar;
}

function projectCombinatorAsSimpleSchema(schema: Record<string, unknown>, root: Record<string, unknown>, depth: number, seenRefs: ReadonlySet<string>): Record<string, unknown> | null {
  const variants = Array.isArray(schema.oneOf) ? schema.oneOf : Array.isArray(schema.anyOf) ? schema.anyOf : null;
  if (!variants) return null;
  const nonNullVariants = variants.filter((item) => !(isRecord(item) && item.type === "null"));
  const nullable = nonNullVariants.length !== variants.length;
  const objectVariant = nonNullVariants.find((item) => simplifiedType(isRecord(item) ? item.type : undefined) === "object");
  if (objectVariant) {
    const projected = projectSchemaNode(objectVariant, root, depth, seenRefs);
    if (isRecord(projected)) return nullable ? { ...projected, nullable: true } : projected;
  }
  const arrayVariant = nonNullVariants.find((item) => simplifiedType(isRecord(item) ? item.type : undefined) === "array");
  if (arrayVariant) {
    const projected = projectSchemaNode(arrayVariant, root, depth, seenRefs);
    if (isRecord(projected)) return nullable ? { ...projected, nullable: true } : projected;
  }
  return nullable ? { type: "object", nullable: true } : { type: "object" };
}

function resolveSchemaNode(value: unknown, root: Record<string, unknown>, seenRefs: ReadonlySet<string> = new Set()): Record<string, unknown> {
  if (!isRecord(value)) return {};
  if (typeof value.$ref === "string") {
    if (seenRefs.has(value.$ref)) return {};
    const target = localRefTarget(root, value.$ref);
    const nextSeen = new Set(seenRefs);
    nextSeen.add(value.$ref);
    return resolveSchemaNode(target, root, nextSeen);
  }
  return value;
}

function localRefTarget(root: Record<string, unknown>, ref: string): unknown {
  if (!ref.startsWith("#/")) return {};
  return ref
    .slice(2)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((current, segment) => (isRecord(current) ? current[segment] : undefined), root);
}

function schemaAllowsNull(schema: Record<string, unknown>): boolean {
  return schema.type === "null" || (Array.isArray(schema.type) && schema.type.includes("null")) ||
    (Array.isArray(schema.oneOf) && schema.oneOf.some((item) => isRecord(item) && item.type === "null")) ||
    (Array.isArray(schema.anyOf) && schema.anyOf.some((item) => isRecord(item) && item.type === "null"));
}

function simplifiedType(type: unknown): "string" | "number" | "integer" | "boolean" | "array" | "object" {
  if (typeof type === "string" && ["string", "number", "integer", "boolean", "array", "object"].includes(type)) {
    return type as "string" | "number" | "integer" | "boolean" | "array" | "object";
  }
  if (Array.isArray(type)) {
    const nonNull = type.find((item): item is string => item !== "null" && typeof item === "string");
    if (nonNull && ["string", "number", "integer", "boolean", "array", "object"].includes(nonNull)) {
      return nonNull as "string" | "number" | "integer" | "boolean" | "array" | "object";
    }
  }
  return "object";
}

function requiredStrings(schema: Record<string, unknown>): readonly string[] {
  return Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [];
}

function recordAt(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return isRecord(value) ? value : {};
}

function shallowTransportSchema(sectionId: CmipGeminiSectionId): Record<string, unknown> {
  if (sectionId === "engines_reasons") {
    return {
      type: "object",
      required: ["engine_scores", "reasons"],
      properties: {
        engine_scores: { type: "array" },
        reasons: { type: "array" },
      },
    };
  }
  return { type: "object" };
}

function variant(
  variantId: CmipGeminiSectionSchemaVariantId,
  schema: Record<string, unknown>,
  retained: readonly string[],
  moved: readonly string[],
): CmipGeminiSectionSchemaVariantReport {
  return {
    variantId,
    metrics: calculateCmipGeminiSectionSchemaComplexity(schema),
    constraintsRetainedProviderSide: retained,
    constraintsMovedToPostValidation: moved,
    finalTask001EnforcementUnchanged: true,
  };
}

function stripRootSchemaKeyword(schema: Record<string, unknown>): Record<string, unknown> {
  const clone = stableJsonClone(schema) as Record<string, unknown>;
  delete clone.$schema;
  return clone;
}

function removeAnnotations(value: unknown): Record<string, unknown> {
  const stripped = strip(value);
  return isRecord(stripped) ? stripped : {};
}

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !ANNOTATION_KEYWORDS.has(key))
      .map(([key, child]) => [key, strip(child)]),
  );
}

function collectKeywordPaths(schema: Record<string, unknown>): readonly Omit<CmipGeminiSchemaKeywordInventoryItem, "presentInMetaDecision" | "providerRequired" | "movableToPostValidation">[] {
  const items: Omit<CmipGeminiSchemaKeywordInventoryItem, "presentInMetaDecision" | "providerRequired" | "movableToPostValidation">[] = [];
  visitSchema(schema, "$", 0, 0, 0, (value, key, objectDepth, arrayDepth, path) => {
    if (!key || Number.isInteger(Number(key))) return;
    if (isSchemaKeyword(key)) {
      items.push({
        path,
        keyword: key,
        valueType: valueType(value),
        nestingDepth: Math.max(objectDepth, arrayDepth),
      });
    }
  });
  return items.sort((a, b) => `${a.path}:${a.keyword}`.localeCompare(`${b.path}:${b.keyword}`));
}

function visitSchema(
  value: unknown,
  path: string,
  depth: number,
  objectDepth: number,
  arrayDepth: number,
  fn: (value: unknown, key: string | null, objectDepth: number, arrayDepth: number, path: string) => void,
  key: string | null = null,
): void {
  fn(value, key, objectDepth, arrayDepth, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitSchema(item, `${path}[${index}]`, depth + 1, objectDepth, arrayDepth + 1, fn, String(index)));
    return;
  }
  if (!isRecord(value)) return;
  const nextObjectDepth = value.type === "object" ? objectDepth + 1 : objectDepth;
  const nextArrayDepth = value.type === "array" ? arrayDepth + 1 : arrayDepth;
  Object.entries(value).forEach(([childKey, child]) => visitSchema(child, pathFor(path, childKey), depth + 1, nextObjectDepth, nextArrayDepth, fn, childKey));
}

function visitUnknown(value: unknown, path: string, fn: (value: unknown, path: string, key: string | null) => void, key: string | null = null, seen = new WeakSet<object>()): void {
  fn(value, path, key);
  if (typeof value !== "object" || value === null) return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitUnknown(item, `${path}[${index}]`, fn, null, seen));
    return;
  }
  Object.entries(value).forEach(([childKey, child]) => visitUnknown(child, pathFor(path, childKey), fn, childKey, seen));
}

function isSchemaKeyword(key: string): boolean {
  return [
    "$schema",
    "$id",
    "$defs",
    "definitions",
    "$ref",
    "type",
    "additionalProperties",
    "required",
    "properties",
    "items",
    "minItems",
    "maxItems",
    "minLength",
    "maxLength",
    "minimum",
    "maximum",
    "enum",
    "const",
    "pattern",
    "format",
    "propertyNames",
    "dependentRequired",
    "contains",
    "unevaluatedProperties",
    "anyOf",
    "oneOf",
    "allOf",
    "description",
  ].includes(key);
}

function diffRecordKeys(left: Record<string, unknown>, right: Record<string, unknown>): readonly string[] {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.filter((key) => stableStringify(left[key] ?? null) !== stableStringify(right[key] ?? null));
}

function pathFor(base: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${base}.${key}` : `${base}[${JSON.stringify(key)}]`;
}

function valueType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
