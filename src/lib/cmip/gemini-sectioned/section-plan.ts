import { stableJsonClone, stableStringify } from "../model-package";
import { CMIP_GEMINI_SECTION_ORDER, CMIP_GEMINI_SECTION_SCHEMA_BYTE_BUDGET, CMIP_GEMINI_SECTION_SCHEMA_MAX_DEPTH } from "./constants";
import type { CmipGeminiSectionDefinition, CmipGeminiSectionId } from "./types";
import { providerSchemaForCmipGeminiSection } from "./section-compatibility-audit";
import { CMIP_CANONICAL_SECTION_PARTITION_MAP, getCmipCanonicalSectionSchema } from "./canonical-section-contract";

const definitions = [
  {
    sectionId: "meta_decision",
    title: "Meta, decision and executive summary",
    outputFields: CMIP_CANONICAL_SECTION_PARTITION_MAP.meta_decision,
    dependsOn: [],
    schema: getCmipCanonicalSectionSchema("meta_decision"),
    rationale: "Establishes report identity, final posture language and the short user-facing summary before explanatory sections depend on it.",
  },
  {
    sectionId: "engines_reasons",
    title: "Engine scores and reasons",
    outputFields: CMIP_CANONICAL_SECTION_PARTITION_MAP.engines_reasons,
    dependsOn: ["meta_decision"],
    schema: getCmipCanonicalSectionSchema("engines_reasons"),
    rationale: "Reasons depend on the validated decision posture and must explain why the posture prevailed.",
  },
  {
    sectionId: "delta_attribution",
    title: "Delta and attribution",
    outputFields: CMIP_CANONICAL_SECTION_PARTITION_MAP.delta_attribution,
    dependsOn: ["meta_decision", "engines_reasons"],
    schema: getCmipCanonicalSectionSchema("delta_attribution"),
    rationale: "Attribution summarizes validated drivers from the decision and evidence sections.",
  },
  {
    sectionId: "scenarios_triggers",
    title: "Scenarios and triggers",
    outputFields: CMIP_CANONICAL_SECTION_PARTITION_MAP.scenarios_triggers,
    dependsOn: ["meta_decision", "engines_reasons"],
    schema: getCmipCanonicalSectionSchema("scenarios_triggers"),
    rationale: "Scenarios and triggers depend on the validated posture and strongest drivers.",
  },
  {
    sectionId: "coins",
    title: "Ten-asset coin decisions",
    outputFields: CMIP_CANONICAL_SECTION_PARTITION_MAP.coins,
    dependsOn: ["meta_decision"],
    schema: getCmipCanonicalSectionSchema("coins"),
    rationale: "Coin postures depend on the report-level decision while preserving exact asset-universe requirements.",
  },
  {
    sectionId: "confidence_memory",
    title: "Confidence and decision memory",
    outputFields: CMIP_CANONICAL_SECTION_PARTITION_MAP.confidence_memory,
    dependsOn: ["meta_decision", "engines_reasons", "coins"],
    schema: getCmipCanonicalSectionSchema("confidence_memory"),
    rationale: "Confidence summarizes section completeness, conflicts and decision-memory availability.",
  },
  {
    sectionId: "charts_audit",
    title: "Charts and audit",
    outputFields: CMIP_CANONICAL_SECTION_PARTITION_MAP.charts_audit,
    dependsOn: ["meta_decision", "engines_reasons", "delta_attribution", "scenarios_triggers", "coins", "confidence_memory"],
    schema: getCmipCanonicalSectionSchema("charts_audit"),
    rationale: "Audit closes the report by registering source and calculation references claimed by earlier sections.",
  },
] as const satisfies readonly CmipGeminiSectionDefinition[];

export const CMIP_GEMINI_SECTION_PLAN: readonly CmipGeminiSectionDefinition[] = definitions.map((definition) =>
  Object.freeze({
    ...definition,
    schema: stableJsonClone(definition.schema) as Record<string, unknown>,
  }),
);

export function getCmipGeminiSectionDefinition(sectionId: CmipGeminiSectionId): CmipGeminiSectionDefinition {
  const definition = CMIP_GEMINI_SECTION_PLAN.find((item) => item.sectionId === sectionId);
  if (!definition) throw new Error(`Unknown Gemini section: ${sectionId}`);
  return definition;
}

export function assertCmipGeminiSectionPlanOrder(): boolean {
  return CMIP_GEMINI_SECTION_PLAN.every((section, index) => section.sectionId === CMIP_GEMINI_SECTION_ORDER[index]);
}

export function providerSchemaForGeminiSection(section: CmipGeminiSectionDefinition): Record<string, unknown> {
  return providerSchemaForCmipGeminiSection(section);
}

export function collectSectionSchemaGuardIssues(schema: unknown): readonly { readonly path: string; readonly keyword: string }[] {
  const issues: { path: string; keyword: string }[] = [];
  const serialized = stableStringify(schema);
  if (Buffer.byteLength(serialized, "utf8") > CMIP_GEMINI_SECTION_SCHEMA_BYTE_BUDGET) {
    issues.push({ path: "$", keyword: "byteSize" });
  }
  walk(schema, "$", 0, issues);
  return issues.sort((a, b) => `${a.path}:${a.keyword}`.localeCompare(`${b.path}:${b.keyword}`));
}

function walk(value: unknown, path: string, depth: number, issues: { path: string; keyword: string }[]): void {
  if (depth > CMIP_GEMINI_SECTION_SCHEMA_MAX_DEPTH) issues.push({ path, keyword: "depth" });
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || typeof item !== "object")) return;
    value.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1, issues));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "$defs" || key === "$ref" || key === "allOf" || key === "oneOf" || key === "anyOf") {
      issues.push({ path, keyword: key });
    }
    if (key === "cmip_report") {
      issues.push({ path, keyword: "canonicalRoot" });
    }
    const childDepth = isRecord(child) && (child.type === "object" || child.type === "array") ? depth + 1 : depth;
    walk(child, /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`, childDepth, issues);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
