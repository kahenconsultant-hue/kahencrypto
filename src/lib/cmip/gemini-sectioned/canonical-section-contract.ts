import outputSchema from "../contracts/output-schema.json";
import type { CmipReportEnvelope } from "../contracts";
import { hashCanonicalJson, stableJsonClone, stableStringify } from "../model-package";
import {
  CMIP_CANONICAL_SECTION_DERIVATION_VERSION,
  CMIP_CANONICAL_SECTION_PARTITION_VERSION,
  CMIP_GEMINI_SECTION_ORDER,
} from "./constants";
import type { CmipGeminiSectionId } from "./types";
import legacyChartsAuditSchema from "./section-schemas/charts-audit.schema.json";
import legacyCoinsSchema from "./section-schemas/coins.schema.json";
import legacyConfidenceMemorySchema from "./section-schemas/confidence-memory.schema.json";
import legacyDeltaAttributionSchema from "./section-schemas/delta-attribution.schema.json";
import legacyEnginesReasonsSchema from "./section-schemas/engines-reasons.schema.json";
import legacyMetaDecisionSchema from "./section-schemas/meta-decision.schema.json";
import legacyScenariosTriggersSchema from "./section-schemas/scenarios-triggers.schema.json";

export type CmipCanonicalRootField =
  | "meta"
  | "decision"
  | "executive_summary"
  | "engine_scores"
  | "reasons"
  | "delta"
  | "attribution"
  | "scenarios"
  | "triggers"
  | "coins"
  | "confidence"
  | "decision_memory"
  | "charts"
  | "audit";

export const CMIP_CANONICAL_SECTION_PARTITION_MAP = {
  meta_decision: ["meta", "decision", "executive_summary"],
  engines_reasons: ["engine_scores", "reasons"],
  delta_attribution: ["delta", "attribution"],
  scenarios_triggers: ["scenarios", "triggers"],
  coins: ["coins"],
  confidence_memory: ["confidence", "decision_memory"],
  charts_audit: ["charts", "audit"],
} as const satisfies Record<CmipGeminiSectionId, readonly CmipCanonicalRootField[]>;

export type CmipSectionSchemaMismatchCategory =
  | "EXACT_CANONICAL_MATCH"
  | "MISSING_FROM_SECTION"
  | "EXTRA_IN_SECTION"
  | "TYPE_MISMATCH"
  | "REQUIREDNESS_MISMATCH"
  | "NULLABILITY_MISMATCH"
  | "ENUM_MISMATCH"
  | "NESTED_STRUCTURE_MISMATCH"
  | "CONSTRAINT_MISMATCH";

export interface CmipCanonicalSectionDerivationReport {
  readonly sectionId: CmipGeminiSectionId;
  readonly partitionVersion: typeof CMIP_CANONICAL_SECTION_PARTITION_VERSION;
  readonly derivationVersion: typeof CMIP_CANONICAL_SECTION_DERIVATION_VERSION;
  readonly canonicalSchemaHash: string;
  readonly derivedSectionSchemaHash: string;
  readonly ownedFields: readonly CmipCanonicalRootField[];
  readonly canonicalSubtreeHashes: Record<CmipCanonicalRootField, string>;
  readonly derivedSubtreeHashes: Record<CmipCanonicalRootField, string>;
  readonly dependencyDefinitionHashes: Record<string, string>;
  readonly equivalent: boolean;
}

export interface CmipLegacySectionSchemaMismatchAudit {
  readonly sectionId: CmipGeminiSectionId;
  readonly counts: Record<CmipSectionSchemaMismatchCategory, number>;
  readonly examples: readonly {
    readonly path: string;
    readonly category: CmipSectionSchemaMismatchCategory;
    readonly message: string;
  }[];
}

type JsonRecord = Record<string, unknown>;

const canonicalSchema = outputSchema as JsonRecord;
const legacySectionSchemas = {
  meta_decision: legacyMetaDecisionSchema,
  engines_reasons: legacyEnginesReasonsSchema,
  delta_attribution: legacyDeltaAttributionSchema,
  scenarios_triggers: legacyScenariosTriggersSchema,
  coins: legacyCoinsSchema,
  confidence_memory: legacyConfidenceMemorySchema,
  charts_audit: legacyChartsAuditSchema,
} as const satisfies Record<CmipGeminiSectionId, JsonRecord>;

export function assertCmipCanonicalPartitionCoverage(): readonly string[] {
  const issues: string[] = [];
  const report = canonicalReportSchema();
  const canonicalRequired = stringArrayAt(report, "required");
  const canonicalProperties = recordAt(report, "properties");
  const ownerByField = new Map<string, CmipGeminiSectionId[]>();

  for (const [sectionId, fields] of Object.entries(CMIP_CANONICAL_SECTION_PARTITION_MAP) as readonly [CmipGeminiSectionId, readonly string[]][]) {
    fields.forEach((field) => {
      const owners = ownerByField.get(field) ?? [];
      owners.push(sectionId);
      ownerByField.set(field, owners);
      if (!Object.hasOwn(canonicalProperties, field)) {
        issues.push(`Unknown partition field ${sectionId}.${field}.`);
      }
    });
  }

  canonicalRequired.forEach((field) => {
    const owners = ownerByField.get(field) ?? [];
    if (owners.length === 0) issues.push(`Required canonical field is not partitioned: ${field}.`);
    if (owners.length > 1) issues.push(`Required canonical field has multiple owners: ${field} -> ${owners.join(",")}.`);
  });

  for (const [field, owners] of ownerByField) {
    if (owners.length > 1) issues.push(`Partition overlap for ${field}: ${owners.join(",")}.`);
  }

  return issues.sort();
}

export function deriveCanonicalSectionSchema(
  sourceSchema: JsonRecord,
  sectionId: CmipGeminiSectionId,
  partitionMap: typeof CMIP_CANONICAL_SECTION_PARTITION_MAP = CMIP_CANONICAL_SECTION_PARTITION_MAP,
): JsonRecord {
  const fields = partitionMap[sectionId];
  const report = canonicalReportSchema(sourceSchema);
  const reportProperties = recordAt(report, "properties");
  const properties: JsonRecord = {};
  const refs = new Set<string>();

  fields.forEach((field) => {
    const property = stableJsonClone(reportProperties[field]) as JsonRecord;
    properties[field] = property;
    collectLocalDefinitionRefs(property, refs);
  });

  const definitions = collectDefinitionDependencies(sourceSchema, refs);
  const schema: JsonRecord = {
    $schema: sourceSchema.$schema,
    $id: `https://cmip.local/gemini-sectioned/derived/${sectionId}.schema.json`,
    title: `CMIP canonical section ${sectionId}`,
    type: "object",
    additionalProperties: false,
    required: [...fields],
    properties,
  };
  if (Object.keys(definitions).length > 0) {
    schema.definitions = definitions;
  }
  return schema;
}

export function getCmipCanonicalSectionSchema(sectionId: CmipGeminiSectionId): JsonRecord {
  return deriveCanonicalSectionSchema(canonicalSchema, sectionId);
}

export function getCmipCanonicalSectionDerivationReport(sectionId: CmipGeminiSectionId): CmipCanonicalSectionDerivationReport {
  const derived = getCmipCanonicalSectionSchema(sectionId);
  const report = canonicalReportSchema();
  const canonicalProperties = recordAt(report, "properties");
  const derivedProperties = recordAt(derived, "properties");
  const dependencyDefinitions = recordAt(derived, "definitions");
  const canonicalSubtreeHashes = {} as Record<CmipCanonicalRootField, string>;
  const derivedSubtreeHashes = {} as Record<CmipCanonicalRootField, string>;
  for (const field of CMIP_CANONICAL_SECTION_PARTITION_MAP[sectionId]) {
    canonicalSubtreeHashes[field] = hashCanonicalJson(canonicalProperties[field]);
    derivedSubtreeHashes[field] = hashCanonicalJson(derivedProperties[field]);
  }
  const dependencyDefinitionHashes = Object.fromEntries(
    Object.entries(dependencyDefinitions).map(([key, value]) => [key, hashCanonicalJson(value)]).sort(([a], [b]) => a.localeCompare(b)),
  );
  return {
    sectionId,
    partitionVersion: CMIP_CANONICAL_SECTION_PARTITION_VERSION,
    derivationVersion: CMIP_CANONICAL_SECTION_DERIVATION_VERSION,
    canonicalSchemaHash: hashCanonicalJson(canonicalSchema),
    derivedSectionSchemaHash: hashCanonicalJson(derived),
    ownedFields: CMIP_CANONICAL_SECTION_PARTITION_MAP[sectionId],
    canonicalSubtreeHashes,
    derivedSubtreeHashes,
    dependencyDefinitionHashes,
    equivalent: Object.keys(canonicalSubtreeHashes).every((field) =>
      canonicalSubtreeHashes[field as CmipCanonicalRootField] === derivedSubtreeHashes[field as CmipCanonicalRootField],
    ),
  };
}

export function getAllCmipCanonicalSectionDerivationReports(): readonly CmipCanonicalSectionDerivationReport[] {
  return CMIP_GEMINI_SECTION_ORDER.map((sectionId) => getCmipCanonicalSectionDerivationReport(sectionId));
}

export function sectionFromCanonicalReportByPartition(sectionId: CmipGeminiSectionId, reportEnvelope: CmipReportEnvelope): JsonRecord {
  const report = reportEnvelope.cmip_report as unknown as JsonRecord;
  return Object.fromEntries(CMIP_CANONICAL_SECTION_PARTITION_MAP[sectionId].map((field) => [field, stableJsonClone(report[field])])) as JsonRecord;
}

export function auditLegacyCmipGeminiSectionSchemas(): readonly CmipLegacySectionSchemaMismatchAudit[] {
  return CMIP_GEMINI_SECTION_ORDER.map((sectionId) => auditLegacySectionSchema(sectionId));
}

export function auditLegacySectionSchema(sectionId: CmipGeminiSectionId): CmipLegacySectionSchemaMismatchAudit {
  const derived = resolveLocalRefs(getCmipCanonicalSectionSchema(sectionId), getCmipCanonicalSectionSchema(sectionId));
  const legacy = legacySectionSchemas[sectionId];
  const counts = zeroMismatchCounts();
  const examples: CmipLegacySectionSchemaMismatchAudit["examples"][number][] = [];
  compareSchemaNodes(derived, legacy, "$", counts, examples);
  return {
    sectionId,
    counts,
    examples: examples.slice(0, 12),
  };
}

function canonicalReportSchema(sourceSchema: JsonRecord = canonicalSchema): JsonRecord {
  const definitions = recordAt(sourceSchema, "definitions");
  return recordAt(definitions, "cmipReport");
}

function collectDefinitionDependencies(sourceSchema: JsonRecord, initialRefs: ReadonlySet<string>): JsonRecord {
  const sourceDefinitions = recordAt(sourceSchema, "definitions");
  const pending = [...initialRefs].sort();
  const seen = new Set<string>();
  const definitions: JsonRecord = {};

  while (pending.length > 0) {
    const ref = pending.shift();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    const name = definitionNameFromRef(ref);
    if (!name) continue;
    const definition = stableJsonClone(sourceDefinitions[name]) as JsonRecord;
    definitions[name] = definition;
    const nested = new Set<string>();
    collectLocalDefinitionRefs(definition, nested);
    nested.forEach((item) => {
      if (!seen.has(item)) pending.push(item);
    });
    pending.sort();
  }

  return Object.fromEntries(Object.entries(definitions).sort(([a], [b]) => a.localeCompare(b)));
}

function collectLocalDefinitionRefs(value: unknown, refs: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectLocalDefinitionRefs(item, refs));
    return;
  }
  if (!isRecord(value)) return;
  if (typeof value.$ref === "string" && value.$ref.startsWith("#/definitions/")) {
    refs.add(value.$ref);
  }
  Object.values(value).forEach((child) => collectLocalDefinitionRefs(child, refs));
}

function resolveLocalRefs(value: unknown, root: JsonRecord, stack: readonly string[] = []): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveLocalRefs(item, root, stack));
  if (!isRecord(value)) return value;
  if (typeof value.$ref === "string" && Object.keys(value).length === 1) {
    if (stack.includes(value.$ref)) return stableJsonClone(value);
    const target = localRefTarget(root, value.$ref);
    return target ? resolveLocalRefs(target, root, [...stack, value.$ref]) : stableJsonClone(value);
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolveLocalRefs(child, root, stack)]));
}

function localRefTarget(root: JsonRecord, ref: string): unknown {
  if (!ref.startsWith("#/")) return null;
  return ref
    .slice(2)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((current, segment) => (isRecord(current) ? current[segment] : undefined), root);
}

function compareSchemaNodes(
  canonical: unknown,
  legacy: unknown,
  path: string,
  counts: Record<CmipSectionSchemaMismatchCategory, number>,
  examples: CmipLegacySectionSchemaMismatchAudit["examples"][number][],
): void {
  if (legacy === undefined) {
    addMismatch(counts, examples, path, "MISSING_FROM_SECTION", "Canonical schema node is missing from legacy section schema.");
    return;
  }
  if (stableStringify(canonical) === stableStringify(legacy)) {
    counts.EXACT_CANONICAL_MATCH += 1;
    return;
  }
  if (!isRecord(canonical) || !isRecord(legacy)) {
    addMismatch(counts, examples, path, "NESTED_STRUCTURE_MISMATCH", "Schema nodes differ.");
    return;
  }

  compareKeyword("type", canonical, legacy, path, "TYPE_MISMATCH", counts, examples);
  compareKeyword("enum", canonical, legacy, path, "ENUM_MISMATCH", counts, examples);
  compareKeyword("required", canonical, legacy, path, "REQUIREDNESS_MISMATCH", counts, examples);
  compareKeyword("additionalProperties", canonical, legacy, path, "CONSTRAINT_MISMATCH", counts, examples);
  compareKeyword("minimum", canonical, legacy, path, "CONSTRAINT_MISMATCH", counts, examples);
  compareKeyword("maximum", canonical, legacy, path, "CONSTRAINT_MISMATCH", counts, examples);
  compareKeyword("minItems", canonical, legacy, path, "CONSTRAINT_MISMATCH", counts, examples);
  compareKeyword("maxItems", canonical, legacy, path, "CONSTRAINT_MISMATCH", counts, examples);
  compareKeyword("minLength", canonical, legacy, path, "CONSTRAINT_MISMATCH", counts, examples);
  compareKeyword("maxLength", canonical, legacy, path, "CONSTRAINT_MISMATCH", counts, examples);
  if (hasDifferentNullability(canonical.type, legacy.type)) {
    addMismatch(counts, examples, `${path}.type`, "NULLABILITY_MISMATCH", "Nullable representation differs.");
  }

  const canonicalProperties = isRecord(canonical.properties) ? canonical.properties : {};
  const legacyProperties = isRecord(legacy.properties) ? legacy.properties : {};
  for (const key of Object.keys(canonicalProperties).sort()) {
    compareSchemaNodes(canonicalProperties[key], legacyProperties[key], `${path}.properties.${key}`, counts, examples);
  }
  for (const key of Object.keys(legacyProperties).sort()) {
    if (!Object.hasOwn(canonicalProperties, key)) {
      addMismatch(counts, examples, `${path}.properties.${key}`, "EXTRA_IN_SECTION", "Legacy section schema contains a non-canonical property.");
    }
  }
  if (canonical.items !== undefined || legacy.items !== undefined) {
    compareSchemaNodes(canonical.items, legacy.items, `${path}.items`, counts, examples);
  }
  for (const keyword of ["oneOf", "anyOf", "allOf"] as const) {
    if (canonical[keyword] !== undefined || legacy[keyword] !== undefined) {
      compareKeyword(keyword, canonical, legacy, path, "NESTED_STRUCTURE_MISMATCH", counts, examples);
    }
  }
}

function compareKeyword(
  keyword: string,
  canonical: JsonRecord,
  legacy: JsonRecord,
  path: string,
  category: CmipSectionSchemaMismatchCategory,
  counts: Record<CmipSectionSchemaMismatchCategory, number>,
  examples: CmipLegacySectionSchemaMismatchAudit["examples"][number][],
): void {
  if (canonical[keyword] === undefined && legacy[keyword] === undefined) return;
  if (stableStringify(canonical[keyword] ?? null) !== stableStringify(legacy[keyword] ?? null)) {
    addMismatch(counts, examples, `${path}.${keyword}`, category, `Keyword ${keyword} differs from canonical schema.`);
  }
}

function addMismatch(
  counts: Record<CmipSectionSchemaMismatchCategory, number>,
  examples: CmipLegacySectionSchemaMismatchAudit["examples"][number][],
  path: string,
  category: CmipSectionSchemaMismatchCategory,
  message: string,
): void {
  counts[category] += 1;
  if (examples.length < 12) examples.push({ path, category, message });
}

function zeroMismatchCounts(): Record<CmipSectionSchemaMismatchCategory, number> {
  return {
    EXACT_CANONICAL_MATCH: 0,
    MISSING_FROM_SECTION: 0,
    EXTRA_IN_SECTION: 0,
    TYPE_MISMATCH: 0,
    REQUIREDNESS_MISMATCH: 0,
    NULLABILITY_MISMATCH: 0,
    ENUM_MISMATCH: 0,
    NESTED_STRUCTURE_MISMATCH: 0,
    CONSTRAINT_MISMATCH: 0,
  };
}

function hasDifferentNullability(left: unknown, right: unknown): boolean {
  return includesNull(left) !== includesNull(right);
}

function includesNull(value: unknown): boolean {
  return value === "null" || (Array.isArray(value) && value.includes("null"));
}

function definitionNameFromRef(ref: string): string | null {
  const prefix = "#/definitions/";
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : null;
}

function recordAt(record: JsonRecord, key: string): JsonRecord {
  const value = record[key];
  return isRecord(value) ? value : {};
}

function stringArrayAt(record: JsonRecord, key: string): readonly string[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
