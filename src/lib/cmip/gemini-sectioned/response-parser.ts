import { sha256Hex } from "../model-package";
import { cmipGeminiSectionIssue } from "./errors";
import { validateCmipGeminiProviderProjection, validateCmipGeminiSection } from "./validate-section";
import type { CmipGeminiSectionData, CmipGeminiSectionId } from "./types";

export interface CmipGeminiSectionParseResult {
  readonly data: CmipGeminiSectionData | null;
  readonly outputTextHash: string | null;
  readonly outerJsonParsed: boolean;
  readonly providerSchemaValid: boolean;
  readonly sectionCanonicalValid: boolean;
  readonly errors: readonly ReturnType<typeof cmipGeminiSectionIssue>[];
}

export function parseCmipGeminiSectionOutput(sectionId: CmipGeminiSectionId, outputText: string | null): CmipGeminiSectionParseResult {
  if (!outputText?.trim()) {
    return {
      data: null,
      outputTextHash: null,
      outerJsonParsed: false,
      providerSchemaValid: false,
      sectionCanonicalValid: false,
      errors: [cmipGeminiSectionIssue({ code: "GEMINI_SECTION_OUTPUT_MISSING", path: "$.provider.outputText", message: `Gemini section ${sectionId} returned no output text.`, severity: "error" })],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    return {
      data: null,
      outputTextHash: sha256Hex(outputText),
      outerJsonParsed: false,
      providerSchemaValid: false,
      sectionCanonicalValid: false,
      errors: [cmipGeminiSectionIssue({ code: "GEMINI_SECTION_OUTPUT_JSON_INVALID", path: "$.provider.outputText", message: `Gemini section ${sectionId} output is not valid JSON.`, severity: "error" })],
    };
  }

  const providerProjectionValidation = validateCmipGeminiProviderProjection(sectionId, parsed);
  if (!providerProjectionValidation.valid) {
    return {
      data: null,
      outputTextHash: sha256Hex(outputText),
      outerJsonParsed: true,
      providerSchemaValid: false,
      sectionCanonicalValid: false,
      errors: providerProjectionValidation.errors,
    };
  }

  const validation = validateCmipGeminiSection(sectionId, parsed);
  if (!validation.valid) {
    return {
      data: null,
      outputTextHash: sha256Hex(outputText),
      outerJsonParsed: true,
      providerSchemaValid: true,
      sectionCanonicalValid: false,
      errors: validation.errors,
    };
  }

  return {
    data: validation.data,
    outputTextHash: sha256Hex(outputText),
    outerJsonParsed: true,
    providerSchemaValid: true,
    sectionCanonicalValid: true,
    errors: [],
  };
}
