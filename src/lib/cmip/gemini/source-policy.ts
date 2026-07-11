import { cmipGeminiIssue } from "./errors";
import type { CmipGeminiIssue } from "./errors";
import type { CmipGeminiToolMappingInput, CmipGeminiToolMappingResult } from "./types";

export function mapCmipGeminiTools(params: CmipGeminiToolMappingInput): CmipGeminiToolMappingResult {
  const warnings: CmipGeminiIssue[] = [];
  if (params.toolPolicy.webSearch.mode === "disabled") {
    return { tools: [], enabled: false, warnings };
  }
  if (!params.enableGoogleSearch) {
    warnings.push(cmipGeminiIssue({
      code: "GEMINI_GOOGLE_SEARCH_DISABLED_BY_ENV",
      path: "$.env.CMIP_GEMINI_ENABLE_GOOGLE_SEARCH",
      message: "Google Search is not enabled for this Gemini execution environment.",
      severity: "warning",
    }));
    return { tools: [], enabled: false, warnings };
  }
  if (!params.capabilities.supportsGoogleSearch) {
    warnings.push(cmipGeminiIssue({
      code: "GEMINI_GOOGLE_SEARCH_UNSUPPORTED_BY_MODEL",
      path: "$.model.capabilities.supportsGoogleSearch",
      message: "The resolved Gemini profile does not advertise Google Search capability.",
      severity: "warning",
    }));
    return { tools: [], enabled: false, warnings };
  }
  if (params.executionMode === "dry_run") {
    warnings.push(cmipGeminiIssue({
      code: "GEMINI_SEARCH_NOT_ALLOWED",
      path: "$.executionMode",
      message: "Google Search is disabled in Gemini dry runs.",
      severity: "warning",
    }));
    return { tools: [], enabled: false, warnings };
  }
  return { tools: [{ type: "google_search" }], enabled: true, warnings };
}
