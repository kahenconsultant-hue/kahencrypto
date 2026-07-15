import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { CMIP_ABSTENTION_REASON_CODES, CMIP_DECISION_POSTURES, CMIP_REQUIRED_ASSET_SYMBOLS } from "../contracts/constants";
import { validateCmipAssetUniverse } from "../contracts/validate-asset-universe";
import { stableJsonClone } from "../model-package";
import { cmipGeminiSectionIssue } from "./errors";
import { CMIP_GEMINI_SECTION_PLAN, providerSchemaForGeminiSection } from "./section-plan";
import type { CmipGeminiSectionData, CmipGeminiSectionId } from "./types";

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
  allowUnionTypes: true,
});
addFormats(ajv);

const validators = new Map(CMIP_GEMINI_SECTION_PLAN.map((section) => [section.sectionId, ajv.compile(section.schema)]));
const providerProjectionValidators = new Map(CMIP_GEMINI_SECTION_PLAN.map((section) => [section.sectionId, ajv.compile(providerSchemaForGeminiSection(section))]));

export function validateCmipGeminiProviderProjection(sectionId: CmipGeminiSectionId, input: unknown): {
  readonly valid: true;
  readonly errors: [];
} | {
  readonly valid: false;
  readonly errors: readonly ReturnType<typeof cmipGeminiSectionIssue>[];
} {
  const validator = providerProjectionValidators.get(sectionId);
  if (!validator) {
    return { valid: false, errors: [cmipGeminiSectionIssue({ code: "GEMINI_SECTION_SCHEMA_INVALID", path: "$.sectionId", message: `Unknown Gemini section: ${sectionId}.`, severity: "critical" })] };
  }
  if (validator(input)) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: (validator.errors ?? []).map((error) =>
      cmipGeminiSectionIssue({
        code: "GEMINI_SECTION_OUTPUT_INVALID",
        path: ajvPath(error.instancePath, error.params),
        message: error.message ?? "Gemini section output failed provider projection validation.",
        severity: "error",
      }),
    ),
  };
}

export function validateCmipGeminiSection(sectionId: CmipGeminiSectionId, input: unknown): {
  readonly valid: true;
  readonly data: CmipGeminiSectionData;
  readonly errors: [];
} | {
  readonly valid: false;
  readonly errors: readonly ReturnType<typeof cmipGeminiSectionIssue>[];
} {
  const validator = validators.get(sectionId);
  if (!validator) {
    return { valid: false, errors: [cmipGeminiSectionIssue({ code: "GEMINI_SECTION_SCHEMA_INVALID", path: "$.sectionId", message: `Unknown Gemini section: ${sectionId}.`, severity: "critical" })] };
  }

  if (!validator(input)) {
    return {
      valid: false,
      errors: (validator.errors ?? []).map((error) =>
        cmipGeminiSectionIssue({
          code: "GEMINI_SECTION_OUTPUT_INVALID",
          path: ajvPath(error.instancePath, error.params),
          message: error.message ?? "Gemini section output failed section schema validation.",
          severity: "error",
        }),
      ),
    };
  }

  const semanticErrors = validateSectionSemantics(sectionId, input);
  if (semanticErrors.length) return { valid: false, errors: semanticErrors };
  return { valid: true, data: stableJsonClone(input) as CmipGeminiSectionData, errors: [] };
}

export function compileAllCmipGeminiSectionSchemas(): readonly CmipGeminiSectionId[] {
  return CMIP_GEMINI_SECTION_PLAN.map((section) => {
    ajv.compile(section.schema);
    return section.sectionId;
  });
}

function validateSectionSemantics(sectionId: CmipGeminiSectionId, input: unknown): ReturnType<typeof cmipGeminiSectionIssue>[] {
  const errors: ReturnType<typeof cmipGeminiSectionIssue>[] = [];
  if (!isRecord(input)) return errors;

  if (sectionId === "meta_decision") {
    const decision = isRecord(input.decision) ? input.decision : {};
    const posture = decision.posture;
    if (!CMIP_DECISION_POSTURES.includes(posture as never)) {
      errors.push(cmipGeminiSectionIssue({ code: "GEMINI_SECTION_OUTPUT_INVALID", path: "$.decision.posture", message: "Decision posture is not supported.", severity: "error" }));
    }
    if (posture === "abstain") {
      if (!isRecord(decision.abstention)) {
        errors.push(cmipGeminiSectionIssue({ code: "GEMINI_SECTION_OUTPUT_INVALID", path: "$.decision.abstention", message: "Abstain posture requires an abstention object.", severity: "error" }));
      } else {
        const reasonCodes = Array.isArray(decision.abstention.reason_codes) ? decision.abstention.reason_codes : [];
        if (reasonCodes.length === 0 || reasonCodes.some((code) => !CMIP_ABSTENTION_REASON_CODES.includes(code as never))) {
          errors.push(cmipGeminiSectionIssue({ code: "GEMINI_SECTION_OUTPUT_INVALID", path: "$.decision.abstention.reason_codes", message: "Abstention reason codes must be non-empty and canonical.", severity: "error" }));
        }
      }
    } else if (decision.abstention !== null) {
      errors.push(cmipGeminiSectionIssue({ code: "GEMINI_SECTION_OUTPUT_INVALID", path: "$.decision.abstention", message: "Directional postures require abstention = null.", severity: "error" }));
    }
  }

  if (sectionId === "coins") {
    const coins = Array.isArray(input.coins) ? input.coins : [];
    errors.push(...validateCmipAssetUniverse(coins as never, "$.coins").map((error) =>
      cmipGeminiSectionIssue({ code: "GEMINI_SECTION_OUTPUT_INVALID", path: error.path, message: error.message, severity: "error" }),
    ));
    const symbols = coins.map((coin) => isRecord(coin) && typeof coin.symbol === "string" ? coin.symbol : null);
    if (symbols.join(",") !== CMIP_REQUIRED_ASSET_SYMBOLS.join(",")) {
      errors.push(cmipGeminiSectionIssue({ code: "GEMINI_SECTION_OUTPUT_INVALID", path: "$.coins", message: "Coin section must use the canonical ten-asset order.", severity: "error" }));
    }
  }

  return errors;
}

function ajvPath(path: string, params: Record<string, unknown>): string {
  const required = typeof params.missingProperty === "string" ? params.missingProperty : null;
  const additional = typeof params.additionalProperty === "string" ? params.additionalProperty : null;
  const base = path ? `$${path.replaceAll("/", ".")}` : "$";
  if (required) return `${base}.${required}`;
  if (additional) return `${base}.${additional}`;
  return base;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
