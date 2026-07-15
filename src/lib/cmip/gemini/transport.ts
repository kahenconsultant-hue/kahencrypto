import Ajv2020 from "ajv/dist/2020";
import { CMIP_OUTPUT_SCHEMA_VERSION } from "../contracts/constants";
import type { CmipReportEnvelope } from "../contracts";
import { validateCmipReport } from "../contracts/validate-report";
import { hashCanonicalJson, sha256Hex, stableJsonClone, stableStringify } from "../model-package";
import { cmipGeminiIssue } from "./errors";
import transportSchema from "./transport-schema.json";
import type { CmipGeminiIssue } from "./errors";
import type { CmipGeminiParsedOutput } from "./types";

export const CMIP_GEMINI_TRANSPORT_MODE = "compact_canonical_root_v3";
export const CMIP_GEMINI_TRANSPORT_SCHEMA_BYTE_BUDGET = 2048;
export const CMIP_GEMINI_TRANSPORT_SCHEMA = stableJsonClone(transportSchema) as Record<string, unknown>;

export interface CmipGeminiTransportEnvelope {
  readonly schema_version: typeof CMIP_OUTPUT_SCHEMA_VERSION;
  readonly cmip_report: Record<string, unknown>;
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});

const validateTransport = ajv.compile(CMIP_GEMINI_TRANSPORT_SCHEMA);

export function buildCmipGeminiTransportEnvelope(report: unknown): CmipGeminiTransportEnvelope {
  const reportObject = isRecord(report) && isRecord(report.cmip_report) && !Array.isArray(report.cmip_report)
    ? report.cmip_report
    : report;
  return {
    schema_version: CMIP_OUTPUT_SCHEMA_VERSION,
    cmip_report: stableJsonClone(reportObject) as Record<string, unknown>,
  };
}

export function validateCmipGeminiTransportEnvelope(input: unknown): { readonly valid: true; readonly envelope: CmipGeminiTransportEnvelope; readonly errors: [] } | { readonly valid: false; readonly errors: readonly CmipGeminiIssue[] } {
  if (!isRecord(input) || Array.isArray(input)) {
    return { valid: false, errors: [issue("GEMINI_TRANSPORT_ENVELOPE_INVALID", "$", "Gemini transport output must be a JSON object.", "error")] };
  }

  if (input.schema_version !== CMIP_OUTPUT_SCHEMA_VERSION) {
    return {
      valid: false,
      errors: [issue("GEMINI_TRANSPORT_VERSION_MISMATCH", "$.schema_version", `Gemini transport schema_version must be ${CMIP_OUTPUT_SCHEMA_VERSION}.`, "error")],
    };
  }

  if (!Object.hasOwn(input, "cmip_report")) {
    return { valid: false, errors: [issue("GEMINI_CMIP_REPORT_MISSING", "$.cmip_report", "Gemini transport envelope is missing cmip_report.", "error")] };
  }

  if (!isRecord(input.cmip_report) || Array.isArray(input.cmip_report)) {
    return { valid: false, errors: [issue("GEMINI_CMIP_REPORT_INVALID", "$.cmip_report", "Gemini transport cmip_report must be a non-null JSON object.", "error")] };
  }

  if (!validateTransport(input)) {
    return {
      valid: false,
      errors: (validateTransport.errors ?? []).map((error) =>
        issue("GEMINI_TRANSPORT_ENVELOPE_INVALID", error.instancePath ? `$${error.instancePath}` : "$", error.message ?? "Gemini transport envelope failed validation.", "error"),
      ),
    };
  }

  return {
    valid: true,
    envelope: {
      schema_version: input.schema_version,
      cmip_report: input.cmip_report,
    },
    errors: [],
  };
}

export function parseCmipGeminiTransportOutput(outputText: string): CmipGeminiParsedOutput {
  let transport: unknown;
  try {
    transport = JSON.parse(outputText);
  } catch {
    return {
      report: null,
      outputTextHash: sha256Hex(outputText),
      canonicalReportHash: null,
      jsonParsed: false,
      errors: [issue("GEMINI_TRANSPORT_ENVELOPE_INVALID", "$.provider.outputText", "Gemini output text is not valid transport-envelope JSON.", "error")],
    };
  }

  const transportValidation = validateCmipGeminiTransportEnvelope(transport);
  if (!transportValidation.valid) {
    return {
      report: null,
      outputTextHash: sha256Hex(outputText),
      canonicalReportHash: null,
      jsonParsed: false,
      errors: transportValidation.errors,
    };
  }

  const reconstructedEnvelope = { cmip_report: transportValidation.envelope.cmip_report };
  const validation = validateCmipReport(reconstructedEnvelope);
  if (!validation.valid) {
    return {
      report: null,
      outputTextHash: sha256Hex(outputText),
      canonicalReportHash: null,
      jsonParsed: true,
      errors: validation.errors.map((error) => issue("GEMINI_CANONICAL_OUTPUT_INVALID", error.path, error.message, "error")),
    };
  }

  const report = stableJsonClone(validation.data) as CmipReportEnvelope;
  return {
    report,
    outputTextHash: sha256Hex(outputText),
    canonicalReportHash: hashCanonicalJson(report),
    jsonParsed: true,
    errors: [],
  };
}

export function parseLooseCmipGeminiReportObject(outputText: string | null): unknown {
  if (!outputText) return null;
  try {
    const transport = JSON.parse(outputText) as unknown;
    const validated = validateCmipGeminiTransportEnvelope(transport);
    if (!validated.valid) return null;
    return stableJsonClone({ cmip_report: validated.envelope.cmip_report });
  } catch {
    return null;
  }
}

export function collectCmipGeminiTransportSchemaGuardIssues(schema: unknown): readonly { readonly path: string; readonly keyword: string }[] {
  const issues: { path: string; keyword: string }[] = [];
  const serialized = stableStringify(schema);
  if (Buffer.byteLength(serialized, "utf8") > CMIP_GEMINI_TRANSPORT_SCHEMA_BYTE_BUDGET) {
    issues.push({ path: "$", keyword: "byteSize" });
  }
  walk(schema, "$", 0, issues);
  return issues.sort((a, b) => `${a.path}:${a.keyword}`.localeCompare(`${b.path}:${b.keyword}`));
}

function walk(value: unknown, path: string, depth: number, issues: { path: string; keyword: string }[]): void {
  if (depth > 4) issues.push({ path, keyword: "depth" });
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1, issues));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "$defs" || key === "$ref" || key === "allOf" || key === "oneOf" || key === "anyOf") issues.push({ path, keyword: key });
    if (key === "engine_scores" || key === "coins" || key === "audit" || key === "decision" || key === "reasons") issues.push({ path, keyword: `canonical:${key}` });
    walk(child, /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`, depth + 1, issues);
  }
}

function issue(code: CmipGeminiIssue["code"], path: string, message: string, severity: CmipGeminiIssue["severity"]): CmipGeminiIssue {
  return cmipGeminiIssue({ code, path, message, severity });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
