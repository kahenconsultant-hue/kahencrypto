import { validateCmipReport } from "../contracts/validate-report";
import type { CmipReportEnvelope } from "../contracts";
import { hashCanonicalJson, stableJsonClone } from "../model-package";
import { CmipGeminiSectionedAssemblyError, cmipGeminiSectionIssue } from "./errors";
import { CMIP_GEMINI_SECTION_ORDER } from "./constants";
import {
  CMIP_CANONICAL_SECTION_PARTITION_MAP,
  getCmipCanonicalSectionDerivationReport,
  sectionFromCanonicalReportByPartition,
} from "./canonical-section-contract";
import type {
  CmipAnyGeminiSectionResult,
  CmipGeminiSectionData,
  CmipGeminiSectionId,
  CmipPartialGeminiSections,
  CmipValidatedGeminiSections,
} from "./types";

export function assembleCmipReportFromGeminiSections(sections: CmipValidatedGeminiSections): CmipReportEnvelope {
  const report: CmipReportEnvelope = {
    cmip_report: {
      meta: stableJsonClone(sections.meta_decision.meta),
      decision: stableJsonClone(sections.meta_decision.decision),
      executive_summary: stableJsonClone(sections.meta_decision.executive_summary),
      engine_scores: stableJsonClone(sections.engines_reasons.engine_scores),
      reasons: stableJsonClone(sections.engines_reasons.reasons),
      delta: stableJsonClone(sections.delta_attribution.delta),
      attribution: stableJsonClone(sections.delta_attribution.attribution),
      scenarios: stableJsonClone(sections.scenarios_triggers.scenarios),
      triggers: stableJsonClone(sections.scenarios_triggers.triggers),
      coins: stableJsonClone(sections.coins.coins),
      confidence: stableJsonClone(sections.confidence_memory.confidence),
      decision_memory: stableJsonClone(sections.confidence_memory.decision_memory),
      charts: stableJsonClone(sections.charts_audit.charts),
      audit: stableJsonClone(sections.charts_audit.audit),
    },
  };

  const referenceErrors = validatePreAssemblyReferenceIntegrity(report);
  if (referenceErrors.length) {
    throw new CmipGeminiSectionedAssemblyError(referenceErrors);
  }

  const validation = validateCmipReport(report);
  if (!validation.valid) {
    throw new CmipGeminiSectionedAssemblyError(validation.errors.map((error) =>
      cmipGeminiSectionIssue({ code: "GEMINI_SECTION_FINAL_VALIDATION_FAILED", path: error.path, message: error.message, severity: "error" }),
    ));
  }

  return stableJsonClone(validation.data);
}

export function validatedSectionsFromResults(results: readonly CmipAnyGeminiSectionResult[]): CmipValidatedGeminiSections {
  const seen = new Set<CmipGeminiSectionId>();
  const partial: CmipPartialGeminiSections = {};
  const errors: ReturnType<typeof cmipGeminiSectionIssue>[] = [];

  for (const result of results) {
    if (seen.has(result.sectionId)) {
      errors.push(cmipGeminiSectionIssue({ code: "GEMINI_SECTION_DUPLICATE_SECTION", path: `$.sections.${result.sectionId}`, message: `Duplicate Gemini section result: ${result.sectionId}.`, severity: "error" }));
      continue;
    }
    seen.add(result.sectionId);
    if (result.status !== "success" || !result.data) {
      errors.push(cmipGeminiSectionIssue({ code: "GEMINI_SECTION_MISSING_SECTION", path: `$.sections.${result.sectionId}`, message: `Gemini section did not succeed: ${result.sectionId}.`, severity: "error" }));
      continue;
    }
    if (!result.validation.sectionCanonicalValid) {
      errors.push(cmipGeminiSectionIssue({ code: "GEMINI_SECTION_OUTPUT_INVALID", path: `$.sections.${result.sectionId}`, message: `Gemini section was not validated against the exact derived canonical section schema: ${result.sectionId}.`, severity: "error" }));
      continue;
    }
    assignSection(partial, result.sectionId, result.data);
  }

  for (const sectionId of CMIP_GEMINI_SECTION_ORDER) {
    if (!seen.has(sectionId)) {
      errors.push(cmipGeminiSectionIssue({ code: "GEMINI_SECTION_MISSING_SECTION", path: `$.sections.${sectionId}`, message: `Required Gemini section is missing: ${sectionId}.`, severity: "error" }));
    }
  }

  if (errors.length) throw new CmipGeminiSectionedAssemblyError(errors);
  return partial as CmipValidatedGeminiSections;
}

export function sectionFromCmipReport(sectionId: CmipGeminiSectionId, reportEnvelope: CmipReportEnvelope): CmipGeminiSectionData {
  return stableJsonClone(sectionFromCanonicalReportByPartition(sectionId, reportEnvelope)) as CmipGeminiSectionData;
}

export function hashAssembledReport(report: CmipReportEnvelope): string {
  return hashCanonicalJson(report);
}

export function buildCmipSectionAssemblyProvenance(): readonly {
  readonly field: string;
  readonly sectionId: CmipGeminiSectionId;
  readonly strictSectionSchemaHash: string;
  readonly canonicalSubtreeHash: string;
  readonly transportConversionId: null;
}[] {
  return CMIP_GEMINI_SECTION_ORDER.flatMap((sectionId) => {
    const report = getCmipCanonicalSectionDerivationReport(sectionId);
    return CMIP_CANONICAL_SECTION_PARTITION_MAP[sectionId].map((field) => ({
      field,
      sectionId,
      strictSectionSchemaHash: report.derivedSectionSchemaHash,
      canonicalSubtreeHash: report.canonicalSubtreeHashes[field],
      transportConversionId: null,
    }));
  });
}

function assignSection(partial: CmipPartialGeminiSections, sectionId: CmipGeminiSectionId, data: CmipGeminiSectionData): void {
  Object.assign(partial, { [sectionId]: data });
}

function validatePreAssemblyReferenceIntegrity(report: CmipReportEnvelope): ReturnType<typeof cmipGeminiSectionIssue>[] {
  const issues: ReturnType<typeof cmipGeminiSectionIssue>[] = [];
  const sourceRefs = new Set(report.cmip_report.audit.sources.map((source) => source.ref));
  const calcRefs = new Set(report.cmip_report.audit.calculations.map((calculation) => calculation.ref));
  collectNamedRefs(report.cmip_report, "source_refs").forEach(({ path, value }) => {
    if (!sourceRefs.has(value)) {
      issues.push(cmipGeminiSectionIssue({ code: "GEMINI_SECTION_ASSEMBLY_FAILED", path, message: `Source ref ${value} is not registered in audit.sources.`, severity: "error" }));
    }
  });
  collectNamedRefs(report.cmip_report, "calc_refs").forEach(({ path, value }) => {
    if (!calcRefs.has(value)) {
      issues.push(cmipGeminiSectionIssue({ code: "GEMINI_SECTION_ASSEMBLY_FAILED", path, message: `Calculation ref ${value} is not registered in audit.calculations.`, severity: "error" }));
    }
  });
  return issues;
}

function collectNamedRefs(value: unknown, keyName: "source_refs" | "calc_refs", path = "$.cmip_report"): readonly { readonly path: string; readonly value: string }[] {
  const refs: { path: string; value: string }[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => refs.push(...collectNamedRefs(item, keyName, `${path}[${index}]`)));
    return refs;
  }
  if (typeof value !== "object" || value === null) return refs;
  Object.entries(value).forEach(([key, child]) => {
    const childPath = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
    if (key === keyName && Array.isArray(child)) {
      child.forEach((item, index) => {
        if (typeof item === "string") refs.push({ path: `${childPath}[${index}]`, value: item });
      });
    }
    refs.push(...collectNamedRefs(child, keyName, childPath));
  });
  return refs;
}
